import uuid
from sqlalchemy import Column, String, Integer, DateTime, Text, ForeignKey, Enum, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base
import enum


class ApprovalStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class Approval(Base):
    __tablename__ = "approvals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    po_id = Column(UUID(as_uuid=True), ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False)
    approver_id = Column(String(255), nullable=False)  # Clerk user ID
    status = Column(Enum(ApprovalStatus), nullable=False, default=ApprovalStatus.pending)
    comments = Column(Text, nullable=True)
    approval_level = Column(Integer, nullable=False, default=1)
    decided_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    purchase_order = relationship("PurchaseOrder", back_populates="approvals")

    def __repr__(self):
        return f"<Approval po={self.po_id} level={self.approval_level} status={self.status}>"
