"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, Loader2, Plus, Eye, X, Sparkles, Mail, FileText, CheckCircle, AlertTriangle, Copy, ChevronDown, Clock, Download, PackageCheck, Send, RefreshCw, Upload, MapPin } from "lucide-react";
import TrackingPanel from "@/components/tracking/TrackingTimeline";
import { toast } from "sonner";
import { extractTextFromPDF } from "@/lib/pdf-extract";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    getPurchaseOrders, createPurchaseOrder, submitPO, getSuppliers, getProducts,
    aiGeneratePO, aiMatchInvoice, downloadPoPdf, sendPOToSupplier, receiveGoods,
    getSupplierCatalog,
    type PurchaseOrder, type Supplier, type Product, type PODraft, type InvoiceMatch,
    type SupplierCatalogItem,
} from "@/lib/api";
import { useAuth } from "@clerk/nextjs";
import { useAICall } from "@/hooks/useAICall";
import { AIErrorBoundary } from "@/components/AIErrorBoundary";
import { useRBAC } from "@/lib/rbac";

const INVOICE_MAX_CHARS = 15000;

const STATUS_LABELS: Record<string, string> = {
    draft: "Draft", pending_approval: "Pending Approval",
    approved: "Approved", sent: "Sent", partially_received: "Partially Received",
    received: "Received", inspection: "Inspection", invoiced: "Invoiced",
    paid: "Paid", cancelled: "Cancelled",
};

