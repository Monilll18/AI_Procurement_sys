"""
Tracking service: TrackingMore API integration (FREE — 50 trackings/month).
Falls back gracefully when TRACKINGMORE_API_KEY is not configured (manual-only mode).

API Docs: https://www.trackingmore.com/docs/trackingmore/d5o23k23fgmu0-api-overview
"""
import os
import httpx
import logging
from typing import Optional
from datetime import datetime
from sqlalchemy.orm import Session

from app.models.shipment import Shipment, ShipmentStatus
from app.models.tracking import TrackingCheckpoint, Carrier
from app.models.notification import Notification

logger = logging.getLogger(__name__)

TRACKINGMORE_API_KEY = os.getenv("TRACKINGMORE_API_KEY", "")
TRACKINGMORE_BASE_URL = "https://api.trackingmore.com/v4"


def _headers():
    return {
        "Content-Type": "application/json",
        "Tracking-Api-Key": TRACKINGMORE_API_KEY,
    }


def is_tracking_configured() -> bool:
    return bool(TRACKINGMORE_API_KEY)


# ═══════════════════════════════════════════════════════════════
# TrackingMore API Functions
# ═══════════════════════════════════════════════════════════════

async def trackingmore_create_tracking(
    tracking_number: str,
    courier_code: str,
    order_number: Optional[str] = None,
    title: Optional[str] = None,
) -> dict:
    """Register a tracking number with TrackingMore."""
    if not is_tracking_configured():
        return {"success": False, "error": "TrackingMore not configured"}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            payload = {
                "tracking_number": tracking_number,
                "courier_code": courier_code,
            }
            if order_number:
                payload["order_number"] = order_number
            if title:
                payload["title"] = title

            resp = await client.post(
                f"{TRACKINGMORE_BASE_URL}/trackings/create",
                headers=_headers(),
                json=payload,
            )
            data = resp.json()
            if resp.status_code in (200, 201) and data.get("meta", {}).get("code") == 200:
                tracking = data.get("data", {})
                return {
                    "success": True,
                    "tracking_id": tracking.get("id"),
                    "data": tracking,
                }
            else:
                msg = data.get("meta", {}).get("message", "Unknown error")
                logger.warning(f"TrackingMore create failed: {msg}")
                return {"success": False, "error": msg}
    except Exception as e:
        logger.error(f"TrackingMore create error: {e}")
        return {"success": False, "error": str(e)}


async def trackingmore_get_tracking(courier_code: str, tracking_number: str) -> dict:
    """Fetch latest tracking info from TrackingMore."""
    if not is_tracking_configured():
        return {"success": False, "error": "TrackingMore not configured"}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{TRACKINGMORE_BASE_URL}/trackings/get",
                headers=_headers(),
                params={
                    "tracking_numbers": tracking_number,
                    "courier_code": courier_code,
                },
            )
            data = resp.json()
            if resp.status_code == 200 and data.get("meta", {}).get("code") == 200:
                items = data.get("data", {}).get("items", [])
                if items:
                    return {"success": True, "data": items[0]}
                return {"success": False, "error": "No tracking data found"}
            else:
                msg = data.get("meta", {}).get("message", "Unknown error")
                return {"success": False, "error": msg}
    except Exception as e:
        logger.error(f"TrackingMore get error: {e}")
        return {"success": False, "error": str(e)}


async def trackingmore_detect_carrier(tracking_number: str) -> dict:
    """Auto-detect carrier from tracking number."""
    if not is_tracking_configured():
        return {"success": False, "error": "TrackingMore not configured"}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{TRACKINGMORE_BASE_URL}/couriers/detect",
                headers=_headers(),
                json={"tracking_number": tracking_number},
            )
            data = resp.json()
            if resp.status_code == 200 and data.get("meta", {}).get("code") == 200:
                couriers = data.get("data", [])
                return {"success": True, "carriers": couriers}
            else:
                msg = data.get("meta", {}).get("message", "Unknown error")
                return {"success": False, "error": msg}
    except Exception as e:
        logger.error(f"TrackingMore detect error: {e}")
        return {"success": False, "error": str(e)}


# ═══════════════════════════════════════════════════════════════
# Status Mapping (TrackingMore → Our system)
# ═══════════════════════════════════════════════════════════════

TRACKINGMORE_STATUS_MAP = {
    "pending": ShipmentStatus.preparing,
    "notfound": ShipmentStatus.info_received,
    "transit": ShipmentStatus.in_transit,
    "pickup": ShipmentStatus.dispatched,
    "undelivered": ShipmentStatus.exception,
    "delivered": ShipmentStatus.delivered,
    "exception": ShipmentStatus.exception,
    "expired": ShipmentStatus.expired,
}


def map_tracking_status(delivery_status: str) -> ShipmentStatus:
    return TRACKINGMORE_STATUS_MAP.get(delivery_status, ShipmentStatus.in_transit)


# ═══════════════════════════════════════════════════════════════
# Refresh Tracking (polls TrackingMore, updates DB)
# ═══════════════════════════════════════════════════════════════

