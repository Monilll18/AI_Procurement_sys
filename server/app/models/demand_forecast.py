import uuid
from sqlalchemy import Column, String, Float, Integer, DateTime, Date, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.orm import relationship
from app.database import Base


class DemandForecast(Base):
    """Stores ML-generated demand predictions per product.
    Created periodically by the forecasting engine (statsmodels/Prophet)."""
    __tablename__ = "demand_forecasts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    forecast_date = Column(Date, nullable=False)
    predicted_demand = Column(Float, nullable=False)
    confidence_lower = Column(Float, nullable=True)
    confidence_upper = Column(Float, nullable=True)
    confidence_score = Column(Float, nullable=True)  # 0.0 - 1.0
    model_version = Column(String(50), nullable=False, default="v1")
    model_params = Column(JSON, nullable=True)  # store model hyperparams
    generated_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    product = relationship("Product", back_populates="demand_forecasts")

    def __repr__(self):
        return f"<DemandForecast product={self.product_id} date={self.forecast_date} demand={self.predicted_demand}>"
