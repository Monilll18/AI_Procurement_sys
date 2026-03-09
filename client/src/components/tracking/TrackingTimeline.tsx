"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Package, MapPin, CheckCircle, Clock, Truck, RefreshCw,
    ExternalLink, Loader2, AlertTriangle, Navigation,
} from "lucide-react";
import {
    getPoTracking, refreshShipmentTracking,
    type ShipmentTracking, type TrackingCheckpoint,
} from "@/lib/api";

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
    preparing: { icon: <Package className="h-5 w-5" />, color: "text-gray-400", label: "Preparing" },
    dispatched: { icon: <Truck className="h-5 w-5" />, color: "text-blue-500", label: "Dispatched" },
    info_received: { icon: <Package className="h-5 w-5" />, color: "text-indigo-500", label: "Info Received" },
    in_transit: { icon: <Navigation className="h-5 w-5" />, color: "text-amber-500", label: "In Transit" },
    out_for_delivery: { icon: <Truck className="h-5 w-5" />, color: "text-orange-500", label: "Out for Delivery" },
    delivered: { icon: <CheckCircle className="h-5 w-5" />, color: "text-green-500", label: "Delivered" },
    exception: { icon: <AlertTriangle className="h-5 w-5" />, color: "text-red-500", label: "Exception" },
    expired: { icon: <Clock className="h-5 w-5" />, color: "text-gray-500", label: "Expired" },
    cancelled: { icon: <AlertTriangle className="h-5 w-5" />, color: "text-red-500", label: "Cancelled" },
};

