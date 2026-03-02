from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
import secrets
from datetime import datetime, timedelta, timezone

from app.database import get_db
from app.models.supplier import Supplier
from app.models.supplier_user import SupplierUser, SupplierInvitation, InvitationStatus
from app.schemas.supplier import SupplierCreate, SupplierUpdate, SupplierResponse
from app.middleware.auth import get_current_user
from app.middleware.supplier_auth import hash_password

router = APIRouter()


def _generate_temp_password(length=12) -> str:
    """Generate a readable temporary password."""
    import string
    chars = string.ascii_letters + string.digits + "!@#$%"
    return "".join(secrets.choice(chars) for _ in range(length))


def _send_supplier_invite_email(
    supplier_name: str, email: str, temp_password: str,
    invite_token: str, buyer_company: str = "ProcureAI",
):
    """Send portal invitation email to supplier via Resend."""
    try:
        from app.services.email_service import send_email, _base_template

        portal_url = "http://localhost:3000/supplier-portal/activate"
        activate_link = f"{portal_url}?token={invite_token}"

        body = f"""
        <h2 style="color: #1f2937; margin-top: 0;">Welcome to {buyer_company}'s Supplier Portal</h2>
        <p style="color: #4b5563;">Hello,</p>
        <p style="color: #4b5563;"><strong>{buyer_company}</strong> has invited <strong>{supplier_name}</strong> to join their Supplier Portal. Through this portal you can:</p>
        <ul style="color: #4b5563;">
            <li>View and respond to purchase orders in real-time</li>
            <li>Update order status and shipment tracking</li>
            <li>Manage your product catalog and prices</li>
            <li>Send invoices directly</li>
        </ul>

        <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <p style="margin: 0 0 8px; font-size: 14px; color: #6b7280;">Your Login Credentials</p>
            <table style="width: 100%;">
                <tr>
                    <td style="padding: 4px 0; color: #6b7280;">Email:</td>
                    <td style="padding: 4px 0; font-weight: 600; color: #1f2937;">{email}</td>
                </tr>
                <tr>
                    <td style="padding: 4px 0; color: #6b7280;">Temp Password:</td>
                    <td style="padding: 4px 0; font-weight: 600; color: #7c3aed; font-family: monospace;">{temp_password}</td>
                </tr>
            </table>
        </div>

        <a href="{activate_link}" style="display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 8px 0;">
            Activate Account & Login →
        </a>

        <p style="color: #9ca3af; font-size: 12px; margin-top: 16px;">This invitation expires in 7 days.</p>
        """

        html = _base_template(title="Supplier Portal Invitation", body=body)
        send_email(
            to=email,
            subject=f"🔑 {buyer_company} invited you to their Supplier Portal",
            html=html,
        )
        return True
    except Exception as e:
        print(f"[INVITE EMAIL ERROR] {e}")
        return False


@router.get("/", response_model=List[SupplierResponse])
async def list_suppliers(
    skip: int = 0,
    limit: int = 100,
    status: str = None,
    db: Session = Depends(get_db),
):
    """List all suppliers with optional status filter."""
    query = db.query(Supplier)
    if status:
        query = query.filter(Supplier.status == status)
    suppliers = query.offset(skip).limit(limit).all()
    return suppliers


@router.get("/{supplier_id}", response_model=SupplierResponse)
async def get_supplier(supplier_id: UUID, db: Session = Depends(get_db)):
    """Get a single supplier by ID."""
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return supplier


