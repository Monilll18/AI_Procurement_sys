"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Search, FileText, Loader2, Eye } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getPurchaseOrders, PurchaseOrder } from "@/lib/api";

export default function RequisitionsPage() {
    const router = useRouter();
    const [orders, setOrders] = useState<PurchaseOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [viewOrder, setViewOrder] = useState<PurchaseOrder | null>(null);

    useEffect(() => {
        getPurchaseOrders()
            .then(setOrders)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const filterByStatus = (status: string | null) => {
        let filtered = orders;
        if (status) {
            filtered = orders.filter((o) => o.status === status);
        }
        if (search) {
            const q = search.toLowerCase();
            filtered = filtered.filter(
                (o) => o.po_number.toLowerCase().includes(q) || (o.supplier_name || "").toLowerCase().includes(q)
            );
        }
        return filtered;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Requisitions</h2>
                    <p className="text-muted-foreground">Create and track purchase requests.</p>
                </div>
                <Button onClick={() => router.push("/purchase-orders")}>
                    <Plus className="mr-2 h-4 w-4" /> New Requisition
                </Button>
            </div>

            <Tabs defaultValue="all" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="all">All ({orders.length})</TabsTrigger>
                    <TabsTrigger value="draft">Drafts ({orders.filter((o) => o.status === "draft").length})</TabsTrigger>
                    <TabsTrigger value="pending">Pending ({orders.filter((o) => o.status === "pending_approval").length})</TabsTrigger>
                    <TabsTrigger value="approved">Approved ({orders.filter((o) => o.status === "approved").length})</TabsTrigger>
                </TabsList>

                <div className="flex items-center gap-4 py-2">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search PO number or supplier..."
                            className="pl-9"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                {["all", "draft", "pending_approval", "approved"].map((tab) => (
                    <TabsContent key={tab} value={tab === "pending_approval" ? "pending" : tab} className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Purchase Requests</CardTitle>
                                <CardDescription>Manage your purchase requisitions and check their status.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <RequisitionTable orders={filterByStatus(tab === "all" ? null : tab)} onView={setViewOrder} />
                            </CardContent>
                        </Card>
                    </TabsContent>
                ))}
            </Tabs>

            {/* View Requisition Detail Dialog */}
            <Dialog open={!!viewOrder} onOpenChange={() => setViewOrder(null)}>
                <DialogContent className="sm:max-w-[600px]">
                    <DialogHeader>
                        <DialogTitle>{viewOrder?.po_number}</DialogTitle>
                        <DialogDescription>Requisition details</DialogDescription>
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
                                    <p className="text-xs text-muted-foreground">Total</p>
                                    <p className="text-lg font-bold">${viewOrder.total_amount.toLocaleString()}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Date</p>
                                    <p className="font-medium">{new Date(viewOrder.created_at).toLocaleDateString()}</p>
                                </div>
                            </div>
                            {viewOrder.notes && (
                                <div>
                                    <p className="text-xs text-muted-foreground">Notes</p>
                                    <p className="text-sm">{viewOrder.notes}</p>
                                </div>
                            )}
                            <div>
                                <p className="text-xs text-muted-foreground mb-2">Items ({viewOrder.line_items?.length || 0})</p>
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
                                                    <TableCell>{li.product_id.substring(0, 8)}...</TableCell>
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

function RequisitionTable({ orders, onView }: { orders: PurchaseOrder[]; onView: (po: PurchaseOrder) => void }) {
    if (orders.length === 0) {
        return <p className="text-center text-muted-foreground py-8">No requisitions found.</p>;
    }

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>PO Number</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {orders.map((order) => (
                    <TableRow key={order.id} className="hover:bg-muted/50 cursor-pointer" onClick={() => onView(order)}>
                        <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-muted-foreground" />
                                {order.po_number}
                            </div>
                        </TableCell>
                        <TableCell>{order.supplier_name || "—"}</TableCell>
                        <TableCell>{order.line_items?.length || 0}</TableCell>
                        <TableCell>${order.total_amount.toLocaleString()}</TableCell>
                        <TableCell>{new Date(order.created_at).toLocaleDateString()}</TableCell>
                        <TableCell>
                            <StatusBadge status={order.status} />
                        </TableCell>
                        <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onView(order); }}>
                                <Eye className="mr-1 h-3 w-3" /> View
                            </Button>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}

function StatusBadge({ status }: { status: string }) {
    const styles: Record<string, string> = {
        draft: "bg-gray-100 text-gray-700 hover:bg-gray-100",
        pending_approval: "bg-yellow-100 text-yellow-700 hover:bg-yellow-100",
        approved: "bg-green-100 text-green-700 hover:bg-green-100",
        sent: "bg-blue-100 text-blue-700 hover:bg-blue-100",
        received: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
        cancelled: "bg-red-100 text-red-700 hover:bg-red-100",
    };
    const labels: Record<string, string> = {
        draft: "Draft", pending_approval: "Pending Approval", approved: "Approved",
        sent: "Sent", received: "Received", cancelled: "Cancelled",
    };
    return (
        <Badge variant="secondary" className={styles[status] || ""}>
            {labels[status] || status}
        </Badge>
    );
}
