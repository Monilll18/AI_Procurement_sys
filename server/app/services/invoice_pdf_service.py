"""
Supplier Invoice PDF generation service using ReportLab.
Generates professional invoice PDF documents for download and 3-way matching.
"""
import io
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)


def generate_invoice_pdf(
    invoice_number: str,
    po_number: str = "",
    supplier_name: str = "",
    supplier_email: str = "",
    invoice_date: str = "",
    due_date: str = "",
    subtotal: float = 0.0,
    tax_amount: float = 0.0,
    total_amount: float = 0.0,
    currency: str = "USD",
    notes: str = "",
    status: str = "draft",
    match_status: str = "",
    line_items: List[Dict[str, Any]] = None,
    company_name: str = "ProcureAI",
) -> bytes:
    """
    Generate a professional invoice PDF document.
    Returns PDF bytes.
    """
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=20 * mm, bottomMargin=20 * mm)
    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        "InvTitle", parent=styles["Title"],
        fontSize=24, textColor=colors.HexColor("#059669"),
        spaceAfter=6,
    )
    subtitle_style = ParagraphStyle(
        "InvSubtitle", parent=styles["Normal"],
        fontSize=12, textColor=colors.HexColor("#6b7280"),
        spaceAfter=12,
    )
    heading_style = ParagraphStyle(
        "InvHeading", parent=styles["Heading2"],
        fontSize=14, textColor=colors.HexColor("#1f2937"),
        spaceBefore=16, spaceAfter=8,
    )
    normal_style = ParagraphStyle(
        "InvNormal", parent=styles["Normal"],
        fontSize=10, textColor=colors.HexColor("#374151"),
        spaceAfter=4,
    )
    bold_style = ParagraphStyle(
        "InvBold", parent=styles["Normal"],
        fontSize=10, textColor=colors.HexColor("#1f2937"),
        fontName="Helvetica-Bold",
    )

    elements = []

    # ─── Header ────────────────────────────────────────────
    elements.append(Paragraph("INVOICE", title_style))
    elements.append(Paragraph(f"From: {supplier_name}", subtitle_style))
    elements.append(HRFlowable(width="100%", color=colors.HexColor("#059669"), thickness=2))
    elements.append(Spacer(1, 10 * mm))

    # ─── Invoice Info Table ────────────────────────────────
    date_str = invoice_date if invoice_date else datetime.utcnow().strftime("%B %d, %Y")
    due_str = due_date if due_date else "Upon receipt"

    info_data = [
        [Paragraph("<b>Invoice #:</b>", bold_style), Paragraph(invoice_number, normal_style),
         Paragraph("<b>Date:</b>", bold_style), Paragraph(date_str, normal_style)],
        [Paragraph("<b>PO Reference:</b>", bold_style), Paragraph(po_number, normal_style),
         Paragraph("<b>Due Date:</b>", bold_style), Paragraph(due_str, normal_style)],
        [Paragraph("<b>Status:</b>", bold_style), Paragraph(status.upper(), normal_style),
         Paragraph("<b>Currency:</b>", bold_style), Paragraph(currency, normal_style)],
    ]
    info_table = Table(info_data, colWidths=[85, 145, 75, 150])
    info_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f0fdf4")),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#1f2937")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1fae5")),
        ("PADDING", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    elements.append(info_table)
    elements.append(Spacer(1, 8 * mm))

    # ─── Supplier Info ─────────────────────────────────────
    elements.append(Paragraph("From", heading_style))
    elements.append(Paragraph(f"<b>{supplier_name}</b>", bold_style))
    if supplier_email:
        elements.append(Paragraph(f"Email: {supplier_email}", normal_style))
    elements.append(Spacer(1, 4 * mm))

    elements.append(Paragraph("Bill To", heading_style))
    elements.append(Paragraph(f"<b>{company_name}</b>", bold_style))
    elements.append(Spacer(1, 8 * mm))

    # ─── Line Items Table ──────────────────────────────────
    elements.append(Paragraph("Invoice Items", heading_style))

    if line_items:
        header = [
            Paragraph("<b>#</b>", bold_style),
            Paragraph("<b>Description</b>", bold_style),
            Paragraph("<b>Qty</b>", bold_style),
            Paragraph("<b>Unit Price</b>", bold_style),
            Paragraph("<b>Total</b>", bold_style),
        ]
        rows = [header]
        for i, item in enumerate(line_items, 1):
            desc = item.get("description", item.get("product_name", "N/A"))
            qty = item.get("quantity", 0)
            unit_price = item.get("unit_price", 0)
            total_price = item.get("total_price", qty * unit_price)
            rows.append([
                Paragraph(str(i), normal_style),
                Paragraph(desc, normal_style),
                Paragraph(str(qty), normal_style),
                Paragraph(f"${unit_price:,.2f}", normal_style),
                Paragraph(f"${total_price:,.2f}", normal_style),
            ])

        items_table = Table(rows, colWidths=[30, 200, 60, 80, 90])
        items_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#059669")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("BACKGROUND", (0, 1), (-1, -1), colors.white),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f0fdf4")]),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1fae5")),
            ("PADDING", (0, 0), (-1, -1), 8),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN", (2, 0), (4, -1), "RIGHT"),
        ]))
        elements.append(items_table)
    else:
        elements.append(Paragraph("No items specified.", normal_style))

    elements.append(Spacer(1, 5 * mm))

    # ─── Totals ────────────────────────────────────────────
    totals_data = [
        [Paragraph("Subtotal:", normal_style), Paragraph(f"${subtotal:,.2f}", normal_style)],
        [Paragraph("Tax:", normal_style), Paragraph(f"${tax_amount:,.2f}", normal_style)],
        [Paragraph("<b>Total Due:</b>", bold_style), Paragraph(f"<b>${total_amount:,.2f}</b>", bold_style)],
    ]
    totals_table = Table(totals_data, colWidths=[360, 100])
    totals_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 1), colors.HexColor("#f9fafb")),
        ("BACKGROUND", (0, 2), (-1, 2), colors.HexColor("#ecfdf5")),
        ("PADDING", (0, 0), (-1, -1), 8),
        ("ALIGN", (-1, 0), (-1, -1), "RIGHT"),
        ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#059669")),
        ("LINEABOVE", (0, 2), (-1, 2), 1, colors.HexColor("#059669")),
    ]))
    elements.append(totals_table)

    # ─── Payment Terms ─────────────────────────────────────
    elements.append(Spacer(1, 6 * mm))
    elements.append(Paragraph(f"<b>Payment Terms:</b> Net 30", bold_style))

    # ─── Notes ─────────────────────────────────────────────
    if notes:
        elements.append(Spacer(1, 6 * mm))
        elements.append(Paragraph("Notes", heading_style))
        elements.append(Paragraph(notes, normal_style))

    # ─── Footer ────────────────────────────────────────────
    elements.append(Spacer(1, 15 * mm))
    elements.append(HRFlowable(width="100%", color=colors.HexColor("#e5e7eb"), thickness=1))
    elements.append(Spacer(1, 3 * mm))
    footer_style = ParagraphStyle(
        "InvFooter", parent=styles["Normal"],
        fontSize=8, textColor=colors.HexColor("#9ca3af"),
        alignment=TA_CENTER,
    )
    elements.append(Paragraph(
        f"Invoice generated by {company_name} • {datetime.utcnow().strftime('%B %d, %Y at %H:%M UTC')}",
        footer_style,
    ))

    doc.build(elements)
    return buffer.getvalue()
