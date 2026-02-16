import uuid
from sqlalchemy import Column, String, Float, DateTime, Enum, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base
import enum


class SupplierStatus(str, enum.Enum):
    active = "active"
    inactive = "inactive"
    blacklisted = "blacklisted"


class Supplier(Base):
    __tablename__ = "suppliers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=True)
    phone = Column(String(50), nullable=True)
    address = Column(String(500), nullable=True)
    rating = Column(Float, nullable=False, default=4.0)
    status = Column(Enum(SupplierStatus), nullable=False, default=SupplierStatus.active)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    purchase_orders = relationship("PurchaseOrder", back_populates="supplier")
    prices = relationship("SupplierPrice", back_populates="supplier", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Supplier {self.name}>"
