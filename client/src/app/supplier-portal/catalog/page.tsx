"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
    Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
    DollarSign, TrendingUp, TrendingDown, Minus, Package, Plus,
    Loader2, RefreshCw, Send, Clock, Trash2,
} from "lucide-react";
import {
    getCatalog, submitPriceUpdate, getPriceUpdates,
    getAvailableProducts, addToCatalog, removeFromCatalog, updateCatalogStock,
    type CatalogItem, type PriceUpdate, type AvailableProduct,
} from "@/lib/supplier-api";

const UPDATE_STATUS_COLORS: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    approved: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export default function CatalogPage() {
    const [catalog, setCatalog] = useState<CatalogItem[]>([]);
    const [updates, setUpdates] = useState<PriceUpdate[]>([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState("catalog");

    // Add product dialog
    const [showAdd, setShowAdd] = useState(false);
    const [availableProducts, setAvailableProducts] = useState<AvailableProduct[]>([]);
    const [selectedProduct, setSelectedProduct] = useState<AvailableProduct | null>(null);
    const [addPrice, setAddPrice] = useState("");
    const [addMinQty, setAddMinQty] = useState("");
    const [addAvailableQty, setAddAvailableQty] = useState("");
    const [addLeadTime, setAddLeadTime] = useState("");
    const [adding, setAdding] = useState(false);

    // Price update dialog
    const [priceUpdateTarget, setPriceUpdateTarget] = useState<CatalogItem | null>(null);
    const [proposedPrice, setProposedPrice] = useState("");
    const [effectiveDate, setEffectiveDate] = useState("");
    const [reason, setReason] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const [c, u] = await Promise.all([getCatalog(), getPriceUpdates()]);
            setCatalog(c);
            setUpdates(u);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const openAddDialog = async () => {
        try {
            const prods = await getAvailableProducts();
            setAvailableProducts(prods);
            setSelectedProduct(null);
            setAddPrice("");
            setAddMinQty("");
            setAddAvailableQty("");
            setAddLeadTime("");
            setShowAdd(true);
        } catch (err) {
            console.error(err);
        }
    };

    const handleAddProduct = async () => {
        if (!selectedProduct || !addPrice) return;
        setAdding(true);
        try {
            await addToCatalog({
                product_id: selectedProduct.id,
                unit_price: parseFloat(addPrice),
                min_order_qty: addMinQty ? parseInt(addMinQty) : undefined,
                available_quantity: addAvailableQty ? parseInt(addAvailableQty) : undefined,
                lead_time_days: addLeadTime ? parseInt(addLeadTime) : undefined,
            });
            setShowAdd(false);
            load();
        } catch (err: any) {
            alert(`❌ ${err.message}`);
        } finally {
            setAdding(false);
        }
    };

    const handleRemove = async (item: CatalogItem) => {
        if (!confirm(`Remove "${item.product_name}" from your catalog?`)) return;
        try {
            await removeFromCatalog(item.id);
            load();
        } catch (err: any) {
            alert(`❌ ${err.message}`);
        }
    };

    const handleSubmitPriceUpdate = async () => {
        if (!priceUpdateTarget) return;
        setSubmitting(true);
        try {
            await submitPriceUpdate({
                product_id: priceUpdateTarget.product_id,
                proposed_price: parseFloat(proposedPrice),
                effective_date: effectiveDate,
                reason: reason || undefined,
            });
            setPriceUpdateTarget(null);
            load();
        } catch (err: any) {
            alert(`❌ ${err.message}`);
        } finally {
            setSubmitting(false);
        }
    };

    const getChangeIcon = (pct: number) => {
        if (pct > 0) return <TrendingUp className="h-4 w-4 text-red-500" />;
        if (pct < 0) return <TrendingDown className="h-4 w-4 text-green-500" />;
        return <Minus className="h-4 w-4 text-gray-400" />;
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <DollarSign className="h-6 w-6 text-violet-500" /> My Catalog
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        Add products you sell — buyers can only order from your catalog
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={load}>
                        <RefreshCw className="h-4 w-4 mr-2" /> Refresh
                    </Button>
                    <Button onClick={openAddDialog} className="bg-violet-600 hover:bg-violet-700 gap-1">
                        <Plus className="h-4 w-4" /> Add Product
                    </Button>
                </div>
            </div>

            <Tabs value={tab} onValueChange={setTab}>
                <TabsList>
                    <TabsTrigger value="catalog">My Products ({catalog.length})</TabsTrigger>
                    <TabsTrigger value="updates">Price Updates ({updates.length})</TabsTrigger>
                </TabsList>

                {/* Catalog Tab */}
                <TabsContent value="catalog" className="mt-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
                        </div>
                    ) : catalog.length === 0 ? (
                        <Card>
                            <CardContent className="py-16 text-center text-muted-foreground">
                                <Package className="h-12 w-12 mx-auto mb-4 opacity-40" />
                                <p className="font-semibold">Your catalog is empty</p>
                                <p className="text-sm mt-1">Add products you sell so buyers can order from you</p>
                                <Button onClick={openAddDialog} variant="outline" className="mt-4 gap-1">
                                    <Plus className="h-4 w-4" /> Add Your First Product
                                </Button>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="rounded-lg border overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Product</TableHead>
                                        <TableHead>Category</TableHead>
                                        <TableHead className="text-right">Unit Price</TableHead>
                                        <TableHead className="text-center">Stock</TableHead>
                                        <TableHead className="text-center">Min Qty</TableHead>
                                        <TableHead className="text-center">Lead Time</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {catalog.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-medium">{item.product_name}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="text-xs">{item.category || "—"}</Badge>
                                            </TableCell>
                                            <TableCell className="text-right font-semibold">
                                                ${item.unit_price.toFixed(2)}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Input
                                                    type="number"
                                                    className="w-20 h-7 text-center text-xs mx-auto"
                                                    defaultValue={item.available_quantity ?? ""}
                                                    placeholder="∞"
                                                    onBlur={async (e) => {
                                                        const val = e.target.value;
                                                        if (val && parseInt(val) !== item.available_quantity) {
                                                            try {
                                                                await updateCatalogStock(item.id, parseInt(val));
                                                                load();
                                                            } catch (err: any) {
                                                                alert(err.message);
                                                            }
                                                        }
                                                    }}
                                                />
                                            </TableCell>
                                            <TableCell className="text-center">{item.min_order_qty || "—"}</TableCell>
                                            <TableCell className="text-center">
                                                {item.lead_time_days ? `${item.lead_time_days}d` : "—"}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="text-violet-600 border-violet-200"
                                                        onClick={() => {
                                                            setPriceUpdateTarget(item);
                                                            setProposedPrice(item.unit_price.toString());
                                                            setEffectiveDate("");
                                                            setReason("");
                                                        }}
                                                    >
                                                        Update Price
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                                        onClick={() => handleRemove(item)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </TabsContent>

                {/* Price Updates Tab */}
                <TabsContent value="updates" className="mt-4">
                    {updates.length === 0 ? (
                        <Card>
                            <CardContent className="py-12 text-center text-muted-foreground">
                                <Clock className="h-10 w-10 mx-auto mb-3 opacity-40" />
                                <p>No price update requests yet</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-3">
                            {updates.map((u) => (
                                <Card key={u.id} className="overflow-hidden">
                                    <CardContent className="p-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                {getChangeIcon(u.change_percent)}
                                                <div>
                                                    <p className="font-semibold text-sm">{u.product_name}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        ${u.current_price.toFixed(2)} → ${u.proposed_price.toFixed(2)}
                                                        <span className={`ml-2 font-medium ${u.change_percent > 0 ? "text-red-500" : "text-green-500"}`}>
                                                            ({u.change_percent > 0 ? "+" : ""}{u.change_percent.toFixed(1)}%)
                                                        </span>
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-muted-foreground">Effective: {u.effective_date}</span>
                                                <Badge variant="outline" className={`border-0 text-xs capitalize ${UPDATE_STATUS_COLORS[u.status] || ""}`}>
                                                    {u.status}
                                                </Badge>
                                            </div>
                                        </div>
                                        {u.reason && <p className="text-xs text-muted-foreground mt-2 pl-7">Reason: {u.reason}</p>}
                                        {u.review_notes && <p className="text-xs mt-1 pl-7 text-amber-600">Review: {u.review_notes}</p>}
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </TabsContent>
            </Tabs>

            {/* Add Product Dialog */}
            <Dialog open={showAdd} onOpenChange={setShowAdd}>
                <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>📦 Add Product to Your Catalog</DialogTitle>
                        <DialogDescription>
                            {selectedProduct
                                ? `Set pricing for ${selectedProduct.name}`
                                : "Select a product to add to your catalog"}
                        </DialogDescription>
                    </DialogHeader>

                    {!selectedProduct ? (
                        <div className="space-y-2 max-h-[400px] overflow-y-auto">
                            {availableProducts.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-8">
                                    All products are already in your catalog! 🎉
                                </p>
                            ) : (
                                availableProducts.map((p) => (
                                    <div
                                        key={p.id}
                                        onClick={() => setSelectedProduct(p)}
                                        className="p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="font-semibold text-sm">{p.name}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    SKU: {p.sku} • {p.category} • {p.unit}
                                                </p>
                                            </div>
                                            <Plus className="h-4 w-4 text-violet-500" />
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="p-3 rounded-lg bg-violet-50 dark:bg-violet-900/10 border border-violet-200/50">
                                <p className="font-semibold text-sm">{selectedProduct.name}</p>
                                <p className="text-xs text-muted-foreground">
                                    SKU: {selectedProduct.sku} • {selectedProduct.category}
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium">Unit Price *</label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        value={addPrice}
                                        onChange={(e) => setAddPrice(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium">Available Qty *</label>
                                    <Input
                                        type="number"
                                        placeholder="100"
                                        value={addAvailableQty}
                                        onChange={(e) => setAddAvailableQty(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium">Min Order Qty</label>
                                    <Input
                                        type="number"
                                        placeholder="1"
                                        value={addMinQty}
                                        onChange={(e) => setAddMinQty(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium">Lead Time (days)</label>
                                    <Input
                                        type="number"
                                        placeholder="7"
                                        value={addLeadTime}
                                        onChange={(e) => setAddLeadTime(e.target.value)}
                                    />
                                </div>
                            </div>

                            <DialogFooter>
                                <Button variant="outline" onClick={() => setSelectedProduct(null)}>
                                    Back
                                </Button>
                                <Button
                                    onClick={handleAddProduct}
                                    disabled={adding || !addPrice}
                                    className="bg-violet-600 hover:bg-violet-700"
                                >
                                    {adding ? (
                                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding...</>
                                    ) : (
                                        <><Plus className="mr-2 h-4 w-4" /> Add to Catalog</>
                                    )}
                                </Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Price Update Dialog */}
            <Dialog open={!!priceUpdateTarget} onOpenChange={() => setPriceUpdateTarget(null)}>
                <DialogContent className="max-w-md">
                    {priceUpdateTarget && (
                        <>
                            <DialogHeader>
                                <DialogTitle>💰 Request Price Update</DialogTitle>
                                <DialogDescription>
                                    {priceUpdateTarget.product_name} — Current: ${priceUpdateTarget.unit_price.toFixed(2)}
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium">Current Price</label>
                                        <Input value={`$${priceUpdateTarget.unit_price.toFixed(2)}`} disabled className="bg-muted" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium">New Price</label>
                                        <Input type="number" step="0.01" value={proposedPrice} onChange={(e) => setProposedPrice(e.target.value)} />
                                    </div>
                                </div>
                                {proposedPrice && parseFloat(proposedPrice) !== priceUpdateTarget.unit_price && (
                                    <div className={`p-2 rounded-lg text-sm text-center font-medium ${parseFloat(proposedPrice) > priceUpdateTarget.unit_price ? "bg-red-50 text-red-600 dark:bg-red-900/20" : "bg-green-50 text-green-600 dark:bg-green-900/20"}`}>
                                        {((parseFloat(proposedPrice) - priceUpdateTarget.unit_price) / priceUpdateTarget.unit_price * 100).toFixed(1)}% change
                                    </div>
                                )}
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium">Effective Date</label>
                                    <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
                                </div>
                                <Textarea placeholder="Reason for price change..." value={reason} onChange={(e) => setReason(e.target.value)} />
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setPriceUpdateTarget(null)}>Cancel</Button>
                                <Button
                                    onClick={handleSubmitPriceUpdate}
                                    disabled={submitting || !proposedPrice || !effectiveDate}
                                    className="bg-violet-600 hover:bg-violet-700"
                                >
                                    {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</> : <><Send className="mr-2 h-4 w-4" /> Submit for Approval</>}
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
