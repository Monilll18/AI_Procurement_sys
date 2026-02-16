from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from uuid import UUID
from datetime import date

from app.database import get_db
from app.models.supplier_price import SupplierPrice
from app.models.supplier import Supplier
from app.models.product import Product

router = APIRouter()


@router.get("/")
async def list_supplier_prices(
    product_id: Optional[str] = None,
    supplier_id: Optional[str] = None,
    active_only: bool = True,
    db: Session = Depends(get_db),
):
    """List supplier prices, optionally filtered by product or supplier."""
    query = db.query(SupplierPrice)
    if product_id:
        query = query.filter(SupplierPrice.product_id == product_id)
    if supplier_id:
        query = query.filter(SupplierPrice.supplier_id == supplier_id)
    if active_only:
        query = query.filter(SupplierPrice.is_active == True)

    prices = query.all()
    return [
        {
            "id": str(sp.id),
            "supplier_id": str(sp.supplier_id),
            "supplier_name": sp.supplier.name if sp.supplier else None,
            "product_id": str(sp.product_id),
            "product_name": sp.product.name if sp.product else None,
            "unit_price": sp.unit_price,
            "currency": sp.currency,
            "min_order_qty": sp.min_order_qty,
            "lead_time_days": sp.lead_time_days,
            "valid_from": sp.valid_from.isoformat() if sp.valid_from else None,
            "valid_to": sp.valid_to.isoformat() if sp.valid_to else None,
            "is_active": sp.is_active,
            "source": sp.source,
        }
        for sp in prices
    ]


@router.get("/compare/{product_id}")
async def compare_prices(product_id: str, db: Session = Depends(get_db)):
    """Compare prices from all suppliers for a specific product.
    Returns suppliers sorted by price (cheapest first) with value scoring."""
    today = date.today()
    prices = (
        db.query(SupplierPrice, Supplier)
        .join(Supplier, Supplier.id == SupplierPrice.supplier_id)
        .filter(SupplierPrice.product_id == product_id)
        .filter(SupplierPrice.is_active == True)
        .filter(SupplierPrice.valid_from <= today)
        .filter(
            (SupplierPrice.valid_to >= today) | (SupplierPrice.valid_to == None)
        )
        .order_by(SupplierPrice.unit_price.asc())
        .all()
    )

    if not prices:
        return {"product_id": product_id, "comparisons": [], "best_supplier": None}

    product = db.query(Product).filter(Product.id == product_id).first()
    best_price = prices[0][0].unit_price
    avg_price = sum(sp.unit_price for sp, _ in prices) / len(prices)

    comparisons = []
    for sp, supplier in prices:
        savings_vs_avg = round(((avg_price - sp.unit_price) / avg_price) * 100, 1) if avg_price > 0 else 0
        comparisons.append({
            "supplier_id": str(supplier.id),
            "supplier_name": supplier.name,
            "supplier_rating": supplier.rating,
            "unit_price": sp.unit_price,
            "currency": sp.currency,
            "min_order_qty": sp.min_order_qty,
            "lead_time_days": sp.lead_time_days,
            "savings_vs_avg_pct": savings_vs_avg,
            "is_cheapest": sp.unit_price == best_price,
            "value_score": round(
                (supplier.rating / 5.0) * 40
                + (1 - (sp.unit_price / (avg_price * 1.5))) * 40
                + (1 - min((sp.lead_time_days or 7) / 30, 1)) * 20,
                1,
            ),
        })

    return {
        "product_id": product_id,
        "product_name": product.name if product else None,
        "supplier_count": len(comparisons),
        "price_range": {"min": best_price, "max": prices[-1][0].unit_price, "avg": round(avg_price, 2)},
        "comparisons": comparisons,
        "best_supplier": comparisons[0] if comparisons else None,
    }


@router.post("/")
async def create_supplier_price(
    supplier_id: str,
    product_id: str,
    unit_price: float,
    currency: str = "USD",
    min_order_qty: Optional[int] = None,
    lead_time_days: Optional[int] = None,
    valid_from: Optional[str] = None,
    valid_to: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Create a new supplier price record."""
    sp = SupplierPrice(
        supplier_id=supplier_id,
        product_id=product_id,
        unit_price=unit_price,
        currency=currency,
        min_order_qty=min_order_qty,
        lead_time_days=lead_time_days,
        valid_from=date.fromisoformat(valid_from) if valid_from else date.today(),
        valid_to=date.fromisoformat(valid_to) if valid_to else None,
        is_active=True,
        source="manual",
    )
    db.add(sp)
    db.commit()
    db.refresh(sp)
    return {"id": str(sp.id), "message": "Supplier price created"}
