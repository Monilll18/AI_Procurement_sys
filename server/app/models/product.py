import uuid
from sqlalchemy import Column, String, Integer, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class Product(Base):
    __tablename__ = "products"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sku = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    category = Column(String(100), nullable=False)
    unit = Column(String(50), nullable=False, default="pcs")  # kg, liters, pcs, etc.
    reorder_point = Column(Integer, nullable=False, default=10)
    reorder_quantity = Column(Integer, nullable=False, default=50)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    inventory = relationship("Inventory", back_populates="product", uselist=False)
    line_items = relationship("POLineItem", back_populates="product")
    supplier_prices = relationship("SupplierPrice", back_populates="product", cascade="all, delete-orphan")
    demand_forecasts = relationship("DemandForecast", back_populates="product", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Product {self.sku}: {self.name}>"
