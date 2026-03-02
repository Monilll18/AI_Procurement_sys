"""
SupplierUser + SupplierInvitation models.
Supplier portal authentication, separate from Clerk (procurement side).
"""
import uuid
import enum
from sqlalchemy import Column, String, Boolean, DateTime, Text, Enum, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class SupplierUserRole(str, enum.Enum):
    admin = "admin"
    staff = "staff"


class InvitationStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    expired = "expired"


class SupplierUser(Base):
    __tablename__ = "supplier_users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    supplier_id = Column(UUID(as_uuid=True), ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=True)
    phone = Column(String(50), nullable=True)
    role = Column(Enum(SupplierUserRole), nullable=False, default=SupplierUserRole.admin)
    is_active = Column(Boolean, nullable=False, default=True)
    must_change_password = Column(Boolean, nullable=False, default=True)
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    invited_by = Column(String(255), nullable=True)  # Clerk user ID who created this

    # Password reset
    reset_token = Column(String(255), unique=True, nullable=True, index=True)
    reset_token_expires = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    supplier = relationship("Supplier", backref="portal_users")

    def __repr__(self):
        return f"<SupplierUser {self.email}>"


class SupplierInvitation(Base):
    __tablename__ = "supplier_invitations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    supplier_id = Column(UUID(as_uuid=True), ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False)
    email = Column(String(255), nullable=False)
    invite_token = Column(String(255), unique=True, nullable=False, index=True)
    status = Column(Enum(InvitationStatus), nullable=False, default=InvitationStatus.pending)
    invited_by = Column(String(255), nullable=True)  # Clerk user ID
    expires_at = Column(DateTime(timezone=True), nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    supplier = relationship("Supplier", backref="invitations")

    def __repr__(self):
        return f"<SupplierInvitation {self.email} status={self.status}>"
