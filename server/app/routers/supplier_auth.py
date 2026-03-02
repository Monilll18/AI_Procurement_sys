"""
Supplier Authentication Router.
Handles login, account activation, password changes.
"""
import secrets
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import Optional

from app.database import get_db
from app.models.supplier_user import SupplierUser, SupplierInvitation, InvitationStatus
from app.middleware.supplier_auth import (
    hash_password, verify_password, create_supplier_token, get_current_supplier_user,
)

router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str

class ActivateRequest(BaseModel):
    token: str
    new_password: str

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


# ─── Login ────────────────────────────────────────────────────

@router.post("/login")
async def supplier_login(data: LoginRequest, db: Session = Depends(get_db)):
    """Supplier login with email + password. Returns JWT token."""
    user = db.query(SupplierUser).filter(
        SupplierUser.email == data.email.lower().strip()
    ).first()

    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated. Contact your buyer.")

    # Update last login
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()

    token = create_supplier_token(
        user_id=str(user.id),
        supplier_id=str(user.supplier_id),
        email=user.email,
        role=user.role.value,
    )

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": str(user.id),
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role.value,
            "supplier_id": str(user.supplier_id),
            "supplier_name": user.supplier.name if user.supplier else None,
            "must_change_password": user.must_change_password,
        },
    }


# ─── Activate Account ────────────────────────────────────────

@router.post("/activate")
async def activate_account(data: ActivateRequest, db: Session = Depends(get_db)):
    """Activate supplier account using invitation token + set new password."""
    invitation = db.query(SupplierInvitation).filter(
        SupplierInvitation.invite_token == data.token,
        SupplierInvitation.status == InvitationStatus.pending,
    ).first()

    if not invitation:
        raise HTTPException(status_code=400, detail="Invalid or expired invitation token")

    if invitation.expires_at < datetime.now(timezone.utc):
        invitation.status = InvitationStatus.expired
        db.commit()
        raise HTTPException(status_code=400, detail="Invitation has expired. Contact your buyer for a new one.")

    # Validate password strength
    if len(data.new_password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")

    # Find the supplier user
    user = db.query(SupplierUser).filter(
        SupplierUser.email == invitation.email,
        SupplierUser.supplier_id == invitation.supplier_id,
    ).first()

    if not user:
        raise HTTPException(status_code=404, detail="User account not found")

    # Update password and activate
    user.password_hash = hash_password(data.new_password)
    user.must_change_password = False
    user.is_active = True
    user.last_login_at = datetime.now(timezone.utc)

    invitation.status = InvitationStatus.accepted

    db.commit()

    # Auto-login: return token
    token = create_supplier_token(
        user_id=str(user.id),
        supplier_id=str(user.supplier_id),
        email=user.email,
        role=user.role.value,
    )

    return {
        "message": "Account activated successfully",
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": str(user.id),
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role.value,
            "supplier_id": str(user.supplier_id),
            "supplier_name": user.supplier.name if user.supplier else None,
        },
    }


# ─── Change Password ─────────────────────────────────────────

@router.post("/change-password")
async def change_password(
    data: ChangePasswordRequest,
    supplier_user: dict = Depends(get_current_supplier_user),
    db: Session = Depends(get_db),
):
    """Change password for authenticated supplier user."""
    user = db.query(SupplierUser).filter(SupplierUser.id == supplier_user["id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if len(data.new_password) < 8:
        raise HTTPException(status_code=422, detail="New password must be at least 8 characters")

    user.password_hash = hash_password(data.new_password)
    user.must_change_password = False
    db.commit()

    return {"message": "Password changed successfully"}


# ─── Forgot Password ─────────────────────────────────────────

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


@router.post("/forgot-password")
async def forgot_password(data: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """
    Request a password reset.
    Generates a secure reset token valid for 1 hour.
    In production, this would send an email — here it returns the reset link directly.
    """
    from datetime import timedelta

    email = data.email.lower().strip()
    user = db.query(SupplierUser).filter(SupplierUser.email == email).first()

    if not user:
        # Don't reveal whether email exists (security best practice)
        return {"message": "If that email exists, a password reset link has been generated.", "reset_url": None}

    if not user.is_active:
        return {"message": "This account has been deactivated. Contact your buyer.", "reset_url": None}

    # Generate secure reset token
    token = secrets.token_urlsafe(48)
    user.reset_token = token
    user.reset_token_expires = datetime.now(timezone.utc) + timedelta(hours=1)
    db.commit()

    reset_url = f"/supplier-portal/reset-password?token={token}"

    # Send reset email
    from app.services.email_service import send_password_reset_email
    email_sent = send_password_reset_email(
        supplier_email=user.email,
        supplier_name=user.full_name or user.email,
        reset_url=reset_url,
    )

    return {
        "message": "Password reset link generated. Valid for 1 hour." + (" Email sent!" if email_sent else ""),
        "reset_url": reset_url,
        "token": token,
        "expires_in_minutes": 60,
        "email_sent": email_sent,
    }


@router.post("/reset-password")
async def reset_password(data: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Reset supplier password using reset token."""
    user = db.query(SupplierUser).filter(
        SupplierUser.reset_token == data.token,
    ).first()

    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    if not user.reset_token_expires or user.reset_token_expires < datetime.now(timezone.utc):
        # Clean up expired token
        user.reset_token = None
        user.reset_token_expires = None
        db.commit()
        raise HTTPException(status_code=400, detail="Reset token has expired. Please request a new one.")

    if len(data.new_password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")

    # Set new password and clear reset token
    user.password_hash = hash_password(data.new_password)
    user.must_change_password = False
    user.reset_token = None
    user.reset_token_expires = None
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()

    # Auto-login: return JWT token
    token = create_supplier_token(
        user_id=str(user.id),
        supplier_id=str(user.supplier_id),
        email=user.email,
        role=user.role.value,
    )

    return {
        "message": "Password reset successfully",
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": str(user.id),
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role.value,
            "supplier_id": str(user.supplier_id),
            "supplier_name": user.supplier.name if user.supplier else None,
        },
    }


# ─── Get Current User Profile ────────────────────────────────

@router.get("/me")
async def get_profile(
    supplier_user: dict = Depends(get_current_supplier_user),
    db: Session = Depends(get_db),
):
    """Get current supplier user profile."""
    user = db.query(SupplierUser).filter(SupplierUser.id == supplier_user["id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "phone": user.phone,
        "role": user.role.value,
        "supplier_id": str(user.supplier_id),
        "supplier_name": user.supplier.name if user.supplier else None,
        "is_active": user.is_active,
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }
