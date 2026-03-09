"""
Tracking router: carrier listing, tracking timeline, refresh, webhook handler.
"""
from uuid import UUID
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.shipment import Shipment
from app.models.tracking import Carrier, TrackingCheckpoint
from app.services.tracking_service import (
    trackingmore_detect_carrier,
    refresh_shipment_tracking,
    add_manual_checkpoint,
    is_tracking_configured,
)

router = APIRouter(prefix="/api/tracking", tags=["tracking"])


# ═══════════════════════════════════════════════════════════════
# Carriers
# ═══════════════════════════════════════════════════════════════

@router.get("/carriers")
async def list_carriers(db: Session = Depends(get_db)):
    """List all active carriers."""
    carriers = db.query(Carrier).filter(Carrier.is_active == True).order_by(Carrier.name).all()
    return [
        {
            "id": str(c.id),
            "code": c.code,
            "name": c.name,
            "aftership_slug": c.aftership_slug,
            "tracking_url_template": c.tracking_url_template,
            "logo_url": c.logo_url,
        }
        for c in carriers
    ]


# ═══════════════════════════════════════════════════════════════
# Detect Carrier (AfterShip auto-detection)
# ═══════════════════════════════════════════════════════════════

@router.post("/detect-carrier")
async def detect_carrier(request: Request, db: Session = Depends(get_db)):
    """Auto-detect carrier from tracking number."""
    body = await request.json()
    tracking_number = body.get("tracking_number", "").strip()
    if not tracking_number:
        raise HTTPException(status_code=400, detail="tracking_number required")

    result = await trackingmore_detect_carrier(tracking_number)
    if not result["success"]:
        return {"success": False, "error": result.get("error"), "carriers": []}

    # Map AfterShip slugs to our carriers
    detected = []
    for courier in result.get("carriers", []):
        slug = courier.get("slug", "")
        our_carrier = db.query(Carrier).filter(Carrier.aftership_slug == slug).first()
        detected.append({
            "slug": slug,
            "name": courier.get("name", slug),
            "code": our_carrier.code if our_carrier else slug,
            "matched": our_carrier is not None,
        })

    return {"success": True, "carriers": detected}


# ═══════════════════════════════════════════════════════════════
# Shipment Tracking Timeline
# ═══════════════════════════════════════════════════════════════

@router.get("/shipment/{shipment_id}")
async def get_shipment_tracking(shipment_id: UUID, db: Session = Depends(get_db)):
    """Get full tracking details for a shipment including all checkpoints."""
    shipment = (
        db.query(Shipment)
        .options(
            joinedload(Shipment.checkpoints),
            joinedload(Shipment.items),
        )
        .filter(Shipment.id == shipment_id)
        .first()
    )
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    # Get carrier info
    carrier = None
    if shipment.carrier_code:
        carrier = db.query(Carrier).filter(Carrier.code == shipment.carrier_code).first()
    elif shipment.carrier:
        carrier = db.query(Carrier).filter(Carrier.name == shipment.carrier).first()

    # Build tracking URL
    tracking_url = shipment.tracking_url
    if not tracking_url and carrier and carrier.tracking_url_template and shipment.tracking_number:
        tracking_url = carrier.tracking_url_template.replace("{tracking_number}", shipment.tracking_number)

    return {
        "shipment_id": str(shipment.id),
        "shipment_number": shipment.shipment_number,
        "status": shipment.status.value if shipment.status else "unknown",
        "carrier": shipment.carrier,
        "carrier_code": shipment.carrier_code,
        "tracking_number": shipment.tracking_number,
        "tracking_url": tracking_url,
        "current_location": shipment.current_location,
        "last_message": shipment.last_checkpoint_message,
        "last_update_time": shipment.last_checkpoint_time.isoformat() if shipment.last_checkpoint_time else None,
        "estimated_delivery": str(shipment.estimated_delivery) if shipment.estimated_delivery else None,
        "actual_delivery": str(shipment.actual_delivery) if shipment.actual_delivery else None,
        "dispatched_at": shipment.dispatched_at.isoformat() if shipment.dispatched_at else None,
        "aftership_enabled": is_tracking_configured() and bool(shipment.aftership_id),
        "checkpoints": [
            {
                "id": str(cp.id),
                "time": cp.checkpoint_time.isoformat() if cp.checkpoint_time else None,
                "location": cp.location,
                "city": cp.city,
                "state": cp.state,
                "country": cp.country,
                "coordinates": {
                    "lat": cp.coordinates_lat,
                    "lng": cp.coordinates_lng,
                } if cp.coordinates_lat and cp.coordinates_lng else None,
                "message": cp.message,
                "status": cp.status,
                "source": cp.source,
            }
            for cp in (shipment.checkpoints or [])
        ],
        "items": [
            {
                "id": str(si.id),
                "quantity_shipped": si.quantity_shipped,
                "product_name": si.po_line_item.product.name if si.po_line_item and si.po_line_item.product else "Unknown",
            }
            for si in (shipment.items or [])
        ],
    }


