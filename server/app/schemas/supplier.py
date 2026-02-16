from pydantic import BaseModel, Field
from uuid import UUID
from datetime import datetime
from typing import Optional
from enum import Enum


class SupplierStatusEnum(str, Enum):
    active = "active"
    inactive = "inactive"
    blacklisted = "blacklisted"


class SupplierCreate(BaseModel):
    name: str = Field(..., max_length=255)
    email: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=50)
    address: Optional[str] = Field(None, max_length=500)
    rating: float = Field(default=4.0, ge=0.0, le=5.0)
    status: SupplierStatusEnum = SupplierStatusEnum.active


class SupplierUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    email: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=50)
    address: Optional[str] = Field(None, max_length=500)
    rating: Optional[float] = Field(None, ge=0.0, le=5.0)
    status: Optional[SupplierStatusEnum] = None


class SupplierResponse(BaseModel):
    id: UUID
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    rating: float
    status: SupplierStatusEnum
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
