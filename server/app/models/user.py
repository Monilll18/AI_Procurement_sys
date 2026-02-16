import uuid
from sqlalchemy import Column, String, Float, Boolean, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
import enum


class UserRole(str, enum.Enum):
    admin = "admin"
    manager = "manager"
    procurement_officer = "procurement_officer"
    approver = "approver"
    viewer = "viewer"


class User(Base):
    """Local user record synced from Clerk.
    Stores role, department, and approval limit for RBAC and workflow routing."""
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clerk_id = Column(String(255), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False, default=UserRole.viewer.value)
    department = Column(String(100), nullable=True)
    approval_limit = Column(Float, nullable=True)  # max PO amount this user can approve
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<User {self.email} role={self.role}>"
