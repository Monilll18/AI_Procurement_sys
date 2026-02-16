import uuid
from sqlalchemy import Column, String, DateTime, Text, func
from sqlalchemy.dialects.postgresql import UUID, JSON
from app.database import Base


class AuditLog(Base):
    """Records every create/update/delete action for compliance and traceability.
    Auto-populated by audit middleware on all CUD operations."""
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String(255), nullable=True)  # Clerk user ID
    user_email = Column(String(255), nullable=True)
    action = Column(String(50), nullable=False)  # created, updated, deleted, approved, rejected
    entity_type = Column(String(100), nullable=False)  # product, supplier, purchase_order, etc.
    entity_id = Column(String(255), nullable=False)
    old_values = Column(JSON, nullable=True)
    new_values = Column(JSON, nullable=True)
    ip_address = Column(String(50), nullable=True)
    user_agent = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    def __repr__(self):
        return f"<AuditLog {self.action} {self.entity_type} by={self.user_id}>"
