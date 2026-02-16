"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, AlertTriangle, CheckCircle, AlertCircle, Loader2, ArrowUpDown, ShoppingCart } from "lucide-react";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { getInventory, type InventoryItem } from "@/lib/api";

function getStockStatus(item: InventoryItem): string {
    if (item.current_stock === 0) return "Critical";
    if (item.current_stock <= item.min_stock) return "Low";
    if (item.current_stock <= item.min_stock * 2) return "Medium";
    return "Good";
}

export default function InventoryPage() {
    const router = useRouter();
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);
    const [adjustQty, setAdjustQty] = useState(0);

    const loadInventory = () => {
        setLoading(true);
        getInventory()
            .then(setInventory)
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    useEffect(() => { loadInventory(); }, []);

    // Apply search + status filter
    const filtered = inventory.filter((i) => {
        const matchesSearch =
            (i.product_name && i.product_name.toLowerCase().includes(search.toLowerCase())) ||
            (i.product_sku && i.product_sku.toLowerCase().includes(search.toLowerCase()));
        if (!matchesSearch) return false;

        if (statusFilter === "all") return true;
        const status = getStockStatus(i);
        if (statusFilter === "critical") return status === "Critical";
        if (statusFilter === "low") return status === "Low" || status === "Medium";
        if (statusFilter === "healthy") return status === "Good";
        return true;
    });

    const criticalCount = inventory.filter((i) => i.current_stock === 0).length;
    const lowCount = inventory.filter((i) => i.current_stock > 0 && i.current_stock <= i.min_stock).length;
    const healthyCount = inventory.filter((i) => i.current_stock > i.min_stock).length;

    const handleAdjust = () => {
        // In a real app, this would call an API endpoint to update stock
        alert(`Stock adjustment of ${adjustQty} would be applied to ${adjustItem?.product_name}. (Backend endpoint needed for PATCH /api/inventory/{id})`);
        setAdjustItem(null);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Inventory</h2>
                    <p className="text-muted-foreground">
                        Real-time stock levels and health monitoring.{" "}
                        <span className="text-xs">({inventory.length} items)</span>
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => router.push("/purchase-orders")}>
                        <ShoppingCart className="mr-2 h-4 w-4" /> Create Reorder
                    </Button>
                </div>
            </div>

            {/* KPI Cards — clickable to filter */}
            <div className="grid gap-4 md:grid-cols-3">
                <div className="cursor-pointer" onClick={() => setStatusFilter(statusFilter === "healthy" ? "all" : "healthy")}>
                    <StatusCard title="Healthy Items" count={healthyCount} icon={<CheckCircle className="text-green-500" />}
                        active={statusFilter === "healthy"} />
                </div>
                <div className="cursor-pointer" onClick={() => setStatusFilter(statusFilter === "low" ? "all" : "low")}>
                    <StatusCard title="Low Stock" count={lowCount} icon={<AlertCircle className="text-yellow-500" />}
                        active={statusFilter === "low"} />
                </div>
                <div className="cursor-pointer" onClick={() => setStatusFilter(statusFilter === "critical" ? "all" : "critical")}>
                    <StatusCard title="Critical (Out of Stock)" count={criticalCount} icon={<AlertTriangle className="text-red-500" />}
                        active={statusFilter === "critical"} />
                </div>
            </div>

            {/* Search & Filter */}
            <div className="flex items-center gap-4 rounded-lg border bg-card p-4 shadow-sm">
                <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search inventory..."
                        className="pl-9"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder="Filter status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="healthy">Healthy</SelectItem>
                        <SelectItem value="low">Low / Medium</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Inventory List */}
            <div className="rounded-xl border bg-card shadow-sm">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <span className="ml-3 text-muted-foreground">Loading inventory...</span>
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Product</TableHead>
                                <TableHead>SKU</TableHead>
                                <TableHead className="w-[300px]">Availability</TableHead>
                                <TableHead>Stock</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filtered.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                                        {search || statusFilter !== "all" ? "No items match your filters." : "No inventory data."}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filtered.map((item) => {
                                    const percent = item.max_stock > 0 ? (item.current_stock / item.max_stock) * 100 : 0;
                                    const status = getStockStatus(item);
                                    return (
                                        <TableRow key={item.id} className="hover:bg-muted/50">
                                            <TableCell className="font-medium">{item.product_name || "Unknown"}</TableCell>
                                            <TableCell className="font-mono text-xs text-muted-foreground">{item.product_sku || "—"}</TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <Progress
                                                        value={percent}
                                                        className={`h-2 ${status === "Critical" ? "bg-red-100" : status === "Low" ? "bg-yellow-100" : "bg-gray-100"}`}
                                                    />
                                                    <span className="text-xs text-muted-foreground w-12">{Math.round(percent)}%</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>{item.current_stock} / {item.max_stock}</TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant="outline"
                                                    className={
                                                        status === "Critical"
                                                            ? "border-red-200 bg-red-50 text-red-700"
                                                            : status === "Low"
                                                                ? "border-yellow-200 bg-yellow-50 text-yellow-700"
                                                                : status === "Medium"
                                                                    ? "border-blue-200 bg-blue-50 text-blue-700"
                                                                    : "border-green-200 bg-green-50 text-green-700"
                                                    }
                                                >
                                                    {status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="sm"
                                                    onClick={() => { setAdjustItem(item); setAdjustQty(0); }}>
                                                    <ArrowUpDown className="mr-1 h-3 w-3" /> Adjust
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                )}
            </div>

            {/* Adjust Stock Dialog */}
            <Dialog open={!!adjustItem} onOpenChange={() => setAdjustItem(null)}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle>Adjust Stock</DialogTitle>
                        <DialogDescription>
                            Adjust stock level for <strong>{adjustItem?.product_name}</strong>
                        </DialogDescription>
                    </DialogHeader>
                    {adjustItem && (
                        <div className="space-y-4 py-4">
                            <div className="grid grid-cols-3 gap-4 text-center">
                                <div>
                                    <p className="text-xs text-muted-foreground">Current</p>
                                    <p className="text-2xl font-bold">{adjustItem.current_stock}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Min</p>
                                    <p className="text-2xl font-bold text-yellow-600">{adjustItem.min_stock}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Max</p>
                                    <p className="text-2xl font-bold text-green-600">{adjustItem.max_stock}</p>
                                </div>
                            </div>
                            <div className="grid gap-2">
                                <Label>Adjustment (+ to add, - to remove)</Label>
                                <Input type="number" value={adjustQty}
                                    onChange={(e) => setAdjustQty(parseInt(e.target.value) || 0)} />
                                <p className="text-xs text-muted-foreground">
                                    New stock will be: <strong>{adjustItem.current_stock + adjustQty}</strong>
                                </p>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAdjustItem(null)}>Cancel</Button>
                        <Button onClick={handleAdjust} disabled={adjustQty === 0}>
                            Apply Adjustment
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function StatusCard({ title, count, icon, active }: { title: string; count: number; icon: React.ReactNode; active?: boolean }) {
    return (
        <Card className={`transition-all ${active ? "ring-2 ring-primary shadow-md" : "hover:shadow-sm"}`}>
            <CardContent className="flex items-center justify-between p-6">
                <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">{title}</p>
                    <p className="text-2xl font-bold">{count}</p>
                </div>
                {icon}
            </CardContent>
        </Card>
    );
}
