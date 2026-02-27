from pydantic import BaseModel, Field
from uuid import UUID
from datetime import datetime, date
from typing import Optional, List
from enum import Enum


class POStatusEnum(str, Enum):
    draft = "draft"
    pending_approval = "pending_approval"
    approved = "approved"
    sent = "sent"
    partially_received = "partially_received"
    received = "received"
    cancelled = "cancelled"


class POLineItemCreate(BaseModel):
    product_id: UUID
    quantity: int = Field(..., ge=1)
    unit_price: float = Field(..., ge=0)


class POLineItemResponse(BaseModel):
    id: UUID
    product_id: UUID
    product_name: Optional[str] = None
    quantity: int
    unit_price: float
    total_price: float
    quantity_received: Optional[int] = 0

    model_config = {"from_attributes": True}


class PurchaseOrderCreate(BaseModel):
    supplier_id: UUID
    expected_delivery: Optional[date] = None
    notes: Optional[str] = None
    line_items: List[POLineItemCreate]


class PurchaseOrderResponse(BaseModel):
    id: UUID
    po_number: str
    supplier_id: Optional[UUID] = None
    created_by: str
    status: POStatusEnum
    total_amount: float
    expected_delivery: Optional[date] = None
    notes: Optional[str] = None
    pdf_url: Optional[str] = None
    sent_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    line_items: List[POLineItemResponse] = []

    # Nested supplier info for display
    supplier_name: Optional[str] = None
    supplier_email: Optional[str] = None

    model_config = {"from_attributes": True}
