"use client";

import { useEffect, useState } from "react";
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
import { Search, Loader2, Plus, Eye, Trash2, X, ChevronRight } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    getPurchaseOrders, createPurchaseOrder, getSuppliers, getProducts,
    type PurchaseOrder, type Supplier, type Product
} from "@/lib/api";
import { useAuth } from "@clerk/nextjs";

const STATUS_LABELS: Record<string, string> = {
    draft: "Draft", pending_approval: "Pending Approval",
    approved: "Approved", sent: "Sent", received: "Received", cancelled: "Cancelled",
};

export default function PurchaseOrdersPage() {
    const { getToken } = useAuth();
    const [orders, setOrders] = useState<PurchaseOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [createOpen, setCreateOpen] = useState(false);
    const [viewOrder, setViewOrder] = useState<PurchaseOrder | null>(null);
    const [saving, setSaving] = useState(false);

    // Create PO form state
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
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

    const openCreate = async () => {
        const [s, p] = await Promise.all([getSuppliers(), getProducts()]);
        setSuppliers(s);
        setProducts(p);
        setSelectedSupplier("");
        setPoNotes("");
        setLineItems([{ product_id: "", quantity: 1, unit_price: 0 }]);
        setCreateOpen(true);
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
            alert(err.message || "Failed to create PO");
        } finally {
            setSaving(false);
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
                <Button onClick={openCreate}>
                    <Plus className="mr-2 h-4 w-4" /> Create Purchase Order
                </Button>
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

                <TabsContent value="all"><OrderTable orders={filtered} loading={loading} search={search} onView={setViewOrder} /></TabsContent>
                <TabsContent value="draft"><OrderTable orders={filtered.filter(o => o.status === "draft")} loading={loading} search={search} onView={setViewOrder} /></TabsContent>
                <TabsContent value="active"><OrderTable orders={filtered.filter(o => ["pending_approval", "approved", "sent"].includes(o.status))} loading={loading} search={search} onView={setViewOrder} /></TabsContent>
                <TabsContent value="closed"><OrderTable orders={filtered.filter(o => o.status === "received")} loading={loading} search={search} onView={setViewOrder} /></TabsContent>
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
                            <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                                <SelectTrigger><SelectValue placeholder="Select supplier..." /></SelectTrigger>
                                <SelectContent>
                                    {suppliers.map((s) => (
                                        <SelectItem key={s.id} value={s.id}>
                                            {s.name} {s.rating && `(★${s.rating})`}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Label>Line Items</Label>
                                <Button variant="outline" size="sm" onClick={addLineItem}>
                                    <Plus className="mr-1 h-3 w-3" /> Add Item
                                </Button>
                            </div>
                            {lineItems.map((li, i) => (
                                <div key={i} className="flex items-end gap-2 p-3 rounded-lg border bg-muted/30">
                                    <div className="flex-1 grid gap-1">
                                        <Label className="text-xs">Product</Label>
                                        <Select value={li.product_id} onValueChange={(v) => updateLineItem(i, "product_id", v)}>
                                            <SelectTrigger className="h-9"><SelectValue placeholder="Select product..." /></SelectTrigger>
                                            <SelectContent>
                                                {products.map((p) => (
                                                    <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="w-24 grid gap-1">
                                        <Label className="text-xs">Qty</Label>
                                        <Input type="number" className="h-9" min={1} value={li.quantity}
                                            onChange={(e) => updateLineItem(i, "quantity", parseInt(e.target.value) || 1)} />
                                    </div>
                                    <div className="w-28 grid gap-1">
                                        <Label className="text-xs">Unit Price ($)</Label>
                                        <Input type="number" className="h-9" min={0} step={0.01} value={li.unit_price}
                                            onChange={(e) => updateLineItem(i, "unit_price", parseFloat(e.target.value) || 0)} />
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
                            ))}
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

            {/* View PO Detail Dialog */}
            <Dialog open={!!viewOrder} onOpenChange={() => setViewOrder(null)}>
                <DialogContent className="sm:max-w-[600px]">
                    <DialogHeader>
                        <DialogTitle>PO: {viewOrder?.po_number}</DialogTitle>
                        <DialogDescription>
                            Created on {viewOrder?.created_at ? new Date(viewOrder.created_at).toLocaleDateString() : "N/A"}
                        </DialogDescription>
                    </DialogHeader>
                    {viewOrder && (
                        <div className="space-y-4 py-4">
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
                                                    <TableCell className="font-medium">{li.product_id.substring(0, 8)}...</TableCell>
                                                    <TableCell>{li.quantity}</TableCell>
                                                    <TableCell>${li.unit_price.toFixed(2)}</TableCell>
                                                    <TableCell className="text-right">${li.total_price.toFixed(2)}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        </div>
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
        received: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
        cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    };
    return (
        <Badge variant="outline" className={`border-0 ${styles[status] || "bg-gray-100"}`}>
            {STATUS_LABELS[status] || status}
        </Badge>
    );
}
