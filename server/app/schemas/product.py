from pydantic import BaseModel, Field
from uuid import UUID
from datetime import datetime
from typing import Optional


class ProductCreate(BaseModel):
    sku: str = Field(..., max_length=50)
    name: str = Field(..., max_length=255)
    category: str = Field(..., max_length=100)
    unit: str = Field(default="pcs", max_length=50)
    reorder_point: int = Field(default=10, ge=0)
    reorder_quantity: int = Field(default=50, ge=1)


class ProductUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    category: Optional[str] = Field(None, max_length=100)
    unit: Optional[str] = Field(None, max_length=50)
    reorder_point: Optional[int] = Field(None, ge=0)
    reorder_quantity: Optional[int] = Field(None, ge=1)


class ProductResponse(BaseModel):
    id: UUID
    sku: str
    name: str
    category: str
    unit: str
    reorder_point: int
    reorder_quantity: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
