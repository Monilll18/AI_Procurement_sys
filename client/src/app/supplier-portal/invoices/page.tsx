"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
    FileText, Loader2, RefreshCw, Plus, Send, Eye, CheckCircle,
    XCircle, AlertTriangle, ArrowRight, DollarSign, Clock, Download,
} from "lucide-react";
import { toast } from "sonner";
import {
    getInvoices, createInvoice, submitInvoice, downloadInvoicePdf, getSupplierPOs,
    type SupplierInvoiceT, type SupplierPO,
} from "@/lib/supplier-api";

const INV_STATUS_COLORS: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
    submitted: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    under_review: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    approved: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    partially_paid: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

const MATCH_COLORS: Record<string, string> = {
    matched: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    mismatch: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export default function InvoicesPage() {
    const [invoices, setInvoices] = useState<SupplierInvoiceT[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("");

    // Create invoice
    const [showCreate, setShowCreate] = useState(false);
    const [availablePOs, setAvailablePOs] = useState<SupplierPO[]>([]);
    const [selectedPO, setSelectedPO] = useState<SupplierPO | null>(null);
    const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);
    const [dueDate, setDueDate] = useState("");
    const [taxRate, setTaxRate] = useState("0");
    const [invNotes, setInvNotes] = useState("");
    const [invItems, setInvItems] = useState<Record<string, { qty: number; price: number }>>({});
    const [creating, setCreating] = useState(false);

    // Detail
    const [viewInvoice, setViewInvoice] = useState<SupplierInvoiceT | null>(null);

    const loadInvoices = async () => {
        setLoading(true);
        try {
            const data = await getInvoices(filter || undefined);
            setInvoices(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadInvoices(); }, [filter]);

    const openCreateDialog = async () => {
        try {
            const pos = await getSupplierPOs();
            setAvailablePOs(pos.filter((p) => p.status === "approved" || p.status === "received" || p.status === "partially_received"));
            setShowCreate(true);
        } catch (err) {
            console.error(err);
        }
    };

    const selectPOForInvoice = (po: SupplierPO) => {
        setSelectedPO(po);
        const items: Record<string, { qty: number; price: number }> = {};
        po.line_items.forEach((li) => {
            items[li.id] = { qty: li.quantity, price: li.unit_price };
        });
        setInvItems(items);
    };

    const handleCreateInvoice = async () => {
        if (!selectedPO) return;
        setCreating(true);
        try {
            const items = selectedPO.line_items.map((li) => ({
                po_line_item_id: li.id,
                description: li.product_name,
                quantity: invItems[li.id]?.qty ?? li.quantity,
                unit_price: invItems[li.id]?.price ?? li.unit_price,
            }));

            const result = await createInvoice({
                po_id: selectedPO.id,
                invoice_date: invoiceDate,
                due_date: dueDate || undefined,
                tax_rate: parseFloat(taxRate) || 0,
                notes: invNotes || undefined,
                items,
            });

            setShowCreate(false);
            setSelectedPO(null);
            loadInvoices();

            // Show match result
            if (result.match_status === "mismatch") {
                toast.warning(`Invoice created: ${result.invoice_number}\n3-Way Match Issues: ${result.match_notes}`);
            }
        } catch (err: any) {
            toast.error(err.message || "Failed to create invoice");
        } finally {
            setCreating(false);
        }
    };

    const handleSubmit = async (inv: SupplierInvoiceT) => {
        try {
            await submitInvoice(inv.id);
            toast.success(`Invoice ${inv.invoice_number} submitted for review`);
            loadInvoices();
        } catch (err: any) {
            toast.error(err.message || "Failed to submit invoice");
        }
    };

    const subtotal = selectedPO
        ? selectedPO.line_items.reduce((sum, li) => sum + (invItems[li.id]?.qty ?? li.quantity) * (invItems[li.id]?.price ?? li.unit_price), 0)
        : 0;
    const tax = subtotal * (parseFloat(taxRate) || 0) / 100;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <FileText className="h-6 w-6 text-violet-500" /> Invoices
                    </h1>
                    <p className="text-muted-foreground text-sm">Create and manage invoices for your purchase orders</p>
                </div>
                <div className="flex items-center gap-2">
                    <Select value={filter} onValueChange={setFilter}>
                        <SelectTrigger className="w-[160px]">
                            <SelectValue placeholder="All Statuses" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Statuses</SelectItem>
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="submitted">Submitted</SelectItem>
                            <SelectItem value="approved">Approved</SelectItem>
                            <SelectItem value="paid">Paid</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={loadInvoices}>
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button onClick={openCreateDialog} className="bg-violet-600 hover:bg-violet-700 gap-1">
                        <Plus className="h-4 w-4" /> New Invoice
                    </Button>
                </div>
            </div>

            {/* Invoice List */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
                </div>
            ) : invoices.length === 0 ? (
                <Card>
                    <CardContent className="py-16 text-center text-muted-foreground">
                        <FileText className="h-12 w-12 mx-auto mb-4 opacity-40" />
                        <p className="font-semibold">No invoices yet</p>
                        <p className="text-sm mt-1">Create an invoice after your PO is accepted or goods are shipped</p>
                        <Button onClick={openCreateDialog} variant="outline" className="mt-4">
                            <Plus className="h-4 w-4 mr-2" /> Create First Invoice
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4">
                    {invoices.map((inv) => (
                        <Card key={inv.id} className="overflow-hidden hover:shadow-md transition-shadow">
                            <CardContent className="p-5">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="font-bold text-base">{inv.invoice_number}</h3>
                                            <Badge variant="outline" className={`border-0 text-xs capitalize ${INV_STATUS_COLORS[inv.status] || ""}`}>
                                                {inv.status.replace(/_/g, " ")}
                                            </Badge>
                                            {inv.match_status && (
                                                <Badge variant="outline" className={`border-0 text-xs ${MATCH_COLORS[inv.match_status] || ""}`}>
                                                    {inv.match_status === "matched" ? "✓ 3-Way Match" : "⚠ Mismatch"}
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-sm text-muted-foreground">
                                            PO: <span className="font-medium text-foreground">{inv.po_number}</span>
                                            {" • "}{inv.line_items.length} items
                                            {inv.invoice_date && ` • ${inv.invoice_date}`}
                                        </p>
                                        <div className="flex items-center gap-4 mt-2">
                                            <span className="text-lg font-bold">${inv.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                            {inv.tax_amount > 0 && (
                                                <span className="text-xs text-muted-foreground">
                                                    (Subtotal: ${inv.subtotal.toFixed(2)} + Tax: ${inv.tax_amount.toFixed(2)})
                                                </span>
                                            )}
                                        </div>
                                        {inv.match_notes && (
                                            <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                                                <AlertTriangle className="h-3 w-3" /> {inv.match_notes}
                                            </p>
                                        )}
                                    </div>

                                    <div className="flex flex-col gap-1.5 shrink-0">
                                        <Button size="sm" variant="outline" onClick={() => setViewInvoice(inv)}>
                                            <Eye className="h-3.5 w-3.5 mr-1" /> View
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={async () => {
                                                try {
                                                    await downloadInvoicePdf(inv.id, `${inv.invoice_number}.pdf`);
                                                    toast.success("Invoice PDF downloaded");
                                                } catch (err: any) {
                                                    toast.error(err.message || "Failed to download PDF");
                                                }
                                            }}
                                        >
                                            <Download className="h-3.5 w-3.5 mr-1" /> PDF
                                        </Button>
                                        {inv.status === "draft" && (
                                            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => handleSubmit(inv)}>
                                                <Send className="h-3.5 w-3.5 mr-1" /> Submit
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
            <Dialog open={!!viewInvoice} onOpenChange={() => setViewInvoice(null)}>
                <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                    {viewInvoice && (
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                    {viewInvoice.invoice_number}
                                    <Badge variant="outline" className={`border-0 text-xs capitalize ${INV_STATUS_COLORS[viewInvoice.status] || ""}`}>
                                        {viewInvoice.status.replace(/_/g, " ")}
                                    </Badge>
                                    {viewInvoice.match_status && (
                                        <Badge variant="outline" className={`border-0 text-xs ${MATCH_COLORS[viewInvoice.match_status] || ""}`}>
                                            {viewInvoice.match_status === "matched" ? "✓ Matched" : "⚠ Mismatch"}
                                        </Badge>
                                    )}
                                </DialogTitle>
                                <DialogDescription>
                                    PO: {viewInvoice.po_number} • Date: {viewInvoice.invoice_date}
                                    {viewInvoice.due_date && ` • Due: ${viewInvoice.due_date}`}
                                </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-4">
                                {/* Summary */}
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="text-center p-3 rounded-lg border">
                                        <p className="text-xs text-muted-foreground">Subtotal</p>
                                        <p className="text-lg font-bold">${viewInvoice.subtotal.toFixed(2)}</p>
                                    </div>
                                    <div className="text-center p-3 rounded-lg border">
                                        <p className="text-xs text-muted-foreground">Tax</p>
                                        <p className="text-lg font-bold">${viewInvoice.tax_amount.toFixed(2)}</p>
                                    </div>
                                    <div className="text-center p-3 rounded-lg border bg-violet-50 dark:bg-violet-900/10">
                                        <p className="text-xs text-muted-foreground">Total</p>
                                        <p className="text-lg font-bold text-violet-600">${viewInvoice.total_amount.toFixed(2)}</p>
                                    </div>
                                </div>

                                {/* Line items  */}
                                <div className="rounded-lg border overflow-hidden">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Description</TableHead>
                                                <TableHead className="text-center">Qty</TableHead>
                                                <TableHead className="text-right">Price</TableHead>
                                                <TableHead className="text-right">Total</TableHead>
                                                <TableHead className="text-center">Match</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {viewInvoice.line_items.map((li) => (
                                                <TableRow key={li.id}>
                                                    <TableCell className="font-medium">{li.description}</TableCell>
                                                    <TableCell className="text-center">
                                                        {li.quantity}
                                                        {li.po_quantity !== null && li.quantity !== li.po_quantity && (
                                                            <span className="text-xs text-red-500 ml-1">(PO: {li.po_quantity})</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        ${li.unit_price.toFixed(2)}
                                                        {li.po_unit_price !== null && Math.abs(li.unit_price - li.po_unit_price) > 0.01 && (
                                                            <span className="text-xs text-red-500 ml-1">(PO: ${li.po_unit_price?.toFixed(2)})</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right">${li.total_price.toFixed(2)}</TableCell>
                                                    <TableCell className="text-center">
                                                        {li.quantity_match === true && li.price_match === true ? (
                                                            <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                                                        ) : li.quantity_match === false || li.price_match === false ? (
                                                            <XCircle className="h-4 w-4 text-red-500 mx-auto" />
                                                        ) : (
                                                            <span className="text-xs text-muted-foreground">—</span>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>

                                {viewInvoice.match_notes && (
                                    <div className="rounded-lg border border-red-200 p-3 bg-red-50 dark:bg-red-900/10">
                                        <p className="text-xs font-semibold text-red-600 mb-1">⚠️ Match Issues</p>
                                        <p className="text-sm text-red-700 dark:text-red-400">{viewInvoice.match_notes}</p>
                                    </div>
                                )}

                                {viewInvoice.notes && (
                                    <div className="rounded-lg border p-3 bg-muted/30">
                                        <p className="text-xs font-semibold text-muted-foreground mb-1">Notes</p>
                                        <p className="text-sm">{viewInvoice.notes}</p>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* Create Invoice Dialog */}
            <Dialog open={showCreate} onOpenChange={setShowCreate}>
                <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>📄 Create Invoice</DialogTitle>
                        <DialogDescription>
                            {selectedPO ? `Invoicing ${selectedPO.po_number}` : "Select a PO to invoice"}
                        </DialogDescription>
                    </DialogHeader>

                    {!selectedPO ? (
                        <div className="space-y-2">
                            {availablePOs.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-8">No POs available for invoicing</p>
                            ) : (
                                availablePOs.map((po) => (
                                    <div
                                        key={po.id}
                                        onClick={() => selectPOForInvoice(po)}
                                        className="p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="font-semibold text-sm">{po.po_number}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {po.line_items.length} items • ${po.total_amount.toLocaleString()}
                                                    <Badge variant="outline" className="ml-2 text-xs capitalize border-0">{po.status.replace(/_/g, " ")}</Badge>
                                                </p>
                                            </div>
                                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="grid grid-cols-3 gap-3">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium">Invoice Date</label>
                                    <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium">Due Date</label>
                                    <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium">Tax Rate (%)</label>
                                    <Input type="number" step="0.5" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
                                </div>
                            </div>

                            {/* Items */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Invoice Items</label>
                                {selectedPO.line_items.map((li) => (
                                    <div key={li.id} className="flex items-center gap-3 p-2 rounded-lg border">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate">{li.product_name}</p>
                                            <p className="text-xs text-muted-foreground">PO: {li.quantity} × ${li.unit_price.toFixed(2)}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="space-y-0.5">
                                                <label className="text-xs text-muted-foreground">Qty</label>
                                                <Input
                                                    type="number"
                                                    min={0}
                                                    value={invItems[li.id]?.qty ?? li.quantity}
                                                    onChange={(e) => setInvItems((prev) => ({
                                                        ...prev,
                                                        [li.id]: { ...prev[li.id], qty: parseInt(e.target.value) || 0 },
                                                    }))}
                                                    className="w-20 text-center"
                                                />
                                            </div>
                                            <div className="space-y-0.5">
                                                <label className="text-xs text-muted-foreground">Price</label>
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    value={invItems[li.id]?.price ?? li.unit_price}
                                                    onChange={(e) => setInvItems((prev) => ({
                                                        ...prev,
                                                        [li.id]: { ...prev[li.id], price: parseFloat(e.target.value) || 0 },
                                                    }))}
                                                    className="w-24 text-center"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Totals */}
                            <div className="rounded-lg border p-3 bg-muted/30 space-y-1">
                                <div className="flex justify-between text-sm">
                                    <span>Subtotal</span>
                                    <span className="font-medium">${subtotal.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span>Tax ({taxRate}%)</span>
                                    <span className="font-medium">${tax.toFixed(2)}</span>
                                </div>
                                <hr className="my-1" />
                                <div className="flex justify-between text-base font-bold">
                                    <span>Total</span>
                                    <span className="text-violet-600">${(subtotal + tax).toFixed(2)}</span>
                                </div>
                            </div>

                            <Textarea placeholder="Invoice notes..." value={invNotes} onChange={(e) => setInvNotes(e.target.value)} />

                            <DialogFooter>
                                <Button variant="outline" onClick={() => setSelectedPO(null)}>Back</Button>
                                <Button
                                    onClick={handleCreateInvoice}
                                    disabled={creating}
                                    className="bg-violet-600 hover:bg-violet-700"
                                >
                                    {creating ? (
                                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...</>
                                    ) : (
                                        <><FileText className="mr-2 h-4 w-4" /> Create Invoice</>
                                    )}
                                </Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
