from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel
import random
import string
import io

from app.database import get_db
from app.models.purchase_order import PurchaseOrder, POLineItem, POStatus
from app.models.supplier import Supplier
from app.models.supplier_price import SupplierPrice
from app.models.product import Product
from app.models.inventory import Inventory
from app.models.stock_movement import StockMovement
from app.schemas.purchase_order import PurchaseOrderCreate, PurchaseOrderResponse
from app.middleware.auth import get_current_user
from app.middleware.role_guard import require_role

router = APIRouter()


def _generate_po_number() -> str:
    """Generate a unique PO number like PO-2026-A7X3."""
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f"PO-2026-{suffix}"


def _enrich_po(po: PurchaseOrder, db=None) -> dict:
    """Add supplier name + product names to PO response."""
    enriched_items = []
    for li in (po.line_items or []):
        item_dict = {
            "id": str(li.id),
            "product_id": str(li.product_id) if li.product_id else None,
            "product_name": None,
            "quantity": li.quantity,
            "unit_price": li.unit_price,
            "total_price": li.total_price,
            "quantity_received": li.quantity_received or 0,
        }
        # Resolve product name
        if db and li.product_id:
            from app.models.product import Product
            product = db.query(Product).filter(Product.id == li.product_id).first()
            if product:
                item_dict["product_name"] = product.name
        enriched_items.append(item_dict)

    return {
        "id": po.id,
        "po_number": po.po_number,
        "supplier_id": po.supplier_id,
        "created_by": po.created_by,
        "status": po.status,
        "total_amount": po.total_amount,
        "expected_delivery": po.expected_delivery,
        "notes": po.notes,
        "pdf_url": po.pdf_url,
        "sent_at": po.sent_at,
        "created_at": po.created_at,
        "updated_at": po.updated_at,
        "line_items": enriched_items,
        "supplier_name": po.supplier.name if po.supplier else None,
        "supplier_email": po.supplier.email if po.supplier else None,
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
    return [_enrich_po(po, db) for po in pos]


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
    return _enrich_po(po, db)


@router.get("/supplier-catalog/{supplier_id}")
async def get_supplier_catalog(
    supplier_id: UUID,
    db: Session = Depends(get_db),
):
    """Get products that a supplier sells (their catalog with prices)."""
    prices = (
        db.query(SupplierPrice)
        .options(joinedload(SupplierPrice.product))
        .filter(SupplierPrice.supplier_id == supplier_id, SupplierPrice.is_active == True)
        .order_by(SupplierPrice.created_at.desc())
        .all()
    )
    return [
        {
            "id": str(p.id),
            "product_id": str(p.product_id),
            "product_name": p.product.name if p.product else "Unknown",
            "sku": p.product.sku if p.product else None,
            "category": p.product.category if p.product else None,
            "unit_price": p.unit_price,
            "currency": p.currency,
            "min_order_qty": p.min_order_qty,
            "available_quantity": p.available_quantity,
            "lead_time_days": p.lead_time_days,
        }
        for p in prices
    ]


@router.post("/", response_model=PurchaseOrderResponse, status_code=201)
async def create_purchase_order(
    po_data: PurchaseOrderCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_role("admin", "manager", "procurement_officer")),
):
    """Create a new purchase order. Requires Officer/Manager/Admin role."""
    supplier = db.query(Supplier).filter(Supplier.id == po_data.supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    # Validate products are in supplier's catalog
    catalog_product_ids = {
        str(sp.product_id)
        for sp in db.query(SupplierPrice).filter(
            SupplierPrice.supplier_id == po_data.supplier_id,
            SupplierPrice.is_active == True,
        ).all()
    }
    for item in po_data.line_items:
        if str(item.product_id) not in catalog_product_ids:
            product = db.query(Product).filter(Product.id == item.product_id).first()
            pname = product.name if product else str(item.product_id)
            raise HTTPException(
                status_code=400,
                detail=f"Product '{pname}' is not in {supplier.name}'s catalog",
            )

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
        created_by=user["clerk_id"],
        status=POStatus.draft,
        total_amount=total_amount,
        expected_delivery=po_data.expected_delivery,
        notes=po_data.notes,
        line_items=line_items,
    )

    db.add(po)
    db.commit()
    db.refresh(po)
    
    po = (
        db.query(PurchaseOrder)
        .options(joinedload(PurchaseOrder.supplier), joinedload(PurchaseOrder.line_items))
        .filter(PurchaseOrder.id == po.id)
        .first()
    )
    return _enrich_po(po, db)


