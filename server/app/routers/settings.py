"""
Settings Router — System-wide configuration management.
Manages global procurement system settings stored in a JSON config.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import json
import os

from app.database import get_db
from app.models.user import User, UserRole
from app.schemas.user import SystemSettings
from app.middleware.auth import get_current_user

router = APIRouter()

# Settings file path (persisted as JSON)
SETTINGS_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "settings.json")

DEFAULT_SETTINGS = {
    "company_name": "ProcureAI Corp",
    "currency": "USD",
    "auto_approve_below": 1000,
    "email_notifications": True,
    "stock_alerts": True,
    "approval_reminders": True,
    "two_factor_auth": False,
}


def _load_settings() -> dict:
    """Load settings from file, or return defaults."""
    try:
        if os.path.exists(SETTINGS_FILE):
            with open(SETTINGS_FILE, "r") as f:
                return {**DEFAULT_SETTINGS, **json.load(f)}
    except Exception:
        pass
    return DEFAULT_SETTINGS.copy()


def _save_settings(settings: dict):
    """Save settings to file."""
    with open(SETTINGS_FILE, "w") as f:
        json.dump(settings, f, indent=2)


@router.get("/")
async def get_settings():
    """Get current system settings."""
    return _load_settings()


@router.put("/")
async def update_settings(
    settings: SystemSettings,
    db: Session = Depends(get_db),
    clerk_id: str = Depends(get_current_user),
):
    """Update system settings (admin only)."""
    # Verify admin
    user = db.query(User).filter(User.clerk_id == clerk_id).first()
    if not user or user.role != UserRole.admin.value:
        raise HTTPException(status_code=403, detail="Admin access required")

    current = _load_settings()
    update_data = settings.model_dump(exclude_none=True)
    current.update(update_data)
    _save_settings(current)

    return current
