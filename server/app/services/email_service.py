"""
Email notification service using Gmail SMTP.
Sends professional HTML emails for procurement events.
Uses Python built-in smtplib — no extra packages required.

Setup:
  1. Enable 2-Step Verification on your Google Account
  2. Go to https://myaccount.google.com/apppasswords
  3. Generate an App Password for "Mail"
  4. Add to .env:
       GMAIL_USER=your@gmail.com
       GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
"""
import os
import ssl
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

logger = logging.getLogger(__name__)

GMAIL_USER = os.getenv("GMAIL_USER", "")
GMAIL_APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD", "")
FROM_NAME = os.getenv("EMAIL_FROM_NAME", "ProcureAI")


# ─── Send Functions ──────────────────────────────────────────

def send_email(to: str, subject: str, html: str) -> bool:
    """Send an HTML email via Gmail SMTP. Returns True on success."""
    if not GMAIL_USER or not GMAIL_APP_PASSWORD:
        logger.warning("Gmail SMTP not configured (missing GMAIL_USER / GMAIL_APP_PASSWORD) — email skipped")
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["From"] = f"{FROM_NAME} <{GMAIL_USER}>"
        msg["To"] = to
        msg["Subject"] = subject
        msg.attach(MIMEText(html, "html"))

        context = ssl.create_default_context()
        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.starttls(context=context)
            server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
            server.sendmail(GMAIL_USER, to, msg.as_string())

        logger.info(f"✅ Email sent: to={to} subject={subject}")
        return True
    except Exception as e:
        logger.error(f"❌ Email send failed: to={to} error={e}")
        return False


# ─── Email Templates ─────────────────────────────────────────