@router.post("/{po_id}/submit", response_model=PurchaseOrderResponse)
async def submit_for_approval(
    po_id: UUID,
    db: Session = Depends(get_db),
    user: dict = Depends(require_role("admin", "manager", "procurement_officer")),
):
    """Submit a draft PO for approval. Requires Officer/Manager/Admin role."""
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
    return _enrich_po(po, db)


# ─── Goods Receipt ──────────────────────────────────────────

class ReceiveLineItem(BaseModel):
    line_item_id: str
    quantity_received: int
    condition: Optional[str] = "GOOD"  # GOOD, DAMAGED, PARTIAL
    storage_location: Optional[str] = None


class ReceiveGoodsRequest(BaseModel):
    items: List[ReceiveLineItem]
    notes: Optional[str] = None


@router.post("/{po_id}/receive")
async def receive_goods(
    po_id: UUID,
    data: ReceiveGoodsRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(require_role("admin", "manager", "procurement_officer")),
):
    """
    Record goods receipt for a purchase order.
    - Updates quantity_received on each line item
    - Auto-updates inventory stock levels
    - Logs stock movements for each received item
    - Changes PO status to 'partially_received' or 'received'
    """
    po = (
        db.query(PurchaseOrder)
        .options(
            joinedload(PurchaseOrder.supplier),
            joinedload(PurchaseOrder.line_items).joinedload(POLineItem.product),
        )
        .filter(PurchaseOrder.id == po_id)
        .first()
    )
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    if po.status not in (POStatus.approved, POStatus.sent, POStatus.partially_received):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot receive goods for PO with status '{po.status.value}'. Must be approved, sent, or partially received.",
        )

    received_items = []
    for recv in data.items:
        # Find matching line item
        line_item = None
        for li in po.line_items:
            if str(li.id) == recv.line_item_id:
                line_item = li
                break

        if not line_item:
            raise HTTPException(status_code=404, detail=f"Line item {recv.line_item_id} not found in PO")

        remaining = line_item.quantity - line_item.quantity_received
        if recv.quantity_received > remaining:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot receive {recv.quantity_received} for {line_item.product.name}. Only {remaining} remaining.",
            )

        # Update line item
        line_item.quantity_received += recv.quantity_received

        # Update inventory
        inv = db.query(Inventory).filter(Inventory.product_id == line_item.product_id).first()
        if inv:
            inv.current_stock += recv.quantity_received
            stock_after = inv.current_stock
        else:
            # Create inventory record if it doesn't exist
            inv = Inventory(
                product_id=line_item.product_id,
                current_stock=recv.quantity_received,
            )
            db.add(inv)
            stock_after = recv.quantity_received

        # Log stock movement
        movement = StockMovement(
            product_id=line_item.product_id,
            type="GOODS_IN",
            quantity=recv.quantity_received,
            reference_type="PURCHASE_ORDER",
            reference_id=po.id,
            performed_by=user.get("clerk_id", "unknown"),
            storage_location=recv.storage_location,
            notes=f"Received from PO {po.po_number}. Condition: {recv.condition}. {data.notes or ''}".strip(),
            stock_after=stock_after,
        )
        db.add(movement)

        received_items.append({
            "product_name": line_item.product.name if line_item.product else "Unknown",
            "quantity_received": recv.quantity_received,
            "total_received": line_item.quantity_received,
            "total_ordered": line_item.quantity,
            "condition": recv.condition,
        })

    # Determine new PO status
    total_ordered = sum(li.quantity for li in po.line_items)
    total_received = sum(li.quantity_received for li in po.line_items)

    if total_received >= total_ordered:
        po.status = POStatus.received
    else:
        po.status = POStatus.partially_received

    db.commit()

    return {
        "message": f"Goods receipt recorded for PO {po.po_number}",
        "po_status": po.status.value,
        "total_ordered": total_ordered,
        "total_received": total_received,
        "items_received": received_items,
    }


