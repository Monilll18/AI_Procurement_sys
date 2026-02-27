import uuid
from sqlalchemy import Column, String, Float, Integer, DateTime, Date, Text, ForeignKey, Enum, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base
import enum


class POStatus(str, enum.Enum):
    draft = "draft"
    pending_approval = "pending_approval"
    approved = "approved"
    sent = "sent"
    partially_received = "partially_received"
    received = "received"
    inspection = "inspection"
    invoiced = "invoiced"
    paid = "paid"
    cancelled = "cancelled"


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    po_number = Column(String(50), unique=True, nullable=False, index=True)
    supplier_id = Column(UUID(as_uuid=True), ForeignKey("suppliers.id"), nullable=True)
    created_by = Column(String(255), nullable=False)  # Clerk user ID
    status = Column(Enum(POStatus), nullable=False, default=POStatus.draft)
    total_amount = Column(Float, nullable=False, default=0.0)
    expected_delivery = Column(Date, nullable=True)
    notes = Column(Text, nullable=True)
    pdf_url = Column(Text, nullable=True)  # Link to generated PDF
    sent_at = Column(DateTime(timezone=True), nullable=True)  # When PO was sent to supplier
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    supplier = relationship("Supplier", back_populates="purchase_orders")
    line_items = relationship("POLineItem", back_populates="purchase_order", cascade="all, delete-orphan")
    approvals = relationship("Approval", back_populates="purchase_order", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<PurchaseOrder {self.po_number}>"


class POLineItem(Base):
    __tablename__ = "po_line_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    po_id = Column(UUID(as_uuid=True), ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=False)
    quantity = Column(Integer, nullable=False)
    unit_price = Column(Float, nullable=False)
    total_price = Column(Float, nullable=False)
    quantity_received = Column(Integer, nullable=False, default=0)

    # Relationships
    purchase_order = relationship("PurchaseOrder", back_populates="line_items")
    product = relationship("Product", back_populates="line_items")

    def __repr__(self):
        return f"<POLineItem po={self.po_id} product={self.product_id} qty={self.quantity}>"
