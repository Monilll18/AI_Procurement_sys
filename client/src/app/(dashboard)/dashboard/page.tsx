"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    ArrowUpRight,
    ArrowDownRight,
    TrendingUp,
    AlertTriangle,
    DollarSign,
    ShoppingCart,
    Package,
    Download,
    Calendar,
    Brain,
    Loader2,
} from "lucide-react";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar,
} from "recharts";
import { cn } from "@/lib/utils";
import { getDashboardStats, type DashboardStats } from "@/lib/api";

const STATUS_LABELS: Record<string, string> = {
    draft: "Draft",
    pending_approval: "Pending",
    approved: "Approved",
    sent: "Sent",
    received: "Received",
    cancelled: "Cancelled",
};

export default function DashboardPage() {
    const router = useRouter();
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getDashboardStats()
            .then(setStats)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <span className="ml-4 text-muted-foreground text-lg">Loading dashboard...</span>
            </div>
        );
    }

    if (!stats) {
        return (
            <div className="text-center py-20 text-muted-foreground">
                Failed to load dashboard data. Is the API running?
            </div>
        );
    }

    // Build chart data from recent orders
    const spendByMonth: Record<string, number> = {};
    stats.recentOrders.forEach((po) => {
        const month = new Date(po.created_at).toLocaleString("default", { month: "short" });
        spendByMonth[month] = (spendByMonth[month] || 0) + po.total_amount;
    });
    const spendData = Object.entries(spendByMonth).map(([name, total]) => ({
        name,
        total: Math.round(total),
    }));

    // Build supplier chart data
    const supplierSpend: Record<string, number> = {};
    stats.recentOrders.forEach((po) => {
        const name = po.supplier_name || "Unknown";
        supplierSpend[name] = (supplierSpend[name] || 0) + po.total_amount;
    });
    const supplierData = Object.entries(supplierSpend)
        .map(([name, spend]) => ({ name: name.substring(0, 12), spend: Math.round(spend) }))
        .sort((a, b) => b.spend - a.spend)
        .slice(0, 5);

    return (
        <div className="flex flex-col gap-8 pb-8">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h2>
                    <p className="text-muted-foreground mt-1">
                        Overview of your procurement performance and activities.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" className="gap-2" onClick={() => router.push("/analytics")}>
                        <TrendingUp className="h-4 w-4" />
                        Analytics
                    </Button>
                    <Button className="gap-2 shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90" onClick={() => router.push("/purchase-orders")}>
                        <ShoppingCart className="h-4 w-4" />
                        New Order
                    </Button>
                </div>
            </div>

            {/* KPI Cards — from live data */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    title="Total Spend"
                    value={`$${stats.totalSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                    trend={`${stats.totalPOs} purchase orders`}
                    trendUp={true}
                    icon={DollarSign}
                    color="text-blue-500"
                    bgColor="bg-blue-500/10"
                />
                <StatCard
                    title="Active Products"
                    value={stats.totalProducts.toString()}
                    trend={`${stats.totalSuppliers} suppliers`}
                    trendUp={true}
                    icon={Package}
                    color="text-orange-500"
                    bgColor="bg-orange-500/10"
                />
                <StatCard
                    title="Low Stock Alerts"
                    value={stats.lowStockCount.toString()}
                    trend={stats.lowStockCount > 0 ? "Items need attention" : "All stocked up!"}
                    trendUp={false}
                    isAlert={stats.lowStockCount > 0}
                    icon={AlertTriangle}
                    color="text-red-500"
                    bgColor="bg-red-500/10"
                />
                <StatCard
                    title="Pending Approvals"
                    value={stats.pendingApprovals.toString()}
                    trend={stats.pendingApprovals > 0 ? "Awaiting review" : "All clear"}
                    trendUp={stats.pendingApprovals === 0}
                    icon={TrendingUp}
                    color="text-emerald-500"
                    bgColor="bg-emerald-500/10"
                />
            </div>

            {/* Main Charts Row */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                {/* Spend Chart */}
                <Card className="col-span-4 shadow-sm border-border/50">
                    <CardHeader>
                        <CardTitle>Spend Analysis</CardTitle>
                        <CardDescription>Monthly expenditure from purchase orders</CardDescription>
                    </CardHeader>
                    <CardContent className="pl-0">
                        <div className="h-[300px] w-full">
                            {spendData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={spendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                                        <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                                            itemStyle={{ color: 'hsl(var(--foreground))' }}
                                        />
                                        <Area type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#colorTotal)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="flex items-center justify-center h-full text-muted-foreground">
                                    No spend data available yet.
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Top Suppliers */}
                <Card className="col-span-3 shadow-sm border-border/50">
                    <CardHeader>
                        <CardTitle>Top Suppliers by Spend</CardTitle>
                        <CardDescription>Your most active vendor relationships</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px] w-full">
                            {supplierData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={supplierData} layout="vertical" margin={{ top: 0, right: 0, left: 40, bottom: 0 }}>
                                        <XAxis type="number" hide />
                                        <YAxis dataKey="name" type="category" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} width={100} />
                                        <Tooltip
                                            cursor={{ fill: 'transparent' }}
                                            contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                                        />
                                        <Bar dataKey="spend" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={32} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="flex items-center justify-center h-full text-muted-foreground">
                                    No supplier data available yet.
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Recent Orders & Insights */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {/* Recent POs — from API */}
                <Card className="col-span-2 shadow-sm border-border/50">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle>Recent Orders</CardTitle>
                            <CardDescription>Latest purchase orders</CardDescription>
                        </div>
                        <Button variant="ghost" size="sm" className="text-xs" onClick={() => router.push("/purchase-orders")}>View All</Button>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                    <TableHead>PO Number</TableHead>
                                    <TableHead>Supplier</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {stats.recentOrders.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center text-muted-foreground py-10">
                                            No orders yet.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    stats.recentOrders.map((po) => (
                                        <TableRow key={po.id} className="hover:bg-muted/50 transition-colors">
                                            <TableCell className="font-medium">
                                                <div className="flex flex-col">
                                                    <span>{po.po_number}</span>
                                                    <span className="text-[10px] text-muted-foreground">
                                                        {new Date(po.created_at).toLocaleDateString()}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Avatar className="h-6 w-6">
                                                        <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                                                            {(po.supplier_name || "??").substring(0, 2)}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    {po.supplier_name || "Unknown"}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <StateBadge status={po.status} />
                                            </TableCell>
                                            <TableCell className="text-right font-medium">
                                                ${po.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                {/* AI Insights — uses inventory alerts */}
                <Card className="col-span-1 shadow-md border-primary/20 bg-gradient-to-br from-card to-primary/5">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-primary">
                            <Brain className="h-5 w-5" />
                            AI Insights
                        </CardTitle>
                        <CardDescription>Smart recommendations for you</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {stats.inventoryAlerts.length > 0 ? (
                            stats.inventoryAlerts.slice(0, 3).map((alert) => (
                                <div key={alert.id} className="p-3 bg-background/60 backdrop-blur-sm rounded-lg border border-border/50 shadow-sm">
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="text-xs font-semibold text-destructive flex items-center gap-1">
                                            <AlertTriangle className="h-3 w-3" /> Low Stock
                                        </span>
                                        <span className="text-[10px] text-muted-foreground">
                                            {alert.current_stock} left
                                        </span>
                                    </div>
                                    <p className="text-sm font-medium">
                                        {alert.product_name || "Unknown product"} below threshold.
                                    </p>
                                    <Button size="sm" variant="secondary" className="w-full mt-2 h-7 text-xs" onClick={() => router.push("/purchase-orders")}>
                                        Reorder Now
                                    </Button>
                                </div>
                            ))
                        ) : (
                            <div className="p-3 bg-background/60 backdrop-blur-sm rounded-lg border border-border/50">
                                <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                                    <TrendingUp className="h-3 w-3" /> All Good!
                                </span>
                                <p className="text-sm font-medium mt-1">No stock alerts. Inventory is healthy.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function StatCard({ title, value, trend, trendUp, isAlert, icon: Icon, color, bgColor }: any) {
    return (
        <Card className="shadow-sm hover:shadow-md transition-all duration-200 border-border/50 group">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                    {title}
                </CardTitle>
                <div className={`p-2 rounded-lg ${bgColor} ${color} transition-colors group-hover:bg-opacity-20`}>
                    <Icon className="h-4 w-4" />
                </div>
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold tracking-tight">{value}</div>
                <p className={cn("text-xs flex items-center mt-1 font-medium",
                    isAlert ? "text-destructive" : (trendUp ? "text-emerald-600" : "text-muted-foreground")
                )}>
                    {trendUp ? <ArrowUpRight className="mr-1 h-3 w-3" /> : <ArrowDownRight className="mr-1 h-3 w-3" />}
                    {trend}
                </p>
            </CardContent>
        </Card>
    );
}

function StateBadge({ status }: { status: string }) {
    const styles: Record<string, string> = {
        approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",
        pending_approval: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400",
        draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400",
        sent: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400",
        received: "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400",
        cancelled: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400",
    };

    return (
        <Badge variant="secondary" className={cn("font-medium", styles[status] || styles.draft)}>
            {STATUS_LABELS[status] || status}
        </Badge>
    );
}