# ─── Send PO to Supplier ─────────────────────────────────────

@router.post("/{po_id}/send")
async def send_po_to_supplier(
    po_id: UUID,
    db: Session = Depends(get_db),
    user: dict = Depends(require_role("admin", "manager", "procurement_officer")),
):
    """
    Send the PO to the supplier via email with PDF attachment.
    Updates PO status to 'sent' and records sent_at timestamp.
    """
    from datetime import datetime
    from app.services.pdf_service import generate_po_pdf
    from app.services.email_service import send_email, _base_template

    po = (
        db.query(PurchaseOrder)
        .options(
            joinedload(PurchaseOrder.supplier),
            joinedload(PurchaseOrder.line_items).joinedload(POLineItem.product),
        )
        .filter(PurchaseOrder.id == po_id)
        .first()
    )
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    if po.status not in (POStatus.approved, POStatus.draft, POStatus.pending_approval):
        raise HTTPException(
            status_code=400,
            detail=f"PO status is '{po.status.value}' — only approved/draft POs can be sent.",
        )

    supplier = po.supplier
    if not supplier or not supplier.email:
        raise HTTPException(
            status_code=400,
            detail="Supplier has no email address. Please update the supplier record first.",
        )

    # Build line items for PDF and email
    items = []
    items_html_rows = ""
    for li in po.line_items:
        product_name = li.product.name if li.product else "Unknown"
        items.append({
            "product_name": product_name,
            "quantity": li.quantity,
            "unit_price": li.unit_price,
            "total_price": li.total_price,
        })
        items_html_rows += f"""
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">{product_name}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">{li.quantity}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">${li.unit_price:,.2f}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">${li.total_price:,.2f}</td>
        </tr>
        """

    # Generate PDF
    pdf_bytes = generate_po_pdf(
        po_number=po.po_number,
        supplier_name=supplier.name,
        supplier_email=supplier.email or "",
        supplier_address=supplier.address or "",
        total_amount=po.total_amount,
        expected_delivery=str(po.expected_delivery) if po.expected_delivery else "",
        notes=po.notes or "",
        created_at=po.created_at.strftime("%B %d, %Y") if po.created_at else "",
        line_items=items,
    )

    # Build email HTML
    officer_name = user.get("email", "Procurement Officer")
    delivery_str = str(po.expected_delivery) if po.expected_delivery else "To be confirmed"
    payment_terms = supplier.payment_terms or "Net 30"

    body = f"""
    <h2 style="color: #1f2937; margin-top: 0;">Purchase Order {po.po_number}</h2>
    <p style="color: #4b5563;">Dear {supplier.contact_person or supplier.name},</p>
    <p style="color: #4b5563;">Please find below our purchase order. We kindly request your confirmation of receipt and expected delivery date.</p>

    <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <table style="width: 100%; border-collapse: collapse;">
            <tr>
                <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">PO Number</td>
                <td style="padding: 8px 0; color: #1f2937; font-weight: 600; text-align: right;">{po.po_number}</td>
            </tr>
            <tr>
                <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Total Amount</td>
                <td style="padding: 8px 0; color: #1f2937; font-weight: 600; text-align: right;">${po.total_amount:,.2f}</td>
            </tr>
            <tr>
                <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Expected Delivery</td>
                <td style="padding: 8px 0; color: #1f2937; text-align: right;">{delivery_str}</td>
            </tr>
            <tr>
                <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Payment Terms</td>
                <td style="padding: 8px 0; color: #1f2937; text-align: right;">{payment_terms}</td>
            </tr>
        </table>
    </div>

    <h3 style="color: #1f2937;">Order Items</h3>
    <table style="width: 100%; border-collapse: collapse;">
        <thead>
            <tr style="background: #7c3aed; color: white;">
                <th style="padding: 8px; text-align: left;">Product</th>
                <th style="padding: 8px; text-align: center;">Qty</th>
                <th style="padding: 8px; text-align: right;">Unit Price</th>
                <th style="padding: 8px; text-align: right;">Total</th>
            </tr>
        </thead>
        <tbody>
            {items_html_rows}
        </tbody>
        <tfoot>
            <tr style="background: #f3f4f6; font-weight: 600;">
                <td colspan="3" style="padding: 8px; text-align: right;">Total:</td>
                <td style="padding: 8px; text-align: right;">${po.total_amount:,.2f}</td>
            </tr>
        </tfoot>
    </table>

    <p style="color: #4b5563; margin-top: 16px;">Please confirm this order at your earliest convenience.</p>
    <p style="color: #4b5563;">Best regards,<br><strong>{officer_name}</strong><br>Procurement Department</p>
    """

    html = _base_template(title="Purchase Order", body=body)

    # Send email
    success = send_email(
        to=supplier.email,
        subject=f"📋 Purchase Order {po.po_number} — ${po.total_amount:,.2f}",
        html=html,
    )

    if not success:
        raise HTTPException(status_code=500, detail="Failed to send email. Check Resend API key.")

    # Update PO status
    po.status = POStatus.sent
    po.sent_at = datetime.utcnow()
    db.commit()

    return {
        "message": f"PO {po.po_number} sent to {supplier.email}",
        "sent_to": supplier.email,
        "sent_at": po.sent_at.isoformat(),
        "po_status": "sent",
    }


