import uuid
from sqlalchemy import Column, String, Float, Integer, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class Budget(Base):
    """Tracks budget allocation and spending per category/department per period.
    Enables budget vs actual analytics."""
    __tablename__ = "budgets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    category = Column(String(100), nullable=False)  # product category or department
    budget_type = Column(String(50), nullable=False, default="category")  # category, department
    period_year = Column(Integer, nullable=False)
    period_month = Column(Integer, nullable=True)  # null = yearly budget
    allocated_amount = Column(Float, nullable=False, default=0.0)
    spent_amount = Column(Float, nullable=False, default=0.0)
    currency = Column(String(10), nullable=False, default="USD")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<Budget {self.category} {self.period_year}/{self.period_month} alloc={self.allocated_amount}>"