def _base_template(title: str, body: str, cta_text: str = "", cta_link: str = "") -> str:
    """Wrap email body in a clean HTML template."""
    cta_html = ""
    if cta_text and cta_link:
        cta_html = f"""
        <div style="text-align: center; margin: 30px 0;">
            <a href="{cta_link}" 
               style="background-color: #7c3aed; color: white; padding: 12px 32px; 
                      border-radius: 8px; text-decoration: none; font-weight: 600;
                      display: inline-block;">
                {cta_text}
            </a>
        </div>
        """

    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #7c3aed, #6d28d9); padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 22px;">🏢 ProcureAI</h1>
                <p style="color: #e9d5ff; margin: 8px 0 0; font-size: 14px;">{title}</p>
            </div>
            
            <!-- Body -->
            <div style="background: white; padding: 32px; border-radius: 0 0 12px 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                {body}
                {cta_html}
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
                <p style="color: #9ca3af; font-size: 12px; text-align: center;">
                    This is an automated notification from ProcureAI.<br>
                    Do not reply to this email.
                </p>
            </div>
        </div>
    </body>
    </html>
    """


# ─── Notification Helpers ────────────────────────────────────

def send_approval_needed(
    approver_email: str,
    approver_name: str,
    pr_number: str,
    requester_name: str,
    amount: float,
    purpose: str,
    app_url: str = "http://localhost:3000",
):
    """Send email when a PR needs approval."""
    body = f"""
    <h2 style="color: #1f2937; margin-top: 0;">Approval Required</h2>
    <p style="color: #4b5563;">Hi {approver_name},</p>
    <p style="color: #4b5563;">{requester_name} has submitted a purchase requisition that needs your approval:</p>
    
    <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <table style="width: 100%; border-collapse: collapse;">
            <tr>
                <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">PR Number</td>
                <td style="padding: 8px 0; color: #1f2937; font-weight: 600; text-align: right;">{pr_number}</td>
            </tr>
            <tr>
                <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Amount</td>
                <td style="padding: 8px 0; color: #1f2937; font-weight: 600; text-align: right;">${amount:,.2f}</td>
            </tr>
            <tr>
                <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Purpose</td>
                <td style="padding: 8px 0; color: #1f2937; text-align: right;">{purpose}</td>
            </tr>
        </table>
    </div>
    """
    html = _base_template(
        title="New Approval Request",
        body=body,
        cta_text="Review & Approve",
        cta_link=f"{app_url}/approvals",
    )
    return send_email(approver_email, f"🔔 Approval Needed: {pr_number} (${amount:,.2f})", html)


def send_pr_approved(
    requester_email: str,
    requester_name: str,
    pr_number: str,
    approver_name: str,
    app_url: str = "http://localhost:3000",
):
    """Send email when a PR is approved."""
    body = f"""
    <h2 style="color: #059669; margin-top: 0;">✅ Request Approved!</h2>
    <p style="color: #4b5563;">Hi {requester_name},</p>
    <p style="color: #4b5563;">Great news! Your purchase requisition <strong>{pr_number}</strong> has been approved by {approver_name}.</p>
    <p style="color: #4b5563;">A purchase order will be created automatically.</p>
    """
    html = _base_template(
        title="Purchase Request Approved",
        body=body,
        cta_text="View Details",
        cta_link=f"{app_url}/requisitions",
    )
    return send_email(requester_email, f"✅ Approved: {pr_number}", html)


def send_pr_rejected(
    requester_email: str,
    requester_name: str,
    pr_number: str,
    approver_name: str,
    reason: str = "",
    app_url: str = "http://localhost:3000",
):
    """Send email when a PR is rejected."""
    reason_html = f'<p style="color: #4b5563;"><strong>Reason:</strong> {reason}</p>' if reason else ""
    body = f"""
    <h2 style="color: #dc2626; margin-top: 0;">❌ Request Rejected</h2>
    <p style="color: #4b5563;">Hi {requester_name},</p>
    <p style="color: #4b5563;">Your purchase requisition <strong>{pr_number}</strong> has been rejected by {approver_name}.</p>
    {reason_html}
    <p style="color: #4b5563;">You can edit and resubmit the request if needed.</p>
    """
    html = _base_template(
        title="Purchase Request Rejected",
        body=body,
        cta_text="Edit Request",
        cta_link=f"{app_url}/requisitions",
    )
    return send_email(requester_email, f"❌ Rejected: {pr_number}", html)


def send_po_sent_to_supplier(
    supplier_email: str,
    supplier_name: str,
    po_number: str,
    total_amount: float,
    company_name: str = "ProcureAI",
):
    """Send PO email to supplier."""
    body = f"""
    <h2 style="color: #1f2937; margin-top: 0;">New Purchase Order</h2>
    <p style="color: #4b5563;">Dear {supplier_name},</p>
    <p style="color: #4b5563;">We are pleased to place the following purchase order:</p>
    
    <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <table style="width: 100%; border-collapse: collapse;">
            <tr>
                <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">PO Number</td>
                <td style="padding: 8px 0; color: #1f2937; font-weight: 600; text-align: right;">{po_number}</td>
            </tr>
            <tr>
                <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Total Amount</td>
                <td style="padding: 8px 0; color: #1f2937; font-weight: 600; text-align: right;">${total_amount:,.2f}</td>
            </tr>
            <tr>
                <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">From</td>
                <td style="padding: 8px 0; color: #1f2937; text-align: right;">{company_name}</td>
            </tr>
        </table>
    </div>
    
    <p style="color: #4b5563;">Please confirm receipt of this order and provide the expected delivery date.</p>
    <p style="color: #4b5563;">Thank you for your partnership.</p>
    """
    html = _base_template(title="Purchase Order", body=body)
    return send_email(supplier_email, f"📋 Purchase Order {po_number} — ${total_amount:,.2f}", html)


def send_low_stock_alert(
    recipient_email: str,
    recipient_name: str,
    product_name: str,
    product_sku: str,
    current_stock: int,
    min_stock: int,
    unit: str = "units",
    app_url: str = "http://localhost:3000",
):
    """Send low stock alert email."""
    body = f"""
    <h2 style="color: #f59e0b; margin-top: 0;">⚠️ Low Stock Alert</h2>
    <p style="color: #4b5563;">Hi {recipient_name},</p>
    <p style="color: #4b5563;">The following product is running low on stock:</p>
    
    <div style="background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <table style="width: 100%; border-collapse: collapse;">
            <tr>
                <td style="padding: 8px 0; color: #92400e; font-size: 14px;">Product</td>
                <td style="padding: 8px 0; color: #1f2937; font-weight: 600; text-align: right;">{product_name}</td>
            </tr>
            <tr>
                <td style="padding: 8px 0; color: #92400e; font-size: 14px;">SKU</td>
                <td style="padding: 8px 0; color: #1f2937; text-align: right;">{product_sku}</td>
            </tr>
            <tr>
                <td style="padding: 8px 0; color: #92400e; font-size: 14px;">Current Stock</td>
                <td style="padding: 8px 0; color: #dc2626; font-weight: 600; text-align: right;">{current_stock} {unit}</td>
            </tr>
            <tr>
                <td style="padding: 8px 0; color: #92400e; font-size: 14px;">Minimum Level</td>
                <td style="padding: 8px 0; color: #1f2937; text-align: right;">{min_stock} {unit}</td>
            </tr>
        </table>
    </div>
    
    <p style="color: #4b5563;">Consider creating a purchase requisition to reorder this item.</p>
    """
    html = _base_template(
        title="Low Stock Warning",
        body=body,
        cta_text="Create Purchase Request",
        cta_link=f"{app_url}/requisitions",
    )
    return send_email(recipient_email, f"⚠️ Low Stock: {product_name} ({current_stock} {unit} remaining)", html)


def send_goods_received(
    requester_email: str,
    requester_name: str,
    po_number: str,
    items_summary: str,
    app_url: str = "http://localhost:3000",
):
    """Send email when goods are received for a PO."""
    body = f"""
    <h2 style="color: #059669; margin-top: 0;">📦 Goods Received</h2>
    <p style="color: #4b5563;">Hi {requester_name},</p>
    <p style="color: #4b5563;">Goods have been received for purchase order <strong>{po_number}</strong>:</p>
    <p style="color: #4b5563;">{items_summary}</p>
    <p style="color: #4b5563;">Inventory has been automatically updated.</p>
    """
    html = _base_template(
        title="Goods Receipt Confirmation",
        body=body,
        cta_text="View Inventory",
        cta_link=f"{app_url}/inventory",
    )
    return send_email(requester_email, f"📦 Goods Received: {po_number}", html)
