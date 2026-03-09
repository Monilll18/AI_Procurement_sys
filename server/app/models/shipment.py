"""
Shipment + ShipmentItem models.
Tracks supplier dispatch, carrier, tracking, and per-item quantities shipped.
"""
import uuid
import enum
from sqlalchemy import (
    Column, String, Integer, Float, DateTime, Date, Text,
    Enum, ForeignKey, func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class ShipmentStatus(str, enum.Enum):
    preparing = "preparing"
    dispatched = "dispatched"
    info_received = "info_received"
    in_transit = "in_transit"
    out_for_delivery = "out_for_delivery"
    delivered = "delivered"
    exception = "exception"
    expired = "expired"
    cancelled = "cancelled"


class ShipmentType(str, enum.Enum):
    full = "full"
    partial = "partial"


class Shipment(Base):
    __tablename__ = "shipments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    po_id = Column(UUID(as_uuid=True), ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False)
    shipment_number = Column(String(50), unique=True, nullable=False, index=True)
    shipment_type = Column(Enum(ShipmentType), nullable=False, default=ShipmentType.full)
    status = Column(Enum(ShipmentStatus), nullable=False, default=ShipmentStatus.preparing)

    carrier = Column(String(100), nullable=True)
    carrier_code = Column(String(50), nullable=True)       # AfterShip carrier slug
    tracking_number = Column(String(255), nullable=True)
    tracking_url = Column(Text, nullable=True)
    aftership_id = Column(String(100), nullable=True)       # AfterShip tracking ID
    estimated_delivery = Column(Date, nullable=True)
    actual_delivery = Column(Date, nullable=True)
    current_location = Column(String(255), nullable=True)   # Last known location
    last_checkpoint_message = Column(Text, nullable=True)
    last_checkpoint_time = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)

    created_by = Column(String(255), nullable=True)  # supplier user id
    dispatched_at = Column(DateTime(timezone=True), nullable=True)
    delivered_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    purchase_order = relationship("PurchaseOrder", backref="shipments")
    items = relationship("ShipmentItem", back_populates="shipment", cascade="all, delete-orphan")
    checkpoints = relationship("TrackingCheckpoint", back_populates="shipment", cascade="all, delete-orphan", order_by="TrackingCheckpoint.checkpoint_time.desc()")

    def __repr__(self):
        return f"<Shipment {self.shipment_number} po={self.po_id} status={self.status}>"


class ShipmentItem(Base):
    __tablename__ = "shipment_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shipment_id = Column(UUID(as_uuid=True), ForeignKey("shipments.id", ondelete="CASCADE"), nullable=False)
    po_line_item_id = Column(UUID(as_uuid=True), ForeignKey("po_line_items.id", ondelete="CASCADE"), nullable=False)
    quantity_shipped = Column(Integer, nullable=False)
    unit_price = Column(Float, nullable=True)  # Price at time of shipment
    notes = Column(Text, nullable=True)

    # Relationships
    shipment = relationship("Shipment", back_populates="items")
    po_line_item = relationship("POLineItem", backref="shipment_items")

    def __repr__(self):
        return f"<ShipmentItem shipment={self.shipment_id} qty={self.quantity_shipped}>"
