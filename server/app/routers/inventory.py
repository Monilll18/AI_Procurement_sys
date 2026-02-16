from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List
from uuid import UUID

from app.database import get_db
from app.models.inventory import Inventory
from app.models.product import Product
from app.schemas.inventory import InventoryCreate, InventoryUpdate, InventoryResponse
from app.middleware.auth import get_current_user

router = APIRouter()


def _enrich_inventory(inv: Inventory) -> dict:
    """Add product name/sku to inventory response."""
    data = {
        "id": inv.id,
        "product_id": inv.product_id,
        "current_stock": inv.current_stock,
        "min_stock": inv.min_stock,
        "max_stock": inv.max_stock,
        "last_updated": inv.last_updated,
        "product_name": inv.product.name if inv.product else None,
        "product_sku": inv.product.sku if inv.product else None,
    }
    return data


@router.get("/", response_model=List[InventoryResponse])
async def list_inventory(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    """List all inventory items with product info."""
    items = (
        db.query(Inventory)
        .options(joinedload(Inventory.product))
        .offset(skip)
        .limit(limit)
        .all()
    )
    return [_enrich_inventory(item) for item in items]


@router.get("/alerts", response_model=List[InventoryResponse])
async def get_low_stock_alerts(db: Session = Depends(get_db)):
    """Get inventory items where current_stock <= min_stock."""
    items = (
        db.query(Inventory)
        .options(joinedload(Inventory.product))
        .filter(Inventory.current_stock <= Inventory.min_stock)
        .all()
    )
    return [_enrich_inventory(item) for item in items]


@router.post("/", response_model=InventoryResponse, status_code=201)
async def create_inventory(
    data: InventoryCreate,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """Create an inventory record for a product (requires auth)."""
    # Verify product exists
    product = db.query(Product).filter(Product.id == data.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # Check if inventory already exists for this product
    existing = db.query(Inventory).filter(Inventory.product_id == data.product_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Inventory record already exists for this product")

    inv = Inventory(**data.model_dump())
    db.add(inv)
    db.commit()
    db.refresh(inv)

    return _enrich_inventory(inv)


@router.patch("/{inventory_id}", response_model=InventoryResponse)
async def update_inventory(
    inventory_id: UUID,
    data: InventoryUpdate,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """Update an inventory record (requires auth)."""
    inv = (
        db.query(Inventory)
        .options(joinedload(Inventory.product))
        .filter(Inventory.id == inventory_id)
        .first()
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Inventory record not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(inv, key, value)

    db.commit()
    db.refresh(inv)
    return _enrich_inventory(inv)