# ═══════════════════════════════════════════════════════════════
# Refresh Tracking (manual poll from AfterShip)
# ═══════════════════════════════════════════════════════════════

@router.post("/shipment/{shipment_id}/refresh")
async def refresh_tracking(
    shipment_id: UUID,
    db: Session = Depends(get_db),
):
    """Manually refresh tracking from AfterShip."""
    result = await refresh_shipment_tracking(str(shipment_id), db)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error"))
    return result


# ═══════════════════════════════════════════════════════════════
# Manual Checkpoint (supplier adds location update)
# ═══════════════════════════════════════════════════════════════

@router.post("/shipment/{shipment_id}/checkpoint")
async def create_manual_checkpoint(
    shipment_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
):
    """Supplier manually adds a tracking checkpoint."""
    body = await request.json()
    message = body.get("message", "").strip()
    location = body.get("location", "").strip()
    status = body.get("status", "in_transit")

    if not message:
        raise HTTPException(status_code=400, detail="message required")

    checkpoint = add_manual_checkpoint(
        shipment_id=str(shipment_id),
        message=message,
        location=location,
        status=status,
        db=db,
    )

    return {
        "success": True,
        "checkpoint_id": str(checkpoint.id),
        "message": checkpoint.message,
        "location": checkpoint.location,
    }


# ═══════════════════════════════════════════════════════════════
# Get tracking by PO ID (for procure panel)
# ═══════════════════════════════════════════════════════════════

@router.get("/po/{po_id}")
async def get_po_tracking(po_id: UUID, db: Session = Depends(get_db)):
    """Get all shipments and tracking for a purchase order."""
    shipments = (
        db.query(Shipment)
        .options(
            joinedload(Shipment.checkpoints),
            joinedload(Shipment.items),
        )
        .filter(Shipment.po_id == po_id)
        .order_by(Shipment.created_at.desc())
        .all()
    )

    result = []
    for s in shipments:
        # Get carrier
        carrier = None
        if s.carrier_code:
            carrier = db.query(Carrier).filter(Carrier.code == s.carrier_code).first()
        elif s.carrier:
            carrier = db.query(Carrier).filter(Carrier.name == s.carrier).first()

        tracking_url = s.tracking_url
        if not tracking_url and carrier and carrier.tracking_url_template and s.tracking_number:
            tracking_url = carrier.tracking_url_template.replace("{tracking_number}", s.tracking_number)

        result.append({
            "shipment_id": str(s.id),
            "shipment_number": s.shipment_number,
            "status": s.status.value if s.status else "unknown",
            "carrier": s.carrier,
            "carrier_code": s.carrier_code,
            "tracking_number": s.tracking_number,
            "tracking_url": tracking_url,
            "current_location": s.current_location,
            "last_message": s.last_checkpoint_message,
            "estimated_delivery": str(s.estimated_delivery) if s.estimated_delivery else None,
            "dispatched_at": s.dispatched_at.isoformat() if s.dispatched_at else None,
            "shipment_type": s.shipment_type.value if s.shipment_type else "full",
            "checkpoints": [
                {
                    "id": str(cp.id),
                    "time": cp.checkpoint_time.isoformat() if cp.checkpoint_time else None,
                    "location": cp.location,
                    "city": cp.city,
                    "state": cp.state,
                    "country": cp.country,
                    "coordinates": {
                        "lat": cp.coordinates_lat,
                        "lng": cp.coordinates_lng,
                    } if cp.coordinates_lat and cp.coordinates_lng else None,
                    "message": cp.message,
                    "status": cp.status,
                    "source": cp.source,
                }
                for cp in (s.checkpoints or [])
            ],
            "items": [
                {
                    "id": str(si.id),
                    "quantity_shipped": si.quantity_shipped,
                }
                for si in (s.items or [])
            ],
        })

    return {"shipments": result, "total": len(result)}


# ═══════════════════════════════════════════════════════════════
# AfterShip Webhook (real-time updates)
# ═══════════════════════════════════════════════════════════════

@router.post("/webhooks/aftership")
async def aftership_webhook(request: Request, db: Session = Depends(get_db)):
    """Handle AfterShip webhook for real-time tracking updates."""
    try:
        body = await request.json()
        msg = body.get("msg", {})

        tracking_number = msg.get("tracking_number")
        slug = msg.get("slug")

        if not tracking_number:
            return {"message": "No tracking number in webhook"}

        # Find matching shipment
        shipment = db.query(Shipment).filter(
            Shipment.tracking_number == tracking_number,
        ).first()

        if not shipment:
            return {"message": f"No shipment found for tracking {tracking_number}"}

        # Refresh tracking data
        result = await refresh_shipment_tracking(str(shipment.id), db)
        return {"message": "Webhook processed", "result": result}

    except Exception as e:
        return {"message": f"Webhook processing error: {str(e)}"}
