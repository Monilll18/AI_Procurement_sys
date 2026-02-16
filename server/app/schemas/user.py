from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime


class UserCreate(BaseModel):
    """Schema for creating/inviting a team member."""
    email: str
    full_name: str
    role: str = "viewer"
    department: Optional[str] = None
    approval_limit: Optional[float] = 0

    class Config:
        json_schema_extra = {
            "example": {
                "email": "john@company.com",
                "full_name": "John Doe",
                "role": "procurement_officer",
                "department": "Operations",
                "approval_limit": 10000,
            }
        }


class UserUpdate(BaseModel):
    """Schema for updating a team member."""
    full_name: Optional[str] = None
    role: Optional[str] = None
    department: Optional[str] = None
    approval_limit: Optional[float] = None
    is_active: Optional[bool] = None


class UserResponse(BaseModel):
    """Schema for user response."""
    id: str
    clerk_id: Optional[str] = None
    email: str
    full_name: str
    role: str
    department: Optional[str] = None
    approval_limit: Optional[float] = 0
    is_active: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SystemSettings(BaseModel):
    """Schema for system-wide settings."""
    company_name: Optional[str] = "ProcureAI Corp"
    currency: Optional[str] = "USD"
    auto_approve_below: Optional[float] = 1000
    email_notifications: Optional[bool] = True
    stock_alerts: Optional[bool] = True
    approval_reminders: Optional[bool] = True
    two_factor_auth: Optional[bool] = False
