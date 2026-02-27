import uuid
from sqlalchemy import Column, String, Float, Integer, DateTime, Date, ForeignKey, Boolean, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class SupplierPrice(Base):
    """Tracks per-product pricing from each supplier over time.
    Enables price comparison, best-value scoring, and price trend analysis."""
    __tablename__ = "supplier_prices"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    supplier_id = Column(UUID(as_uuid=True), ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    unit_price = Column(Float, nullable=False)
    currency = Column(String(10), nullable=False, default="USD")
    min_order_qty = Column(Integer, nullable=True)
    available_quantity = Column(Integer, nullable=True)  # NULL = unlimited/not tracked
    lead_time_days = Column(Integer, nullable=True)
    valid_from = Column(Date, nullable=False)
    valid_to = Column(Date, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    source = Column(String(50), nullable=False, default="manual")  # manual, upload, api
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    supplier = relationship("Supplier", back_populates="prices")
    product = relationship("Product", back_populates="supplier_prices")

    def __repr__(self):
        return f"<SupplierPrice supplier={self.supplier_id} product={self.product_id} price={self.unit_price}>"
