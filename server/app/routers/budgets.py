from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional

from app.database import get_db
from app.models.budget import Budget
from app.models.product import Product
from app.models.purchase_order import PurchaseOrder, POLineItem, POStatus

router = APIRouter()


@router.get("/")
async def list_budgets(
    period_year: Optional[int] = None,
    budget_type: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """List all budgets with spent amount calculated from actual PO data."""
    query = db.query(Budget)
    if period_year:
        query = query.filter(Budget.period_year == period_year)
    if budget_type:
        query = query.filter(Budget.budget_type == budget_type)

    budgets = query.all()
    return [
        {
            "id": str(b.id),
            "category": b.category,
            "budget_type": b.budget_type,
            "period_year": b.period_year,
            "period_month": b.period_month,
            "allocated_amount": b.allocated_amount,
            "spent_amount": b.spent_amount,
            "remaining": round(b.allocated_amount - b.spent_amount, 2),
            "utilization_pct": round((b.spent_amount / b.allocated_amount) * 100, 1) if b.allocated_amount > 0 else 0,
            "currency": b.currency,
        }
        for b in budgets
    ]


@router.get("/vs-actual")
async def budget_vs_actual(period_year: int = 2026, db: Session = Depends(get_db)):
    """Compare allocated budgets vs actual spend from POs per category."""
    budgets = db.query(Budget).filter(Budget.period_year == period_year).all()

    # Get actual spend by category from approved/sent/received POs
    from sqlalchemy import extract
    actual_spend = (
        db.query(
            Product.category,
            func.sum(POLineItem.total_price).label("total"),
        )
        .join(POLineItem, POLineItem.product_id == Product.id)
        .join(PurchaseOrder, PurchaseOrder.id == POLineItem.po_id)
        .filter(PurchaseOrder.status.notin_([POStatus.draft, POStatus.cancelled]))
        .filter(extract("year", PurchaseOrder.created_at) == period_year)
        .group_by(Product.category)
        .all()
    )
    spend_map = {cat: total for cat, total in actual_spend}

    result = []
    for b in budgets:
        actual = spend_map.get(b.category, 0) or 0
        result.append({
            "category": b.category,
            "allocated": b.allocated_amount,
            "actual_spent": round(actual, 2),
            "remaining": round(b.allocated_amount - actual, 2),
            "utilization_pct": round((actual / b.allocated_amount) * 100, 1) if b.allocated_amount > 0 else 0,
            "over_budget": actual > b.allocated_amount,
        })

    return sorted(result, key=lambda x: x["utilization_pct"], reverse=True)


@router.post("/")
async def create_budget(
    category: str,
    allocated_amount: float,
    period_year: int = 2026,
    period_month: Optional[int] = None,
    budget_type: str = "category",
    currency: str = "USD",
    db: Session = Depends(get_db),
):
    """Create a new budget allocation."""
    budget = Budget(
        category=category,
        budget_type=budget_type,
        period_year=period_year,
        period_month=period_month,
        allocated_amount=allocated_amount,
        currency=currency,
    )
    db.add(budget)
    db.commit()
    db.refresh(budget)
    return {"id": str(budget.id), "message": "Budget created"}
