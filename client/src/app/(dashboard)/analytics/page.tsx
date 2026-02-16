"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, DollarSign, ShoppingCart, Users, TrendingUp, Loader2 } from "lucide-react";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
    AreaChart, Area,
} from "recharts";
import {
    getSpendByCategory, getSupplierPerformance, getMonthlySpend,
    CategorySpend, SupplierPerformance, MonthlySpend,
} from "@/lib/api";

export default function AnalyticsPage() {
    const [categoryData, setCategoryData] = useState<CategorySpend[]>([]);
    const [supplierData, setSupplierData] = useState<SupplierPerformance[]>([]);
    const [monthlyData, setMonthlyData] = useState<MonthlySpend[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            getSpendByCategory(),
            getSupplierPerformance(),
            getMonthlySpend(),
        ])
            .then(([categories, suppliers, monthly]) => {
                setCategoryData(categories);
                setSupplierData(suppliers);
                setMonthlyData(monthly);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    const totalSpend = categoryData.reduce((s, c) => s + c.value, 0);
    const topCategory = categoryData[0]?.name || "N/A";
    const topSupplier = supplierData[0]?.name || "N/A";

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Analytics</h2>
                    <p className="text-muted-foreground">Detailed reports on spending and supplier performance.</p>
                </div>
                <Button variant="outline" onClick={() => {
                    const rows = ["Category,Spend", ...categoryData.map(c => `${c.name},${c.value}`)];
                    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a"); a.href = url; a.download = "analytics-report.csv"; a.click();
                    URL.revokeObjectURL(url);
                }}>
                    <Download className="mr-2 h-4 w-4" /> Export Report
                </Button>
            </div>

            {/* KPI Summary Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <KPICard title="Total Spend" value={`$${(totalSpend / 1000).toFixed(0)}K`} icon={DollarSign} desc="All active orders" />
                <KPICard title="Top Category" value={topCategory} icon={ShoppingCart} desc={`$${(categoryData[0]?.value / 1000 || 0).toFixed(0)}K spent`} />
                <KPICard title="Top Supplier" value={topSupplier} icon={Users} desc={`${supplierData[0]?.orders || 0} orders`} />
                <KPICard title="Avg Rating" value={`${(supplierData.reduce((s, sp) => s + sp.rating, 0) / (supplierData.length || 1)).toFixed(0)}%`} icon={TrendingUp} desc="Across all suppliers" />
            </div>

            {/* Monthly Spend Trend */}
            {monthlyData.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Monthly Spend Trend</CardTitle>
                        <CardDescription>Total procurement spend over time.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={monthlyData}>
                                    <defs>
                                        <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#7C3AED" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#7C3AED" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                                    <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <Tooltip formatter={(v) => [`$${Number(v).toLocaleString()}`, "Spend"]} />
                                    <Area type="monotone" dataKey="total" stroke="#7C3AED" strokeWidth={2} fillOpacity={1} fill="url(#colorSpend)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="grid gap-6 md:grid-cols-2">
                {/* Spend by Category */}
                <Card>
                    <CardHeader>
                        <CardTitle>Spend by Category</CardTitle>
                        <CardDescription>Total expense distribution across product categories.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[350px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={categoryData} layout="vertical" margin={{ top: 5, right: 30, left: 60, bottom: 5 }}>
                                    <XAxis type="number" fontSize={12} tickLine={false} axisLine={false} stroke="#888888" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
                                    <YAxis dataKey="name" type="category" fontSize={12} tickLine={false} axisLine={false} stroke="#888888" width={90} />
                                    <Tooltip formatter={(v) => [`$${Number(v).toLocaleString()}`, "Spend"]} cursor={{ fill: 'transparent' }} />
                                    <Bar dataKey="value" fill="#7C3AED" radius={[0, 4, 4, 0]} barSize={28} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                {/* Supplier Performance */}
                <Card>
                    <CardHeader>
                        <CardTitle>Supplier Performance Scores</CardTitle>
                        <CardDescription>Ratings (converted to 100-point scale) and order volumes.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[350px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={supplierData.slice(0, 8)} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} stroke="#888888" angle={-20} textAnchor="end" height={60} />
                                    <YAxis fontSize={12} tickLine={false} axisLine={false} stroke="#888888" domain={[0, 100]} />
                                    <Tooltip />
                                    <Legend />
                                    <Bar dataKey="rating" name="Rating %" fill="#ADFA1D" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="orders" name="Orders" fill="#2563EB" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function KPICard({ title, value, icon: Icon, desc }: { title: string; value: string; icon: any; desc: string }) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{value}</div>
                <p className="text-xs text-muted-foreground">{desc}</p>
            </CardContent>
        </Card>
    );
}
