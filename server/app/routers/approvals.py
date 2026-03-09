from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List
from uuid import UUID
from datetime import datetime

from app.database import get_db
from app.models.approval import Approval, ApprovalStatus
from app.models.purchase_order import PurchaseOrder, POStatus
from app.middleware.auth import get_current_user
from app.middleware.role_guard import require_role

router = APIRouter()


@router.get("/pending", response_model=List[dict])
async def list_pending_approvals(
    db: Session = Depends(get_db),
    user: dict = Depends(require_role("admin", "manager", "approver")),
):
    """List all pending approval requests. Requires Manager/Admin/Finance role."""
    approvals = (
        db.query(Approval)
        .filter(Approval.status == ApprovalStatus.pending)
        .all()
    )
    return [
        {
            "id": str(a.id),
            "po_id": str(a.po_id),
            "approver_id": a.approver_id,
            "status": a.status.value,
            "approval_level": a.approval_level,
            "comments": a.comments,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in approvals
    ]


@router.post("/{po_id}/approve")
async def approve_purchase_order(
    po_id: UUID,
    db: Session = Depends(get_db),
    user: dict = Depends(require_role("admin")),
):
    """Approve a purchase order. Requires Admin role only (segregation of duties)."""
    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if po.status != POStatus.pending_approval:
        raise HTTPException(status_code=400, detail="PO is not pending approval")

    # Create an approval record — use the verified user identity
    approval = Approval(
        po_id=po_id,
        approver_id=user["clerk_id"],
        status=ApprovalStatus.approved,
        decided_at=datetime.utcnow(),
    )
    db.add(approval)

    # Update PO status
    po.status = POStatus.approved
    db.commit()

    return {"message": "Purchase order approved", "po_number": po.po_number}


@router.post("/{po_id}/reject")
async def reject_purchase_order(
    po_id: UUID,
    comments: str = "",
    db: Session = Depends(get_db),
    user: dict = Depends(require_role("admin", "manager", "approver")),
):
    """Reject a purchase order. Requires Manager/Admin/Finance role."""
    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if po.status != POStatus.pending_approval:
        raise HTTPException(status_code=400, detail="PO is not pending approval")

    # Create a rejection record — use the verified user identity
    approval = Approval(
        po_id=po_id,
        approver_id=user["clerk_id"],
        status=ApprovalStatus.rejected,
        comments=comments,
        decided_at=datetime.utcnow(),
    )
    db.add(approval)

    # Update PO status back to draft for revision
    po.status = POStatus.draft
    db.commit()

    return {"message": "Purchase order rejected", "po_number": po.po_number}
