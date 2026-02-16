from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional

from app.database import get_db
from app.models.notification import Notification

router = APIRouter()


@router.get("/")
async def list_notifications(
    user_id: Optional[str] = None,
    unread_only: bool = False,
    limit: int = Query(default=50, le=200),
    db: Session = Depends(get_db),
):
    """List notifications, optionally filtered by user and read status."""
    query = db.query(Notification).order_by(desc(Notification.created_at))
    if user_id:
        query = query.filter(Notification.user_id == user_id)
    if unread_only:
        query = query.filter(Notification.is_read == False)
    notifications = query.limit(limit).all()

    return [
        {
            "id": str(n.id),
            "user_id": n.user_id,
            "type": n.type,
            "title": n.title,
            "message": n.message,
            "link": n.link,
            "is_read": n.is_read,
            "created_at": n.created_at.isoformat() if n.created_at else None,
        }
        for n in notifications
    ]


@router.get("/unread-count")
async def unread_count(user_id: str, db: Session = Depends(get_db)):
    """Get count of unread notifications for a user."""
    count = (
        db.query(Notification)
        .filter(Notification.user_id == user_id, Notification.is_read == False)
        .count()
    )
    return {"unread_count": count}


@router.post("/{notification_id}/read")
async def mark_as_read(notification_id: str, db: Session = Depends(get_db)):
    """Mark a notification as read."""
    notif = db.query(Notification).filter(Notification.id == notification_id).first()
    if not notif:
        return {"error": "Notification not found"}
    notif.is_read = True
    db.commit()
    return {"message": "Marked as read"}


@router.post("/mark-all-read")
async def mark_all_read(user_id: str, db: Session = Depends(get_db)):
    """Mark all notifications for a user as read."""
    db.query(Notification).filter(
        Notification.user_id == user_id, Notification.is_read == False
    ).update({"is_read": True})
    db.commit()
    return {"message": "All notifications marked as read"}
