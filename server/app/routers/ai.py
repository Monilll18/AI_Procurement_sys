"""
AI Router — endpoints for all AI/LLM features.
Integrations: NL Purchase Requests, Chat Assistant, Supplier Explanation,
Email Parsing, Price Sheet Parsing, PO Generation, Invoice Matching.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel, field_validator, model_validator
from typing import Optional, List
import logging

from app.database import get_db
from app.models.product import Product
from app.models.inventory import Inventory
from app.middleware.rate_limit import limiter
from app.services.llm_service import (
    parse_natural_language_request,
    generate_supplier_explanation,
    parse_supplier_email,
    parse_price_sheet_text,
    generate_po_draft,
    match_invoice_to_po,
)
from app.services.ai_chat import chat_with_assistant

router = APIRouter()
logger = logging.getLogger(__name__)


# ─── Schemas with Validation ───────────────────────────────

class NLParseRequest(BaseModel):
    user_input: str
    include_stock: bool = True

    @field_validator("user_input")
    @classmethod
    def validate_user_input(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("user_input cannot be empty")
        if len(v) > 2000:
            raise ValueError("user_input must be 2000 characters or fewer")
        return v


class ChatRequest(BaseModel):
    question: str
    user_name: Optional[str] = "User"
    user_role: Optional[str] = "admin"

    @field_validator("question")
    @classmethod
    def validate_question(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("question cannot be empty")
        if len(v) > 1000:
            raise ValueError("question must be 1000 characters or fewer")
        return v


class SupplierExplainRequest(BaseModel):
    product_name: str
    quantity: int = 1
    urgency: str = "medium"
    supplier_scores: List[dict]

    @field_validator("product_name")
    @classmethod
    def validate_product_name(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("product_name cannot be empty")
        if len(v) > 200:
            raise ValueError("product_name must be 200 characters or fewer")
        return v.strip()

    @field_validator("urgency")
    @classmethod
    def validate_urgency(cls, v: str) -> str:
        allowed = {"low", "medium", "high", "critical"}
        if v not in allowed:
            raise ValueError(f"urgency must be one of: {', '.join(allowed)}")
        return v

    @field_validator("supplier_scores")
    @classmethod
    def validate_supplier_scores(cls, v: list) -> list:
        if len(v) > 20:
            raise ValueError("supplier_scores cannot contain more than 20 entries")
        return v


class EmailParseRequest(BaseModel):
    email_text: str

    @field_validator("email_text")
    @classmethod
    def validate_email_text(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("email_text cannot be empty")
        if len(v) > 10000:
            raise ValueError("email_text must be 10,000 characters or fewer")
        return v


class PriceSheetParseRequest(BaseModel):
    raw_text: str

    @field_validator("raw_text")
    @classmethod
    def validate_raw_text(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("raw_text cannot be empty")
        if len(v) > 20000:
            raise ValueError("raw_text must be 20,000 characters or fewer")
        return v


# ─── Integration 1: Natural Language Purchase Request ─────

@router.post("/parse-request")
@limiter.limit("10/minute")
async def parse_purchase_request(request: Request, data: NLParseRequest, db: Session = Depends(get_db)):
    """
    Parse a natural language purchase request into structured PR data.

    Example input: "I need 50 boxes of A4 paper and 10 ink cartridges
                    for the marketing team by next Friday"
    """
    # Fetch product catalog from DB
    products = db.query(Product).limit(100).all()
    catalog = [
        {
            "id": str(p.id),
            "name": p.name,
            "sku": p.sku,
            "category": p.category,
            "unit": p.unit,
            "reorder_point": p.reorder_point,
        }
        for p in products
    ]

    # Optionally include stock levels
    stock = None
    if data.include_stock:
        inv_items = (
            db.query(Inventory, Product)
            .join(Product, Product.id == Inventory.product_id)
            .limit(50)
            .all()
        )
        stock = [
            {
                "product": prod.name,
                "sku": prod.sku,
                "current_stock": inv.current_stock,
                "reorder_point": prod.reorder_point,
            }
            for inv, prod in inv_items
        ]

    result = await parse_natural_language_request(
        user_input=data.user_input,
        product_catalog=catalog,
        current_stock=stock,
    )

    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error", "AI parsing failed"))

    return {
        "parsed": result.get("content"),
        "raw_response": result.get("raw"),
        "usage": result.get("usage"),
    }


# ─── Integration 8: AI Chat Assistant (RAG) ──────────────────

@router.post("/chat")
@limiter.limit("10/minute")
async def ai_chat(request: Request, data: ChatRequest, db: Session = Depends(get_db)):
    """
    RAG-powered AI chat. User asks questions in natural language,
    system fetches relevant data and answers using LLM.

    Examples:
    - "How much did we spend on IT last quarter?"
    - "Which supplier is cheapest for ink?"
    - "Show me all overdue deliveries"
    """
    try:
        result = await chat_with_assistant(
            question=data.question,
            db=db,
            user_name=data.user_name or "User",
            user_role=data.user_role or "admin",
        )

        return {
            "answer": result.get("answer", "Sorry, I couldn't process that."),
            "intent": result.get("intent", "general"),
            "success": result.get("success", False),
            "usage": result.get("usage"),
        }
    except Exception as e:
        logger.error(f"AI chat error: {e}")
        return {
            "answer": f"AI service error: {str(e)}",
            "intent": "error",
            "success": False,
        }


# ─── Integration 7B: Supplier Recommendation Explanation ─────

@router.post("/explain-supplier")
@limiter.limit("10/minute")
async def explain_supplier_choice(request: Request, data: SupplierExplainRequest):
    """
    Take ML supplier scores and generate a human-friendly
    recommendation using LLM.
    """
    result = await generate_supplier_explanation(
        product_name=data.product_name,
        quantity=data.quantity,
        supplier_scores=data.supplier_scores,
        urgency=data.urgency,
    )

    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error", "AI explanation failed"))

    return {
        "explanation": result.get("content"),
        "usage": result.get("usage"),
    }


# ─── Integration 5: Supplier Email Parsing ───────────────────

@router.post("/parse-email")
@limiter.limit("10/minute")
async def parse_email(request: Request, data: EmailParseRequest, db: Session = Depends(get_db)):
    """
    Parse a supplier email/quote into structured data.
    Extracts: items, prices, availability, terms, delivery timeline.
    """
    products = db.query(Product).limit(100).all()
    catalog = [
        {"id": str(p.id), "name": p.name, "sku": p.sku}
        for p in products
    ]

    result = await parse_supplier_email(
        email_text=data.email_text,
        product_catalog=catalog,
    )

    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error", "Email parsing failed"))

    return {
        "parsed": result.get("content"),
        "usage": result.get("usage"),
    }


# ─── Integration 3: Price Sheet Text Parsing ─────────────────

@router.post("/parse-price-sheet")
@limiter.limit("10/minute")
async def parse_price_sheet(request: Request, data: PriceSheetParseRequest, db: Session = Depends(get_db)):
    """
    Parse OCR-extracted text from a price sheet into structured prices.
    Called after OCR extracts raw text from PDF/image.
    """
    products = db.query(Product).limit(100).all()
    catalog = [
        {"id": str(p.id), "name": p.name, "sku": p.sku}
        for p in products
    ]

    result = await parse_price_sheet_text(
        raw_text=data.raw_text,
        product_catalog=catalog,
    )

    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error", "Price sheet parsing failed"))

    return {
        "parsed": result.get("content"),
        "usage": result.get("usage"),
    }


# ─── Integration 7A: ML Supplier Scoring ─────────────────────

@router.get("/score-supplier/{supplier_id}")
async def score_supplier_endpoint(supplier_id: str, product_id: str = None, db: Session = Depends(get_db)):
    """
    Score a supplier using weighted ML algorithm.
    Components: price (30%), delivery (30%), quality (25%), response (15%).
    """
    from app.services.supplier_scorer import score_supplier
    result = score_supplier(supplier_id, product_id, db)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@router.get("/rank-suppliers/{product_id}")
async def rank_suppliers_endpoint(product_id: str, limit: int = 5, db: Session = Depends(get_db)):
    """
    Rank all suppliers for a product using ML scoring.
    Returns sorted list with scores and breakdown.
    """
    from app.services.supplier_scorer import rank_suppliers_for_product
    return rank_suppliers_for_product(product_id, db, limit)


# ─── Integration 6: Price Anomaly Detection ──────────────────

class PriceCheckRequest(BaseModel):
    product_id: str
    new_price: float


@router.post("/check-price")
async def check_price_anomaly(data: PriceCheckRequest, db: Session = Depends(get_db)):
    """
    Check if a new price is anomalous using IsolationForest ML.
    Returns: is_anomaly, deviation %, historical stats.
    """
    from app.services.anomaly_service import detect_price_anomaly
    return detect_price_anomaly(data.product_id, data.new_price, db)


@router.get("/price-anomalies")
async def get_price_anomalies(db: Session = Depends(get_db)):
    """Scan all recent prices and return any anomalies found."""
    from app.services.anomaly_service import batch_check_prices
    return batch_check_prices(db)


# ─── Integration 10: Fraud Detection ─────────────────────────

@router.get("/fraud-scan")
async def scan_fraud_patterns(db: Session = Depends(get_db)):
    """
    Scan for suspicious procurement patterns:
    - Split orders (same user, same supplier, just below limit)
    - Large orders with new suppliers
    - Off-hours PO activity
    """
    from app.services.anomaly_service import detect_fraud_patterns
    return detect_fraud_patterns(db)


# ─── Integration 4: AI PO Generation ────────────────────────

class POGenerateRequest(BaseModel):
    po_number: str
    total_amount: float
    required_by: Optional[str] = None
    payment_terms: Optional[str] = "Net 30"
    purpose: Optional[str] = "General procurement"
    supplier_id: str
    line_items: List[dict]  # [{product_name, quantity, unit, unit_price, total_price}]

    @field_validator("po_number")
    @classmethod
    def validate_po_number(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("po_number cannot be empty")
        if len(v) > 50:
            raise ValueError("po_number must be 50 characters or fewer")
        return v.strip()

    @field_validator("total_amount")
    @classmethod
    def validate_total_amount(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("total_amount must be greater than 0")
        if v > 10_000_000:
            raise ValueError("total_amount exceeds maximum allowed value")
        return v

    @field_validator("line_items")
    @classmethod
    def validate_line_items(cls, v: list) -> list:
        if not v:
            raise ValueError("line_items cannot be empty")
        if len(v) > 50:
            raise ValueError("line_items cannot contain more than 50 items")
        return v


@router.post("/generate-po")
@limiter.limit("10/minute")
async def generate_po_endpoint(request: Request, data: POGenerateRequest, db: Session = Depends(get_db)):
    """
    Generate a professional PO email draft and document using LLM.
    Takes PO data + supplier info and returns ready-to-send email.
    """
    from app.models.supplier import Supplier
    supplier_obj = db.query(Supplier).filter(Supplier.id == data.supplier_id).first()
    if not supplier_obj:
        raise HTTPException(status_code=404, detail="Supplier not found")

    supplier = {
        "name": supplier_obj.name,
        "email": supplier_obj.email or "",
        "contact_person": getattr(supplier_obj, "contact_person", "") or "",
        "address": supplier_obj.address or "",
    }

    po_data = {
        "po_number": data.po_number,
        "date": __import__("datetime").datetime.utcnow().strftime("%B %d, %Y"),
        "total_amount": data.total_amount,
        "required_by": data.required_by or "As soon as possible",
        "payment_terms": data.payment_terms,
        "purpose": data.purpose,
    }

    result = await generate_po_draft(
        po_data=po_data,
        supplier=supplier,
        line_items=data.line_items,
    )

    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error", "PO generation failed"))

    return {
        "draft": result.get("content"),
        "usage": result.get("usage"),
    }


# ─── Integration 9: Invoice Matching AI ──────────────────────

class InvoiceMatchRequest(BaseModel):
    invoice_text: str  # OCR-extracted text from invoice PDF/image
    po_id: Optional[str] = None
    po_number: Optional[str] = None
    po_total: Optional[float] = None
    po_supplier_name: Optional[str] = None
    po_payment_terms: Optional[str] = "Net 30"
    po_line_items: Optional[List[dict]] = None
    received_items: Optional[List[dict]] = None  # goods received note

    @field_validator("invoice_text")
    @classmethod
    def validate_invoice_text(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("invoice_text cannot be empty")
        if len(v) > 15000:
            raise ValueError("invoice_text must be 15,000 characters or fewer")
        return v


@router.post("/match-invoice")
@limiter.limit("10/minute")
async def match_invoice_endpoint(request: Request, data: InvoiceMatchRequest, db: Session = Depends(get_db)):
    """
    3-way invoice matching: Invoice vs PO vs Goods Received.
    Extracts invoice data from OCR text, compares to PO, flags discrepancies.
    """
    # If po_id provided, fetch PO data from DB
    po_data: dict = {
        "po_number": data.po_number or "N/A",
        "total_amount": data.po_total or 0,
        "supplier_name": data.po_supplier_name or "N/A",
        "payment_terms": data.po_payment_terms or "Net 30",
        "line_items": data.po_line_items or [],
    }

    if data.po_id:
        from app.models.purchase_order import PurchaseOrder, POLineItem
        from app.models.product import Product
        from app.models.supplier import Supplier
        po = db.query(PurchaseOrder).filter(PurchaseOrder.id == data.po_id).first()
        if po:
            supplier = db.query(Supplier).filter(Supplier.id == po.supplier_id).first()
            items = (
                db.query(POLineItem, Product)
                .join(Product, Product.id == POLineItem.product_id)
                .filter(POLineItem.po_id == po.id)
                .all()
            )
            po_data = {
                "po_number": po.po_number,
                "total_amount": float(po.total_amount),
                "supplier_name": supplier.name if supplier else "Unknown",
                "payment_terms": getattr(supplier, "payment_terms", "Net 30") if supplier else "Net 30",
                "line_items": [
                    {
                        "product_name": prod.name,
                        "sku": prod.sku,
                        "quantity": item.quantity,
                        "unit_price": float(item.unit_price),
                        "total": float(item.total_price),
                    }
                    for item, prod in items
                ],
            }
            # Auto-populate received items from DB if not provided
            if not data.received_items:
                received = [
                    {
                        "product_name": prod.name,
                        "quantity_ordered": item.quantity,
                        "quantity_received": item.quantity_received,
                    }
                    for item, prod in items
                    if item.quantity_received > 0
                ]
                if received:
                    data.received_items = received

    result = await match_invoice_to_po(
        invoice_text=data.invoice_text,
        po_data=po_data,
        received_items=data.received_items,
    )

    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error", "Invoice matching failed"))

    return {
        "match": result.get("content"),
        "usage": result.get("usage"),
    }


# ─── Health Check ─────────────────────────────────────────────

@router.get("/health")
async def ai_health():
    """Check if AI service is configured and ready."""
    import os
    from app.services.llm_service import LLM_PROVIDER

    provider_names = {
        "groq": "Groq (LLaMA 3.3 70B)",
        "gemini": "Google Gemini (2.0 Flash)",
        "zhipu": "Zhipu AI (GLM-4)",
        "none": "Not configured",
    }
    return {
        "llm_configured": LLM_PROVIDER != "none",
        "llm_provider": provider_names.get(LLM_PROVIDER, LLM_PROVIDER),
        "features": {
            "llm": [
                "parse-request (NL → structured PR)",
                "chat (RAG assistant)",
                "explain-supplier (LLM recommendation)",
                "parse-email (supplier quote extraction)",
                "parse-price-sheet (OCR text → prices)",
                "generate-po (AI PO email draft)",
                "match-invoice (3-way invoice matching)",
            ],
            "ml": [
                "score-supplier (weighted scoring)",
                "rank-suppliers (product-level ranking)",
                "check-price (IsolationForest anomaly)",
                "fraud-scan (pattern detection)",
            ],
        },
    }
