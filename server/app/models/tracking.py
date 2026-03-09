"""
Tracking models: Carrier definitions and shipment tracking checkpoints.
Used for real-time order tracking with AfterShip integration.
"""
import uuid
from sqlalchemy import (
    Column, String, Float, DateTime, Text, Boolean,
    ForeignKey, func,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.database import Base


class Carrier(Base):
    """Known shipping carrier definitions with AfterShip integration data."""
    __tablename__ = "carriers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String(50), unique=True, nullable=False, index=True)       # fedex, ups, dhl
    name = Column(String(100), nullable=False)                                # FedEx, UPS, DHL Express
    aftership_slug = Column(String(50), nullable=True)                        # AfterShip carrier slug
    tracking_url_template = Column(Text, nullable=True)                       # https://fedex.com/track?id={tracking_number}
    logo_url = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<Carrier {self.code} ({self.name})>"


class TrackingCheckpoint(Base):
    """Individual tracking checkpoint from carrier updates."""
    __tablename__ = "tracking_checkpoints"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shipment_id = Column(UUID(as_uuid=True), ForeignKey("shipments.id", ondelete="CASCADE"), nullable=False, index=True)

    checkpoint_time = Column(DateTime(timezone=True), nullable=False)
    location = Column(String(255), nullable=True)          # "Los Angeles, CA"
    city = Column(String(100), nullable=True)
    state = Column(String(100), nullable=True)
    country = Column(String(100), nullable=True)
    zip_code = Column(String(20), nullable=True)
    coordinates_lat = Column(Float, nullable=True)
    coordinates_lng = Column(Float, nullable=True)

    message = Column(Text, nullable=False)                 # "Package arrived at facility"
    status = Column(String(50), nullable=True)             # InTransit, Delivered, etc.
    substatus = Column(String(100), nullable=True)

    source = Column(String(50), default="manual")          # aftership, manual, supplier
    raw_data = Column(JSONB, nullable=True)                # Full checkpoint data from API
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    shipment = relationship("Shipment", back_populates="checkpoints")

    def __repr__(self):
        return f"<TrackingCheckpoint {self.shipment_id} '{self.message[:30]}'>"
