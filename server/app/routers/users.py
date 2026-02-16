"""
Users Router — Team management with env-based role assignment.

Roles are pre-configured in .env by email:
  ADMIN_EMAILS=alice@co.com,bob@co.com
  MANAGER_EMAILS=sarah@co.com
  OFFICER_EMAILS=mike@co.com
  FINANCE_EMAILS=lisa@co.com

When a user signs in for the first time, their Clerk email is matched against
these lists to auto-assign their role. Anyone not listed defaults to "viewer".
Admins can also reassign roles via the API at any time.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
import os

from app.database import get_db
from app.models.user import User, UserRole
from app.schemas.user import UserCreate, UserUpdate, UserResponse
from app.middleware.auth import get_current_user

router = APIRouter()


# ─── Env-based role resolver ──────────────────────────────────────────

def _parse_emails(env_key: str) -> list[str]:
    """Read comma-separated emails from an env var."""
    raw = os.getenv(env_key, "")
    return [e.strip().lower() for e in raw.split(",") if e.strip()]


def resolve_role_from_env(email: str) -> str:
    """
    Match an email against env-defined role lists.
    Priority: admin > manager > procurement_officer > approver > viewer.
    """
    email_lower = email.strip().lower()

    if email_lower in _parse_emails("ADMIN_EMAILS"):
        return UserRole.admin.value
    if email_lower in _parse_emails("MANAGER_EMAILS"):
        return UserRole.manager.value
    if email_lower in _parse_emails("OFFICER_EMAILS"):
        return UserRole.procurement_officer.value
    if email_lower in _parse_emails("FINANCE_EMAILS"):
        return UserRole.approver.value

    return UserRole.viewer.value


# ─── Helpers ──────────────────────────────────────────────────────────

def _user_to_response(u: User) -> UserResponse:
    return UserResponse(
        id=str(u.id),
        clerk_id=u.clerk_id,
        email=u.email,
        full_name=u.full_name,
        role=u.role,
        department=u.department,
        approval_limit=u.approval_limit or 0,
        is_active=u.is_active,
        created_at=u.created_at,
        updated_at=u.updated_at,
    )


def _get_user_or_404(db: Session, user_id: str) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def _require_admin(db: Session, clerk_id: str) -> User:
    """Verify the calling user has admin role."""
    user = db.query(User).filter(User.clerk_id == clerk_id).first()
    if not user or user.role != UserRole.admin.value:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ─── Available Roles (must be BEFORE /{user_id} to avoid route conflict) ─

@router.get("/roles/list")
async def list_roles():
    """List all available roles and their descriptions."""
    return {
        "admin": {
            "label": "Admin",
            "description": "Full system access, manage users and settings",
            "permissions": ["Full Access", "Manage Users", "System Config", "All Approvals"],
        },
        "manager": {
            "label": "Procurement Manager",
            "description": "Manage POs, approve orders, view analytics",
            "permissions": ["Create PO", "Approve PO", "View Analytics", "Manage Suppliers"],
        },
        "procurement_officer": {
            "label": "Procurement Officer",
            "description": "Create POs, manage products and inventory",
            "permissions": ["Create PO", "Manage Products", "View Inventory", "Request Approval"],
        },
        "approver": {
            "label": "Finance / Approver",
            "description": "View budgets, analytics, and approve high-value POs",
            "permissions": ["View Budgets", "View Analytics", "Approve High-Value", "Export Reports"],
        },
        "viewer": {
            "label": "Viewer",
            "description": "Read-only access to dashboards and reports",
            "permissions": ["View Dashboard", "View Reports", "Read-Only"],
        },
    }


# ─── Get Current User Profile ─────────────────────────────────────────

@router.get("/me")
async def get_my_profile(
    email: Optional[str] = None,
    full_name: Optional[str] = None,
    db: Session = Depends(get_db),
    clerk_id: str = Depends(get_current_user),
):
    """
    Get the current user's profile.
    On first login, auto-creates a user record with the role resolved from .env.
    The frontend passes the user's Clerk email & name as query params on first call.

    Handles three scenarios:
    1. User already exists by clerk_id → return profile (sync email/name if changed)
    2. User exists by email but different clerk_id (seed/admin-created) → link to real Clerk account
    3. Brand new user → create with env-based role
    """
    user = db.query(User).filter(User.clerk_id == clerk_id).first()

    if not user and email:
        # Check if a user was pre-created (by seed or admin) with this email
        # but has a different clerk_id (e.g. "seed_admin" or "pending_xxx")
        user = db.query(User).filter(User.email == email).first()
        if user:
            # Link the existing record to the real Clerk account
            user.clerk_id = clerk_id
            if full_name and user.full_name != full_name:
                user.full_name = full_name
            db.commit()
            db.refresh(user)

    if not user:
        # Brand new user — resolve role from .env by email
        user_email = email or f"{clerk_id}@pending.sync"
        role = resolve_role_from_env(user_email)

        user = User(
            clerk_id=clerk_id,
            email=user_email,
            full_name=full_name or "New User",
            role=role,
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        # Sync email/name from Clerk if provided and changed
        changed = False
        if email and user.email != email:
            user.email = email
            changed = True
        if full_name and user.full_name != full_name:
            user.full_name = full_name
            changed = True
        if changed:
            db.commit()
            db.refresh(user)

    return _user_to_response(user)


# ─── List Team Members ────────────────────────────────────────────────

@router.get("/", response_model=List[UserResponse])
async def list_users(
    role: Optional[str] = None,
    department: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db),
):
    """List all team members, optionally filtered by role or department."""
    query = db.query(User)
    if role:
        query = query.filter(User.role == role)
    if department:
        query = query.filter(User.department == department)
    if is_active is not None:
        query = query.filter(User.is_active == is_active)

    users = query.order_by(User.created_at).all()
    return [_user_to_response(u) for u in users]


# ─── Get Single User ──────────────────────────────────────────────────

@router.get("/{user_id}", response_model=UserResponse)
async def get_user(user_id: str, db: Session = Depends(get_db)):
    """Get a single team member by ID."""
    return _user_to_response(_get_user_or_404(db, user_id))


# ─── Add Team Member (Admin Only) ─────────────────────────────────────

@router.post("/", response_model=UserResponse, status_code=201)
async def create_user(
    user_data: UserCreate,
    db: Session = Depends(get_db),
    clerk_id: str = Depends(get_current_user),
):
    """
    Add a new team member (admin only).
    The role can be set directly by the admin, overriding the .env defaults.
    """
    _require_admin(db, clerk_id)

    # Check if email already exists
    existing = db.query(User).filter(User.email == user_data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Validate role
    valid_roles = [r.value for r in UserRole]
    if user_data.role not in valid_roles:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {valid_roles}")

    user = User(
        clerk_id=f"pending_{user_data.email}",  # Linked when user signs in via Clerk
        email=user_data.email,
        full_name=user_data.full_name,
        role=user_data.role,
        department=user_data.department,
        approval_limit=user_data.approval_limit,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return _user_to_response(user)


# ─── Update Team Member (Admin Only) ──────────────────────────────────

@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    updates: UserUpdate,
    db: Session = Depends(get_db),
    clerk_id: str = Depends(get_current_user),
):
    """
    Update a team member's role, department, or approval limit (admin only).
    This is how the admin assigns roles to users.
    """
    _require_admin(db, clerk_id)
    user = _get_user_or_404(db, user_id)

    if updates.full_name is not None:
        user.full_name = updates.full_name
    if updates.role is not None:
        valid_roles = [r.value for r in UserRole]
        if updates.role not in valid_roles:
            raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {valid_roles}")
        user.role = updates.role
    if updates.department is not None:
        user.department = updates.department
    if updates.approval_limit is not None:
        user.approval_limit = updates.approval_limit
    if updates.is_active is not None:
        user.is_active = updates.is_active

    db.commit()
    db.refresh(user)

    return _user_to_response(user)


# ─── Delete Team Member (Admin Only) ──────────────────────────────────

@router.delete("/{user_id}")
async def delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    clerk_id: str = Depends(get_current_user),
):
    """Remove a team member (admin only)."""
    _require_admin(db, clerk_id)
    user = _get_user_or_404(db, user_id)

    if user.clerk_id == clerk_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    db.delete(user)
    db.commit()
    return {"message": f"User {user.email} removed"}
