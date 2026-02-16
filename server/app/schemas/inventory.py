from pydantic import BaseModel, Field
from uuid import UUID
from datetime import datetime
from typing import Optional


class InventoryCreate(BaseModel):
    product_id: UUID
    current_stock: int = Field(default=0, ge=0)
    min_stock: int = Field(default=5, ge=0)
    max_stock: int = Field(default=500, ge=1)


class InventoryUpdate(BaseModel):
    current_stock: Optional[int] = Field(None, ge=0)
    min_stock: Optional[int] = Field(None, ge=0)
    max_stock: Optional[int] = Field(None, ge=1)


class InventoryResponse(BaseModel):
    id: UUID
    product_id: UUID
    current_stock: int
    min_stock: int
    max_stock: int
    last_updated: Optional[datetime] = None

    # Nested product name for display
    product_name: Optional[str] = None
    product_sku: Optional[str] = None

    model_config = {"from_attributes": True}