export default function PurchaseOrdersPage() {
    const { getToken } = useAuth();
    const { can } = useRBAC();
    const [orders, setOrders] = useState<PurchaseOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [createOpen, setCreateOpen] = useState(false);
    const [viewOrder, setViewOrder] = useState<PurchaseOrder | null>(null);
    const [saving, setSaving] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // AI PO Generation state
    const [poDraft, setPoDraft] = useState<PODraft | null>(null);
    const [poDraftError, setPoDraftError] = useState("");

    // Invoice Matching state
    const [invoiceText, setInvoiceText] = useState("");
    const [invoiceMatch, setInvoiceMatch] = useState<InvoiceMatch | null>(null);
    const [invoiceMatchError, setInvoiceMatchError] = useState("");
    const [extractingPdf, setExtractingPdf] = useState(false);

    // Receive Goods state
    const [receiveItems, setReceiveItems] = useState<{ line_item_id: string; quantity_received: number; condition: string }[]>([]);
    const [receiveNotes, setReceiveNotes] = useState("");
    const [receiving, setReceiving] = useState(false);

    // Create PO form state
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [catalogItems, setCatalogItems] = useState<SupplierCatalogItem[]>([]);
    const [selectedSupplier, setSelectedSupplier] = useState("");
    const [poNotes, setPoNotes] = useState("");
    const [lineItems, setLineItems] = useState<{ product_id: string; quantity: number; unit_price: number }[]>([]);

    const loadOrders = () => {
        setLoading(true);
        getPurchaseOrders()
            .then(setOrders)
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    useEffect(() => { loadOrders(); }, []);

    const handleViewOrder = (po: PurchaseOrder) => {
        // Cancel any in-flight AI requests from previous PO
        poDraftAI.abort();
        invoiceMatchAI.abort();
        setViewOrder(po);
        setPoDraft(null);
        setPoDraftError("");
        setInvoiceText("");
        setInvoiceMatch(null);
        setInvoiceMatchError("");
        // Init receive goods state
        setReceiveItems(
            (po.line_items || []).map((li) => ({
                line_item_id: li.id,
                quantity_received: 0,
                condition: "GOOD",
            }))
        );
        setReceiveNotes("");
    };

    // ── AI PO Draft — useAICall (debounce + cooldown + abort)
    const poDraftAI = useAICall<{ draft: PODraft }>({
        fn: useCallback((_signal: AbortSignal) => {
            if (!viewOrder) return Promise.reject(new Error("No PO selected"));
            const lineItemsForAI = (viewOrder.line_items || []).map((li) => ({
                product_name: li.product_id,
                quantity: li.quantity,
                unit: "pcs",
                unit_price: li.unit_price,
                total_price: li.total_price,
            }));
            return aiGeneratePO({
                po_number: viewOrder.po_number,
                total_amount: viewOrder.total_amount,
                supplier_id: viewOrder.supplier_id,
                line_items: lineItemsForAI,
                payment_terms: "Net 30",
                purpose: viewOrder.notes || "General procurement",
            });
        }, [viewOrder]),
        onSuccess: (result) => {
            if (result.draft) {
                const draft = typeof result.draft === "string" ? JSON.parse(result.draft) : result.draft;
                setPoDraft(draft);
            }
            setPoDraftError("");
        },
        onError: (msg) => setPoDraftError(msg || "Failed to generate PO draft"),
    });

    // ── Invoice Match — useAICall (debounce + cooldown + abort)
    const invoiceMatchAI = useAICall<{ match: InvoiceMatch }>({
        fn: useCallback((_signal: AbortSignal) => {
            if (!viewOrder || !invoiceText.trim()) return Promise.reject(new Error("Invoice text required"));
            return aiMatchInvoice({ invoice_text: invoiceText, po_id: viewOrder.id });
        }, [viewOrder, invoiceText]),
        onSuccess: (result) => {
            if (result.match) {
                const match = typeof result.match === "string" ? JSON.parse(result.match) : result.match;
                setInvoiceMatch(match);
            }
            setInvoiceMatchError("");
        },
        onError: (msg) => setInvoiceMatchError(msg || "Invoice matching failed"),
    });


    const openCreate = async () => {
        const [s, p] = await Promise.all([getSuppliers(), getProducts()]);
        setSuppliers(s);
        setProducts(p);
        setSelectedSupplier("");
        setCatalogItems([]);
        setPoNotes("");
        setLineItems([{ product_id: "", quantity: 1, unit_price: 0 }]);
        setCreateOpen(true);
    };

    const handleSupplierChange = async (supplierId: string) => {
        setSelectedSupplier(supplierId);
        setLineItems([{ product_id: "", quantity: 1, unit_price: 0 }]);
        if (supplierId) {
            try {
                const catalog = await getSupplierCatalog(supplierId);
                setCatalogItems(catalog);
            } catch {
                setCatalogItems([]);
            }
        } else {
            setCatalogItems([]);
        }
    };

    const addLineItem = () => {
        setLineItems([...lineItems, { product_id: "", quantity: 1, unit_price: 0 }]);
    };

    const removeLineItem = (index: number) => {
        setLineItems(lineItems.filter((_, i) => i !== index));
    };

    const updateLineItem = (index: number, field: string, value: any) => {
        const updated = [...lineItems];
        (updated[index] as any)[field] = value;
        setLineItems(updated);
    };

    const totalAmount = lineItems.reduce((sum, li) => sum + (li.quantity * li.unit_price), 0);

    const handleCreatePO = async () => {
        if (!selectedSupplier || lineItems.length === 0) return;
        setSaving(true);
        try {
            const token = await getToken() || "";
            await createPurchaseOrder({
                supplier_id: selectedSupplier,
                notes: poNotes || null,
                line_items: lineItems.map((li) => ({
                    product_id: li.product_id,
                    quantity: li.quantity,
                    unit_price: li.unit_price,
                    total_price: li.quantity * li.unit_price,
                })),
            }, token);
            setCreateOpen(false);
            loadOrders();
        } catch (err: any) {
            toast.error(err.message || "Failed to create PO");
        } finally {
            setSaving(false);
        }
    };

    const handleSubmitPO = async (poId: string) => {
        setSubmitting(true);
        try {
            const token = await getToken() || "";
            await submitPO(poId, token);
            setViewOrder(null);
            loadOrders();
        } catch (err: any) {
            toast.error(err.message || "Failed to submit PO for approval");
        } finally {
            setSubmitting(false);
        }
    };

    const handleReceiveGoods = async () => {
        if (!viewOrder) return;
        const itemsToReceive = receiveItems.filter((r) => r.quantity_received > 0);
        if (itemsToReceive.length === 0) return;
        setReceiving(true);
        try {
            const token = await getToken() || "";
            const result = await receiveGoods(viewOrder.id, {
                items: itemsToReceive,
                notes: receiveNotes || undefined,
            }, token);
            toast.success(`${result.message} — Received ${result.total_received}/${result.total_ordered}`);
            loadOrders();
            setViewOrder(null);
        } catch (err: any) {
            toast.error(err.message || "Failed to record receipt");
        } finally {
            setReceiving(false);
        }
    };

    const filtered = orders.filter(
        (po) =>
            po.po_number.toLowerCase().includes(search.toLowerCase()) ||
            (po.supplier_name && po.supplier_name.toLowerCase().includes(search.toLowerCase()))
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Purchase Orders</h2>
                    <p className="text-muted-foreground">
                        Track and manage orders sent to suppliers.{" "}
                        <span className="text-xs">({orders.length} total)</span>
                    </p>
                </div>
                {can("create_po") && (
                    <Button onClick={openCreate}>
                        <Plus className="mr-2 h-4 w-4" /> Create Purchase Order
                    </Button>
                )}
            </div>

            <Tabs defaultValue="all" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="all">All ({orders.length})</TabsTrigger>
                    <TabsTrigger value="draft">Drafts ({orders.filter(o => o.status === "draft").length})</TabsTrigger>
                    <TabsTrigger value="active">Active ({orders.filter(o => ["pending_approval", "approved", "sent"].includes(o.status)).length})</TabsTrigger>
                    <TabsTrigger value="closed">Received ({orders.filter(o => o.status === "received").length})</TabsTrigger>
                </TabsList>

                <div className="flex items-center gap-4 rounded-lg border bg-card p-4 shadow-sm">
                    <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search PO number or supplier..."
                            className="pl-9"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                <TabsContent value="all"><OrderTable orders={filtered} loading={loading} search={search} onView={handleViewOrder} /></TabsContent>
                <TabsContent value="draft"><OrderTable orders={filtered.filter(o => o.status === "draft")} loading={loading} search={search} onView={handleViewOrder} /></TabsContent>
                <TabsContent value="active"><OrderTable orders={filtered.filter(o => ["pending_approval", "approved", "sent"].includes(o.status))} loading={loading} search={search} onView={handleViewOrder} /></TabsContent>
                <TabsContent value="closed"><OrderTable orders={filtered.filter(o => o.status === "received")} loading={loading} search={search} onView={handleViewOrder} /></TabsContent>
            </Tabs>

            {/* Create PO Dialog */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Create Purchase Order</DialogTitle>
                        <DialogDescription>Select a supplier and add products to create a new PO.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-6 py-4">
                        <div className="grid gap-2">
                            <Label>Supplier</Label>
                            <Select value={selectedSupplier} onValueChange={handleSupplierChange}>
                                <SelectTrigger><SelectValue placeholder="Select supplier..." /></SelectTrigger>
                                <SelectContent>
                                    {suppliers.map((s) => (
                                        <SelectItem key={s.id} value={s.id}>
                                            {s.name} {s.rating && `(★${s.rating})`}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {selectedSupplier && catalogItems.length === 0 && (
                                <p className="text-xs text-amber-600 mt-1">⚠ This supplier has no products in their catalog yet.</p>
                            )}
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Label>Line Items</Label>
                                <Button variant="outline" size="sm" onClick={addLineItem}>
                                    <Plus className="mr-1 h-3 w-3" /> Add Item
                                </Button>
                            </div>
                            {lineItems.map((li, i) => {
                                const catItem = catalogItems.find(c => c.product_id === li.product_id);
                                const availQty = catItem?.available_quantity;
                                const overStock = availQty != null && li.quantity > availQty;
                                return (
                                    <div key={i} className="p-3 rounded-lg border bg-muted/30 space-y-2">
                                        <div className="flex items-end gap-2">
                                            <div className="flex-1 grid gap-1">
                                                <Label className="text-xs">Product</Label>
                                                <Select value={li.product_id} onValueChange={(v) => {
                                                    updateLineItem(i, "product_id", v);
                                                    const cat = catalogItems.find(c => c.product_id === v);
                                                    if (cat) updateLineItem(i, "unit_price", cat.unit_price);
                                                }}>
                                                    <SelectTrigger className="h-9"><SelectValue placeholder="Select product..." /></SelectTrigger>
                                                    <SelectContent>
                                                        {catalogItems.length > 0 ? (
                                                            catalogItems.map((c) => (
                                                                <SelectItem key={c.product_id} value={c.product_id}>
                                                                    {c.product_name} {c.sku ? `(${c.sku})` : ""} — ${c.unit_price.toFixed(2)}
                                                                    {c.available_quantity != null ? ` • ${c.available_quantity} in stock` : ""}
                                                                </SelectItem>
                                                            ))
                                                        ) : (
                                                            products.map((p) => (
                                                                <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
                                                            ))
                                                        )}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="w-24 grid gap-1">
                                                <Label className="text-xs">Qty</Label>
                                                <Input type="number" className={`h-9 ${overStock ? "border-amber-500 bg-amber-50 dark:bg-amber-900/20" : ""}`} min={1} value={li.quantity}
                                                    onChange={(e) => updateLineItem(i, "quantity", parseInt(e.target.value) || 1)} />
                                            </div>
                                            <div className="w-28 grid gap-1">
                                                <Label className="text-xs">Catalog Price</Label>
                                                <div className="h-9 flex items-center px-3 rounded-md bg-muted border text-sm font-semibold">
                                                    ${li.unit_price.toFixed(2)}
                                                </div>
                                            </div>
                                            <div className="w-24 text-right">
                                                <p className="text-sm font-medium">${(li.quantity * li.unit_price).toFixed(2)}</p>
                                            </div>
                                            {lineItems.length > 1 && (
                                                <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => removeLineItem(i)}>
                                                    <X className="h-4 w-4 text-red-500" />
                                                </Button>
                                            )}
                                        </div>
                                        {/* Stock warning */}
                                        {overStock && (
                                            <p className="text-xs text-amber-600 font-medium pl-1">
                                                ⚠️ Supplier only has {availQty} in stock — you're ordering {li.quantity - availQty!} more than available.
                                                Consider splitting across suppliers.
                                            </p>
                                        )}
                                        {availQty != null && !overStock && li.product_id && (
                                            <p className="text-xs text-green-600 pl-1">✅ {availQty} available in supplier stock</p>
                                        )}
                                    </div>
                                );
                            })}
                            <div className="flex justify-end p-2">
                                <p className="text-lg font-bold">Total: ${totalAmount.toFixed(2)}</p>
                            </div>
                        </div>

                        <div className="grid gap-2">
                            <Label>Notes (optional)</Label>
                            <Textarea placeholder="Add any special instructions..." value={poNotes} onChange={(e) => setPoNotes(e.target.value)} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreatePO} disabled={saving || !selectedSupplier || lineItems.some(li => !li.product_id)}>
                            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Create PO (${totalAmount.toFixed(2)})
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* View PO Detail Dialog — with AI tabs */}
            <Dialog open={!!viewOrder} onOpenChange={() => setViewOrder(null)}>
                <DialogContent className="sm:max-w-[680px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>PO: {viewOrder?.po_number}</DialogTitle>
                        <DialogDescription>
                            Created on {viewOrder?.created_at ? new Date(viewOrder.created_at).toLocaleDateString() : "N/A"}
                        </DialogDescription>
                    </DialogHeader>
                    {viewOrder && (
                        <Tabs defaultValue="details">
                            <TabsList className="w-full">
                                <TabsTrigger value="details" className="flex-1">Details</TabsTrigger>
                                <TabsTrigger value="send-supplier" className="flex-1">
                                    <Send className="h-3.5 w-3.5 mr-1" /> Send to Supplier
                                </TabsTrigger>
                                <TabsTrigger value="invoice" className="flex-1">
                                    <FileText className="h-3.5 w-3.5 mr-1" /> Invoice Match
                                </TabsTrigger>
                                {["approved", "sent", "partially_received"].includes(viewOrder.status) && (
                                    <TabsTrigger value="receive" className="flex-1">
                                        <PackageCheck className="h-3.5 w-3.5 mr-1" /> Receive Goods
                                    </TabsTrigger>
                                )}
                                {["approved", "sent", "partially_received", "received", "in_transit", "dispatched"].includes(viewOrder.status) && (
                                    <TabsTrigger value="tracking" className="flex-1">
                                        <MapPin className="h-3.5 w-3.5 mr-1" /> Tracking
                                    </TabsTrigger>
                                )}
                            </TabsList>

                            {/* Details Tab */}
                            <TabsContent value="details" className="space-y-4 pt-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-xs text-muted-foreground">Supplier</p>
                                        <p className="font-medium">{viewOrder.supplier_name || "Unknown"}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground">Status</p>
                                        <StatusBadge status={viewOrder.status} />
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground">Total Amount</p>
                                        <p className="text-lg font-bold">${viewOrder.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground">Expected Delivery</p>
                                        <p className="font-medium">{viewOrder.expected_delivery || "Not set"}</p>
                                    </div>
                                </div>
                                {viewOrder.notes && (
                                    <div>
                                        <p className="text-xs text-muted-foreground">Notes</p>
                                        <p className="text-sm">{viewOrder.notes}</p>
                                    </div>
                                )}
                                <div>
                                    <p className="text-xs text-muted-foreground mb-2">Line Items ({viewOrder.line_items?.length || 0})</p>
                                    <div className="rounded-lg border">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Product</TableHead>
                                                    <TableHead>Qty</TableHead>
                                                    <TableHead>Price</TableHead>
                                                    <TableHead className="text-right">Total</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {(viewOrder.line_items || []).map((li, i) => (
                                                    <TableRow key={i}>
                                                        <TableCell className="font-medium">{li.product_name || li.product_id?.substring(0, 8) || "—"}</TableCell>
                                                        <TableCell>{li.quantity}</TableCell>
                                                        <TableCell>${li.unit_price.toFixed(2)}</TableCell>
                                                        <TableCell className="text-right">${li.total_price.toFixed(2)}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>

                                {/* Submit for Approval button — only for draft POs */}
                                {viewOrder.status === "draft" && can("create_po") && (
                                    <div className="pt-3 border-t">
                                        <Button
                                            className="w-full bg-purple-600 hover:bg-purple-700"
                                            onClick={() => handleSubmitPO(viewOrder.id)}
                                            disabled={submitting}
                                        >
                                            {submitting ? (
                                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</>
                                            ) : (
                                                <><Send className="mr-2 h-4 w-4" /> Submit for Approval</>
                                            )}
                                        </Button>
                                    </div>
                                )}

                                {/* Download PDF button */}
                                <div className={viewOrder.status === "draft" ? "pt-3 border-t" : ""}>
                                    <Button
                                        variant="outline"
                                        className="w-full gap-2"
                                        onClick={() => downloadPoPdf(viewOrder.id)}
                                    >
                                        <Download className="h-4 w-4" /> Download PDF
                                    </Button>
                                </div>
                            </TabsContent>

                            {/* Send to Supplier Tab */}
                            <TabsContent value="send-supplier" className="pt-4 space-y-4">
                                <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                                    <Mail className="h-4 w-4 inline mr-2 text-blue-500" />
                                    Send a professional PO email with line items to <strong>{viewOrder.supplier_name}</strong>
                                    {viewOrder.supplier_email ? ` (${viewOrder.supplier_email})` : " — ⚠️ No email set"}.
                                </div>

                                {/* Email Preview */}
                                <div className="rounded-lg border bg-card p-4 space-y-3">
                                    <p className="text-xs font-semibold text-muted-foreground">📧 Email Preview</p>
                                    <div className="text-sm space-y-2">
                                        <p><span className="text-muted-foreground">To:</span> <strong>{viewOrder.supplier_email || "No email set"}</strong></p>
                                        <p><span className="text-muted-foreground">Subject:</span> Purchase Order {viewOrder.po_number} — ${viewOrder.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                        <hr className="border-dashed" />
                                        <p>Dear {viewOrder.supplier_name},</p>
                                        <p>Please find below our purchase order. We kindly request your confirmation of receipt and expected delivery date.</p>
                                        <div className="rounded border p-2 bg-muted/50">
                                            <table className="w-full text-xs">
                                                <thead>
                                                    <tr className="border-b">
                                                        <th className="text-left p-1">Product</th>
                                                        <th className="text-center p-1">Qty</th>
                                                        <th className="text-right p-1">Unit Price</th>
                                                        <th className="text-right p-1">Total</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {(viewOrder.line_items || []).map((li, i) => (
                                                        <tr key={i} className="border-b border-dashed">
                                                            <td className="p-1">{li.product_name || li.product_id?.substring(0, 8)}</td>
                                                            <td className="text-center p-1">{li.quantity}</td>
                                                            <td className="text-right p-1">${li.unit_price.toFixed(2)}</td>
                                                            <td className="text-right p-1">${li.total_price.toFixed(2)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot>
                                                    <tr className="font-bold">
                                                        <td colSpan={3} className="text-right p-1">Total:</td>
                                                        <td className="text-right p-1">${viewOrder.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                        <p className="text-xs text-muted-foreground">Please confirm this order at your earliest convenience.</p>
                                    </div>
                                </div>

                                {/* Send Button — status gate */}
                                {viewOrder.status === "draft" ? (
                                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
                                        <p className="font-semibold text-amber-400">⏳ PO is still a Draft</p>
                                        <p className="text-muted-foreground mt-1">Submit this PO for approval first. Go to the Details tab and click &quot;Submit for Approval&quot;.</p>
                                    </div>
                                ) : viewOrder.status === "pending_approval" ? (
                                    <div className="rounded-lg border border-purple-500/30 bg-purple-500/10 p-4 text-sm">
                                        <p className="font-semibold text-purple-400">🔒 Waiting for Admin Approval</p>
                                        <p className="text-muted-foreground mt-1">This PO has been submitted and is awaiting Admin approval. Only after approval can it be sent to the supplier.</p>
                                    </div>
                                ) : viewOrder.status === "cancelled" ? (
                                    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm">
                                        <p className="font-semibold text-red-400">❌ PO Cancelled</p>
                                        <p className="text-muted-foreground mt-1">This purchase order has been cancelled and cannot be sent.</p>
                                    </div>
                                ) : (viewOrder.status === "sent" || viewOrder.status === "received" || viewOrder.status === "partially_received") ? (
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 text-sm">
                                            <CheckCircle className="h-4 w-4" />
                                            <span>
                                                Already sent{viewOrder.sent_at ? ` on ${new Date(viewOrder.sent_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}
                                            </span>
                                        </div>
                                        {can("create_po") && (
                                            <Button
                                                variant="outline"
                                                className="w-full gap-2"
                                                disabled={!viewOrder.supplier_email || submitting}
                                                onClick={async () => {
                                                    setSubmitting(true);
                                                    try {
                                                        const token = await getToken();
                                                        if (!token) throw new Error("Not authenticated");
                                                        const result = await sendPOToSupplier(viewOrder.id, token);
                                                        toast.success(result.message || "PO resent to supplier");
                                                        loadOrders();
                                                    } catch (err: any) {
                                                        toast.error(err.message || "Failed to resend");
                                                    } finally {
                                                        setSubmitting(false);
                                                    }
                                                }}
                                            >
                                                {submitting ? (
                                                    <><Loader2 className="h-4 w-4 animate-spin" /> Resending...</>
                                                ) : (
                                                    <><RefreshCw className="h-4 w-4" /> Resend to Supplier</>
                                                )}
                                            </Button>
                                        )}
                                    </div>
                                ) : viewOrder.status === "approved" && can("create_po") ? (
                                    <Button
                                        className="w-full bg-purple-600 hover:bg-purple-700 gap-2"
                                        disabled={!viewOrder.supplier_email || submitting}
                                        onClick={async () => {
                                            setSubmitting(true);
                                            try {
                                                const token = await getToken();
                                                if (!token) throw new Error("Not authenticated");
                                                const result = await sendPOToSupplier(viewOrder.id, token);
                                                toast.success(result.message || "PO sent to supplier");
                                                loadOrders();
                                                setViewOrder(null);
                                            } catch (err: any) {
                                                toast.error(err.message || "Failed to send");
                                            } finally {
                                                setSubmitting(false);
                                            }
                                        }}
                                    >
                                        {submitting ? (
                                            <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</>
                                        ) : (
                                            <><Send className="h-4 w-4" /> Send PO to Supplier</>
                                        )}
                                    </Button>
                                ) : (
                                    <div className="rounded-lg border border-muted p-4 text-sm text-muted-foreground text-center">
                                        You don&apos;t have permission to send POs, or this PO is not in an approved state.
                                    </div>
                                )}
                            </TabsContent>

                            {/* Invoice Match Tab */}
                            <TabsContent value="invoice" className="pt-4 space-y-4">
                                <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                                    <FileText className="h-4 w-4 inline mr-2 text-green-500" />
                                    Upload an invoice PDF or paste the text to perform 3-way matching against this PO.
                                </div>

                                {/* PDF Upload */}
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        className="gap-2 flex-1"
                                        disabled={extractingPdf}
                                        onClick={() => document.getElementById("invoice-pdf-upload")?.click()}
                                    >
                                        {extractingPdf ? (
                                            <><Loader2 className="h-4 w-4 animate-spin" /> Extracting text from PDF...</>
                                        ) : (
                                            <><Upload className="h-4 w-4" /> Upload Invoice PDF</>
                                        )}
                                    </Button>
                                    <input
                                        id="invoice-pdf-upload"
                                        type="file"
                                        accept=".pdf"
                                        className="hidden"
                                        onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            if (!file) return;
                                            setExtractingPdf(true);
                                            try {
                                                const text = await extractTextFromPDF(file);
                                                if (text.trim()) {
                                                    setInvoiceText(text.slice(0, INVOICE_MAX_CHARS));
                                                    toast.success(`Extracted ${text.length} characters from ${file.name}`);
                                                } else {
                                                    toast.error("No text found in PDF. The PDF might be image-only (scanned). Try using Google Lens or Adobe Scan to OCR it first.");
                                                }
                                            } catch (err: any) {
                                                toast.error(err.message || "Failed to read PDF");
                                            } finally {
                                                setExtractingPdf(false);
                                                e.target.value = "";
                                            }
                                        }}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label>Invoice Text (paste OCR output or invoice content)</Label>
                                        <span className={`text-xs ${invoiceText.length > INVOICE_MAX_CHARS
                                            ? "text-red-500 font-semibold"
                                            : "text-muted-foreground"
                                            }`}>
                                            {invoiceText.length.toLocaleString()} / {INVOICE_MAX_CHARS.toLocaleString()}
                                        </span>
                                    </div>
                                    <Textarea
                                        placeholder={`Invoice #INV-2024-001\nDate: January 15, 2024\nFrom: ${viewOrder.supplier_name || "Supplier Name"}\n\nItem 1: Product A x 10 @ $25.00 = $250.00\nItem 2: Product B x 5 @ $40.00 = $200.00\n\nTotal: $450.00\nPayment Terms: Net 30`}
                                        value={invoiceText}
                                        onChange={(e) => setInvoiceText(e.target.value.slice(0, INVOICE_MAX_CHARS))}
                                        rows={6}
                                        className={`font-mono text-xs ${invoiceText.length > INVOICE_MAX_CHARS * 0.9 ? "border-amber-400" : ""
                                            }`}
                                    />
                                </div>

                                <Button
                                    onClick={invoiceMatchAI.trigger}
                                    disabled={invoiceMatchAI.loading || invoiceMatchAI.cooldown > 0 || !invoiceText.trim() || invoiceText.length > INVOICE_MAX_CHARS}
                                    className="w-full"
                                >
                                    {invoiceMatchAI.loading ? (
                                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Matching Invoice...</>
                                    ) : invoiceMatchAI.cooldown > 0 ? (
                                        <><Clock className="mr-2 h-4 w-4" /> Wait {invoiceMatchAI.cooldown}s...</>
                                    ) : (
                                        <><Sparkles className="mr-2 h-4 w-4" /> Run 3-Way Match</>
                                    )}
                                </Button>

                                {invoiceMatchError && (
                                    <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 text-sm">
                                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                        {invoiceMatchError}
                                    </div>
                                )}

                                {invoiceMatch && (
                                    <AIErrorBoundary featureName="Invoice Match">
                                        <div className="space-y-4">
                                            {/* Match Result Banner */}
                                            <div className={`flex items-center gap-3 p-4 rounded-lg border ${invoiceMatch.match_result === "approved" ? "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-700" :
                                                invoiceMatch.match_result === "discrepancy" ? "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-700" :
                                                    "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-700"
                                                }`}>
                                                {invoiceMatch.match_result === "approved" ? (
                                                    <CheckCircle className="h-6 w-6 text-green-600 shrink-0" />
                                                ) : (
                                                    <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0" />
                                                )}
                                                <div className="flex-1">
                                                    <p className="font-semibold capitalize">{invoiceMatch.match_result.replace("_", " ")}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        Match score: {Math.round(invoiceMatch.match_score * 100)}% · {invoiceMatch.action_reason}
                                                    </p>
                                                </div>
                                                <Badge variant="outline" className={`${invoiceMatch.recommended_action === "approve_for_payment" ? "border-green-300 text-green-700" :
                                                    "border-amber-300 text-amber-700"
                                                    }`}>
                                                    {invoiceMatch.recommended_action.replace(/_/g, " ")}
                                                </Badge>
                                            </div>

                                            {/* Discrepancies */}
                                            {invoiceMatch.discrepancies?.length > 0 && (
                                                <div className="space-y-2">
                                                    <p className="text-sm font-semibold text-red-600">
                                                        ⚠️ {invoiceMatch.discrepancies.length} Discrepanc{invoiceMatch.discrepancies.length === 1 ? "y" : "ies"} Found
                                                        {invoiceMatch.total_dispute_amount > 0 && (
                                                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                                                                (${invoiceMatch.total_dispute_amount.toFixed(2)} in dispute)
                                                            </span>
                                                        )}
                                                    </p>
                                                    {invoiceMatch.discrepancies.map((d, i) => (
                                                        <div key={i} className="p-3 rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-800 text-sm">
                                                            <p className="font-medium">{d.description}</p>
                                                            <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                                                                <span>PO: <strong>{d.po_value}</strong></span>
                                                                <span>Invoice: <strong>{d.invoice_value}</strong></span>
                                                                {d.financial_impact > 0 && <span className="text-red-600">Impact: ${d.financial_impact.toFixed(2)}</span>}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Extracted Invoice Data */}
                                            {invoiceMatch.invoice_extracted && (
                                                <div className="space-y-2">
                                                    <p className="text-sm font-semibold">Extracted Invoice Data</p>
                                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                                        {invoiceMatch.invoice_extracted.invoice_number && (
                                                            <div className="p-2 rounded bg-muted">
                                                                <p className="text-muted-foreground">Invoice #</p>
                                                                <p className="font-medium">{invoiceMatch.invoice_extracted.invoice_number}</p>
                                                            </div>
                                                        )}
                                                        {invoiceMatch.invoice_extracted.total_amount != null && (
                                                            <div className="p-2 rounded bg-muted">
                                                                <p className="text-muted-foreground">Invoice Total</p>
                                                                <p className="font-medium">${invoiceMatch.invoice_extracted.total_amount?.toLocaleString()}</p>
                                                            </div>
                                                        )}
                                                        {invoiceMatch.invoice_extracted.due_date && (
                                                            <div className="p-2 rounded bg-muted">
                                                                <p className="text-muted-foreground">Due Date</p>
                                                                <p className="font-medium">{invoiceMatch.invoice_extracted.due_date}</p>
                                                            </div>
                                                        )}
                                                        {invoiceMatch.invoice_extracted.payment_terms && (
                                                            <div className="p-2 rounded bg-muted">
                                                                <p className="text-muted-foreground">Payment Terms</p>
                                                                <p className="font-medium">{invoiceMatch.invoice_extracted.payment_terms}</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </AIErrorBoundary>
                                )}
                            </TabsContent>

                            {/* Receive Goods Tab */}
                            <TabsContent value="receive" className="pt-4 space-y-4">
                                <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                                    <PackageCheck className="h-4 w-4 inline mr-2 text-emerald-500" />
                                    Record goods received for each line item. Updates inventory and stock movements automatically.
                                </div>

                                <div className="rounded-lg border">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Product</TableHead>
                                                <TableHead className="text-center">Ordered</TableHead>
                                                <TableHead className="text-center">Received</TableHead>
                                                <TableHead className="text-center">Receive Now</TableHead>
                                                <TableHead>Condition</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {(viewOrder.line_items || []).map((li, i) => {
                                                const remaining = li.quantity - (li.quantity_received || 0);
                                                return (
                                                    <TableRow key={li.id}>
                                                        <TableCell className="font-medium">
                                                            {li.product_name || li.product_id?.substring(0, 8) || "—"}
                                                        </TableCell>
                                                        <TableCell className="text-center">{li.quantity}</TableCell>
                                                        <TableCell className="text-center">
                                                            <span className={li.quantity_received === li.quantity ? "text-green-600 font-semibold" : ""}>
                                                                {li.quantity_received || 0}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <Input
                                                                type="number"
                                                                min={0}
                                                                max={remaining}
                                                                className="h-8 w-20 mx-auto text-center"
                                                                value={receiveItems[i]?.quantity_received || 0}
                                                                disabled={remaining <= 0}
                                                                onChange={(e) => {
                                                                    const val = Math.min(parseInt(e.target.value) || 0, remaining);
                                                                    setReceiveItems((prev) => prev.map((r, idx) =>
                                                                        idx === i ? { ...r, quantity_received: val } : r
                                                                    ));
                                                                }}
                                                            />
                                                            {remaining <= 0 && (
                                                                <span className="text-xs text-green-600">✓ Complete</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Select
                                                                value={receiveItems[i]?.condition || "GOOD"}
                                                                onValueChange={(v) => {
                                                                    setReceiveItems((prev) => prev.map((r, idx) =>
                                                                        idx === i ? { ...r, condition: v } : r
                                                                    ));
                                                                }}
                                                            >
                                                                <SelectTrigger className="h-8 w-28">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="GOOD">✅ Good</SelectItem>
                                                                    <SelectItem value="DAMAGED">⚠️ Damaged</SelectItem>
                                                                    <SelectItem value="REJECTED">❌ Rejected</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>

                                <div className="grid gap-2">
                                    <Label>Notes (optional)</Label>
                                    <Textarea
                                        placeholder="Add any notes about this delivery..."
                                        value={receiveNotes}
                                        onChange={(e) => setReceiveNotes(e.target.value)}
                                        rows={2}
                                    />
                                </div>

                                <Button
                                    className="w-full bg-emerald-600 hover:bg-emerald-700 gap-2"
                                    disabled={receiving || receiveItems.every((r) => r.quantity_received <= 0)}
                                    onClick={handleReceiveGoods}
                                >
                                    {receiving ? (
                                        <><Loader2 className="h-4 w-4 animate-spin" /> Recording Receipt...</>
                                    ) : (
                                        <><PackageCheck className="h-4 w-4" /> Record Receipt</>
                                    )}
                                </Button>
                            </TabsContent>

                            {/* Tracking Tab */}
                            <TabsContent value="tracking" className="pt-4">
                                <TrackingPanel poId={viewOrder.id} />
                            </TabsContent>
                        </Tabs>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

function OrderTable({ orders, loading, search, onView }: { orders: PurchaseOrder[]; loading: boolean; search: string; onView: (po: PurchaseOrder) => void }) {
    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="ml-3 text-muted-foreground">Loading orders...</span>
            </div>
        );
    }

    return (
        <Card>
            <CardContent className="p-0">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>PO Number</TableHead>
                            <TableHead>Supplier</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Items</TableHead>
                            <TableHead>Total Amount</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {orders.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                                    {search ? "No orders match your search." : "No orders found. Click 'Create Purchase Order' to get started."}
                                </TableCell>
                            </TableRow>
                        ) : (
                            orders.map((po) => (
                                <TableRow key={po.id} className="hover:bg-muted/50 cursor-pointer" onClick={() => onView(po)}>
                                    <TableCell className="font-medium text-primary">{po.po_number}</TableCell>
                                    <TableCell>{po.supplier_name || "Unknown"}</TableCell>
                                    <TableCell>{new Date(po.created_at).toLocaleDateString()}</TableCell>
                                    <TableCell>{po.line_items?.length || 0}</TableCell>
                                    <TableCell className="font-medium">
                                        ${po.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </TableCell>
                                    <TableCell><StatusBadge status={po.status} /></TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onView(po); }}>
                                            <Eye className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}

function StatusBadge({ status }: { status: string }) {
    const styles: Record<string, string> = {
        draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
        pending_approval: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
        approved: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
        sent: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
        partially_received: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
        received: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
        cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    };
    return (
        <Badge variant="outline" className={`border-0 ${styles[status] || "bg-gray-100"}`}>
            {STATUS_LABELS[status] || status}
        </Badge>
    );
}
