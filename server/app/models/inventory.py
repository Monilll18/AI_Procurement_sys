import uuid
from sqlalchemy import Column, Integer, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class Inventory(Base):
    __tablename__ = "inventory"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, unique=True)
    current_stock = Column(Integer, nullable=False, default=0)
    min_stock = Column(Integer, nullable=False, default=5)
    max_stock = Column(Integer, nullable=False, default=500)
    last_updated = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    product = relationship("Product", back_populates="inventory")

    def __repr__(self):
        return f"<Inventory product={self.product_id} stock={self.current_stock}>"
