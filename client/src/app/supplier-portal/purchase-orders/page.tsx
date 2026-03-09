"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
    CheckCircle, XCircle, Package, Loader2, Truck, Clock,
    AlertTriangle, Eye, RefreshCw, ShoppingCart,
} from "lucide-react";
import {
    getSupplierPOs, supplierAcceptPO, supplierRejectPO, supplierPartialAccept,
    createShipment, type SupplierPO,
} from "@/lib/supplier-api";

const STATUS_COLORS: Record<string, string> = {
    sent: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    approved: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    received: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    partially_received: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
    pending_approval: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
};

type ActionType = "accept" | "reject" | "partial" | "dispatch" | null;

export default function SupplierPurchaseOrdersPage() {
    const [pos, setPOs] = useState<SupplierPO[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("");
    const [selectedPO, setSelectedPO] = useState<SupplierPO | null>(null);
    const [showDetail, setShowDetail] = useState(false);

    // Action state
    const [actionType, setActionType] = useState<ActionType>(null);
    const [acting, setActing] = useState(false);
    const [rejectReason, setRejectReason] = useState("");
    const [acceptNotes, setAcceptNotes] = useState("");
    const [partialItems, setPartialItems] = useState<Record<string, number>>({});
    const [partialReason, setPartialReason] = useState("Limited stock availability");
    const [trackingNumber, setTrackingNumber] = useState("");
    const [carrier, setCarrier] = useState("");
    const [dispatchNotes, setDispatchNotes] = useState("");

    const loadPOs = async () => {
        setLoading(true);
        try {
            const data = await getSupplierPOs(filter || undefined);
            setPOs(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadPOs(); }, [filter]);

    const openAction = (po: SupplierPO, type: ActionType) => {
        setSelectedPO(po);
        setActionType(type);
        setRejectReason("");
        setAcceptNotes("");
        setPartialReason("Limited stock availability");
        setTrackingNumber("");
        setCarrier("");
        setDispatchNotes("");

        if (type === "partial" && po) {
            const init: Record<string, number> = {};
            po.line_items.forEach((li) => {
                init[li.id] = li.quantity; // default to full qty
            });
            setPartialItems(init);
        }
    };

    const closeAction = () => {
        setActionType(null);
        setSelectedPO(null);
    };

    const handleAction = async () => {
        if (!selectedPO) return;
        setActing(true);
        try {
            switch (actionType) {
                case "accept":
                    await supplierAcceptPO(selectedPO.id, acceptNotes || undefined);
                    break;
                case "reject":
                    await supplierRejectPO(selectedPO.id, rejectReason);
                    break;
                case "partial":
                    const items = selectedPO.line_items.map((li) => ({
                        line_item_id: li.id,
                        available_qty: partialItems[li.id] ?? li.quantity,
                    }));
                    await supplierPartialAccept(selectedPO.id, items, partialReason);
                    break;
                case "dispatch":
                    const dispatchItems = selectedPO.line_items.map((li) => ({
                        line_item_id: li.id,
                        quantity_shipped: li.quantity - li.quantity_received,
                    }));
                    await createShipment({
                        po_id: selectedPO.id,
                        carrier: carrier || undefined,
                        tracking_number: trackingNumber || undefined,
                        notes: dispatchNotes || undefined,
                        items: dispatchItems,
                    });
                    break;
            }
            closeAction();
            loadPOs();
        } catch (err: any) {
            alert(`❌ ${err.message}`);
        } finally {
            setActing(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <ShoppingCart className="h-6 w-6 text-violet-500" />
                        Purchase Orders
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        Manage orders from your buyers
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Select value={filter} onValueChange={setFilter}>
                        <SelectTrigger className="w-[160px]">
                            <SelectValue placeholder="All Statuses" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Statuses</SelectItem>
                            <SelectItem value="sent">New / Sent</SelectItem>
                            <SelectItem value="approved">Accepted</SelectItem>
                            <SelectItem value="partially_received">Partial</SelectItem>
                            <SelectItem value="received">Delivered</SelectItem>
                            <SelectItem value="cancelled">Rejected</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={loadPOs}>
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* PO List */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
                </div>
            ) : pos.length === 0 ? (
                <Card>
                    <CardContent className="py-16 text-center text-muted-foreground">
                        <Package className="h-12 w-12 mx-auto mb-4 opacity-40" />
                        <p className="font-semibold">No purchase orders found</p>
                        <p className="text-sm mt-1">
                            {filter ? "Try a different filter" : "Your buyers haven't sent any POs yet"}
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4">
                    {pos.map((po) => (
                        <Card key={po.id} className="overflow-hidden hover:shadow-md transition-shadow">
                            <CardContent className="p-5">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="font-bold text-base">{po.po_number}</h3>
                                            <Badge
                                                variant="outline"
                                                className={`border-0 text-xs capitalize ${STATUS_COLORS[po.status] || ""}`}
                                            >
                                                {po.status.replace(/_/g, " ")}
                                            </Badge>
                                        </div>
                                        <p className="text-sm text-muted-foreground">
                                            {po.line_items.length} items •{" "}
                                            ${po.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            {po.sent_at && ` • Sent ${new Date(po.sent_at).toLocaleDateString()}`}
                                        </p>

                                        {/* Quick line items preview */}
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            {po.line_items.slice(0, 3).map((li) => (
                                                <span
                                                    key={li.id}
                                                    className="text-xs bg-muted px-2 py-0.5 rounded-full"
                                                >
                                                    {li.product_name} × {li.quantity}
                                                </span>
                                            ))}
                                            {po.line_items.length > 3 && (
                                                <span className="text-xs text-muted-foreground">
                                                    +{po.line_items.length - 3} more
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Action buttons */}
                                    <div className="flex flex-col gap-1.5 shrink-0">
                                        <Button size="sm" variant="outline" onClick={() => { setSelectedPO(po); setShowDetail(true); }}>
                                            <Eye className="h-3.5 w-3.5 mr-1" /> View
                                        </Button>
                                        {po.status === "sent" && (
                                            <>
                                                <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => openAction(po, "accept")}>
                                                    <CheckCircle className="h-3.5 w-3.5 mr-1" /> Accept
                                                </Button>
                                                <Button size="sm" variant="destructive" onClick={() => openAction(po, "reject")}>
                                                    <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                                                </Button>
                                                <Button size="sm" variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50" onClick={() => openAction(po, "partial")}>
                                                    <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Partial
                                                </Button>
                                            </>
                                        )}
                                        {po.status === "approved" && (
                                            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => openAction(po, "dispatch")}>
                                                <Truck className="h-3.5 w-3.5 mr-1" /> Dispatch
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Detail Dialog */}
            <Dialog open={showDetail} onOpenChange={setShowDetail}>
                <DialogContent className="max-w-2xl">
                    {selectedPO && (
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                    {selectedPO.po_number}
                                    <Badge variant="outline" className={`border-0 text-xs capitalize ${STATUS_COLORS[selectedPO.status] || ""}`}>
                                        {selectedPO.status.replace(/_/g, " ")}
                                    </Badge>
                                </DialogTitle>
                                <DialogDescription>
                                    Total: ${selectedPO.total_amount.toLocaleString()} •{" "}
                                    {selectedPO.line_items.length} items
                                    {selectedPO.expected_delivery && ` • Due: ${selectedPO.expected_delivery}`}
                                </DialogDescription>
                            </DialogHeader>

                            <div className="rounded-lg border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Product</TableHead>
                                            <TableHead className="text-center">Qty</TableHead>
                                            <TableHead className="text-right">Unit Price</TableHead>
                                            <TableHead className="text-right">Total</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {selectedPO.line_items.map((li) => (
                                            <TableRow key={li.id}>
                                                <TableCell className="font-medium">{li.product_name}</TableCell>
                                                <TableCell className="text-center">{li.quantity}</TableCell>
                                                <TableCell className="text-right">${li.unit_price.toFixed(2)}</TableCell>
                                                <TableCell className="text-right">${li.total_price.toFixed(2)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>

                            {selectedPO.notes && (
                                <div className="rounded-lg border p-3 bg-muted/30">
                                    <p className="text-xs font-semibold text-muted-foreground mb-1">Notes</p>
                                    <p className="text-sm whitespace-pre-wrap">{selectedPO.notes}</p>
                                </div>
                            )}
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* Action Dialog */}
            <Dialog open={actionType !== null} onOpenChange={() => closeAction()}>
                <DialogContent className="max-w-lg">
                    {selectedPO && (
                        <>
                            <DialogHeader>
                                <DialogTitle>
                                    {actionType === "accept" && "✅ Accept Order"}
                                    {actionType === "reject" && "❌ Reject Order"}
                                    {actionType === "partial" && "⚠️ Partial Delivery"}
                                    {actionType === "dispatch" && "🚚 Dispatch Order"}
                                </DialogTitle>
                                <DialogDescription>
                                    {selectedPO.po_number} — ${selectedPO.total_amount.toLocaleString()}
                                </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-4">
                                {actionType === "accept" && (
                                    <div className="space-y-2">
                                        <p className="text-sm text-muted-foreground">
                                            Confirm you can fulfill this order in full.
                                        </p>
                                        <Textarea
                                            placeholder="Optional notes for the buyer..."
                                            value={acceptNotes}
                                            onChange={(e) => setAcceptNotes(e.target.value)}
                                        />
                                    </div>
                                )}

                                {actionType === "reject" && (
                                    <div className="space-y-2">
                                        <p className="text-sm text-muted-foreground">
                                            Provide a reason for rejecting this order. The buyer will be notified.
                                        </p>
                                        <Textarea
                                            placeholder="e.g. Out of stock, production delay, pricing issue..."
                                            value={rejectReason}
                                            onChange={(e) => setRejectReason(e.target.value)}
                                            required
                                        />
                                    </div>
                                )}

                                {actionType === "partial" && (
                                    <div className="space-y-3">
                                        <p className="text-sm text-muted-foreground">
                                            Enter the quantity you can deliver for each item:
                                        </p>
                                        {selectedPO.line_items.map((li) => (
                                            <div key={li.id} className="flex items-center gap-3 p-2 rounded-lg border">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium truncate">{li.product_name}</p>
                                                    <p className="text-xs text-muted-foreground">Ordered: {li.quantity}</p>
                                                </div>
                                                <Input
                                                    type="number"
                                                    min={0}
                                                    max={li.quantity}
                                                    value={partialItems[li.id] ?? li.quantity}
                                                    onChange={(e) => {
                                                        const val = parseInt(e.target.value) || 0;
                                                        const clamped = Math.min(Math.max(val, 0), li.quantity);
                                                        setPartialItems((prev) => ({
                                                            ...prev,
                                                            [li.id]: clamped,
                                                        }));
                                                    }}
                                                    className="w-24 text-center"
                                                />
                                            </div>
                                        ))}
                                        <Textarea
                                            placeholder="Reason for partial delivery..."
                                            value={partialReason}
                                            onChange={(e) => setPartialReason(e.target.value)}
                                        />
                                    </div>
                                )}

                                {actionType === "dispatch" && (
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1.5">
                                                <label className="text-sm font-medium">Carrier</label>
                                                <Select value={carrier} onValueChange={setCarrier}>
                                                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="FedEx">FedEx</SelectItem>
                                                        <SelectItem value="UPS">UPS</SelectItem>
                                                        <SelectItem value="DHL">DHL</SelectItem>
                                                        <SelectItem value="USPS">USPS</SelectItem>
                                                        <SelectItem value="Other">Other</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-sm font-medium">Tracking #</label>
                                                <Input
                                                    placeholder="e.g. FDX123456789"
                                                    value={trackingNumber}
                                                    onChange={(e) => setTrackingNumber(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        <Textarea
                                            placeholder="Dispatch notes..."
                                            value={dispatchNotes}
                                            onChange={(e) => setDispatchNotes(e.target.value)}
                                        />
                                    </div>
                                )}
                            </div>

                            <DialogFooter>
                                <Button variant="outline" onClick={closeAction} disabled={acting}>
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleAction}
                                    disabled={acting || (actionType === "reject" && !rejectReason.trim())}
                                    className={
                                        actionType === "accept" ? "bg-green-600 hover:bg-green-700" :
                                            actionType === "reject" ? "bg-red-600 hover:bg-red-700" :
                                                actionType === "dispatch" ? "bg-blue-600 hover:bg-blue-700" :
                                                    "bg-amber-600 hover:bg-amber-700"
                                    }
                                >
                                    {acting ? (
                                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>
                                    ) : (
                                        <>
                                            {actionType === "accept" && "Confirm Accept"}
                                            {actionType === "reject" && "Confirm Reject"}
                                            {actionType === "partial" && "Submit Partial"}
                                            {actionType === "dispatch" && "Mark Dispatched"}
                                        </>
                                    )}
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
