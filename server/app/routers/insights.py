"""
AI Insights router — smart recommendations and demand forecasting.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.insights_engine import generate_insights, generate_forecast

router = APIRouter()


@router.get("/")
async def get_insights(db: Session = Depends(get_db)):
    """Get all AI-generated insights (reorder alerts, spend anomalies, supplier risk)."""
    return generate_insights(db)


@router.get("/forecast")
async def get_forecast(db: Session = Depends(get_db)):
    """Get demand forecast based on historical PO data."""
    return generate_forecast(db)
