import uuid
from sqlalchemy import Column, String, Boolean, DateTime, Text, func
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
import enum


class NotificationType(str, enum.Enum):
    approval_needed = "approval_needed"
    approval_result = "approval_result"
    stock_alert = "stock_alert"
    price_spike = "price_spike"
    po_sent = "po_sent"
    po_received = "po_received"
    forecast_ready = "forecast_ready"
    system = "system"


class Notification(Base):
    """In-app notifications for users.
    Types: approval requests, stock alerts, price spikes, PO status changes."""
    __tablename__ = "notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String(255), nullable=False, index=True)  # Clerk user ID
    type = Column(String(50), nullable=False)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    link = Column(String(500), nullable=True)  # e.g. /purchase-orders/abc123
    is_read = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    def __repr__(self):
        return f"<Notification {self.type} to={self.user_id} read={self.is_read}>"