const STATUS_BADGE_COLORS: Record<string, string> = {
    dispatched: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    in_transit: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    out_for_delivery: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    delivered: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    exception: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

// Progress steps for the tracker bar
const PROGRESS_STEPS = ["dispatched", "in_transit", "out_for_delivery", "delivered"];

function ProgressTracker({ status, checkpoints }: { status: string; checkpoints?: { status: string }[] }) {
    // Derive best status from both the status field AND checkpoint statuses
    let effectiveStatus = status;
    if (checkpoints?.length) {
        const cpStatuses = checkpoints.map(cp => cp.status?.toLowerCase() || "");
        if (cpStatuses.some(s => s.includes("deliver"))) effectiveStatus = "delivered";
        else if (cpStatuses.some(s => s.includes("out_for"))) effectiveStatus = "out_for_delivery";
        else if (cpStatuses.some(s => s.includes("transit"))) effectiveStatus = "in_transit";
    }
    const currentIdx = PROGRESS_STEPS.indexOf(effectiveStatus);
    const fallbackIdx = currentIdx >= 0 ? currentIdx : 0; // At minimum show dispatched
    return (
        <div className="flex items-center w-full my-4">
            {PROGRESS_STEPS.map((step, idx) => {
                const isActive = idx <= fallbackIdx;
                const cfg = STATUS_CONFIG[step];
                return (
                    <div key={step} className="flex items-center flex-1 last:flex-none">
                        <div className={`flex flex-col items-center ${isActive ? "opacity-100" : "opacity-40"}`}>
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all
                                ${isActive ? "border-violet-500 bg-violet-500/10" : "border-gray-300 dark:border-gray-600"}`}>
                                <span className={isActive ? "text-violet-500" : "text-gray-400"}>{cfg?.icon}</span>
                            </div>
                            <span className={`text-xs mt-1 font-medium ${isActive ? "text-violet-600 dark:text-violet-400" : "text-muted-foreground"}`}>
                                {cfg?.label}
                            </span>
                        </div>
                        {idx < PROGRESS_STEPS.length - 1 && (
                            <div className={`flex-1 h-0.5 mx-2 rounded transition-all ${idx < fallbackIdx ? "bg-violet-500" : "bg-gray-200 dark:bg-gray-700"}`} />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function CheckpointTimeline({ checkpoints }: { checkpoints: TrackingCheckpoint[] }) {
    if (!checkpoints.length) {
        return (
            <p className="text-sm text-muted-foreground text-center py-6">No tracking checkpoints yet</p>
        );
    }

    return (
        <div className="relative ml-4">
            {/* Vertical line */}
            <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-gray-200 dark:bg-gray-700" />

            <div className="space-y-4">
                {checkpoints.map((cp, idx) => {
                    const isFirst = idx === 0;
                    return (
                        <div key={cp.id} className="relative flex gap-4">
                            {/* Dot */}
                            <div className="relative z-10 flex-shrink-0 mt-1">
                                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center
                                    ${isFirst
                                        ? "border-violet-500 bg-violet-500"
                                        : "border-gray-300 bg-background dark:border-gray-600"
                                    }`}>
                                    {isFirst && <div className="w-2 h-2 bg-white rounded-full" />}
                                </div>
                            </div>

                            {/* Content */}
                            <div className={`flex-1 pb-2 ${isFirst ? "bg-violet-50/50 dark:bg-violet-900/10 -ml-2 pl-4 pr-3 py-2 rounded-lg" : ""}`}>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-0.5">
                                    <Clock className="w-3 h-3" />
                                    {cp.time ? new Date(cp.time).toLocaleString() : "—"}
                                    {cp.source !== "manual" && (
                                        <Badge variant="outline" className="text-[10px] py-0 px-1 h-4">{cp.source}</Badge>
                                    )}
                                </div>
                                <p className={`text-sm ${isFirst ? "font-semibold" : "font-medium"}`}>{cp.message}</p>
                                {cp.location && (
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                                        <MapPin className="w-3 h-3" />
                                        {cp.location}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default function TrackingPanel({ poId }: { poId: string }) {
    const [data, setData] = useState<{ shipments: ShipmentTracking[] } | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        try {
            const res = await getPoTracking(poId);
            setData(res);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [poId]);

    // Auto-refresh every 5 minutes
    useEffect(() => {
        const interval = setInterval(load, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, [poId]);

    const handleRefresh = async (shipmentId: string) => {
        setRefreshing(shipmentId);
        try {
            await refreshShipmentTracking(shipmentId);
            await load();
        } catch (err: any) {
            console.error(err);
        } finally {
            setRefreshing(null);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
            </div>
        );
    }

    if (!data || !data.shipments.length) {
        return (
            <div className="text-center py-12 text-muted-foreground">
                <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="font-medium">No shipments yet</p>
                <p className="text-sm mt-1">This order hasn&apos;t been shipped by the supplier</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {data.shipments.map((s) => {
                const statusCfg = STATUS_CONFIG[s.status] || STATUS_CONFIG.dispatched;
                return (
                    <div key={s.shipment_id} className="space-y-4">
                        {/* Shipment header */}
                        <div className="flex items-start justify-between">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="font-bold">{s.shipment_number}</h3>
                                    <Badge variant="outline" className={`border-0 text-xs ${STATUS_BADGE_COLORS[s.status] || ""}`}>
                                        {statusCfg.label}
                                    </Badge>
                                    {s.shipment_type === "partial" && (
                                        <Badge variant="outline" className="text-xs border-amber-300 text-amber-600">Partial</Badge>
                                    )}
                                </div>
                                <p className="text-sm text-muted-foreground mt-0.5">
                                    {s.carrier && `${s.carrier} • `}
                                    Tracking: <span className="font-mono text-foreground">{s.tracking_number || "—"}</span>
                                </p>
                            </div>
                            <div className="flex gap-1.5">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleRefresh(s.shipment_id)}
                                    disabled={refreshing === s.shipment_id}
                                >
                                    {refreshing === s.shipment_id ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <RefreshCw className="h-3.5 w-3.5" />
                                    )}
                                </Button>
                                {s.tracking_url && (
                                    <Button size="sm" variant="outline" asChild>
                                        <a href={s.tracking_url} target="_blank" rel="noopener noreferrer">
                                            <ExternalLink className="h-3.5 w-3.5 mr-1" />
                                            Track
                                        </a>
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* Info cards */}
                        <div className="grid grid-cols-3 gap-2">
                            <div className="text-center p-2.5 rounded-lg border bg-muted/20">
                                <Truck className="h-4 w-4 mx-auto mb-1 text-blue-500" />
                                <p className="text-[10px] text-muted-foreground">Dispatched</p>
                                <p className="text-xs font-medium">
                                    {s.dispatched_at ? new Date(s.dispatched_at).toLocaleDateString() : "—"}
                                </p>
                            </div>
                            <div className="text-center p-2.5 rounded-lg border bg-muted/20">
                                <MapPin className="h-4 w-4 mx-auto mb-1 text-amber-500" />
                                <p className="text-[10px] text-muted-foreground">Current Location</p>
                                <p className="text-xs font-medium truncate">{s.current_location || "—"}</p>
                            </div>
                            <div className="text-center p-2.5 rounded-lg border bg-muted/20">
                                <Clock className="h-4 w-4 mx-auto mb-1 text-green-500" />
                                <p className="text-[10px] text-muted-foreground">Est. Delivery</p>
                                <p className="text-xs font-medium">{s.estimated_delivery || "—"}</p>
                            </div>
                        </div>

                        {/* Progress bar */}
                        <ProgressTracker status={s.status} checkpoints={s.checkpoints} />

                        {/* Checkpoints timeline */}
                        <div>
                            <h4 className="text-sm font-semibold mb-3 flex items-center gap-1">
                                <Clock className="h-4 w-4" /> Tracking History
                            </h4>
                            <CheckpointTimeline checkpoints={s.checkpoints} />
                        </div>

                        {data.shipments.length > 1 && <hr className="border-dashed" />}
                    </div>
                );
            })}
        </div>
    );
}