@router.post("/", status_code=201)
async def create_supplier(
    supplier_data: SupplierCreate,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """Create a new supplier. If send_portal_invite=True, auto-creates portal account."""
    data = supplier_data.model_dump(exclude={"send_portal_invite"})
    supplier = Supplier(**data)
    db.add(supplier)
    db.flush()  # Get the ID

    portal_credentials = None
    if supplier_data.send_portal_invite and supplier.email:
        portal_credentials = _create_portal_invite(db, supplier, user_id)

    db.commit()
    db.refresh(supplier)

    # Build response with credentials (if portal invite was sent)
    response = SupplierResponse.model_validate(supplier).model_dump()
    response["id"] = str(response["id"])
    if portal_credentials:
        response["portal_credentials"] = portal_credentials
    return response


def _create_portal_invite(db: Session, supplier: Supplier, invited_by: str) -> dict | None:
    """Create a SupplierUser + Invitation for a supplier. Returns credentials dict."""
    # Check if user already exists
    existing = db.query(SupplierUser).filter(SupplierUser.email == supplier.email.lower().strip()).first()
    if existing:
        return None  # Already has an account

    temp_password = _generate_temp_password()
    invite_token = secrets.token_urlsafe(32)
    portal_url = "http://localhost:3000/supplier-portal/login"

    # Create supplier user with temp password
    user = SupplierUser(
        supplier_id=supplier.id,
        email=supplier.email.lower().strip(),
        password_hash=hash_password(temp_password),
        full_name=supplier.contact_person or supplier.name,
        role="admin",
        is_active=True,
        must_change_password=True,
        invited_by=invited_by,
    )
    db.add(user)

    # Create invitation
    invitation = SupplierInvitation(
        supplier_id=supplier.id,
        email=supplier.email.lower().strip(),
        invite_token=invite_token,
        invited_by=invited_by,
        expires_at=datetime.utcnow() + timedelta(days=7),
    )
    db.add(invitation)

    db.flush()

    # Always log credentials to console for local dev
    print(f"\n{'='*60}")
    print(f"🔑 SUPPLIER PORTAL CREDENTIALS for {supplier.name}")
    print(f"   Email:         {supplier.email.lower().strip()}")
    print(f"   Temp Password: {temp_password}")
    print(f"   Portal URL:    {portal_url}")
    print(f"{'='*60}\n")

    # Send email (best-effort — credentials also shown in UI)
    email_sent = _send_supplier_invite_email(
        supplier_name=supplier.name,
        email=supplier.email,
        temp_password=temp_password,
        invite_token=invite_token,
    )

    return {
        "email": supplier.email.lower().strip(),
        "temp_password": temp_password,
        "portal_url": portal_url,
        "email_sent": email_sent,
    }


@router.post("/{supplier_id}/invite")
async def send_portal_invite(
    supplier_id: UUID,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """Send portal invitation to an existing supplier."""
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    if not supplier.email:
        raise HTTPException(status_code=400, detail="Supplier has no email address")

    # Check if already has active account → offer password reset instead of error
    existing_user = db.query(SupplierUser).filter(SupplierUser.email == supplier.email.lower().strip()).first()
    if existing_user and not existing_user.must_change_password:
        import secrets
        from datetime import timedelta

        token = secrets.token_urlsafe(48)
        existing_user.reset_token = token
        existing_user.reset_token_expires = datetime.now(timezone.utc) + timedelta(hours=1)
        db.commit()

        reset_url = f"/supplier-portal/reset-password?token={token}"

        # Send reset email to supplier
        from app.services.email_service import send_password_reset_email
        email_sent = send_password_reset_email(
            supplier_email=existing_user.email,
            supplier_name=existing_user.full_name or supplier.name,
            reset_url=reset_url,
        )

        return {
            "message": "Supplier already has an account. A password reset link has been " + ("emailed to them." if email_sent else "generated."),
            "action": "password_reset",
            "reset_url": reset_url,
            "token": token,
            "email_sent": email_sent,
        }

    # Delete old pending invitations
    db.query(SupplierInvitation).filter(
        SupplierInvitation.supplier_id == supplier_id,
        SupplierInvitation.status == InvitationStatus.pending,
    ).delete()

    # Delete old user if they never activated
    if existing_user and existing_user.must_change_password:
        db.delete(existing_user)

    db.flush()

    credentials = _create_portal_invite(db, supplier, user_id)
    if not credentials:
        raise HTTPException(status_code=500, detail="Failed to create portal invite")

    db.commit()
    return {
        "message": f"Portal invitation sent to {supplier.email}",
        "portal_credentials": credentials,
    }


@router.patch("/{supplier_id}", response_model=SupplierResponse)
async def update_supplier(
    supplier_id: UUID,
    supplier_data: SupplierUpdate,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """Update an existing supplier (requires auth)."""
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    update_data = supplier_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(supplier, key, value)

    db.commit()
    db.refresh(supplier)
    return supplier


@router.delete("/{supplier_id}", status_code=204)
async def delete_supplier(
    supplier_id: UUID,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """Delete a supplier and clean up related records (requires auth)."""
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    # Clean up related records to avoid FK constraint errors
    from app.models.supplier_user import SupplierUser, SupplierInvitation
    from app.models.supplier_price_update import SupplierPriceUpdate
    from app.models.supplier_invoice import SupplierInvoice, InvoiceLineItem

    # Delete invoices (and their line items via cascade)
    invoices = db.query(SupplierInvoice).filter(SupplierInvoice.supplier_id == supplier_id).all()
    for inv in invoices:
        db.query(InvoiceLineItem).filter(InvoiceLineItem.invoice_id == inv.id).delete()
        db.delete(inv)

    # Delete price updates, users, invitations
    db.query(SupplierPriceUpdate).filter(SupplierPriceUpdate.supplier_id == supplier_id).delete()
    db.query(SupplierInvitation).filter(SupplierInvitation.supplier_id == supplier_id).delete()
    db.query(SupplierUser).filter(SupplierUser.supplier_id == supplier_id).delete()

    # Nullify supplier_id on POs (don't delete POs — they're important records)
    from app.models.purchase_order import PurchaseOrder
    db.query(PurchaseOrder).filter(PurchaseOrder.supplier_id == supplier_id).update(
        {PurchaseOrder.supplier_id: None}, synchronize_session="fetch"
    )

    db.delete(supplier)
    db.commit()

