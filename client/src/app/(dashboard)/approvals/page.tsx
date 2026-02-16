"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, X, Clock, AlertCircle, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getPurchaseOrders, PurchaseOrder, approvePO, rejectPO } from "@/lib/api";
import { useAuth } from "@clerk/nextjs";

export default function ApprovalsPage() {
    const [pendingOrders, setPendingOrders] = useState<PurchaseOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const { getToken } = useAuth();

    const loadPending = () => {
        setLoading(true);
        getPurchaseOrders("pending_approval")
            .then(setPendingOrders)
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    useEffect(() => { loadPending(); }, []);

    const handleApprove = async (poId: string) => {
        try {
            setActionLoading(poId);
            const token = await getToken();
            await approvePO(poId, token || "");
            setPendingOrders((prev) => prev.filter((po) => po.id !== poId));
        } catch (error) {
            console.error("Failed to approve:", error);
        } finally {
            setActionLoading(null);
        }
    };

    const handleReject = async (poId: string) => {
        try {
            setActionLoading(poId);
            const token = await getToken();
            await rejectPO(poId, token || "");
            setPendingOrders((prev) => prev.filter((po) => po.id !== poId));
        } catch (error) {
            console.error("Failed to reject:", error);
        } finally {
            setActionLoading(null);
        }
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
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Approvals</h2>
                <p className="text-muted-foreground">Review and take action on purchase orders pending approval.</p>
            </div>

            {pendingOrders.length === 0 ? (
                <Card className="p-8 text-center">
                    <div className="flex flex-col items-center gap-3">
                        <Check className="h-12 w-12 text-green-500" />
                        <h3 className="text-xl font-semibold">All caught up!</h3>
                        <p className="text-muted-foreground">No purchase orders pending approval.</p>
                    </div>
                </Card>
            ) : (
                <div className="grid gap-6 lg:grid-cols-2">
                    {pendingOrders.map((po) => (
                        <Card key={po.id} className="border-l-4 border-l-purple-500 shadow-sm hover:shadow-md transition-shadow">
                            <CardHeader className="pb-3">
                                <div className="flex justify-between items-start">
                                    <div className="flex gap-3">
                                        <Avatar>
                                            <AvatarFallback className="bg-purple-100 text-purple-700">
                                                {po.po_number.substring(0, 2)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <CardTitle className="text-base">{po.po_number}</CardTitle>
                                            <CardDescription>
                                                {po.supplier_name || "Unknown Supplier"} • {po.line_items?.length || 0} items
                                            </CardDescription>
                                        </div>
                                    </div>
                                    <Badge variant="secondary" className="bg-yellow-100 text-yellow-700">
                                        <Clock className="w-3 h-3 mr-1" /> Pending
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="pb-3">
                                <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                                    <div className="flex justify-between text-sm text-muted-foreground">
                                        <span>Created: {new Date(po.created_at).toLocaleDateString()}</span>
                                        {po.expected_delivery && (
                                            <span>Due: {new Date(po.expected_delivery).toLocaleDateString()}</span>
                                        )}
                                    </div>
                                    {po.line_items?.slice(0, 3).map((item, i) => (
                                        <div key={i} className="flex justify-between text-sm">
                                            <span>{item.quantity} × item</span>
                                            <span>${item.total_price.toLocaleString()}</span>
                                        </div>
                                    ))}
                                    {(po.line_items?.length || 0) > 3 && (
                                        <p className="text-xs text-muted-foreground">
                                            +{(po.line_items?.length || 0) - 3} more items...
                                        </p>
                                    )}
                                    <div className="border-t pt-2 flex justify-between font-bold text-base mt-2">
                                        <span>Total</span>
                                        <span>${po.total_amount.toLocaleString()}</span>
                                    </div>
                                </div>
                                {po.notes && (
                                    <p className="text-xs text-muted-foreground mt-2 italic">Note: {po.notes}</p>
                                )}
                            </CardContent>
                            <CardFooter className="flex gap-3 border-t bg-gray-50/50 p-4">
                                <Button
                                    variant="outline"
                                    className="flex-1 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                                    onClick={() => handleReject(po.id)}
                                    disabled={actionLoading === po.id}
                                >
                                    <X className="w-4 h-4 mr-2" /> Reject
                                </Button>
                                <Button
                                    className="flex-1 bg-purple-600 hover:bg-purple-700"
                                    onClick={() => handleApprove(po.id)}
                                    disabled={actionLoading === po.id}
                                >
                                    {actionLoading === po.id ? (
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    ) : (
                                        <Check className="w-4 h-4 mr-2" />
                                    )}
                                    Approve
                                </Button>
                            </CardFooter>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
