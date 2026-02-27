"""
Supplier Portal Router — endpoints for authenticated supplier users.
Dashboard, PO management, accept/reject/partial, shipments, status updates.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func as sqla_func
from uuid import UUID
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date

from app.database import get_db
from app.models.purchase_order import PurchaseOrder, POLineItem, POStatus
from app.models.supplier import Supplier
from app.models.supplier_user import SupplierUser
from app.models.shipment import Shipment, ShipmentItem, ShipmentStatus, ShipmentType
from app.models.supplier_price import SupplierPrice
from app.models.supplier_price_update import SupplierPriceUpdate, PriceUpdateStatus
from app.models.supplier_invoice import SupplierInvoice, InvoiceLineItem, InvoiceStatus
from app.models.product import Product
from app.middleware.supplier_auth import get_current_supplier_user

router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────

class AcceptPORequest(BaseModel):
    notes: Optional[str] = None
    expected_delivery: Optional[str] = None

class RejectPORequest(BaseModel):
    reason: str

class PartialAcceptRequest(BaseModel):
    items: List[dict]  # [{ "line_item_id": "...", "available_qty": 10 }]
    reason: Optional[str] = "Limited stock availability"
    notes: Optional[str] = None

class CreateShipmentRequest(BaseModel):
    po_id: str
    shipment_type: str = "full"  # full or partial
    carrier: Optional[str] = None
    tracking_number: Optional[str] = None
    tracking_url: Optional[str] = None
    estimated_delivery: Optional[str] = None
    notes: Optional[str] = None
    items: List[dict]  # [{ "line_item_id": "...", "quantity_shipped": 10 }]

class UpdateShipmentRequest(BaseModel):
    status: str  # dispatched, in_transit, delivered
    tracking_number: Optional[str] = None
    tracking_url: Optional[str] = None
    carrier: Optional[str] = None
    notes: Optional[str] = None


# ─── Dashboard ────────────────────────────────────────────────

@router.get("/dashboard")
async def supplier_dashboard(
    supplier_user: dict = Depends(get_current_supplier_user),
    db: Session = Depends(get_db),
):
    """Supplier dashboard with key stats."""
    sid = supplier_user["supplier_id"]
    supplier = db.query(Supplier).filter(Supplier.id == sid).first()
    all_pos = db.query(PurchaseOrder).filter(PurchaseOrder.supplier_id == sid).all()

    # Shipment stats
    shipment_count = db.query(Shipment).join(PurchaseOrder).filter(
        PurchaseOrder.supplier_id == sid
    ).count()
    active_shipments = db.query(Shipment).join(PurchaseOrder).filter(
        PurchaseOrder.supplier_id == sid,
        Shipment.status.in_([ShipmentStatus.dispatched, ShipmentStatus.in_transit]),
    ).count()

    stats = {
        "total_pos": len(all_pos),
        "new_pos": sum(1 for po in all_pos if po.status == POStatus.sent),
        "in_progress": sum(1 for po in all_pos if po.status in (POStatus.approved, POStatus.partially_received)),
        "completed": sum(1 for po in all_pos if po.status == POStatus.received),
        "total_value": sum(po.total_amount for po in all_pos),
        "pending_value": sum(po.total_amount for po in all_pos if po.status in (POStatus.sent, POStatus.approved)),
        "total_shipments": shipment_count,
        "active_shipments": active_shipments,
    }

    return {
        "supplier": {
            "id": str(supplier.id) if supplier else None,
            "name": supplier.name if supplier else "Unknown",
            "email": supplier.email if supplier else None,
            "rating": supplier.rating if supplier else 0,
        },
        "stats": stats,
        "user": {
            "full_name": supplier_user["full_name"],
            "email": supplier_user["email"],
            "role": supplier_user["role"],
        },
    }


# ─── List Purchase Orders ────────────────────────────────────

@router.get("/purchase-orders")
async def list_supplier_pos(
    status: Optional[str] = None,
    supplier_user: dict = Depends(get_current_supplier_user),
    db: Session = Depends(get_db),
):
    """List all POs for this supplier."""
    sid = supplier_user["supplier_id"]

    query = (
        db.query(PurchaseOrder)
        .options(joinedload(PurchaseOrder.line_items).joinedload(POLineItem.product))
        .filter(PurchaseOrder.supplier_id == sid)
    )

    if status and status != "all":
        query = query.filter(PurchaseOrder.status == status)

    pos = query.order_by(PurchaseOrder.created_at.desc()).all()
    return [_format_po(po, db) for po in pos]


# ─── Get PO Detail ───────────────────────────────────────────

@router.get("/purchase-orders/{po_id}")
async def get_supplier_po(
    po_id: UUID,
    supplier_user: dict = Depends(get_current_supplier_user),
    db: Session = Depends(get_db),
):
    """Get detailed PO view for supplier."""
    po = (
        db.query(PurchaseOrder)
        .options(
            joinedload(PurchaseOrder.line_items).joinedload(POLineItem.product),
            joinedload(PurchaseOrder.supplier),
        )
        .filter(PurchaseOrder.id == po_id, PurchaseOrder.supplier_id == supplier_user["supplier_id"])
        .first()
    )
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    return _format_po(po, db)


# ─── Accept PO ────────────────────────────────────────────────

@router.post("/purchase-orders/{po_id}/accept")
async def accept_po(
    po_id: UUID,
    data: AcceptPORequest = AcceptPORequest(),
    supplier_user: dict = Depends(get_current_supplier_user),
    db: Session = Depends(get_db),
):
    po = _get_and_validate_po(po_id, supplier_user["supplier_id"], db)
    old_status = po.status.value
    po.status = POStatus.approved
    if data.notes:
        po.notes = (po.notes or "") + f"\n[Supplier] {data.notes}"
    db.commit()
    return {"message": f"PO {po.po_number} accepted", "old_status": old_status, "new_status": "approved"}


# ─── Reject PO ────────────────────────────────────────────────

@router.post("/purchase-orders/{po_id}/reject")
async def reject_po(
    po_id: UUID,
    data: RejectPORequest,
    supplier_user: dict = Depends(get_current_supplier_user),
    db: Session = Depends(get_db),
):
    po = _get_and_validate_po(po_id, supplier_user["supplier_id"], db)
    old_status = po.status.value
    po.status = POStatus.cancelled
    po.notes = (po.notes or "") + f"\n[Supplier REJECTED] {data.reason}"
    db.commit()
    return {"message": f"PO {po.po_number} rejected", "old_status": old_status, "new_status": "cancelled", "reason": data.reason}


# ─── Partial Accept ──────────────────────────────────────────

@router.post("/purchase-orders/{po_id}/partial")
async def partial_accept_po(
    po_id: UUID,
    data: PartialAcceptRequest,
    supplier_user: dict = Depends(get_current_supplier_user),
    db: Session = Depends(get_db),
):
    po = _get_and_validate_po(po_id, supplier_user["supplier_id"], db)
    old_status = po.status.value
    po.status = POStatus.partially_received

    partial_summary = []
    for item in data.items:
        li = db.query(POLineItem).filter(POLineItem.id == item["line_item_id"]).first()
        if li:
            product_name = li.product.name if li.product else "Unknown"
            partial_summary.append(f"{product_name}: {item['available_qty']}/{li.quantity}")

    po.notes = (po.notes or "") + f"\n[Supplier PARTIAL] {data.reason or 'Limited stock'}. " + ", ".join(partial_summary)
    if data.notes:
        po.notes += f" Note: {data.notes}"
    db.commit()
    return {"message": f"PO {po.po_number} partially accepted", "old_status": old_status, "new_status": "partially_received", "partial_items": partial_summary}


# ═══════════════════════════════════════════════════════════════
# ─── SHIPMENTS ────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════

def _generate_shipment_number(db: Session) -> str:
    """Generate next shipment number like SHP-2026-0001."""
    year = datetime.utcnow().year
    prefix = f"SHP-{year}-"
    last = (
        db.query(Shipment)
        .filter(Shipment.shipment_number.like(f"{prefix}%"))
        .order_by(Shipment.shipment_number.desc())
        .first()
    )
    if last:
        last_num = int(last.shipment_number.split("-")[-1])
        return f"{prefix}{last_num + 1:04d}"
    return f"{prefix}0001"


@router.post("/shipments")
async def create_shipment(
    data: CreateShipmentRequest,
    supplier_user: dict = Depends(get_current_supplier_user),
    db: Session = Depends(get_db),
):
    """Create a shipment for a PO. Supplier dispatches goods."""
    po = db.query(PurchaseOrder).filter(
        PurchaseOrder.id == data.po_id,
        PurchaseOrder.supplier_id == supplier_user["supplier_id"],
    ).first()
    if not po:
        raise HTTPException(status_code=404, detail="PO not found")
    if po.status not in (POStatus.approved, POStatus.sent, POStatus.partially_received):
        raise HTTPException(status_code=400, detail=f"Cannot ship — PO status is '{po.status.value}'")

    # Parse estimated delivery
    est_delivery = None
    if data.estimated_delivery:
        try:
            est_delivery = date.fromisoformat(data.estimated_delivery)
        except ValueError:
            pass

    shipment = Shipment(
        po_id=po.id,
        shipment_number=_generate_shipment_number(db),
        shipment_type=ShipmentType(data.shipment_type),
        status=ShipmentStatus.dispatched,
        carrier=data.carrier,
        tracking_number=data.tracking_number,
        tracking_url=data.tracking_url,
        estimated_delivery=est_delivery,
        notes=data.notes,
        created_by=supplier_user["id"],
        dispatched_at=datetime.utcnow(),
    )
    db.add(shipment)
    db.flush()

    # Create shipment items
    for item in data.items:
        si = ShipmentItem(
            shipment_id=shipment.id,
            po_line_item_id=item["line_item_id"],
            quantity_shipped=item["quantity_shipped"],
        )
        db.add(si)

    # Update PO notes
    po.notes = (po.notes or "") + f"\n[SHIPPED] {shipment.shipment_number} via {data.carrier or 'N/A'}"
    if data.tracking_number:
        po.notes += f" | Tracking: {data.tracking_number}"

    db.commit()
    db.refresh(shipment)

    return {
        "message": f"Shipment {shipment.shipment_number} created",
        "shipment_id": str(shipment.id),
        "shipment_number": shipment.shipment_number,
    }


@router.get("/shipments")
async def list_shipments(
    status: Optional[str] = None,
    supplier_user: dict = Depends(get_current_supplier_user),
    db: Session = Depends(get_db),
):
    """List all shipments for this supplier."""
    query = (
        db.query(Shipment)
        .join(PurchaseOrder)
        .options(
            joinedload(Shipment.purchase_order),
            joinedload(Shipment.items).joinedload(ShipmentItem.po_line_item).joinedload(POLineItem.product),
        )
        .filter(PurchaseOrder.supplier_id == supplier_user["supplier_id"])
    )

    if status and status != "all":
        query = query.filter(Shipment.status == status)

    shipments = query.order_by(Shipment.created_at.desc()).all()
    return [_format_shipment(s) for s in shipments]


@router.get("/shipments/{shipment_id}")
async def get_shipment(
    shipment_id: UUID,
    supplier_user: dict = Depends(get_current_supplier_user),
    db: Session = Depends(get_db),
):
    """Get shipment detail."""
    shipment = (
        db.query(Shipment)
        .join(PurchaseOrder)
        .options(
            joinedload(Shipment.purchase_order),
            joinedload(Shipment.items).joinedload(ShipmentItem.po_line_item).joinedload(POLineItem.product),
        )
        .filter(Shipment.id == shipment_id, PurchaseOrder.supplier_id == supplier_user["supplier_id"])
        .first()
    )
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
    return _format_shipment(shipment)


@router.patch("/shipments/{shipment_id}")
async def update_shipment(
    shipment_id: UUID,
    data: UpdateShipmentRequest,
    supplier_user: dict = Depends(get_current_supplier_user),
    db: Session = Depends(get_db),
):
    """Update shipment status / tracking info."""
    shipment = (
        db.query(Shipment)
        .join(PurchaseOrder)
        .filter(Shipment.id == shipment_id, PurchaseOrder.supplier_id == supplier_user["supplier_id"])
        .first()
    )
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    old_status = shipment.status.value

    if data.status:
        shipment.status = ShipmentStatus(data.status)
    if data.tracking_number:
        shipment.tracking_number = data.tracking_number
    if data.tracking_url:
        shipment.tracking_url = data.tracking_url
    if data.carrier:
        shipment.carrier = data.carrier
    if data.notes:
        shipment.notes = (shipment.notes or "") + f"\n{data.notes}"

    if data.status == "delivered":
        shipment.delivered_at = datetime.utcnow()
        shipment.actual_delivery = date.today()

    db.commit()
    db.refresh(shipment)

    return {
        "message": f"Shipment {shipment.shipment_number} updated to {data.status}",
        "old_status": old_status,
        "new_status": shipment.status.value,
    }


# ─── Helpers ──────────────────────────────────────────────────

def _get_and_validate_po(po_id: UUID, supplier_id: str, db: Session) -> PurchaseOrder:
    po = (
        db.query(PurchaseOrder)
        .options(joinedload(PurchaseOrder.line_items).joinedload(POLineItem.product))
        .filter(PurchaseOrder.id == po_id, PurchaseOrder.supplier_id == supplier_id)
        .first()
    )
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if po.status not in (POStatus.sent, POStatus.approved, POStatus.draft, POStatus.pending_approval):
        raise HTTPException(status_code=400, detail=f"PO status is '{po.status.value}' — cannot modify at this stage.")
    return po


def _format_po(po: PurchaseOrder, db: Session) -> dict:
    """Format PO for supplier portal response, includes shipment summary."""
    # Get shipments for this PO
    shipments = db.query(Shipment).filter(Shipment.po_id == po.id).order_by(Shipment.created_at.desc()).all()

    return {
        "id": str(po.id),
        "po_number": po.po_number,
        "status": po.status.value,
        "total_amount": po.total_amount,
        "expected_delivery": str(po.expected_delivery) if po.expected_delivery else None,
        "notes": po.notes,
        "sent_at": po.sent_at.isoformat() if po.sent_at else None,
        "created_at": po.created_at.isoformat() if po.created_at else None,
        "shipment_count": len(shipments),
        "latest_shipment": {
            "id": str(shipments[0].id),
            "number": shipments[0].shipment_number,
            "status": shipments[0].status.value,
            "carrier": shipments[0].carrier,
            "tracking_number": shipments[0].tracking_number,
        } if shipments else None,
        "line_items": [
            {
                "id": str(li.id),
                "product_name": li.product.name if li.product else "Unknown",
                "product_id": str(li.product_id),
                "quantity": li.quantity,
                "unit_price": li.unit_price,
                "total_price": li.total_price,
                "quantity_received": li.quantity_received or 0,
            }
            for li in (po.line_items or [])
        ],
    }


def _format_shipment(s: Shipment) -> dict:
    """Format shipment for API response."""
    return {
        "id": str(s.id),
        "shipment_number": s.shipment_number,
        "po_id": str(s.po_id),
        "po_number": s.purchase_order.po_number if s.purchase_order else None,
        "shipment_type": s.shipment_type.value if s.shipment_type else "full",
        "status": s.status.value,
        "carrier": s.carrier,
        "tracking_number": s.tracking_number,
        "tracking_url": s.tracking_url,
        "estimated_delivery": str(s.estimated_delivery) if s.estimated_delivery else None,
        "actual_delivery": str(s.actual_delivery) if s.actual_delivery else None,
        "notes": s.notes,
        "dispatched_at": s.dispatched_at.isoformat() if s.dispatched_at else None,
        "delivered_at": s.delivered_at.isoformat() if s.delivered_at else None,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "items": [
            {
                "id": str(si.id),
                "product_name": si.po_line_item.product.name if si.po_line_item and si.po_line_item.product else "Unknown",
                "quantity_shipped": si.quantity_shipped,
                "quantity_ordered": si.po_line_item.quantity if si.po_line_item else 0,
                "unit_price": si.unit_price or (si.po_line_item.unit_price if si.po_line_item else 0),
            }
            for si in (s.items or [])
        ],
    }


# ═══════════════════════════════════════════════════════════════
# ─── CATALOG & PRICING ────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════

@router.get("/catalog")
async def list_catalog(
    supplier_user: dict = Depends(get_current_supplier_user),
    db: Session = Depends(get_db),
):
    """List all products this supplier has prices for."""
    sid = supplier_user["supplier_id"]
    prices = (
        db.query(SupplierPrice)
        .options(joinedload(SupplierPrice.product))
        .filter(SupplierPrice.supplier_id == sid, SupplierPrice.is_active == True)
        .order_by(SupplierPrice.created_at.desc())
        .all()
    )
    return [
        {
            "id": str(p.id),
            "product_id": str(p.product_id),
            "product_name": p.product.name if p.product else "Unknown",
            "category": p.product.category if p.product else None,
            "unit_price": p.unit_price,
            "currency": p.currency,
            "min_order_qty": p.min_order_qty,
            "available_quantity": p.available_quantity,
            "lead_time_days": p.lead_time_days,
            "valid_from": str(p.valid_from) if p.valid_from else None,
            "valid_to": str(p.valid_to) if p.valid_to else None,
        }
        for p in prices
    ]


class PriceUpdateRequest(BaseModel):
    product_id: str
    proposed_price: float
    effective_date: str
    reason: Optional[str] = None


@router.post("/catalog/price-update")
async def submit_price_update(
    data: PriceUpdateRequest,
    supplier_user: dict = Depends(get_current_supplier_user),
    db: Session = Depends(get_db),
):
    """Submit a price change request for buyer approval."""
    sid = supplier_user["supplier_id"]

    # Get current price
    current_price_record = (
        db.query(SupplierPrice)
        .filter(SupplierPrice.supplier_id == sid, SupplierPrice.product_id == data.product_id, SupplierPrice.is_active == True)
        .first()
    )
    current_price = current_price_record.unit_price if current_price_record else 0
    change_pct = ((data.proposed_price - current_price) / current_price * 100) if current_price > 0 else 0

    update = SupplierPriceUpdate(
        supplier_id=sid,
        product_id=data.product_id,
        current_price=current_price,
        proposed_price=data.proposed_price,
        change_percent=round(change_pct, 2),
        reason=data.reason,
        effective_date=date.fromisoformat(data.effective_date),
        created_by=supplier_user["id"],
    )
    db.add(update)
    db.commit()
    db.refresh(update)

    return {
        "message": "Price update submitted for approval",
        "id": str(update.id),
        "change_percent": update.change_percent,
    }


@router.get("/catalog/price-updates")
async def list_price_updates(
    status: Optional[str] = None,
    supplier_user: dict = Depends(get_current_supplier_user),
    db: Session = Depends(get_db),
):
    """List price update requests."""
    query = (
        db.query(SupplierPriceUpdate)
        .options(joinedload(SupplierPriceUpdate.product))
        .filter(SupplierPriceUpdate.supplier_id == supplier_user["supplier_id"])
    )
    if status and status != "all":
        query = query.filter(SupplierPriceUpdate.status == status)

    updates = query.order_by(SupplierPriceUpdate.created_at.desc()).all()
    return [
        {
            "id": str(u.id),
            "product_id": str(u.product_id),
            "product_name": u.product.name if u.product else "Unknown",
            "current_price": u.current_price,
            "proposed_price": u.proposed_price,
            "change_percent": u.change_percent,
            "reason": u.reason,
            "effective_date": str(u.effective_date),
            "status": u.status.value,
            "review_notes": u.review_notes,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in updates
    ]


@router.get("/catalog/available-products")
async def list_available_products(
    supplier_user: dict = Depends(get_current_supplier_user),
    db: Session = Depends(get_db),
):
    """List products NOT yet in this supplier's catalog (so they can add them)."""
    sid = supplier_user["supplier_id"]
    # Get product IDs already in catalog
    existing_ids = (
        db.query(SupplierPrice.product_id)
        .filter(SupplierPrice.supplier_id == sid, SupplierPrice.is_active == True)
        .all()
    )
    existing_set = {str(pid[0]) for pid in existing_ids}

    all_products = db.query(Product).order_by(Product.name).all()
    return [
        {
            "id": str(p.id),
            "name": p.name,
            "sku": p.sku,
            "category": p.category,
            "unit": p.unit,
        }
        for p in all_products
        if str(p.id) not in existing_set
    ]