@router.delete("/{po_id}", status_code=204)
async def delete_purchase_order(
    po_id: UUID,
    db: Session = Depends(get_db),
    user: dict = Depends(require_role("admin")),
):
    """Delete a purchase order. Admin only."""
    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if po.status != POStatus.draft:
        raise HTTPException(status_code=400, detail="Only draft POs can be deleted")

    db.delete(po)
    db.commit()


# ─── PDF Generation ─────────────────────────────────────────

@router.get("/{po_id}/pdf")
async def download_po_pdf(
    po_id: UUID,
    db: Session = Depends(get_db),
):
    """Generate and download a PO as a PDF document."""
    from fastapi.responses import StreamingResponse
    from app.services.pdf_service import generate_po_pdf

    po = (
        db.query(PurchaseOrder)
        .options(
            joinedload(PurchaseOrder.supplier),
            joinedload(PurchaseOrder.line_items).joinedload(POLineItem.product),
        )
        .filter(PurchaseOrder.id == po_id)
        .first()
    )
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    # Build line items data for PDF
    items = []
    for li in po.line_items:
        items.append({
            "product_name": li.product.name if li.product else "Unknown",
            "quantity": li.quantity,
            "unit_price": li.unit_price,
            "total_price": li.total_price,
        })

    pdf_bytes = generate_po_pdf(
        po_number=po.po_number,
        supplier_name=po.supplier.name if po.supplier else "Unknown",
        supplier_email=po.supplier.email if po.supplier else "",
        supplier_address=po.supplier.address if po.supplier else "",
        total_amount=po.total_amount,
        expected_delivery=str(po.expected_delivery) if po.expected_delivery else "",
        notes=po.notes or "",
        created_at=po.created_at.strftime("%B %d, %Y") if po.created_at else "",
        line_items=items,
    )

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{po.po_number}.pdf"'},
    )
