from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID

from app.database import get_db
from app.models.supplier import Supplier
from app.schemas.supplier import SupplierCreate, SupplierUpdate, SupplierResponse
from app.middleware.auth import get_current_user

router = APIRouter()


@router.get("/", response_model=List[SupplierResponse])
async def list_suppliers(
    skip: int = 0,
    limit: int = 100,
    status: str = None,
    db: Session = Depends(get_db),
):
    """List all suppliers with optional status filter."""
    query = db.query(Supplier)
    if status:
        query = query.filter(Supplier.status == status)
    suppliers = query.offset(skip).limit(limit).all()
    return suppliers


@router.get("/{supplier_id}", response_model=SupplierResponse)
async def get_supplier(supplier_id: UUID, db: Session = Depends(get_db)):
    """Get a single supplier by ID."""
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return supplier


@router.post("/", response_model=SupplierResponse, status_code=201)
async def create_supplier(
    supplier_data: SupplierCreate,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """Create a new supplier (requires auth)."""
    supplier = Supplier(**supplier_data.model_dump())
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    return supplier


@router.patch("/{supplier_id}", response_model=SupplierResponse)
async def update_supplier(
    supplier_id: UUID,
    supplier_data: SupplierUpdate,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """Update an existing supplier (requires auth)."""
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    update_data = supplier_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(supplier, key, value)

    db.commit()
    db.refresh(supplier)
    return supplier


@router.delete("/{supplier_id}", status_code=204)
async def delete_supplier(
    supplier_id: UUID,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """Delete a supplier (requires auth)."""
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    db.delete(supplier)
    db.commit()