class AddToCatalogRequest(BaseModel):
    product_id: str
    unit_price: float
    currency: str = "USD"
    min_order_qty: Optional[int] = None
    available_quantity: Optional[int] = None
    lead_time_days: Optional[int] = None


@router.post("/catalog/add")
async def add_to_catalog(
    data: AddToCatalogRequest,
    supplier_user: dict = Depends(get_current_supplier_user),
    db: Session = Depends(get_db),
):
    """Add a product to supplier's catalog with pricing."""
    sid = supplier_user["supplier_id"]

    # Check for duplicate
    exists = db.query(SupplierPrice).filter(
        SupplierPrice.supplier_id == sid,
        SupplierPrice.product_id == data.product_id,
        SupplierPrice.is_active == True,
    ).first()
    if exists:
        raise HTTPException(status_code=400, detail="Product already in your catalog")

    product = db.query(Product).filter(Product.id == data.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    sp = SupplierPrice(
        supplier_id=sid,
        product_id=data.product_id,
        unit_price=data.unit_price,
        currency=data.currency,
        min_order_qty=data.min_order_qty,
        available_quantity=data.available_quantity,
        lead_time_days=data.lead_time_days,
        valid_from=date.today(),
        is_active=True,
        source="supplier_portal",
    )
    db.add(sp)
    db.commit()
    db.refresh(sp)

    return {
        "message": f"{product.name} added to your catalog",
        "id": str(sp.id),
        "product_name": product.name,
    }


@router.delete("/catalog/{price_id}")
async def remove_from_catalog(
    price_id: UUID,
    supplier_user: dict = Depends(get_current_supplier_user),
    db: Session = Depends(get_db),
):
    """Remove a product from supplier's catalog."""
    sp = db.query(SupplierPrice).filter(
        SupplierPrice.id == price_id,
        SupplierPrice.supplier_id == supplier_user["supplier_id"],
    ).first()
    if not sp:
        raise HTTPException(status_code=404, detail="Catalog item not found")

    product_name = sp.product.name if sp.product else "Product"
    sp.is_active = False
    db.commit()

    return {"message": f"{product_name} removed from your catalog"}


class UpdateStockRequest(BaseModel):
    available_quantity: int


@router.patch("/catalog/{price_id}/stock")
async def update_catalog_stock(
    price_id: UUID,
    data: UpdateStockRequest,
    supplier_user: dict = Depends(get_current_supplier_user),
    db: Session = Depends(get_db),
):
    """Update available quantity for a catalog item."""
    sp = db.query(SupplierPrice).filter(
        SupplierPrice.id == price_id,
        SupplierPrice.supplier_id == supplier_user["supplier_id"],
    ).first()
    if not sp:
        raise HTTPException(status_code=404, detail="Catalog item not found")

    sp.available_quantity = data.available_quantity
    db.commit()

    product_name = sp.product.name if sp.product else "Product"
    return {"message": f"Stock updated: {product_name} → {data.available_quantity} units"}

# ═══════════════════════════════════════════════════════════════
# ─── INVOICING ────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════

def _generate_invoice_number(db: Session) -> str:
    year = datetime.utcnow().year
    prefix = f"INV-{year}-"
    last = (
        db.query(SupplierInvoice)
        .filter(SupplierInvoice.invoice_number.like(f"{prefix}%"))
        .order_by(SupplierInvoice.invoice_number.desc())
        .first()
    )
    if last:
        last_num = int(last.invoice_number.split("-")[-1])
        return f"{prefix}{last_num + 1:04d}"
    return f"{prefix}0001"


class CreateInvoiceRequest(BaseModel):
    po_id: str
    invoice_date: str
    due_date: Optional[str] = None
    tax_rate: float = 0  # percentage
    notes: Optional[str] = None
    items: List[dict]  # [{ "po_line_item_id": "...", "description": "...", "quantity": 10, "unit_price": 45.00 }]


@router.post("/invoices")
async def create_invoice(
    data: CreateInvoiceRequest,
    supplier_user: dict = Depends(get_current_supplier_user),
    db: Session = Depends(get_db),
):
    """Create an invoice for a PO. Auto-performs 3-way matching."""
    po = db.query(PurchaseOrder).options(
        joinedload(PurchaseOrder.line_items).joinedload(POLineItem.product)
    ).filter(
        PurchaseOrder.id == data.po_id,
        PurchaseOrder.supplier_id == supplier_user["supplier_id"],
    ).first()
    if not po:
        raise HTTPException(status_code=404, detail="PO not found")

    # Calculate totals
    subtotal = sum(item.get("quantity", 0) * item.get("unit_price", 0) for item in data.items)
    tax_amount = round(subtotal * (data.tax_rate / 100), 2)
    total = round(subtotal + tax_amount, 2)

    due = None
    if data.due_date:
        try:
            due = date.fromisoformat(data.due_date)
        except ValueError:
            pass

    invoice = SupplierInvoice(
        invoice_number=_generate_invoice_number(db),
        po_id=po.id,
        supplier_id=supplier_user["supplier_id"],
        status=InvoiceStatus.draft,
        invoice_date=date.fromisoformat(data.invoice_date),
        due_date=due,
        subtotal=subtotal,
        tax_amount=tax_amount,
        total_amount=total,
        notes=data.notes,
        created_by=supplier_user["id"],
    )
    db.add(invoice)
    db.flush()

    # Create line items with 3-way matching
    all_match = True
    match_issues = []
    po_li_map = {str(li.id): li for li in po.line_items}

    for item in data.items:
        po_li = po_li_map.get(item.get("po_line_item_id", ""))
        po_qty = po_li.quantity if po_li else None
        po_price = po_li.unit_price if po_li else None
        qty_match = (item["quantity"] == po_qty) if po_qty is not None else None
        price_match = (abs(item["unit_price"] - po_price) < 0.01) if po_price is not None else None

        if qty_match is False:
            all_match = False
            pname = po_li.product.name if po_li and po_li.product else "Unknown"
            match_issues.append(f"{pname}: qty {item['quantity']} vs PO {po_qty}")
        if price_match is False:
            all_match = False
            pname = po_li.product.name if po_li and po_li.product else "Unknown"
            match_issues.append(f"{pname}: price ${item['unit_price']} vs PO ${po_price}")

        li = InvoiceLineItem(
            invoice_id=invoice.id,
            po_line_item_id=item.get("po_line_item_id"),
            description=item.get("description", ""),
            quantity=item["quantity"],
            unit_price=item["unit_price"],
            total_price=round(item["quantity"] * item["unit_price"], 2),
            tax_rate=data.tax_rate,
            po_quantity=po_qty,
            po_unit_price=po_price,
            quantity_match=qty_match,
            price_match=price_match,
        )
        db.add(li)

    # Set match status
    if all_match:
        invoice.match_status = "matched"
    else:
        invoice.match_status = "mismatch"
        invoice.match_notes = "; ".join(match_issues)

    db.commit()
    db.refresh(invoice)

    return {
        "message": f"Invoice {invoice.invoice_number} created",
        "invoice_id": str(invoice.id),
        "invoice_number": invoice.invoice_number,
        "match_status": invoice.match_status,
        "match_notes": invoice.match_notes,
    }


@router.get("/invoices")
async def list_invoices(
    status: Optional[str] = None,
    supplier_user: dict = Depends(get_current_supplier_user),
    db: Session = Depends(get_db),
):
    """List all invoices for this supplier."""
    query = (
        db.query(SupplierInvoice)
        .options(
            joinedload(SupplierInvoice.purchase_order),
            joinedload(SupplierInvoice.line_items),
        )
        .filter(SupplierInvoice.supplier_id == supplier_user["supplier_id"])
    )
    if status and status != "all":
        query = query.filter(SupplierInvoice.status == status)

    invoices = query.order_by(SupplierInvoice.created_at.desc()).all()
    return [_format_invoice(inv) for inv in invoices]


@router.get("/invoices/{invoice_id}")
async def get_invoice(
    invoice_id: UUID,
    supplier_user: dict = Depends(get_current_supplier_user),
    db: Session = Depends(get_db),
):
    """Get invoice details."""
    inv = (
        db.query(SupplierInvoice)
        .options(
            joinedload(SupplierInvoice.purchase_order),
            joinedload(SupplierInvoice.line_items).joinedload(InvoiceLineItem.po_line_item).joinedload(POLineItem.product),
        )
        .filter(SupplierInvoice.id == invoice_id, SupplierInvoice.supplier_id == supplier_user["supplier_id"])
        .first()
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return _format_invoice(inv)


@router.post("/invoices/{invoice_id}/submit")
async def submit_invoice(
    invoice_id: UUID,
    supplier_user: dict = Depends(get_current_supplier_user),
    db: Session = Depends(get_db),
):
    """Submit a draft invoice for buyer review."""
    inv = db.query(SupplierInvoice).filter(
        SupplierInvoice.id == invoice_id,
        SupplierInvoice.supplier_id == supplier_user["supplier_id"],
    ).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if inv.status != InvoiceStatus.draft:
        raise HTTPException(status_code=400, detail="Only draft invoices can be submitted")

    inv.status = InvoiceStatus.submitted
    inv.submitted_at = datetime.utcnow()
    db.commit()

    return {"message": f"Invoice {inv.invoice_number} submitted for review", "status": "submitted"}


def _format_invoice(inv: SupplierInvoice) -> dict:
    return {
        "id": str(inv.id),
        "invoice_number": inv.invoice_number,
        "po_id": str(inv.po_id),
        "po_number": inv.purchase_order.po_number if inv.purchase_order else None,
        "status": inv.status.value,
        "invoice_date": str(inv.invoice_date) if inv.invoice_date else None,
        "due_date": str(inv.due_date) if inv.due_date else None,
        "subtotal": inv.subtotal,
        "tax_amount": inv.tax_amount,
        "total_amount": inv.total_amount,
        "currency": inv.currency,
        "notes": inv.notes,
        "match_status": inv.match_status,
        "match_notes": inv.match_notes,
        "review_notes": inv.review_notes,
        "submitted_at": inv.submitted_at.isoformat() if inv.submitted_at else None,
        "approved_at": inv.approved_at.isoformat() if inv.approved_at else None,
        "paid_at": inv.paid_at.isoformat() if inv.paid_at else None,
        "created_at": inv.created_at.isoformat() if inv.created_at else None,
        "line_items": [
            {
                "id": str(li.id),
                "description": li.description,
                "quantity": li.quantity,
                "unit_price": li.unit_price,
                "total_price": li.total_price,
                "tax_rate": li.tax_rate,
                "po_quantity": li.po_quantity,
                "po_unit_price": li.po_unit_price,
                "quantity_match": li.quantity_match,
                "price_match": li.price_match,
            }
            for li in (inv.line_items or [])
        ],
    }


@router.get("/invoices/{invoice_id}/pdf")
async def download_invoice_pdf(
    invoice_id: UUID,
    supplier_user: dict = Depends(get_current_supplier_user),
    db: Session = Depends(get_db),
):
    """Generate and download an invoice as PDF."""
    import io
    from starlette.responses import StreamingResponse
    from app.services.invoice_pdf_service import generate_invoice_pdf

    inv = db.query(SupplierInvoice).filter(
        SupplierInvoice.id == invoice_id,
        SupplierInvoice.supplier_id == supplier_user["supplier_id"],
    ).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    supplier = db.query(Supplier).filter(Supplier.id == inv.supplier_id).first()
    po = inv.purchase_order

    pdf_bytes = generate_invoice_pdf(
        invoice_number=inv.invoice_number,
        po_number=po.po_number if po else "",
        supplier_name=supplier.name if supplier else "Unknown",
        supplier_email=supplier.email if supplier else "",
        invoice_date=str(inv.invoice_date) if inv.invoice_date else "",
        due_date=str(inv.due_date) if inv.due_date else "",
        subtotal=float(inv.subtotal),
        tax_amount=float(inv.tax_amount),
        total_amount=float(inv.total_amount),
        currency=inv.currency or "USD",
        notes=inv.notes or "",
        status=inv.status.value if inv.status else "draft",
        match_status=inv.match_status or "",
        line_items=[
            {
                "description": li.description,
                "quantity": li.quantity,
                "unit_price": li.unit_price,
                "total_price": li.total_price,
            }
            for li in (inv.line_items or [])
        ],
    )

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{inv.invoice_number}.pdf"'},
    )
