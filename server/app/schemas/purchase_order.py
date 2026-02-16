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
    received = "received"
    cancelled = "cancelled"


class POLineItemCreate(BaseModel):
    product_id: UUID
    quantity: int = Field(..., ge=1)
    unit_price: float = Field(..., ge=0)


class POLineItemResponse(BaseModel):
    id: UUID
    product_id: UUID
    quantity: int
    unit_price: float
    total_price: float

    model_config = {"from_attributes": True}


class PurchaseOrderCreate(BaseModel):
    supplier_id: UUID
    expected_delivery: Optional[date] = None
    notes: Optional[str] = None
    line_items: List[POLineItemCreate]


class PurchaseOrderResponse(BaseModel):
    id: UUID
    po_number: str
    supplier_id: UUID
    created_by: str
    status: POStatusEnum
    total_amount: float
    expected_delivery: Optional[date] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    line_items: List[POLineItemResponse] = []

    # Nested supplier name for display
    supplier_name: Optional[str] = None

    model_config = {"from_attributes": True}
