"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Sparkles, AlertTriangle, ArrowRight, TrendingDown, TrendingUp,
    Package, DollarSign, ShieldAlert, Loader2, RefreshCw,
    Search, Shield, Zap, Eye, BarChart2,
} from "lucide-react";
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import { getInsights, getForecast, Insight, ForecastPoint, aiFraudScan, aiGetPriceAnomalies, aiGetProductForecast, ProductForecast, getPriceUpdates, approvePriceUpdate, rejectPriceUpdate, type PriceUpdateItem } from "@/lib/api";
import { useAuth } from "@clerk/nextjs";
import { CheckCircle, XCircle } from "lucide-react";

// ─── Tab config ──────────────────────────────────────────────
const TABS = [
    { id: "overview", label: "Overview", icon: BarChart2 },
    { id: "price-changes", label: "Supplier Price Changes", icon: DollarSign },
    { id: "demand", label: "Demand Forecast", icon: TrendingUp },
    { id: "fraud", label: "Fraud Detection", icon: Shield },
    { id: "anomalies", label: "Price Anomalies", icon: Search },
] as const;
type TabId = typeof TABS[number]["id"];

export default function AIInsightsPage() {
    const { getToken } = useAuth();
    const [insights, setInsights] = useState<Insight[]>([]);
    const [forecast, setForecast] = useState<ForecastPoint[]>([]);
    const [productForecast, setProductForecast] = useState<ProductForecast[]>([]);
    const [fraudAlerts, setFraudAlerts] = useState<any[]>([]);
    const [priceAnomalies, setPriceAnomalies] = useState<any[]>([]);
    const [supplierPriceUpdates, setSupplierPriceUpdates] = useState<PriceUpdateItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [mlLoading, setMlLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<TabId>("overview");

    const loadData = () => {
        setLoading(true);
        Promise.all([getInsights(), getForecast(), aiGetProductForecast().catch(() => [])])
            .then(([ins, fc, pf]) => {
                setInsights(ins);
                setForecast(fc);
                setProductForecast(pf as ProductForecast[]);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    const loadMLData = async () => {
        setMlLoading(true);
        const token = (await getToken()) || undefined;
        Promise.all([
            aiFraudScan().catch(() => []),
            aiGetPriceAnomalies().catch(() => []),
            getPriceUpdates(undefined, token).catch(() => []),
        ])
            .then(([fraud, anomalies, priceUpdates]) => {
                setFraudAlerts(fraud);
                setPriceAnomalies(anomalies);
                setSupplierPriceUpdates(priceUpdates);
            })
            .catch(console.error)
            .finally(() => setMlLoading(false));
    };

    useEffect(() => {
        loadData();
        loadMLData();
    }, []);

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
    const mlPriceAlerts = insights.filter((i) => i.type === "price_anomaly");

    const criticalCount = insights.filter((i) => i.severity === "critical").length;
    const warningCount = insights.filter((i) => i.severity === "warning").length;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-col gap-2">
                    <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <Sparkles className="h-8 w-8 text-purple-600" /> AI Insights
                    </h2>
                    <p className="text-muted-foreground">ML-powered monitoring, fraud detection, and predictive analytics.</p>
                </div>
                <Button variant="outline" onClick={() => { loadData(); loadMLData(); }} disabled={loading || mlLoading}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${(loading || mlLoading) ? "animate-spin" : ""}`} /> Refresh
                </Button>
            </div>

            {/* Summary Badges */}
            <div className="flex gap-3 flex-wrap">
                <Badge variant="destructive" className="px-3 py-1.5 text-sm">
                    {criticalCount} Critical
                </Badge>
                <Badge variant="secondary" className="px-3 py-1.5 text-sm border-yellow-200 bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700">
                    {warningCount} Warnings
                </Badge>
                <Badge variant="secondary" className="px-3 py-1.5 text-sm">
                    {insights.length} Total Insights
                </Badge>
                {fraudAlerts.length > 0 && (
                    <Badge className="px-3 py-1.5 text-sm bg-red-500/10 text-red-500 border border-red-500/30">
                        <Shield className="h-3 w-3 mr-1" /> {fraudAlerts.length} Fraud Alerts
                    </Badge>
                )}
                {priceAnomalies.length > 0 && (
                    <Badge className="px-3 py-1.5 text-sm bg-purple-500/10 text-purple-500 border border-purple-500/30">
                        <Search className="h-3 w-3 mr-1" /> {priceAnomalies.length} Price Anomalies
                    </Badge>
                )}
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-1 p-1 rounded-lg bg-muted/50 w-fit">
                {TABS.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`
                                flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all
                                ${isActive
                                    ? "bg-background shadow-sm text-foreground"
                                    : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                                }
                            `}
                        >
                            <Icon className="h-4 w-4" />
                            {tab.label}
                            {tab.id === "fraud" && fraudAlerts.length > 0 && (
                                <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-red-500 text-white">
                                    {fraudAlerts.length}
                                </span>
                            )}
                            {tab.id === "anomalies" && priceAnomalies.length > 0 && (
                                <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-purple-500 text-white">
                                    {priceAnomalies.length}
                                </span>
                            )}
                            {tab.id === "price-changes" && supplierPriceUpdates.filter(u => u.status === "pending").length > 0 && (
                                <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-amber-500 text-white">
                                    {supplierPriceUpdates.filter(u => u.status === "pending").length}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* ─── Tab: Overview ─────────────────────────────────── */}
            {activeTab === "overview" && (
                <>
                    {/* Demand Forecast Chart */}
                    {forecast.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Demand Forecast</CardTitle>
                                <CardDescription>
                                    Holt's Exponential Smoothing with seasonality — shaded area shows 80% confidence interval.
                                </CardDescription>
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
                                                <linearGradient id="colorCI" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#82ca9d" stopOpacity={0.2} />
                                                    <stop offset="95%" stopColor="#82ca9d" stopOpacity={0.05} />
                                                </linearGradient>
                                            </defs>
                                            <XAxis dataKey="month" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                                            <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                            <Tooltip formatter={(v, name) => {
                                                if (v == null) return ["N/A", name];
                                                const labels: Record<string, string> = {
                                                    actual: "Actual Spend",
                                                    predicted: "AI Forecast",
                                                    upper: "Upper Bound (80%)",
                                                    lower: "Lower Bound (80%)",
                                                };
                                                return [`$${Number(v).toLocaleString()}`, labels[name as string] || name];
                                            }} />
                                            <Legend formatter={(v) => {
                                                const labels: Record<string, string> = {
                                                    actual: "Actual Spend",
                                                    predicted: "AI Forecast",
                                                    upper: "Confidence Band",
                                                    lower: "",
                                                };
                                                return labels[v as string] ?? v;
                                            }} />
                                            {/* Confidence interval band */}
                                            <Area type="monotone" dataKey="upper" stroke="none" fill="url(#colorCI)" name="upper" legendType="none" />
                                            <Area type="monotone" dataKey="lower" stroke="none" fill="white" fillOpacity={0} name="lower" legendType="none" />
                                            <Area type="monotone" dataKey="actual" stroke="#8884d8" fillOpacity={1} fill="url(#colorActual)" name="actual" />
                                            <Area type="monotone" dataKey="predicted" stroke="#82ca9d" fillOpacity={0.3} fill="url(#colorPredicted)" name="predicted" strokeDasharray="5 5" />
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

                    {mlPriceAlerts.length > 0 && (
                        <section>
                            <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                                <Search className="h-5 w-5 text-purple-500" /> ML Price Alerts ({mlPriceAlerts.length})
                            </h3>
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {mlPriceAlerts.map((insight, i) => (
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
                </>
            )}

            {/* ─── Tab: Demand Forecast ──────────────────────────── */}
            {activeTab === "demand" && (
                <div className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <TrendingUp className="h-5 w-5 text-green-500" /> Product Demand Forecast
                            </CardTitle>
                            <CardDescription>
                                AI predicts next-month demand for top products based on 3-month order history.
                            </CardDescription>
                        </CardHeader>
                    </Card>

                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-6 w-6 animate-spin text-green-500 mr-2" />
                            <span className="text-muted-foreground">Generating product forecasts...</span>
                        </div>
                    ) : productForecast.length === 0 ? (
                        <Card className="p-8 text-center">
                            <p className="text-muted-foreground">No product order history found. Create some purchase orders to see forecasts.</p>
                        </Card>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {productForecast.map((pf) => (
                                <Card key={pf.product_id} className={`hover:shadow-md transition-shadow border-l-4 ${pf.urgency === "critical" ? "border-l-red-500" :
                                    pf.urgency === "high" ? "border-l-amber-500" : "border-l-green-500"
                                    }`}>
                                    <CardHeader className="pb-2">
                                        <div className="flex items-center justify-between">
                                            <Badge variant="outline" className={`text-xs ${pf.urgency === "critical" ? "border-red-300 text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-300" :
                                                pf.urgency === "high" ? "border-amber-300 text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-300" :
                                                    "border-green-300 text-green-600 bg-green-50 dark:bg-green-900/30 dark:text-green-300"
                                                }`}>
                                                {pf.urgency === "critical" ? "🔴 Critical" : pf.urgency === "high" ? "🟡 High" : "🟢 Normal"}
                                            </Badge>
                                            <span className="text-xs text-muted-foreground font-mono">{pf.sku}</span>
                                        </div>
                                        <CardTitle className="text-base mt-2">{pf.product_name}</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-2 text-sm">
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Next Month Forecast</span>
                                                <span className="font-bold text-primary">{pf.next_month_forecast} {pf.unit}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Avg Monthly</span>
                                                <span className="font-medium">{pf.avg_monthly_qty} {pf.unit}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Reorder Point</span>
                                                <span className="font-medium">{pf.reorder_point} {pf.unit}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Order Frequency</span>
                                                <span className="font-medium">{pf.order_frequency}x / 3mo</span>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ─── Tab: Fraud Detection ─────────────────────────── */}
            {activeTab === "fraud" && (
                <div className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Shield className="h-5 w-5 text-red-500" /> Fraud Pattern Scanner
                            </CardTitle>
                            <CardDescription>
                                ML detects: split orders, unusually large orders with new suppliers, off-hours activity.
                            </CardDescription>
                        </CardHeader>
                    </Card>

                    {mlLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-6 w-6 animate-spin text-red-500 mr-2" />
                            <span className="text-muted-foreground">Scanning for fraud patterns...</span>
                        </div>
                    ) : fraudAlerts.length === 0 ? (
                        <Card className="p-8 text-center border-green-500/30 bg-green-500/5">
                            <p className="text-green-600 dark:text-green-400 font-medium">✅ No suspicious patterns detected. All clear!</p>
                        </Card>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2">
                            {fraudAlerts.map((alert, i) => (
                                <FraudAlertCard key={i} alert={alert} />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ─── Tab: Price Anomalies ─────────────────────────── */}
            {activeTab === "anomalies" && (
                <div className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Search className="h-5 w-5 text-purple-500" /> IsolationForest Price Analyzer
                            </CardTitle>
                            <CardDescription>
                                ML scans all recent prices and flags statistical outliers using IsolationForest.
                            </CardDescription>
                        </CardHeader>
                    </Card>

                    {mlLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-6 w-6 animate-spin text-purple-500 mr-2" />
                            <span className="text-muted-foreground">Analyzing price patterns...</span>
                        </div>
                    ) : priceAnomalies.length === 0 ? (
                        <Card className="p-8 text-center border-green-500/30 bg-green-500/5">
                            <p className="text-green-600 dark:text-green-400 font-medium">✅ All prices within normal range. No anomalies detected.</p>
                        </Card>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {priceAnomalies.map((anomaly, i) => (
                                <PriceAnomalyCard key={i} anomaly={anomaly} />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ─── Tab: Supplier Price Changes ────────────────────── */}
            {activeTab === "price-changes" && (
                <div className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <DollarSign className="h-5 w-5 text-amber-500" /> Supplier Price Change Requests
                            </CardTitle>
                            <CardDescription>
                                Review price updates submitted by suppliers. Approving updates the supplier&apos;s catalog price automatically.
                            </CardDescription>
                        </CardHeader>
                    </Card>

                    {mlLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-6 w-6 animate-spin text-amber-500 mr-2" />
                            <span className="text-muted-foreground">Loading price updates...</span>
                        </div>
                    ) : supplierPriceUpdates.length === 0 ? (
                        <Card className="p-8 text-center border-green-500/30 bg-green-500/5">
                            <p className="text-green-600 dark:text-green-400 font-medium">✅ No supplier price change requests. All prices are up to date.</p>
                        </Card>
                    ) : (
                        <div className="space-y-3">
                            {supplierPriceUpdates.map((pu) => {
                                const isIncrease = pu.change_percent > 0;
                                const isPending = pu.status === "pending";
                                return (
                                    <Card key={pu.id} className={`overflow-hidden border-l-4 ${pu.status === "approved" ? "border-l-green-500 opacity-70" :
                                            pu.status === "rejected" ? "border-l-red-500 opacity-70" :
                                                isIncrease ? "border-l-red-400" : "border-l-green-400"
                                        }`}>
                                        <CardContent className="p-4">
                                            <div className="flex items-center justify-between gap-4">
                                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                                    <div className={`p-2 rounded-lg ${isIncrease ? "bg-red-100 dark:bg-red-900/30" : "bg-green-100 dark:bg-green-900/30"}`}>
                                                        {isIncrease
                                                            ? <TrendingUp className="h-5 w-5 text-red-500" />
                                                            : <TrendingDown className="h-5 w-5 text-green-500" />}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="font-semibold text-sm truncate">{pu.product_name}</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            by <span className="font-medium">{pu.supplier_name}</span> • Effective: {pu.effective_date}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="text-right shrink-0">
                                                    <div className="flex items-center gap-2 text-sm">
                                                        <span className="text-muted-foreground">${pu.current_price.toFixed(2)}</span>
                                                        <span>→</span>
                                                        <span className="font-bold">${pu.proposed_price.toFixed(2)}</span>
                                                    </div>
                                                    <span className={`text-xs font-semibold ${isIncrease ? "text-red-500" : "text-green-500"}`}>
                                                        {isIncrease ? "+" : ""}{pu.change_percent.toFixed(1)}%
                                                    </span>
                                                </div>

                                                {isPending ? (
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="text-green-600 border-green-200 hover:bg-green-50 gap-1"
                                                            onClick={async () => {
                                                                const token = (await getToken()) || undefined;
                                                                await approvePriceUpdate(pu.id, undefined, token);
                                                                loadMLData();
                                                            }}
                                                        >
                                                            <CheckCircle className="h-4 w-4" /> Approve
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="text-red-600 border-red-200 hover:bg-red-50 gap-1"
                                                            onClick={async () => {
                                                                const token = (await getToken()) || undefined;
                                                                await rejectPriceUpdate(pu.id, undefined, token);
                                                                loadMLData();
                                                            }}
                                                        >
                                                            <XCircle className="h-4 w-4" /> Reject
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <Badge variant="outline" className={`shrink-0 text-xs ${pu.status === "approved"
                                                            ? "border-green-300 text-green-600 bg-green-50 dark:bg-green-900/30"
                                                            : "border-red-300 text-red-600 bg-red-50 dark:bg-red-900/30"
                                                        }`}>
                                                        {pu.status === "approved" ? "✅ Approved" : "❌ Rejected"}
                                                    </Badge>
                                                )}
                                            </div>
                                            {pu.reason && <p className="text-xs text-muted-foreground mt-2 pl-11">Reason: {pu.reason}</p>}
                                            {pu.review_notes && <p className="text-xs mt-1 pl-11 text-amber-600">Review: {pu.review_notes}</p>}
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Insight Card (existing alerts) ─────────────────────────────
function InsightCard({ insight }: { insight: Insight }) {
    const router = useRouter();
    const colorMap: Record<string, { border: string; badge: string; label: string; route: string }> = {
        reorder: { border: "border-l-orange-500", badge: "border-orange-200 text-orange-700 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-300", label: "Reorder", route: "/purchase-orders" },
        spend_anomaly: { border: "border-l-blue-500", badge: "border-blue-200 text-blue-700 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-300", label: "Spend Alert", route: "/analytics" },
        supplier_risk: { border: "border-l-red-500", badge: "border-red-200 text-red-700 bg-red-50 dark:bg-red-900/30 dark:text-red-300", label: "Risk Alert", route: "/suppliers" },
        price_anomaly: { border: "border-l-purple-500", badge: "border-purple-200 text-purple-700 bg-purple-50 dark:bg-purple-900/30 dark:text-purple-300", label: "Price Anomaly", route: "/ai-insights" },
    };
    const style = colorMap[insight.type] || colorMap["spend_anomaly"];

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

// ─── Fraud Alert Card ───────────────────────────────────────────
function FraudAlertCard({ alert }: { alert: any }) {
    const typeConfig: Record<string, { icon: any; color: string; bgColor: string }> = {
        split_order: { icon: AlertTriangle, color: "text-amber-500", bgColor: "bg-amber-500/10" },
        new_supplier_large_order: { icon: Shield, color: "text-red-500", bgColor: "bg-red-500/10" },
        off_hours: { icon: Eye, color: "text-blue-500", bgColor: "bg-blue-500/10" },
    };
    const config = typeConfig[alert.type] || typeConfig["new_supplier_large_order"];
    const Icon = config.icon;

    return (
        <Card className="hover:shadow-md transition-shadow border border-red-500/20">
            <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${config.bgColor}`}>
                        <Icon className={`h-5 w-5 ${config.color}`} />
                    </div>
                    <div className="flex-1">
                        <Badge variant="outline" className={`text-xs ${alert.severity === "critical" ? "border-red-300 text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-300" : "border-amber-300 text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-300"}`}>
                            {alert.severity === "critical" ? "🔴 Critical" : "🟡 Warning"}
                        </Badge>
                    </div>
                </div>
                <CardTitle className="text-base mt-2">{alert.title}</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground mb-3">{alert.description}</p>
                {alert.metadata && (
                    <div className="text-xs space-y-1 p-3 rounded-lg bg-muted/50">
                        {alert.metadata.supplier && (
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Supplier</span>
                                <span className="font-medium">{alert.metadata.supplier}</span>
                            </div>
                        )}
                        {alert.metadata.po_number && (
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">PO</span>
                                <span className="font-mono font-medium">{alert.metadata.po_number}</span>
                            </div>
                        )}
                        {alert.metadata.amount && (
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Amount</span>
                                <span className="font-medium text-red-500">${Number(alert.metadata.amount).toLocaleString()}</span>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

// ─── Price Anomaly Card ─────────────────────────────────────────
function PriceAnomalyCard({ anomaly }: { anomaly: any }) {
    const deviation = anomaly.deviation_pct || 0;
    const isHigh = deviation > 0;

    return (
        <Card className="hover:shadow-md transition-shadow border border-purple-500/20">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <Badge variant="outline" className="border-purple-300 text-purple-600 bg-purple-50 dark:bg-purple-900/30 dark:text-purple-300">
                        <Search className="h-3 w-3 mr-1" /> Anomaly
                    </Badge>
                    <div className={`flex items-center gap-1 text-sm font-semibold ${isHigh ? "text-red-500" : "text-green-500"}`}>
                        {isHigh ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                        {Math.abs(deviation).toFixed(1)}%
                    </div>
                </div>
                <CardTitle className="text-base mt-2">{anomaly.product_name || "Unknown Product"}</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground mb-3">{anomaly.reason || "Unusual price detected by IsolationForest model."}</p>
                <div className="text-xs space-y-1 p-3 rounded-lg bg-muted/50">
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">New Price</span>
                        <span className="font-medium">${Number(anomaly.new_price || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Historical Avg</span>
                        <span className="font-medium">${Number(anomaly.historical_avg || 0).toLocaleString()}</span>
                    </div>
                    {anomaly.confidence != null && (
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Confidence</span>
                            <span className="font-medium">{(anomaly.confidence * 100).toFixed(0)}%</span>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