async def refresh_shipment_tracking(shipment_id: str, db: Session) -> dict:
    """
    Poll TrackingMore for latest status, update Shipment + create TrackingCheckpoints.
    Returns updated tracking data.
    """
    shipment = db.query(Shipment).filter(Shipment.id == shipment_id).first()
    if not shipment:
        return {"success": False, "error": "Shipment not found"}

    if not shipment.tracking_number or not shipment.carrier_code:
        return {"success": False, "error": "No tracking number or carrier code"}

    result = await trackingmore_get_tracking(shipment.carrier_code, shipment.tracking_number)
    if not result["success"]:
        return result

    tracking = result["data"]
    old_status = shipment.status

    # Update shipment fields
    delivery_status = tracking.get("delivery_status", "")
    new_status = map_tracking_status(delivery_status)
    origin_info = tracking.get("origin_info", {})
    destination_info = tracking.get("destination_info", {})

    # Get checkpoints from tracking data
    checkpoints = origin_info.get("trackinfo", []) + destination_info.get("trackinfo", [])
    # Sort by date descending
    checkpoints.sort(key=lambda x: x.get("Date", ""), reverse=True)

    shipment.status = new_status
    if checkpoints:
        latest = checkpoints[0]
        shipment.current_location = latest.get("Details", "")
        shipment.last_checkpoint_message = latest.get("StatusDescription", "")
        cp_date = latest.get("Date")
        if cp_date:
            try:
                shipment.last_checkpoint_time = datetime.fromisoformat(cp_date.replace("Z", "+00:00"))
            except (ValueError, TypeError):
                try:
                    shipment.last_checkpoint_time = datetime.strptime(cp_date, "%Y-%m-%d %H:%M:%S")
                except (ValueError, TypeError):
                    pass

    if new_status == ShipmentStatus.delivered and checkpoints:
        try:
            delivered_time = checkpoints[0].get("Date", "")
            shipment.actual_delivery = datetime.fromisoformat(
                delivered_time.replace("Z", "+00:00")
            ).date()
            shipment.delivered_at = datetime.fromisoformat(
                delivered_time.replace("Z", "+00:00")
            )
        except (ValueError, TypeError, KeyError):
            pass

    # Store new checkpoints
    new_checkpoints = []
    for cp in checkpoints:
        cp_date_str = cp.get("Date")
        if not cp_date_str:
            continue
        try:
            cp_time = datetime.fromisoformat(cp_date_str.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            try:
                cp_time = datetime.strptime(cp_date_str, "%Y-%m-%d %H:%M:%S")
            except (ValueError, TypeError):
                continue

        description = cp.get("StatusDescription", "Status update")
        location = cp.get("Details", "")

        # Check if checkpoint already exists
        exists = db.query(TrackingCheckpoint).filter(
            TrackingCheckpoint.shipment_id == shipment.id,
            TrackingCheckpoint.checkpoint_time == cp_time,
            TrackingCheckpoint.message == description,
        ).first()

        if not exists:
            checkpoint = TrackingCheckpoint(
                shipment_id=shipment.id,
                checkpoint_time=cp_time,
                location=location,
                message=description,
                status=delivery_status,
                source="trackingmore",
                raw_data=cp,
            )
            db.add(checkpoint)
            new_checkpoints.append(checkpoint)

    # Send notification if status changed
    if old_status != new_status and shipment.purchase_order:
        po = shipment.purchase_order
        status_labels = {
            ShipmentStatus.in_transit: "📦 In Transit",
            ShipmentStatus.out_for_delivery: "🚚 Out for Delivery",
            ShipmentStatus.delivered: "✅ Delivered",
            ShipmentStatus.exception: "⚠️ Delivery Exception",
        }
        label = status_labels.get(new_status, f"Status: {new_status.value}")
        last_msg = shipment.last_checkpoint_message or ""

        notification = Notification(
            user_id=po.created_by if hasattr(po, "created_by") else None,
            type="tracking_update",
            title=f"{label} — {po.po_number}",
            message=f"Shipment {shipment.shipment_number} via {shipment.carrier}: {last_msg}",
            link=f"/purchase-orders",
        )
        if notification.user_id:
            db.add(notification)

    db.commit()

    return {
        "success": True,
        "status": new_status.value,
        "previous_status": old_status.value if old_status else None,
        "current_location": shipment.current_location,
        "last_message": shipment.last_checkpoint_message,
        "new_checkpoints": len(new_checkpoints),
    }


# ═══════════════════════════════════════════════════════════════
# Manual checkpoint (supplier adds update without API)
# ═══════════════════════════════════════════════════════════════

def add_manual_checkpoint(
    shipment_id: str,
    message: str,
    location: str,
    status: str,
    db: Session,
) -> TrackingCheckpoint:
    """Add a manual tracking checkpoint (e.g., supplier updates status)."""
    checkpoint = TrackingCheckpoint(
        shipment_id=shipment_id,
        checkpoint_time=datetime.utcnow(),
        location=location,
        message=message,
        status=status,
        source="manual",
    )
    db.add(checkpoint)

    # Update shipment last checkpoint
    shipment = db.query(Shipment).filter(Shipment.id == shipment_id).first()
    if shipment:
        shipment.current_location = location
        shipment.last_checkpoint_message = message
        shipment.last_checkpoint_time = datetime.utcnow()

    db.commit()
    return checkpoint
