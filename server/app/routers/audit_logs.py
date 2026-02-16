from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional

from app.database import get_db
from app.models.audit_log import AuditLog

router = APIRouter()


@router.get("/")
async def list_audit_logs(
    entity_type: Optional[str] = None,
    action: Optional[str] = None,
    user_id: Optional[str] = None,
    limit: int = Query(default=100, le=500),
    offset: int = 0,
    db: Session = Depends(get_db),
):
    """List audit logs with optional filtering. Paginated."""
    query = db.query(AuditLog).order_by(desc(AuditLog.created_at))
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    if action:
        query = query.filter(AuditLog.action == action)
    if user_id:
        query = query.filter(AuditLog.user_id == user_id)

    total = query.count()
    logs = query.offset(offset).limit(limit).all()

    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "logs": [
            {
                "id": str(log.id),
                "user_id": log.user_id,
                "user_email": log.user_email,
                "action": log.action,
                "entity_type": log.entity_type,
                "entity_id": log.entity_id,
                "old_values": log.old_values,
                "new_values": log.new_values,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            }
            for log in logs
        ],
    }


@router.get("/summary")
async def audit_summary(db: Session = Depends(get_db)):
    """Summary statistics for the audit log."""
    from sqlalchemy import func

    total = db.query(AuditLog).count()

    by_action = (
        db.query(AuditLog.action, func.count(AuditLog.id).label("count"))
        .group_by(AuditLog.action)
        .all()
    )

    by_entity = (
        db.query(AuditLog.entity_type, func.count(AuditLog.id).label("count"))
        .group_by(AuditLog.entity_type)
        .all()
    )

    return {
        "total_events": total,
        "by_action": {a: c for a, c in by_action},
        "by_entity": {e: c for e, c in by_entity},
    }
