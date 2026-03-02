"""
Purchase Requisitions router — full PR lifecycle with AI assistance.
Supports: create → submit → review → approve/reject → convert to PO.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, desc
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import uuid

from app.database import get_db
from app.models.purchase_requisition import PurchaseRequisition, PRLineItem, PRStatus, PRPriority
from app.models.purchase_order import PurchaseOrder, POLineItem, POStatus
from app.models.product import Product
from app.models.supplier import Supplier
from app.models.supplier_price import SupplierPrice
from app.middleware.auth import get_current_user
from app.middleware.role_guard import require_role
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────

class PRLineItemCreate(BaseModel):
    product_id: Optional[str] = None
    item_name: str
    item_description: Optional[str] = None
    quantity: int = 1
    estimated_unit_price: float = 0
    unit: str = "pcs"


class PRCreate(BaseModel):
    title: str
    description: Optional[str] = None
    department: Optional[str] = None
    category: Optional[str] = None
    priority: str = "medium"
    estimated_total: float = 0
    budget_code: Optional[str] = None
    preferred_supplier_id: Optional[str] = None
    needed_by: Optional[str] = None
    justification: Optional[str] = None
    notes: Optional[str] = None
    line_items: List[PRLineItemCreate] = []


class PRUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    department: Optional[str] = None
    category: Optional[str] = None
    priority: Optional[str] = None
    budget_code: Optional[str] = None
    preferred_supplier_id: Optional[str] = None
    needed_by: Optional[str] = None
    justification: Optional[str] = None
    notes: Optional[str] = None


def _pr_to_response(pr: PurchaseRequisition) -> dict:
    return {
        "id": str(pr.id),
        "pr_number": pr.pr_number,
        "title": pr.title,
        "description": pr.description,
        "requested_by": pr.requested_by,
        "department": pr.department,
        "category": pr.category,
        "priority": pr.priority.value if pr.priority else "medium",
        "status": pr.status.value if pr.status else "draft",
        "estimated_total": pr.estimated_total,
        "budget_code": pr.budget_code,
        "preferred_supplier_id": str(pr.preferred_supplier_id) if pr.preferred_supplier_id else None,
        "needed_by": str(pr.needed_by) if pr.needed_by else None,
        "submitted_at": pr.submitted_at.isoformat() if pr.submitted_at else None,
        "approved_at": pr.approved_at.isoformat() if pr.approved_at else None,
        "rejected_at": pr.rejected_at.isoformat() if pr.rejected_at else None,
        "approved_by": pr.approved_by,
        "rejection_reason": pr.rejection_reason,
        "po_id": str(pr.po_id) if pr.po_id else None,
        "ai_suggested_supplier": pr.ai_suggested_supplier,
        "ai_suggested_quantity": pr.ai_suggested_quantity,
        "notes": pr.notes,
        "justification": pr.justification,
        "created_at": pr.created_at.isoformat() if pr.created_at else None,
        "line_items": [
            {
                "id": str(li.id),
                "product_id": str(li.product_id) if li.product_id else None,
                "item_name": li.item_name,
                "item_description": li.item_description,
                "quantity": li.quantity,
                "estimated_unit_price": li.estimated_unit_price,
                "estimated_total": li.estimated_total,
                "unit": li.unit,
            }
            for li in (pr.line_items or [])
        ],
    }


def _generate_pr_number(db: Session) -> str:
    """Generate next PR number like PR-2026-0001."""
    year = datetime.utcnow().year
    count = db.query(PurchaseRequisition).filter(
        PurchaseRequisition.pr_number.like(f"PR-{year}-%")
    ).count()
    return f"PR-{year}-{str(count + 1).zfill(4)}"


# ─── AI Assistance ───────────────────────────────────────────────

def _suggest_supplier(db: Session, product_ids: List[str]) -> Optional[dict]:
    """AI: Find the best supplier based on price and rating for given products."""
    if not product_ids:
        return None

    # Get all supplier prices for these products
    prices = (
        db.query(SupplierPrice, Supplier)
        .join(Supplier, Supplier.id == SupplierPrice.supplier_id)
        .filter(
            SupplierPrice.product_id.in_(product_ids),
            SupplierPrice.is_active == True,
            Supplier.status == "active",
        )
        .all()
    )

    if not prices:
        return None

    # Score suppliers: lower price + higher rating = better
    supplier_scores: dict = {}
    for sp, supplier in prices:
        sid = str(supplier.id)
        if sid not in supplier_scores:
            supplier_scores[sid] = {
                "id": sid,
                "name": supplier.name,
                "rating": supplier.rating or 3.0,
                "total_price": 0,
                "products_covered": 0,
            }
        supplier_scores[sid]["total_price"] += sp.unit_price
        supplier_scores[sid]["products_covered"] += 1

    # Rank by: products covered (desc), then rating (desc), then price (asc)
    ranked = sorted(
        supplier_scores.values(),
        key=lambda x: (-x["products_covered"], -x["rating"], x["total_price"]),
    )

    return ranked[0] if ranked else None


# ─── Endpoints ────────────────────────────────────────────────────

@router.get("/")
async def list_requisitions(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    limit: int = Query(default=50, le=200),
    db: Session = Depends(get_db),
):
    """List purchase requisitions with optional filters."""
    q = db.query(PurchaseRequisition).options(joinedload(PurchaseRequisition.line_items))

    if status:
        q = q.filter(PurchaseRequisition.status == status)
    if priority:
        q = q.filter(PurchaseRequisition.priority == priority)

    prs = q.order_by(desc(PurchaseRequisition.created_at)).limit(limit).all()
    return [_pr_to_response(pr) for pr in prs]


@router.get("/{pr_id}")
async def get_requisition(pr_id: str, db: Session = Depends(get_db)):
    """Get a single PR with details."""
    pr = (
        db.query(PurchaseRequisition)
        .options(joinedload(PurchaseRequisition.line_items))
        .filter(PurchaseRequisition.id == pr_id)
        .first()
    )
    if not pr:
        raise HTTPException(status_code=404, detail="Requisition not found")
    return _pr_to_response(pr)


@router.post("/")
async def create_requisition(
    data: PRCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_role("admin", "manager", "procurement_officer")),
):
    """Create a new purchase requisition. Requires Officer/Manager/Admin role."""
    pr = PurchaseRequisition(
        pr_number=_generate_pr_number(db),
        title=data.title,
        description=data.description,
        requested_by=user["clerk_id"],
        department=data.department,
        category=data.category,
        priority=PRPriority(data.priority) if data.priority else PRPriority.medium,
        estimated_total=data.estimated_total,
        budget_code=data.budget_code,
        preferred_supplier_id=data.preferred_supplier_id if data.preferred_supplier_id else None,
        needed_by=data.needed_by,
        justification=data.justification,
        notes=data.notes,
    )

    total = 0
    product_ids = []
    for item in data.line_items:
        li_total = item.quantity * item.estimated_unit_price
        total += li_total
        line = PRLineItem(
            product_id=item.product_id if item.product_id else None,
            item_name=item.item_name,
            item_description=item.item_description,
            quantity=item.quantity,
            estimated_unit_price=item.estimated_unit_price,
            estimated_total=li_total,
            unit=item.unit,
        )
        pr.line_items.append(line)
        if item.product_id:
            product_ids.append(item.product_id)

    pr.estimated_total = total or data.estimated_total

    # AI Suggestion: find best supplier if none specified
    if not data.preferred_supplier_id and product_ids:
        suggestion = _suggest_supplier(db, product_ids)
        if suggestion:
            pr.preferred_supplier_id = suggestion["id"]
            pr.ai_suggested_supplier = True

    db.add(pr)
    db.commit()
    db.refresh(pr)
    return _pr_to_response(pr)


@router.patch("/{pr_id}")
async def update_requisition(
    pr_id: str,
    updates: PRUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_role("admin", "manager", "procurement_officer")),
):
    """Update a draft PR. Requires Officer/Manager/Admin role."""
    pr = db.query(PurchaseRequisition).filter(PurchaseRequisition.id == pr_id).first()
    if not pr:
        raise HTTPException(status_code=404, detail="Requisition not found")
    if pr.status not in [PRStatus.draft, PRStatus.rejected]:
        raise HTTPException(status_code=400, detail="Can only edit draft or rejected PRs")

    for key, value in updates.dict(exclude_unset=True).items():
        if key == "priority":
            value = PRPriority(value)
        setattr(pr, key, value)

    db.commit()
    db.refresh(pr)
    return _pr_to_response(pr)


@router.post("/{pr_id}/submit")
async def submit_requisition(
    pr_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(require_role("admin", "manager", "procurement_officer")),
):
    """Submit a PR for approval. Requires Officer/Manager/Admin role."""
    pr = db.query(PurchaseRequisition).filter(PurchaseRequisition.id == pr_id).first()
    if not pr:
        raise HTTPException(status_code=404, detail="Requisition not found")
    if pr.status not in [PRStatus.draft, PRStatus.rejected]:
        raise HTTPException(status_code=400, detail="Can only submit draft or rejected PRs")

    pr.status = PRStatus.submitted
    pr.submitted_at = datetime.utcnow()
    db.commit()

    # 📧 Send email notification to admins/managers
    try:
        from app.services.email_service import send_approval_needed
        from app.models.user import User
        approvers = db.query(User).filter(User.role.in_(["admin", "manager", "approver"]), User.is_active == True).all()
        for approver in approvers:
            if approver.email:
                send_approval_needed(
                    approver_email=approver.email,
                    approver_name=approver.full_name or approver.email,
                    pr_number=pr.pr_number,
                    requester_name=user.get("email", "Unknown"),
                    amount=pr.estimated_total,
                    purpose=pr.title,
                )
                logger.info(f"Approval email sent to {approver.email} for {pr.pr_number}")
    except Exception as e:
        logger.warning(f"Email send failed (non-blocking): {e}")

    return {"message": "Requisition submitted for approval", "pr_number": pr.pr_number}


@router.post("/{pr_id}/approve")
async def approve_requisition(
    pr_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(require_role("admin", "manager", "approver")),
):
    """Approve a submitted PR. Requires Manager/Admin/Finance role."""
    pr = db.query(PurchaseRequisition).filter(PurchaseRequisition.id == pr_id).first()
    if not pr:
        raise HTTPException(status_code=404, detail="Requisition not found")
    if pr.status not in [PRStatus.submitted, PRStatus.under_review]:
        raise HTTPException(status_code=400, detail="Can only approve submitted PRs")

    pr.status = PRStatus.approved
    pr.approved_at = datetime.utcnow()
    pr.approved_by = user["clerk_id"]
    db.commit()

    # 📧 Send approval email to requester
    try:
        from app.services.email_service import send_pr_approved
        from app.models.user import User
        requester = db.query(User).filter(User.clerk_id == pr.requested_by).first()
        if requester and requester.email:
            send_pr_approved(
                requester_email=requester.email,
                requester_name=requester.full_name or requester.email,
                pr_number=pr.pr_number,
                approver_name=user.get("email", "Manager"),
            )
            logger.info(f"Approval email sent to {requester.email} for {pr.pr_number}")
    except Exception as e:
        logger.warning(f"Email send failed (non-blocking): {e}")

    return {"message": "Requisition approved", "pr_number": pr.pr_number}


@router.post("/{pr_id}/reject")
async def reject_requisition(
    pr_id: str,
    reason: str = "No reason provided",
    db: Session = Depends(get_db),
    user: dict = Depends(require_role("admin", "manager", "approver")),
):
    """Reject a submitted PR. Requires Manager/Admin/Finance role."""
    pr = db.query(PurchaseRequisition).filter(PurchaseRequisition.id == pr_id).first()
    if not pr:
        raise HTTPException(status_code=404, detail="Requisition not found")

    pr.status = PRStatus.rejected
    pr.rejected_at = datetime.utcnow()
    pr.rejection_reason = reason
    db.commit()

    # 📧 Send rejection email to requester
    try:
        from app.services.email_service import send_pr_rejected
        from app.models.user import User
        requester = db.query(User).filter(User.clerk_id == pr.requested_by).first()
        if requester and requester.email:
            send_pr_rejected(
                requester_email=requester.email,
                requester_name=requester.full_name or requester.email,
                pr_number=pr.pr_number,
                approver_name=user.get("email", "Manager"),
                reason=reason,
            )
            logger.info(f"Rejection email sent to {requester.email} for {pr.pr_number}")
    except Exception as e:
        logger.warning(f"Email send failed (non-blocking): {e}")

    return {"message": "Requisition rejected", "pr_number": pr.pr_number}


class ConvertToPORequest(BaseModel):
    """Optional request body for PR → PO conversion.
    Allows buyer to choose supplier and override prices."""
    supplier_id: Optional[str] = None
    line_item_prices: Optional[dict] = None  # { product_id_or_item_name: unit_price }
    notes: Optional[str] = None


@router.post("/{pr_id}/convert-to-po")
async def convert_to_po(
    pr_id: str,
    body: Optional[ConvertToPORequest] = None,
    db: Session = Depends(get_db),
    user: dict = Depends(require_role("admin", "manager")),
):
    """Convert an approved PR into a Purchase Order. Requires Manager/Admin role.
    
    Accepts optional body with:
    - supplier_id: manually chosen supplier (overrides AI suggestion)
    - line_item_prices: { product_id: unit_price } to override estimated prices
    - notes: additional PO notes
    """
    pr = (
        db.query(PurchaseRequisition)
        .options(joinedload(PurchaseRequisition.line_items))
        .filter(PurchaseRequisition.id == pr_id)
        .first()
    )
    if not pr:
        raise HTTPException(status_code=404, detail="Requisition not found")
    if pr.status != PRStatus.approved:
        raise HTTPException(status_code=400, detail="Only approved PRs can be converted to POs")

    # Supplier selection priority:
    # 1. Buyer's manual choice (from request body)
    # 2. PR preferred supplier (AI suggestion)
    # 3. Fallback to first available
    supplier_id = None
    if body and body.supplier_id:
        supplier_id = body.supplier_id
    elif pr.preferred_supplier_id:
        supplier_id = pr.preferred_supplier_id
    
    if not supplier_id:
        first_supplier = db.query(Supplier).filter(Supplier.status == "active").first()
        if not first_supplier:
            raise HTTPException(
                status_code=400,
                detail="No active suppliers exist. Please create a supplier first.",
            )
        supplier_id = first_supplier.id

    # Verify supplier exists and is active
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Selected supplier not found")

    # ─── Catalog Validation ─────────────────────────────────────────
    # First, resolve product IDs for ALL line items (even manually typed ones)
    resolved_items = []  # List of (line_item, resolved_product_id)
    for li in pr.line_items:
        product_id = li.product_id
        if not product_id and li.item_name:
            # Try to find product by name
            product = db.query(Product).filter(
                Product.name.ilike(f"%{li.item_name}%")
            ).first()
            if product:
                product_id = product.id
        resolved_items.append((li, product_id))

    # Check which resolved products this supplier actually carries
    resolved_product_ids = [pid for _, pid in resolved_items if pid]
    catalog_hits = set()
    if resolved_product_ids:
        matching_prices = db.query(SupplierPrice.product_id).filter(
            SupplierPrice.supplier_id == supplier_id,
            SupplierPrice.product_id.in_(resolved_product_ids),
            SupplierPrice.is_active == True,
        ).all()
        catalog_hits = {str(sp.product_id) for sp in matching_prices}

    products_total = len(resolved_items)  # Total line items
    products_with_id = len(resolved_product_ids)  # Items we could identify
    products_in_catalog = len(catalog_hits)
    catalog_warning = None

    if products_with_id > 0 and products_in_catalog == 0:
        # Supplier has NONE of the identifiable products — block
        force = (body.notes or "").strip().lower() == "force" if body else False
        if not force:
            missing_names = [li.item_name for li, pid in resolved_items if pid and str(pid) not in catalog_hits]
            if not missing_names:
                missing_names = [li.item_name for li, _ in resolved_items if li.item_name]
            raise HTTPException(
                status_code=400,
                detail=f"{supplier.name} does not carry any of the requested products "
                       f"({', '.join(missing_names[:3])}). Choose a different supplier or "
                       f"add these products to their catalog first.",
            )
    elif products_with_id > 0 and products_in_catalog < products_with_id:
        missing_names = [li.item_name for li, pid in resolved_items if pid and str(pid) not in catalog_hits]
        catalog_warning = (
            f"Warning: {supplier.name} is missing {products_with_id - products_in_catalog} of "
            f"{products_with_id} products in their catalog ({', '.join(missing_names[:3])}). "
            f"PR estimated prices will be used for missing items."
        )
    elif products_with_id == 0 and products_total > 0:
        catalog_warning = (
            f"Warning: None of the {products_total} items could be matched to products in the system. "
            f"Using PR estimated prices."
        )

    # Build price lookup from body overrides
    price_overrides = (body.line_item_prices or {}) if body else {}

    # Generate PO number
    year = datetime.utcnow().year
    po_count = db.query(PurchaseOrder).filter(
        PurchaseOrder.po_number.like(f"PO-{year}-%")
    ).count()
    po_number = f"PO-{year}-{str(po_count + 1).zfill(4)}"

    # Create PO from PR
    extra_notes = (body.notes or "") if body else ""
    po = PurchaseOrder(
        po_number=po_number,
        supplier_id=supplier_id,
        created_by=user["clerk_id"],
        status=POStatus.draft,
        total_amount=0,  # Will be calculated from line items
        expected_delivery=pr.needed_by,
        notes=f"From {pr.pr_number}. {extra_notes} {pr.notes or ''}".strip(),
    )

    # Convert line items — use resolved product IDs and buyer's price overrides
    total = 0
    for li, resolved_pid in resolved_items:
        product_id = resolved_pid
        # If still no product_id, create auto product
        if not product_id and li.item_name:
            product = Product(
                sku=f"AUTO-{li.item_name[:20].upper().replace(' ', '-')}",
                name=li.item_name or "Unnamed Item",
                category=pr.category or "General",
                unit=li.unit or "pcs",
            )
            db.add(product)
            db.flush()
            product_id = product.id
        elif not product_id:
            # Skip items with no name and no product_id
            continue

        # Price priority: buyer override > supplier catalog > PR estimate
        unit_price = li.estimated_unit_price or 0
        pid_str = str(product_id) if product_id else ""
        if pid_str in price_overrides:
            unit_price = float(price_overrides[pid_str])
        elif product_id:
            # Try to get supplier's actual price for this product
            sp = db.query(SupplierPrice).filter(
                SupplierPrice.product_id == product_id,
                SupplierPrice.supplier_id == supplier_id,
                SupplierPrice.is_active == True,
            ).first()
            if sp:
                unit_price = sp.unit_price

        line_total = li.quantity * unit_price
        total += line_total

        po_line = POLineItem(
            product_id=product_id,
            quantity=li.quantity,
            unit_price=unit_price,
            total_price=line_total,
        )
        po.line_items.append(po_line)

    po.total_amount = total
    db.add(po)

    # Update PR
    pr.status = PRStatus.converted_to_po
    pr.po_id = po.id

    db.commit()
    db.refresh(po)

    return {
        "message": f"{pr.pr_number} converted to {po.po_number}",
        "po_id": str(po.id),
        "po_number": po.po_number,
        "supplier_name": supplier.name,
        "total_amount": total,
        "catalog_warning": catalog_warning,
    }


@router.get("/{pr_id}/supplier-coverage")
async def get_supplier_coverage(
    pr_id: str,
    db: Session = Depends(get_db),
):
    """For a given PR, return how many of its products each supplier carries.
    Used by the frontend supplier picker to show product availability."""
    pr = (
        db.query(PurchaseRequisition)
        .options(joinedload(PurchaseRequisition.line_items))
        .filter(PurchaseRequisition.id == pr_id)
        .first()
    )
    if not pr:
        raise HTTPException(status_code=404, detail="Requisition not found")

    # Resolve product IDs — same logic as convert_to_po
    product_ids = []
    for li in pr.line_items:
        pid = li.product_id
        if not pid and li.item_name:
            product = db.query(Product).filter(
                Product.name.ilike(f"%{li.item_name}%")
            ).first()
            if product:
                pid = product.id
        if pid:
            product_ids.append(pid)

    total_products = len(product_ids)

    # Get all active suppliers
    active_suppliers = db.query(Supplier).filter(Supplier.status == "active").all()

    coverage = []
    for supplier in active_suppliers:
        if total_products > 0:
            matching = db.query(SupplierPrice.product_id).filter(
                SupplierPrice.supplier_id == supplier.id,
                SupplierPrice.product_id.in_(product_ids),
                SupplierPrice.is_active == True,
            ).all()
            matched = len({str(sp.product_id) for sp in matching})
        else:
            matched = 0

        coverage.append({
            "supplier_id": str(supplier.id),
            "supplier_name": supplier.name,
            "products_matched": matched,
            "products_total": total_products,
            "has_all": matched == total_products and total_products > 0,
            "has_none": matched == 0 and total_products > 0,
        })

    # Sort: suppliers with most coverage first
    coverage.sort(key=lambda c: c["products_matched"], reverse=True)

    return {"pr_id": pr_id, "total_products": total_products, "suppliers": coverage}


@router.get("/stats/summary")
async def get_pr_stats(db: Session = Depends(get_db)):
    """Get summary statistics for PRs."""
    total = db.query(PurchaseRequisition).count()
    by_status = (
        db.query(PurchaseRequisition.status, func.count(PurchaseRequisition.id))
        .group_by(PurchaseRequisition.status)
        .all()
    )
    status_counts = {s.value: c for s, c in by_status}

    return {
        "total": total,
        "by_status": status_counts,
        "pending_review": status_counts.get("submitted", 0) + status_counts.get("under_review", 0),
    }
