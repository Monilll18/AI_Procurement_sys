"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
    Plus, Search, FileText, Loader2, Send, CheckCircle, XCircle,
    ArrowUpRight, Clock, AlertTriangle, Sparkles, ChevronDown, Trash2, Package,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useRBAC } from "@/lib/rbac";
import { useAuth } from "@clerk/nextjs";
import { toast } from "sonner";
import {
    getRequisitions, createRequisition, submitRequisition,
    approveRequisition, rejectRequisition, convertPRtoPO,
    aiParseRequest,
    type PurchaseRequisition, type PRLineItem,
    getProducts, type Product,
    getSuppliers, type Supplier,
    getDepartments, type DepartmentData,
    getSupplierPriceComparison,
    getSupplierCoverage, type SupplierCoverageItem,
} from "@/lib/api";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
    draft: { label: "Draft", color: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30", icon: FileText },
    submitted: { label: "Submitted", color: "bg-blue-500/15 text-blue-400 border-blue-500/30", icon: Send },
    under_review: { label: "Under Review", color: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: Clock },
    approved: { label: "Approved", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: CheckCircle },
    rejected: { label: "Rejected", color: "bg-red-500/15 text-red-400 border-red-500/30", icon: XCircle },
    converted_to_po: { label: "Converted to PO", color: "bg-purple-500/15 text-purple-400 border-purple-500/30", icon: ArrowUpRight },
    cancelled: { label: "Cancelled", color: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30", icon: XCircle },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
    low: { label: "Low", color: "bg-zinc-500/15 text-zinc-400" },
    medium: { label: "Medium", color: "bg-blue-500/15 text-blue-400" },
    high: { label: "High", color: "bg-amber-500/15 text-amber-400" },
    critical: { label: "Critical", color: "bg-red-500/15 text-red-400" },
};

export default function RequisitionsPage() {
    const { role, can } = useRBAC();
    const { getToken } = useAuth();
    const [prs, setPrs] = useState<PurchaseRequisition[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [tab, setTab] = useState("all");
    const [showCreate, setShowCreate] = useState(false);
    const [creating, setCreating] = useState(false);
    const [selectedPR, setSelectedPR] = useState<PurchaseRequisition | null>(null);
    const [products, setProducts] = useState<Product[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [departments, setDepartments] = useState<DepartmentData[]>([]);
    const [rejectReason, setRejectReason] = useState("");
    const [showReject, setShowReject] = useState(false);
    const [actionLoading, setActionLoading] = useState("");
    const [nlInput, setNlInput] = useState("");
    const [nlParsing, setNlParsing] = useState(false);
    const [showAIAssist, setShowAIAssist] = useState(false);
    // Product search state for line items
    const [productSearchIdx, setProductSearchIdx] = useState<number | null>(null);
    const [productQuery, setProductQuery] = useState("");
    // Cache for product prices { productId: lowestPrice }
    const priceCache = useRef<Record<string, number>>({});
    // Supplier selection for PR→PO conversion
    const [showSupplierPicker, setShowSupplierPicker] = useState(false);
    const [convertingPR, setConvertingPR] = useState<PurchaseRequisition | null>(null);
    const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
    const [converting, setConverting] = useState(false);
    const [coverageData, setCoverageData] = useState<SupplierCoverageItem[]>([]);
    const [coverageLoading, setCoverageLoading] = useState(false);

    // Create form state
    const [form, setForm] = useState({
        title: "",
        description: "",
        department: "",
        category: "",
        priority: "medium",
        justification: "",
        needed_by: "",
        notes: "",
        line_items: [{ item_name: "", quantity: 1, estimated_unit_price: 0, unit: "pcs", product_id: "" }] as any[],
    });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [prData, prodData, suppData, deptData] = await Promise.all([
                getRequisitions().catch(() => []),
                getProducts().catch(() => []),
                getSuppliers().catch(() => []),
                getDepartments().catch(() => []),
            ]);
            setPrs(prData);
            setProducts(prodData);
            setSuppliers(suppData);
            setDepartments(deptData);
        } finally {
            setLoading(false);
        }
    };

    // Fetch lowest supplier price for a product and cache it
    const fetchProductPrice = async (productId: string): Promise<number> => {
        if (priceCache.current[productId] !== undefined) return priceCache.current[productId];
        try {
            const prices = await getSupplierPriceComparison(productId);
            if (prices && prices.length > 0) {
                const lowest = Math.min(...prices.map(p => p.unit_price));
                priceCache.current[productId] = lowest;
                return lowest;
            }
        } catch { /* no prices available */ }
        priceCache.current[productId] = 0;
        return 0;
    };

    // Select a product for a line item — auto-fill name, price, unit
    const selectProductForItem = async (index: number, product: Product) => {
        const price = await fetchProductPrice(product.id);
        const items = [...form.line_items];
        items[index] = {
            ...items[index],
            item_name: product.name,
            product_id: product.id,
            estimated_unit_price: price,
            unit: product.unit || "pcs",
        };
        setForm({ ...form, line_items: items });
        setProductSearchIdx(null);
        setProductQuery("");
        if (price > 0) {
            toast.success(`Price auto-filled: $${price.toLocaleString()} per ${product.unit || 'unit'}`);
        } else {
            toast.info(`No supplier price found for ${product.name}. Enter estimated price manually.`);
        }
    };

    // Filter products based on search query
    const filteredProducts = productQuery
        ? products.filter(p =>
            p.name.toLowerCase().includes(productQuery.toLowerCase()) ||
            p.sku.toLowerCase().includes(productQuery.toLowerCase()) ||
            (p.category && p.category.toLowerCase().includes(productQuery.toLowerCase()))
        ).slice(0, 8)
        : products.slice(0, 8);

    const filteredPRs = prs.filter(pr => {
        const matchesSearch = !search || pr.title.toLowerCase().includes(search.toLowerCase()) ||
            pr.pr_number.toLowerCase().includes(search.toLowerCase());
        const matchesTab = tab === "all" ||
            (tab === "pending" && ["submitted", "under_review"].includes(pr.status)) ||
            (tab === "approved" && pr.status === "approved") ||
            (tab === "draft" && pr.status === "draft");
        return matchesSearch && matchesTab;
    });

    const handleCreate = async () => {
        if (!form.title) return;
        setCreating(true);
        try {
            const token = await getToken();
            const estimated_total = form.line_items.reduce(
                (sum: number, li: any) => sum + (li.quantity * li.estimated_unit_price), 0
            );
            await createRequisition({
                ...form,
                estimated_total,
                line_items: form.line_items.filter((li: any) => li.item_name),
            }, token);
            setShowCreate(false);
            setForm({
                title: "", description: "", department: "", category: "", priority: "medium",
                justification: "", needed_by: "", notes: "",
                line_items: [{ item_name: "", quantity: 1, estimated_unit_price: 0, unit: "pcs", product_id: "" }],
            });
            await loadData();
            toast.success("Purchase requisition created!");
        } catch (e: any) {
            toast.error(e.message || "Failed to create requisition. Check if the server is running.");
        } finally {
            setCreating(false);
        }
    };

    const handleAction = async (action: string, prId: string) => {
        setActionLoading(action + prId);
        try {
            const token = await getToken();
            if (action === "submit") await submitRequisition(prId, token);
            else if (action === "approve") await approveRequisition(prId, token);
            else if (action === "reject") {
                await rejectRequisition(prId, rejectReason, token);
                setShowReject(false);
                setRejectReason("");
            }
            else if (action === "convert") {
                // Open supplier picker instead of auto-converting
                const pr = prs.find(p => p.id === prId) || selectedPR;
                if (pr) {
                    setConvertingPR(pr);
                    setSelectedSupplierId(pr.preferred_supplier_id || "");
                    setShowSupplierPicker(true);
                    setSelectedPR(null);
                    // Fetch supplier coverage data
                    setCoverageLoading(true);
                    try {
                        const cov = await getSupplierCoverage(pr.id);
                        setCoverageData(cov.suppliers || []);
                    } catch { setCoverageData([]); }
                    finally { setCoverageLoading(false); }
                }
                return;
            }
            await loadData();
            setSelectedPR(null);
            toast.success(`${action.charAt(0).toUpperCase() + action.slice(1)} successful!`);
        } catch (e: any) {
            toast.error(e.message || `Failed to ${action}`);
        } finally {
            setActionLoading("");
        }
    };

    const addLineItem = () => {
        setForm({
            ...form,
            line_items: [...form.line_items, { item_name: "", quantity: 1, estimated_unit_price: 0, unit: "pcs", product_id: "" }],
        });
    };

    const updateLineItem = (index: number, field: string, value: any) => {
        const items = [...form.line_items];
        items[index] = { ...items[index], [field]: value };
        setForm({ ...form, line_items: items });
    };

    const removeLineItem = (index: number) => {
        setForm({ ...form, line_items: form.line_items.filter((_: any, i: number) => i !== index) });
    };

    const total = form.line_items.reduce(
        (sum: number, li: any) => sum + (li.quantity * li.estimated_unit_price), 0
    );

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <span className="ml-4 text-muted-foreground text-lg">Loading requisitions...</span>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Purchase Requisitions</h1>
                    <p className="text-muted-foreground">Request, review, and convert purchase requisitions</p>
                </div>
                <Button onClick={() => setShowCreate(true)} className="shadow-lg shadow-primary/20">
                    <Plus className="h-4 w-4 mr-2" /> New Request
                </Button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: "Total PRs", value: prs.length, color: "text-foreground" },
                    { label: "Pending Review", value: prs.filter(p => ["submitted", "under_review"].includes(p.status)).length, color: "text-amber-400" },
                    { label: "Approved", value: prs.filter(p => p.status === "approved").length, color: "text-emerald-400" },
                    { label: "Converted to PO", value: prs.filter(p => p.status === "converted_to_po").length, color: "text-purple-400" },
                ].map((stat, i) => (
                    <Card key={i} className="border-border/50">
                        <CardContent className="pt-4 pb-3">
                            <p className="text-xs text-muted-foreground">{stat.label}</p>
                            <p className={cn("text-2xl font-bold", stat.color)}>{stat.value}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Filters */}
            <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input className="pl-9" placeholder="Search PRs..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <Tabs value={tab} onValueChange={setTab}>
                    <TabsList>
                        <TabsTrigger value="all">All</TabsTrigger>
                        <TabsTrigger value="draft">Drafts</TabsTrigger>
                        <TabsTrigger value="pending">Pending</TabsTrigger>
                        <TabsTrigger value="approved">Approved</TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {/* PR Table */}
            <Card className="border-border/50">
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>PR Number</TableHead>
                                <TableHead>Title</TableHead>
                                <TableHead>Priority</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Estimated Total</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredPRs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                                        No purchase requisitions found. Create your first one!
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredPRs.map(pr => {
                                    const statusCfg = STATUS_CONFIG[pr.status] || STATUS_CONFIG.draft;
                                    const priorityCfg = PRIORITY_CONFIG[pr.priority] || PRIORITY_CONFIG.medium;
                                    return (
                                        <TableRow key={pr.id} className="cursor-pointer hover:bg-muted/30"
                                            onClick={() => setSelectedPR(pr)}>
                                            <TableCell className="font-mono text-sm font-medium">{pr.pr_number}</TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    {pr.title}
                                                    {pr.ai_suggested_supplier && (
                                                        <span title="AI assisted"><Sparkles className="h-3.5 w-3.5 text-purple-400" /></span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={cn("text-[10px]", priorityCfg.color)}>
                                                    {priorityCfg.label}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={cn("text-[10px]", statusCfg.color)}>
                                                    {statusCfg.label}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right font-mono">
                                                ${pr.estimated_total.toLocaleString()}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground text-sm">
                                                {pr.created_at ? new Date(pr.created_at).toLocaleDateString() : "—"}
                                            </TableCell>
                                            <TableCell>
                                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* ─── Create PR Dialog ────────────────────────────────────── */}
            <Dialog open={showCreate} onOpenChange={setShowCreate}>
                <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FileText className="h-5 w-5 text-primary" /> New Purchase Requisition
                        </DialogTitle>
                        <DialogDescription>Create a new purchase request. AI will suggest the best supplier.</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label>Title *</Label>
                                <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                                    placeholder="e.g. Q1 Office Supplies" />
                            </div>
                            <div className="grid gap-2">
                                <Label>Priority</Label>
                                <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="low">Low</SelectItem>
                                        <SelectItem value="medium">Medium</SelectItem>
                                        <SelectItem value="high">High</SelectItem>
                                        <SelectItem value="critical">Critical</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label>Department</Label>
                                <Select value={form.department} onValueChange={v => setForm({ ...form, department: v })}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select department" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {departments.length > 0 ? departments.map(d => (
                                            <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                                        )) : (
                                            <>
                                                <SelectItem value="IT">IT</SelectItem>
                                                <SelectItem value="Operations">Operations</SelectItem>
                                                <SelectItem value="Marketing">Marketing</SelectItem>
                                                <SelectItem value="Finance">Finance</SelectItem>
                                                <SelectItem value="HR">HR</SelectItem>
                                                <SelectItem value="Engineering">Engineering</SelectItem>
                                            </>
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <Label>Needed By</Label>
                                <Input type="date" value={form.needed_by}
                                    onChange={e => setForm({ ...form, needed_by: e.target.value })} />
                            </div>
                        </div>

                        <div className="grid gap-2">
                            <Label>Business Justification</Label>
                            <Textarea value={form.justification}
                                onChange={e => setForm({ ...form, justification: e.target.value })}
                                placeholder="Why is this purchase needed?" rows={2} />
                        </div>

                        <Separator />

                        {/* ─── AI Natural Language Input ─────────────── */}
                        <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-4">
                            <button
                                type="button"
                                onClick={() => setShowAIAssist(!showAIAssist)}
                                className="flex items-center gap-2 w-full text-left text-sm font-semibold text-purple-600 dark:text-purple-400 hover:text-purple-700 transition-colors"
                            >
                                <Sparkles className="h-4 w-4" />
                                ✨ Describe what you need (AI auto-fill)
                                <ChevronDown className={`h-4 w-4 ml-auto transition-transform ${showAIAssist ? "rotate-180" : ""}`} />
                            </button>
                            {showAIAssist && (
                                <div className="mt-3 space-y-3">
                                    <Textarea
                                        value={nlInput}
                                        onChange={(e) => setNlInput(e.target.value)}
                                        placeholder="e.g. I need 50 mechanical keyboards, 20 monitors, and 100 ethernet cables for the new office floor"
                                        rows={3}
                                        className="bg-background"
                                    />
                                    <div className="flex items-center gap-2">
                                        <Button
                                            size="sm"
                                            disabled={!nlInput.trim() || nlParsing}
                                            onClick={async () => {
                                                setNlParsing(true);
                                                try {
                                                    const result = await aiParseRequest(nlInput);
                                                    const parsed = result.parsed;
                                                    if (parsed && parsed.items && parsed.items.length > 0) {
                                                        const newItems = parsed.items.map((item: any) => ({
                                                            item_name: item.item_name || "",
                                                            quantity: item.quantity || 1,
                                                            estimated_unit_price: item.estimated_unit_price || 0,
                                                            unit: item.unit || "pcs",
                                                            product_id: item.matched_product_id || "",
                                                        }));
                                                        setForm({
                                                            ...form,
                                                            title: form.title || parsed.title || "AI-generated Request",
                                                            category: form.category || parsed.department || "",
                                                            line_items: newItems,
                                                        });
                                                        setShowAIAssist(false);
                                                    }
                                                } catch (e: any) {
                                                    console.error("AI parse failed:", e);
                                                } finally {
                                                    setNlParsing(false);
                                                }
                                            }}
                                            className="bg-purple-600 hover:bg-purple-700 text-white"
                                        >
                                            {nlParsing ? (
                                                <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Parsing...</>
                                            ) : (
                                                <><Sparkles className="h-3 w-3 mr-1" /> AI Parse</>
                                            )}
                                        </Button>
                                        <span className="text-xs text-muted-foreground">AI will extract items, quantities, and estimated prices</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Line Items */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <Label className="text-base font-semibold">Line Items</Label>
                                <Button variant="outline" size="sm" onClick={addLineItem}>
                                    <Plus className="h-3 w-3 mr-1" /> Add Item
                                </Button>
                            </div>
                            <div className="space-y-3">
                                {form.line_items.map((li: any, idx: number) => (
                                    <div key={idx} className="p-3 rounded-lg border bg-muted/20 space-y-2">
                                        <div className="flex gap-2 items-end">
                                            {/* ── Product Picker ── */}
                                            <div className="grid gap-1 flex-1 relative">
                                                <Label className="text-xs flex items-center gap-1">
                                                    <Package className="h-3 w-3" /> Product
                                                </Label>
                                                <div className="relative">
                                                    <Input
                                                        value={productSearchIdx === idx ? productQuery : li.item_name}
                                                        onChange={e => {
                                                            setProductSearchIdx(idx);
                                                            setProductQuery(e.target.value);
                                                            updateLineItem(idx, "item_name", e.target.value);
                                                            updateLineItem(idx, "product_id", "");
                                                        }}
                                                        onFocus={() => {
                                                            setProductSearchIdx(idx);
                                                            setProductQuery(li.item_name || "");
                                                        }}
                                                        onBlur={() => {
                                                            // Delay to allow click on dropdown item
                                                            setTimeout(() => setProductSearchIdx(null), 200);
                                                        }}
                                                        placeholder="Search product or type name..."
                                                        className="pr-8"
                                                    />
                                                    <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                                                </div>
                                                {/* Product dropdown */}
                                                {productSearchIdx === idx && (
                                                    <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto">
                                                        {filteredProducts.length > 0 ? (
                                                            filteredProducts.map(product => (
                                                                <button
                                                                    key={product.id}
                                                                    type="button"
                                                                    className="w-full text-left px-3 py-2 hover:bg-muted/50 flex items-center justify-between text-sm transition-colors"
                                                                    onMouseDown={e => e.preventDefault()}
                                                                    onClick={() => selectProductForItem(idx, product)}
                                                                >
                                                                    <div>
                                                                        <p className="font-medium">{product.name}</p>
                                                                        <p className="text-xs text-muted-foreground">{product.sku} · {product.category}</p>
                                                                    </div>
                                                                    <span className="text-xs text-muted-foreground">{product.unit}</span>
                                                                </button>
                                                            ))
                                                        ) : (
                                                            <div className="px-3 py-3 text-sm text-muted-foreground text-center">
                                                                No products found — type a custom item name
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="grid gap-1 w-20">
                                                <Label className="text-xs">Qty</Label>
                                                <Input type="number" value={li.quantity}
                                                    onChange={e => updateLineItem(idx, "quantity", parseInt(e.target.value) || 1)} />
                                            </div>
                                            <div className="grid gap-1 w-28">
                                                <Label className="text-xs">Est. Price</Label>
                                                <Input type="number" value={li.estimated_unit_price}
                                                    onChange={e => updateLineItem(idx, "estimated_unit_price", parseFloat(e.target.value) || 0)}
                                                    className={li.product_id && li.estimated_unit_price > 0 ? "border-emerald-500/50" : ""}
                                                />
                                            </div>
                                            <div className="text-right w-24 pb-1">
                                                <p className="text-sm font-mono font-semibold">
                                                    ${(li.quantity * li.estimated_unit_price).toLocaleString()}
                                                </p>
                                            </div>
                                            {form.line_items.length > 1 && (
                                                <Button variant="ghost" size="icon" className="text-red-400"
                                                    onClick={() => removeLineItem(idx)}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>
                                        {li.product_id && li.estimated_unit_price > 0 && (
                                            <p className="text-[10px] text-emerald-400 flex items-center gap-1">
                                                <CheckCircle className="h-3 w-3" /> Price auto-filled from supplier catalog
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <div className="text-right mt-3">
                                <span className="text-muted-foreground text-sm">Estimated Total: </span>
                                <span className="text-xl font-bold font-mono">${total.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                        <Button onClick={handleCreate} disabled={creating || !form.title}>
                            {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Create Requisition
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ─── PR Detail / Action Dialog ──────────────────────────── */}
            <Dialog open={!!selectedPR} onOpenChange={() => setSelectedPR(null)}>
                <DialogContent className="max-w-lg">
                    {selectedPR && (() => {
                        const statusCfg = STATUS_CONFIG[selectedPR.status] || STATUS_CONFIG.draft;
                        const StatusIcon = statusCfg.icon;
                        return (
                            <>
                                <DialogHeader>
                                    <DialogTitle className="flex items-center gap-2">
                                        <StatusIcon className="h-5 w-5" /> {selectedPR.pr_number}
                                    </DialogTitle>
                                    <DialogDescription>{selectedPR.title}</DialogDescription>
                                </DialogHeader>
                                <div className="space-y-3">
                                    <div className="flex gap-2 flex-wrap">
                                        <Badge variant="outline" className={cn("text-xs", statusCfg.color)}>
                                            {statusCfg.label}
                                        </Badge>
                                        <Badge variant="outline" className={cn("text-xs", PRIORITY_CONFIG[selectedPR.priority]?.color)}>
                                            {PRIORITY_CONFIG[selectedPR.priority]?.label || selectedPR.priority}
                                        </Badge>
                                        {selectedPR.ai_suggested_supplier && (
                                            <Badge className="text-xs bg-purple-500/15 text-purple-400 border border-purple-500/30">
                                                <Sparkles className="h-3 w-3 mr-1" /> AI Supplier
                                            </Badge>
                                        )}
                                    </div>

                                    {selectedPR.justification && (
                                        <div>
                                            <p className="text-xs text-muted-foreground">Justification</p>
                                            <p className="text-sm">{selectedPR.justification}</p>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                        <div>
                                            <p className="text-xs text-muted-foreground">Department</p>
                                            <p>{selectedPR.department || "—"}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground">Estimated Total</p>
                                            <p className="font-mono font-bold">${selectedPR.estimated_total.toLocaleString()}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground">Needed By</p>
                                            <p>{selectedPR.needed_by || "—"}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground">Created</p>
                                            <p>{selectedPR.created_at ? new Date(selectedPR.created_at).toLocaleDateString() : "—"}</p>
                                        </div>
                                    </div>

                                    {/* Line items */}
                                    {selectedPR.line_items.length > 0 && (
                                        <div>
                                            <p className="text-xs text-muted-foreground mb-2">Items ({selectedPR.line_items.length})</p>
                                            <div className="space-y-1">
                                                {selectedPR.line_items.map((li, i) => (
                                                    <div key={i} className="flex justify-between text-sm p-2 rounded bg-muted/30">
                                                        <span>{li.item_name} × {li.quantity}</span>
                                                        <span className="font-mono">${(li.estimated_total || li.quantity * li.estimated_unit_price).toLocaleString()}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {selectedPR.rejection_reason && (
                                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                                            <p className="text-xs font-semibold text-red-400 mb-1">Rejection Reason</p>
                                            <p className="text-sm">{selectedPR.rejection_reason}</p>
                                        </div>
                                    )}
                                </div>

                                <DialogFooter className="flex gap-2">
                                    {selectedPR.status === "draft" && (
                                        <Button onClick={() => handleAction("submit", selectedPR.id)}
                                            disabled={!!actionLoading}>
                                            {actionLoading === "submit" + selectedPR.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                            <Send className="h-4 w-4 mr-1" /> Submit for Approval
                                        </Button>
                                    )}
                                    {["submitted", "under_review"].includes(selectedPR.status) && can("approve_po") && (
                                        <>
                                            <Button variant="destructive"
                                                onClick={() => { setShowReject(true); }}
                                                disabled={!!actionLoading}>
                                                <XCircle className="h-4 w-4 mr-1" /> Reject
                                            </Button>
                                            <Button onClick={() => handleAction("approve", selectedPR.id)}
                                                disabled={!!actionLoading}
                                                className="bg-emerald-600 hover:bg-emerald-700">
                                                {actionLoading === "approve" + selectedPR.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                <CheckCircle className="h-4 w-4 mr-1" /> Approve
                                            </Button>
                                        </>
                                    )}
                                    {selectedPR.status === "approved" && (
                                        <Button onClick={() => handleAction("convert", selectedPR.id)}
                                            disabled={!!actionLoading}
                                            className="bg-purple-600 hover:bg-purple-700">
                                            {actionLoading === "convert" + selectedPR.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                            <ArrowUpRight className="h-4 w-4 mr-1" /> Convert to PO
                                        </Button>
                                    )}
                                </DialogFooter>
                            </>
                        );
                    })()}
                </DialogContent>
            </Dialog>

            {/* ─── Reject Dialog ──────────────────────────────────────── */}
            <Dialog open={showReject} onOpenChange={setShowReject}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Reject Requisition</DialogTitle>
                        <DialogDescription>Provide a reason for rejection.</DialogDescription>
                    </DialogHeader>
                    <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                        placeholder="Reason for rejection..." rows={3} />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowReject(false)}>Cancel</Button>
                        <Button variant="destructive"
                            onClick={() => selectedPR && handleAction("reject", selectedPR.id)}
                            disabled={!!actionLoading}>
                            {actionLoading.startsWith("reject") && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Reject
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ─── Supplier Selection Dialog for PR→PO ─────────────────── */}
            <Dialog open={showSupplierPicker} onOpenChange={(open) => {
                if (!open) { setShowSupplierPicker(false); setConvertingPR(null); }
            }}>
                <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <ArrowUpRight className="h-5 w-5 text-purple-400" />
                            Select Supplier for PO
                        </DialogTitle>
                        <DialogDescription>
                            Choose which supplier to create the Purchase Order with.
                            {convertingPR && (
                                <span className="block mt-1 font-medium text-foreground">
                                    {convertingPR.pr_number}: {convertingPR.title}
                                </span>
                            )}
                        </DialogDescription>
                    </DialogHeader>

                    {/* Items summary */}
                    {convertingPR && convertingPR.line_items.length > 0 && (
                        <div className="rounded-lg border bg-muted/20 p-3">
                            <p className="text-xs text-muted-foreground mb-2 font-semibold">Items in this request:</p>
                            {convertingPR.line_items.map((li, i) => (
                                <div key={i} className="flex justify-between text-sm py-1">
                                    <span>{li.item_name} × {li.quantity}</span>
                                    <span className="font-mono text-muted-foreground">
                                        ${(li.estimated_total || li.quantity * li.estimated_unit_price).toLocaleString()}
                                    </span>
                                </div>
                            ))}
                            <Separator className="my-2" />
                            <div className="flex justify-between text-sm font-semibold">
                                <span>Estimated Total</span>
                                <span className="font-mono">${convertingPR.estimated_total.toLocaleString()}</span>
                            </div>
                        </div>
                    )}

                    {/* Supplier list */}
                    <div className="space-y-2">
                        <Label className="text-sm font-semibold">Available Suppliers</Label>
                        {coverageLoading ? (
                            <div className="flex items-center justify-center py-6">
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                <span className="ml-2 text-sm text-muted-foreground">Checking product availability...</span>
                            </div>
                        ) : suppliers.filter(s => s.status === "active").length === 0 ? (
                            <p className="text-sm text-muted-foreground py-4 text-center">
                                No active suppliers found. Create a supplier first.
                            </p>
                        ) : (
                            suppliers.filter(s => s.status === "active").map(supplier => {
                                const isAISuggested = convertingPR?.preferred_supplier_id === supplier.id;
                                const isSelected = selectedSupplierId === supplier.id;
                                const cov = coverageData.find(c => c.supplier_id === supplier.id);
                                const hasNone = cov?.has_none || false;
                                const hasAll = cov?.has_all || false;
                                const matched = cov?.products_matched ?? 0;
                                const total = cov?.products_total ?? 0;

                                return (
                                    <button
                                        key={supplier.id}
                                        type="button"
                                        onClick={() => !hasNone && setSelectedSupplierId(supplier.id)}
                                        disabled={hasNone}
                                        className={cn(
                                            "w-full text-left p-3 rounded-lg border transition-all",
                                            hasNone
                                                ? "border-red-500/20 bg-red-500/5 opacity-60 cursor-not-allowed"
                                                : isSelected
                                                    ? "border-purple-500 bg-purple-500/10 ring-1 ring-purple-500/30"
                                                    : "border-border/50 hover:border-border hover:bg-muted/30"
                                        )}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className={cn(
                                                    "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                                                    hasNone ? "border-red-400/30" :
                                                        isSelected ? "border-purple-500" : "border-muted-foreground/30"
                                                )}>
                                                    {isSelected && !hasNone && <div className="w-2 h-2 rounded-full bg-purple-500" />}
                                                    {hasNone && <XCircle className="h-3 w-3 text-red-400" />}
                                                </div>
                                                <span className="font-medium">{supplier.name}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                {isAISuggested && !hasNone && (
                                                    <Badge className="text-[10px] bg-purple-500/15 text-purple-400 border-purple-500/30">
                                                        <Sparkles className="h-2.5 w-2.5 mr-0.5" /> AI Pick
                                                    </Badge>
                                                )}
                                                {total > 0 && (
                                                    <Badge variant="outline" className={cn(
                                                        "text-[10px]",
                                                        hasAll ? "text-emerald-400 border-emerald-500/30" :
                                                            hasNone ? "text-red-400 border-red-500/30" :
                                                                "text-amber-400 border-amber-500/30"
                                                    )}>
                                                        {hasAll ? "✅" : hasNone ? "❌" : "⚠️"} {matched}/{total} products
                                                    </Badge>
                                                )}
                                                <Badge variant="outline" className="text-[10px]">
                                                    ★ {supplier.rating.toFixed(1)}
                                                </Badge>
                                            </div>
                                        </div>
                                        <div className="mt-1.5 ml-6 flex gap-4 text-xs text-muted-foreground">
                                            {hasNone && <span className="text-red-400">No matching products in catalog</span>}
                                            {!hasNone && supplier.email && <span>{supplier.email}</span>}
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>

                    <p className="text-xs text-muted-foreground">
                        💡 The PO will use the selected supplier's catalog prices when available.
                        Suppliers with ❌ 0 products cannot be selected.
                    </p>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => {
                            setShowSupplierPicker(false);
                            setConvertingPR(null);
                        }}>Cancel</Button>
                        <Button
                            disabled={!selectedSupplierId || converting}
                            className="bg-purple-600 hover:bg-purple-700"
                            onClick={async () => {
                                if (!convertingPR || !selectedSupplierId) return;
                                setConverting(true);
                                try {
                                    const token = await getToken();
                                    const result = await convertPRtoPO(
                                        convertingPR.id,
                                        token,
                                        { supplier_id: selectedSupplierId }
                                    );
                                    toast.success(
                                        `${result.po_number} created with ${result.supplier_name || 'selected supplier'}! Total: $${(result.total_amount || 0).toLocaleString()}`,
                                    );
                                    // Show catalog warning if any
                                    if ((result as any).catalog_warning) {
                                        toast.warning((result as any).catalog_warning);
                                    }
                                    setShowSupplierPicker(false);
                                    setConvertingPR(null);
                                    setSelectedSupplierId("");
                                    await loadData();
                                } catch (e: any) {
                                    toast.error(e.message || "Failed to convert PR to PO");
                                } finally {
                                    setConverting(false);
                                }
                            }}
                        >
                            {converting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            <ArrowUpRight className="h-4 w-4 mr-1" /> Create Purchase Order
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
