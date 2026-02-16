from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List
from uuid import UUID
import random
import string

from app.database import get_db
from app.models.purchase_order import PurchaseOrder, POLineItem, POStatus
from app.models.supplier import Supplier
from app.schemas.purchase_order import PurchaseOrderCreate, PurchaseOrderResponse
from app.middleware.auth import get_current_user

router = APIRouter()


def _generate_po_number() -> str:
    """Generate a unique PO number like PO-2026-A7X3."""
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f"PO-2026-{suffix}"


def _enrich_po(po: PurchaseOrder) -> dict:
    """Add supplier name to PO response."""
    return {
        "id": po.id,
        "po_number": po.po_number,
        "supplier_id": po.supplier_id,
        "created_by": po.created_by,
        "status": po.status,
        "total_amount": po.total_amount,
        "expected_delivery": po.expected_delivery,
        "notes": po.notes,
        "created_at": po.created_at,
        "updated_at": po.updated_at,
        "line_items": po.line_items or [],
        "supplier_name": po.supplier.name if po.supplier else None,
    }


@router.get("/", response_model=List[PurchaseOrderResponse])
async def list_purchase_orders(
    skip: int = 0,
    limit: int = 100,
    status: str = None,
    db: Session = Depends(get_db),
):
    """List all purchase orders with optional status filter."""
    query = (
        db.query(PurchaseOrder)
        .options(joinedload(PurchaseOrder.supplier), joinedload(PurchaseOrder.line_items))
    )
    if status:
        query = query.filter(PurchaseOrder.status == status)
    
    pos = query.order_by(PurchaseOrder.created_at.desc()).offset(skip).limit(limit).all()
    return [_enrich_po(po) for po in pos]


@router.get("/{po_id}", response_model=PurchaseOrderResponse)
async def get_purchase_order(po_id: UUID, db: Session = Depends(get_db)):
    """Get a single purchase order by ID."""
    po = (
        db.query(PurchaseOrder)
        .options(joinedload(PurchaseOrder.supplier), joinedload(PurchaseOrder.line_items))
        .filter(PurchaseOrder.id == po_id)
        .first()
    )
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    return _enrich_po(po)


@router.post("/", response_model=PurchaseOrderResponse, status_code=201)
async def create_purchase_order(
    po_data: PurchaseOrderCreate,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """Create a new purchase order with line items (requires auth)."""
    # Verify supplier exists
    supplier = db.query(Supplier).filter(Supplier.id == po_data.supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    # Calculate total amount from line items
    total_amount = 0.0
    line_items = []
    for item in po_data.line_items:
        total_price = item.quantity * item.unit_price
        total_amount += total_price
        line_items.append(
            POLineItem(
                product_id=item.product_id,
                quantity=item.quantity,
                unit_price=item.unit_price,
                total_price=total_price,
            )
        )

    po = PurchaseOrder(
        po_number=_generate_po_number(),
        supplier_id=po_data.supplier_id,
        created_by=user_id,
        status=POStatus.draft,
        total_amount=total_amount,
        expected_delivery=po_data.expected_delivery,
        notes=po_data.notes,
        line_items=line_items,
    )

    db.add(po)
    db.commit()
    db.refresh(po)
    
    # Re-query with joins
    po = (
        db.query(PurchaseOrder)
        .options(joinedload(PurchaseOrder.supplier), joinedload(PurchaseOrder.line_items))
        .filter(PurchaseOrder.id == po.id)
        .first()
    )
    return _enrich_po(po)


@router.post("/{po_id}/submit", response_model=PurchaseOrderResponse)
async def submit_for_approval(
    po_id: UUID,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """Submit a draft PO for approval."""
    po = (
        db.query(PurchaseOrder)
        .options(joinedload(PurchaseOrder.supplier), joinedload(PurchaseOrder.line_items))
        .filter(PurchaseOrder.id == po_id)
        .first()
    )
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if po.status != POStatus.draft:
        raise HTTPException(status_code=400, detail="Only draft POs can be submitted")

    po.status = POStatus.pending_approval
    db.commit()
    db.refresh(po)
    return _enrich_po(po)


@router.delete("/{po_id}", status_code=204)
async def delete_purchase_order(
    po_id: UUID,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """Delete a purchase order (only drafts can be deleted)."""
    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if po.status != POStatus.draft:
        raise HTTPException(status_code=400, detail="Only draft POs can be deleted")

    db.delete(po)
    db.commit()
