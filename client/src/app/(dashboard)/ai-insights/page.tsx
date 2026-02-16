"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Sparkles, AlertTriangle, ArrowRight, TrendingDown, TrendingUp,
    Package, DollarSign, ShieldAlert, Loader2, RefreshCw,
} from "lucide-react";
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend,
} from "recharts";
import { getInsights, getForecast, Insight, ForecastPoint } from "@/lib/api";

export default function AIInsightsPage() {
    const [insights, setInsights] = useState<Insight[]>([]);
    const [forecast, setForecast] = useState<ForecastPoint[]>([]);
    const [loading, setLoading] = useState(true);

    const loadData = () => {
        setLoading(true);
        Promise.all([getInsights(), getForecast()])
            .then(([ins, fc]) => {
                setInsights(ins);
                setForecast(fc);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    useEffect(() => { loadData(); }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    // Group insights by type
    const reorderAlerts = insights.filter((i) => i.type === "reorder");
    const spendAnomalies = insights.filter((i) => i.type === "spend_anomaly");
    const supplierRisks = insights.filter((i) => i.type === "supplier_risk");

    const criticalCount = insights.filter((i) => i.severity === "critical").length;
    const warningCount = insights.filter((i) => i.severity === "warning").length;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-col gap-2">
                    <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <Sparkles className="h-8 w-8 text-purple-600" /> AI Insights
                    </h2>
                    <p className="text-muted-foreground">Predictive analytics and smart recommendations for your procurement.</p>
                </div>
                <Button variant="outline" onClick={loadData} disabled={loading}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
                </Button>
            </div>

            {/* Summary Badges */}
            <div className="flex gap-3 flex-wrap">
                <Badge variant="destructive" className="px-3 py-1.5 text-sm">
                    {criticalCount} Critical
                </Badge>
                <Badge variant="secondary" className="px-3 py-1.5 text-sm border-yellow-200 bg-yellow-50 text-yellow-700">
                    {warningCount} Warnings
                </Badge>
                <Badge variant="secondary" className="px-3 py-1.5 text-sm">
                    {insights.length} Total Insights
                </Badge>
            </div>

            {/* Demand Forecast Chart */}
            {forecast.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Demand Forecast</CardTitle>
                        <CardDescription>Historical spend with AI-predicted trend for next 3 months.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[350px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={forecast}>
                                    <defs>
                                        <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
                                            <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="colorPredicted" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#82ca9d" stopOpacity={0.8} />
                                            <stop offset="95%" stopColor="#82ca9d" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <XAxis dataKey="month" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                                    <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <Tooltip formatter={(v) => v != null ? [`$${Number(v).toLocaleString()}`, ""] : ["N/A", ""]} />
                                    <Legend />
                                    <Area type="monotone" dataKey="actual" stroke="#8884d8" fillOpacity={1} fill="url(#colorActual)" name="Actual Spend" />
                                    <Area type="monotone" dataKey="predicted" stroke="#82ca9d" fillOpacity={1} fill="url(#colorPredicted)" name="AI Prediction" strokeDasharray="5 5" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Insight Sections */}
            {reorderAlerts.length > 0 && (
                <section>
                    <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                        <Package className="h-5 w-5 text-orange-500" /> Reorder Alerts ({reorderAlerts.length})
                    </h3>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {reorderAlerts.map((insight, i) => (
                            <InsightCard key={i} insight={insight} />
                        ))}
                    </div>
                </section>
            )}

            {spendAnomalies.length > 0 && (
                <section>
                    <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                        <DollarSign className="h-5 w-5 text-blue-500" /> Spend Anomalies ({spendAnomalies.length})
                    </h3>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {spendAnomalies.map((insight, i) => (
                            <InsightCard key={i} insight={insight} />
                        ))}
                    </div>
                </section>
            )}

            {supplierRisks.length > 0 && (
                <section>
                    <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                        <ShieldAlert className="h-5 w-5 text-red-500" /> Supplier Risk ({supplierRisks.length})
                    </h3>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {supplierRisks.map((insight, i) => (
                            <InsightCard key={i} insight={insight} />
                        ))}
                    </div>
                </section>
            )}

            {insights.length === 0 && (
                <Card className="p-8 text-center">
                    <p className="text-muted-foreground">🎉 No issues found! All systems are operating normally.</p>
                </Card>
            )}
        </div>
    );
}

function InsightCard({ insight }: { insight: Insight }) {
    const router = useRouter();
    const colorMap = {
        reorder: { border: "border-l-orange-500", badge: "border-orange-200 text-orange-700 bg-orange-50", label: "Reorder", route: "/purchase-orders" },
        spend_anomaly: { border: "border-l-blue-500", badge: "border-blue-200 text-blue-700 bg-blue-50", label: "Spend Alert", route: "/analytics" },
        supplier_risk: { border: "border-l-red-500", badge: "border-red-200 text-red-700 bg-red-50", label: "Risk Alert", route: "/suppliers" },
    };
    const style = colorMap[insight.type];

    return (
        <Card className={`hover:shadow-md transition-shadow border-l-4 ${style.border}`}>
            <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                    <Badge variant="outline" className={style.badge}>
                        {insight.severity === "critical" ? "🔴" : "🟡"} {style.label}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{insight.impact} Impact</span>
                </div>
                <CardTitle className="text-lg mt-2">{insight.title}</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground mb-4">{insight.description}</p>
                <Button variant="secondary" className="w-full justify-between group" size="sm"
                    onClick={() => router.push(style.route)}>
                    {insight.action}
                    <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Button>
            </CardContent>
        </Card>
    );
}
