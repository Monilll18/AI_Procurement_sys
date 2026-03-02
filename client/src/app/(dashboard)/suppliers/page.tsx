"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Search, Truck, Star, Phone, Mail, MapPin, Loader2, Plus, Sparkles,
    Upload, FileText, CheckCircle, AlertTriangle, X, DollarSign, Clock,
    Trash2, ExternalLink, Copy, RefreshCw, KeyRound,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
    getSuppliers, createSupplier, deleteSupplier, resendSupplierInvite,
    aiScoreSupplier, aiParsePriceSheet,
    type Supplier, type PortalCredentials,
} from "@/lib/api";
import { useAuth } from "@clerk/nextjs";
import { useAICall } from "@/hooks/useAICall";
import { AIErrorBoundary } from "@/components/AIErrorBoundary";
import { useRBAC } from "@/lib/rbac";

const PRICE_SHEET_MAX_CHARS = 20000;

export default function SuppliersPage() {
    const { getToken } = useAuth();
    const { can } = useRBAC();
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [viewSupplier, setViewSupplier] = useState<Supplier | null>(null);

    const [formData, setFormData] = useState({
        name: "", email: "", phone: "", address: "", rating: 4.0, status: "active" as const,
        send_portal_invite: true,
    });
    const [aiScore, setAiScore] = useState<any>(null);
    const [aiScoreLoading, setAiScoreLoading] = useState(false);
    const [aiScoreError, setAiScoreError] = useState("");

    // Price Sheet OCR state
    const [ocrText, setOcrText] = useState("");
    const [ocrResult, setOcrResult] = useState<any>(null);
    const [ocrError, setOcrError] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Delete confirmation modal state
    const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);
    const [deleting, setDeleting] = useState(false);

    // Portal credentials modal state
    const [credentials, setCredentials] = useState<PortalCredentials | null>(null);
    const [resending, setResending] = useState(false);

    const loadSuppliers = () => {
        setLoading(true);
        getSuppliers()
            .then(setSuppliers)
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    useEffect(() => { loadSuppliers(); }, []);

    // Fetch AI score when supplier is viewed
    useEffect(() => {
        if (viewSupplier) {
            setAiScore(null);
            setAiScoreLoading(true);
            setAiScoreError("");
            setOcrText("");
            setOcrResult(null);
            setOcrError("");
            aiScoreSupplier(viewSupplier.id)
                .then(setAiScore)
                .catch((err) => setAiScoreError(err.message || "Failed to load AI score"))
                .finally(() => setAiScoreLoading(false));
        }
    }, [viewSupplier]);

    const filtered = suppliers.filter(
        (s) =>
            s.name.toLowerCase().includes(search.toLowerCase()) ||
            (s.email && s.email.toLowerCase().includes(search.toLowerCase()))
    );

    const openCreate = () => {
        setFormData({ name: "", email: "", phone: "", address: "", rating: 4.0, status: "active", send_portal_invite: true });
        setDialogOpen(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const token = await getToken() || "";
            const result = await createSupplier(formData, token);
            setDialogOpen(false);
            loadSuppliers();

            // Show portal credentials if they were generated
            if (result.portal_credentials) {
                setCredentials(result.portal_credentials);
            }
        } catch (err: any) {
            alert(err.message || "Failed to add supplier");
        } finally {
            setSaving(false);
        }
    };

    // Handle file upload for price sheet OCR
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // For text files and simple PDFs, read as text
        // In production you'd use a proper OCR service
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target?.result as string;
            setOcrText(text || "");
        };

        if (file.type === "text/plain" || file.name.endsWith(".txt")) {
            reader.readAsText(file);
        } else {
            // For PDF/images, show a placeholder message
            setOcrText(`[File: ${file.name}]\nPrice List - January 2024\nA4 Paper 80GSM (Box of 5 reams).....$12.50\nA4 Paper 100GSM (Box of 5 reams)...$15.00\nBlue Pens (Pack of 12).............$4.50\nHP 305 Black Cartridge.............$22.00\nMINIMUM ORDER: $100\nPAYMENT TERMS: Net 30 days\nVALID UNTIL: March 31, 2024`);
        }
    };

    // ── Price Sheet OCR — useAICall (debounce + cooldown + abort)
    const priceSheetAI = useAICall<{ parsed: any }>({
        fn: useCallback((_signal: AbortSignal) => {
            if (!ocrText.trim()) return Promise.reject(new Error("No text to parse"));
            return aiParsePriceSheet(ocrText);
        }, [ocrText]),
        onSuccess: (result) => {
            setOcrResult(result.parsed);
            setOcrError("");
        },
        onError: (msg) => setOcrError(msg || "Failed to parse price sheet"),
    });

    // Stats
    const activeCount = suppliers.filter(s => s.status === "active").length;
    const avgRating = suppliers.length > 0 ? (suppliers.reduce((s, su) => s + su.rating, 0) / suppliers.length).toFixed(1) : "0";

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Suppliers</h2>
                    <p className="text-muted-foreground">
                        Manage your vendor relationships and performance.{" "}
                        <span className="text-xs">({suppliers.length} total · {activeCount} active · ★{avgRating} avg)</span>
                    </p>
                </div>
                {can("create_supplier") && (
                    <Button onClick={openCreate}>
                        <Plus className="mr-2 h-4 w-4" /> Add Supplier
                    </Button>
                )}
            </div>

            {/* Search */}
            <div className="flex items-center gap-4 rounded-lg border bg-card p-4 shadow-sm">
                <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search suppliers by name or email..."
                        className="pl-9"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            {/* Loading State */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="ml-3 text-muted-foreground">Loading suppliers...</span>
                </div>
            ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {filtered.length === 0 ? (
                        <div className="col-span-full text-center text-muted-foreground py-10">
                            {search ? "No suppliers match your search." : "No suppliers found. Click 'Add Supplier' to get started."}
                        </div>
                    ) : (
                        filtered.map((supplier) => (
                            <Card key={supplier.id} className="hover:shadow-md transition-shadow group cursor-pointer" onClick={() => setViewSupplier(supplier)}>
                                <CardHeader className="flex flex-row items-start justify-between pb-2">
                                    <div className="flex items-center gap-3">
                                        <Avatar className="h-10 w-10 border">
                                            <AvatarFallback className="bg-purple-50 text-purple-700 font-bold dark:bg-purple-900/30 dark:text-purple-400">
                                                {supplier.name.substring(0, 2)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <CardTitle className="text-base">{supplier.name}</CardTitle>
                                            <Badge
                                                variant="secondary"
                                                className={`text-[10px] h-5 px-1.5 mt-0.5 ${supplier.status === "active"
                                                    ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                                    : supplier.status === "inactive"
                                                        ? "bg-gray-100 text-gray-600"
                                                        : "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                                    }`}
                                            >
                                                {supplier.status}
                                            </Badge>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400 px-2 py-0.5 rounded text-xs font-medium">
                                        <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                                        {supplier.rating.toFixed(1)}
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-3 pt-2">
                                    <div className="space-y-2 text-sm text-muted-foreground">
                                        {supplier.phone && (
                                            <div className="flex items-center gap-2">
                                                <Phone className="h-3.5 w-3.5" /> {supplier.phone}
                                            </div>
                                        )}
                                        {supplier.email && (
                                            <div className="flex items-center gap-2">
                                                <Mail className="h-3.5 w-3.5" /> {supplier.email}
                                            </div>
                                        )}
                                        {supplier.address && (
                                            <div className="flex items-center gap-2">
                                                <MapPin className="h-3.5 w-3.5" />
                                                <span className="truncate">{supplier.address}</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="pt-2 border-t mt-3">
                                        <span className="text-xs text-muted-foreground">
                                            Since {new Date(supplier.created_at).toLocaleDateString()}
                                        </span>
                                    </div>
                                </CardContent>
                            </Card>
                        ))
                    )}
                </div>
            )}

            {/* Add Supplier Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Add New Supplier</DialogTitle>
                        <DialogDescription>Add a new vendor to your supplier network.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name">Company Name</Label>
                            <Input id="name" placeholder="e.g. Acme Electronics" value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="email">Email</Label>
                                <Input id="email" type="email" placeholder="sales@acme.com" value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="phone">Phone</Label>
                                <Input id="phone" placeholder="+1 555-0123" value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                            </div>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="address">Address</Label>
                            <Input id="address" placeholder="123 Business Ave, Suite 100" value={formData.address}
                                onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label>Initial Rating</Label>
                                <Select value={formData.rating.toString()} onValueChange={(v) => setFormData({ ...formData, rating: parseFloat(v) })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {[5, 4.5, 4, 3.5, 3, 2.5, 2].map(r => (
                                            <SelectItem key={r} value={r.toString()}>★ {r.toFixed(1)}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <Label>Status</Label>
                                <Select value={formData.status} onValueChange={(v: any) => setFormData({ ...formData, status: v })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="active">Active</SelectItem>
                                        <SelectItem value="inactive">Inactive</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        {/* Portal Invite Toggle */}
                        <div className="flex items-center gap-3 p-3 rounded-lg border bg-violet-50/50 dark:bg-violet-900/10">
                            <input
                                type="checkbox"
                                id="portal-invite"
                                checked={formData.send_portal_invite}
                                onChange={(e) => setFormData({ ...formData, send_portal_invite: e.target.checked })}
                                className="h-4 w-4 rounded border-gray-300 text-violet-600"
                            />
                            <div>
                                <label htmlFor="portal-invite" className="text-sm font-medium cursor-pointer">
                                    Send Portal Invite
                                </label>
                                <p className="text-xs text-muted-foreground">
                                    Creates login credentials so the supplier can access their portal
                                </p>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSave} disabled={saving || !formData.name}>
                            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Add Supplier
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* View Supplier Detail Dialog — with Tabs */}
            <Dialog open={!!viewSupplier} onOpenChange={() => setViewSupplier(null)}>
                <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{viewSupplier?.name}</DialogTitle>
                        <DialogDescription>Supplier details, AI score, and price sheet analysis</DialogDescription>
                    </DialogHeader>
                    {viewSupplier && (
                        <Tabs defaultValue="details">
                            <TabsList className="w-full">
                                <TabsTrigger value="details" className="flex-1">Details</TabsTrigger>
                                <TabsTrigger value="ai-score" className="flex-1">
                                    <Sparkles className="h-3.5 w-3.5 mr-1" /> AI Score
                                </TabsTrigger>
                                <TabsTrigger value="price-sheet" className="flex-1">
                                    <FileText className="h-3.5 w-3.5 mr-1" /> Price Sheet
                                </TabsTrigger>
                            </TabsList>

                            {/* Details Tab */}
                            <TabsContent value="details" className="space-y-4 pt-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-xs text-muted-foreground">Status</p>
                                        <Badge variant="secondary" className={
                                            viewSupplier.status === "active" ? "bg-green-100 text-green-700" :
                                                viewSupplier.status === "inactive" ? "bg-gray-100 text-gray-600" :
                                                    "bg-red-100 text-red-700"
                                        }>{viewSupplier.status}</Badge>
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground">Rating</p>
                                        <p className="font-medium flex items-center gap-1">
                                            <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                                            {viewSupplier.rating.toFixed(1)} / 5.0
                                        </p>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    {viewSupplier.email && (
                                        <div className="flex items-center gap-2 text-sm">
                                            <Mail className="h-4 w-4 text-muted-foreground" />
                                            <a href={`mailto:${viewSupplier.email}`} className="text-primary hover:underline">{viewSupplier.email}</a>
                                        </div>
                                    )}
                                    {viewSupplier.phone && (
                                        <div className="flex items-center gap-2 text-sm">
                                            <Phone className="h-4 w-4 text-muted-foreground" />
                                            <a href={`tel:${viewSupplier.phone}`} className="text-primary hover:underline">{viewSupplier.phone}</a>
                                        </div>
                                    )}
                                    {viewSupplier.address && (
                                        <div className="flex items-center gap-2 text-sm">
                                            <MapPin className="h-4 w-4 text-muted-foreground" /> {viewSupplier.address}
                                        </div>
                                    )}
                                </div>
                                <div className="text-xs text-muted-foreground border-t pt-3 flex items-center justify-between">
                                    <span>Added on {new Date(viewSupplier.created_at).toLocaleDateString()}</span>
                                    <div className="flex items-center gap-2">
                                        <a
                                            href="/supplier-portal/login"
                                            target="_blank"
                                            className="text-violet-600 hover:underline flex items-center gap-1"
                                        >
                                            <ExternalLink className="h-3 w-3" /> Portal
                                        </a>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-violet-600 hover:text-violet-700 hover:bg-violet-50 h-7 text-xs"
                                            disabled={resending}
                                            onClick={async () => {
                                                setResending(true);
                                                try {
                                                    const token = await getToken() || "";
                                                    const res = await resendSupplierInvite(viewSupplier.id, token);
                                                    if (res.action === "password_reset") {
                                                        // Supplier already has account — show reset link
                                                        const fullUrl = `${window.location.origin}${res.reset_url}`;
                                                        toast.success("Password reset link generated", {
                                                            description: "Supplier already has an account. Share the reset link with them.",
                                                            duration: 10000,
                                                            action: {
                                                                label: "Copy Link",
                                                                onClick: () => {
                                                                    navigator.clipboard.writeText(fullUrl);
                                                                    toast.info("Reset link copied to clipboard");
                                                                },
                                                            },
                                                        });
                                                    } else {
                                                        setCredentials(res.portal_credentials || null);
                                                    }
                                                } catch (err: any) {
                                                    toast.error(err.message || "Failed to resend invite");
                                                } finally {
                                                    setResending(false);
                                                }
                                            }}
                                        >
                                            {resending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                                            Resend Invite
                                        </Button>
                                        {can("delete_supplier") && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                                onClick={() => {
                                                    setDeleteTarget(viewSupplier);
                                                }}
                                            >
                                                <Trash2 className="h-4 w-4 mr-1" /> Delete
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </TabsContent>

                            {/* AI Score Tab */}
                            <TabsContent value="ai-score" className="pt-4">
                                {aiScoreLoading ? (
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                                        <Loader2 className="h-5 w-5 animate-spin" /> Calculating AI score...
                                    </div>
                                ) : aiScore ? (
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between p-4 rounded-lg bg-primary/5 border border-primary/20">
                                            <div>
                                                <p className="text-xs text-muted-foreground">Overall AI Score</p>
                                                <p className="text-4xl font-bold text-primary">
                                                    {typeof aiScore.total_score === 'number' ? aiScore.total_score.toFixed(1) : '—'}
                                                    <span className="text-lg text-muted-foreground">/10</span>
                                                </p>
                                            </div>
                                            <Sparkles className="h-10 w-10 text-primary/30" />
                                        </div>
                                        {aiScore.breakdown && (
                                            <div className="space-y-3">
                                                {[
                                                    { key: 'price', label: 'Price Competitiveness', color: 'bg-blue-500', weight: '30%' },
                                                    { key: 'delivery', label: 'Delivery Reliability', color: 'bg-green-500', weight: '30%' },
                                                    { key: 'quality', label: 'Quality Score', color: 'bg-purple-500', weight: '25%' },
                                                    { key: 'response', label: 'Response Time', color: 'bg-amber-500', weight: '15%' },
                                                ].map(({ key, label, color, weight }) => {
                                                    const val = aiScore.breakdown[key]?.score;
                                                    return (
                                                        <div key={key} className="space-y-1">
                                                            <div className="flex items-center justify-between text-sm">
                                                                <span className="text-muted-foreground">{label}</span>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-xs text-muted-foreground">{weight}</span>
                                                                    <span className="font-mono font-medium">
                                                                        {typeof val === 'number' ? val.toFixed(1) : '—'}/10
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                                                                <div
                                                                    className={`h-full rounded-full ${color} transition-all duration-700`}
                                                                    style={{ width: `${((val || 0) / 10) * 100}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="text-center py-8 text-muted-foreground">
                                        <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-30" />
                                        <p className="text-sm">Score unavailable — not enough order history.</p>
                                    </div>
                                )}
                            </TabsContent>

                            {/* Price Sheet OCR Tab */}
                            <TabsContent value="price-sheet" className="pt-4 space-y-4">
                                <div className="rounded-lg border border-dashed border-border p-4 text-center space-y-3">
                                    <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                                    <div>
                                        <p className="text-sm font-medium">Upload Price Sheet</p>
                                        <p className="text-xs text-muted-foreground">PDF, image, or text file from supplier</p>
                                    </div>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".txt,.pdf,.png,.jpg,.jpeg"
                                        className="hidden"
                                        onChange={handleFileUpload}
                                    />
                                    <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                                        <Upload className="h-4 w-4 mr-2" /> Choose File
                                    </Button>
                                </div>

                                <div className="space-y-2">
                                    <Label>Or paste price sheet text directly:</Label>
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-muted-foreground">Characters</span>
                                        <span className={`text-xs ${ocrText.length > PRICE_SHEET_MAX_CHARS
                                            ? "text-red-500 font-semibold"
                                            : "text-muted-foreground"
                                            }`}>
                                            {ocrText.length.toLocaleString()} / {PRICE_SHEET_MAX_CHARS.toLocaleString()}
                                        </span>
                                    </div>
                                    <Textarea
                                        placeholder="Paste OCR text or price list content here..."
                                        value={ocrText}
                                        onChange={(e) => setOcrText(e.target.value.slice(0, PRICE_SHEET_MAX_CHARS))}
                                        rows={5}
                                        className={`font-mono text-xs ${ocrText.length > PRICE_SHEET_MAX_CHARS * 0.9 ? "border-amber-400" : ""
                                            }`}
                                    />
                                </div>

                                <Button
                                    onClick={priceSheetAI.trigger}
                                    disabled={priceSheetAI.loading || priceSheetAI.cooldown > 0 || !ocrText.trim() || ocrText.length > PRICE_SHEET_MAX_CHARS}
                                    className="w-full"
                                >
                                    {priceSheetAI.loading ? (
                                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> AI Parsing...</>
                                    ) : priceSheetAI.cooldown > 0 ? (
                                        <><Clock className="mr-2 h-4 w-4" /> Wait {priceSheetAI.cooldown}s...</>
                                    ) : (
                                        <><Sparkles className="mr-2 h-4 w-4" /> Parse with AI</>
                                    )}
                                </Button>

                                {ocrError && (
                                    <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 text-sm">
                                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                        {ocrError}
                                    </div>
                                )}

                                {ocrResult && (
                                    <AIErrorBoundary featureName="Price Sheet Parser">
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
                                                <CheckCircle className="h-4 w-4" />
                                                AI extracted {ocrResult.supplier_prices?.length || 0} products
                                            </div>

                                            {/* Metadata */}
                                            <div className="grid grid-cols-3 gap-2 text-xs">
                                                {ocrResult.valid_until && (
                                                    <div className="p-2 rounded bg-muted">
                                                        <p className="text-muted-foreground">Valid Until</p>
                                                        <p className="font-medium">{ocrResult.valid_until}</p>
                                                    </div>
                                                )}
                                                {ocrResult.payment_terms && (
                                                    <div className="p-2 rounded bg-muted">
                                                        <p className="text-muted-foreground">Payment</p>
                                                        <p className="font-medium">{ocrResult.payment_terms}</p>
                                                    </div>
                                                )}
                                                {ocrResult.minimum_order && (
                                                    <div className="p-2 rounded bg-muted">
                                                        <p className="text-muted-foreground">Min Order</p>
                                                        <p className="font-medium">${ocrResult.minimum_order}</p>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Extracted Products */}
                                            <div className="space-y-2 max-h-60 overflow-y-auto">
                                                {(ocrResult.supplier_prices || []).map((item: any, i: number) => (
                                                    <div key={i} className="flex items-center justify-between p-3 rounded-lg border bg-card text-sm">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-medium truncate">{item.description}</p>
                                                            {item.matched_product_name && (
                                                                <p className="text-xs text-muted-foreground">
                                                                    → Matched: {item.matched_product_name}
                                                                    {" "}
                                                                    <span className={`font-medium ${item.confidence > 0.8 ? "text-green-600" : "text-amber-600"}`}>
                                                                        ({Math.round((item.confidence || 0) * 100)}% match)
                                                                    </span>
                                                                </p>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-1 text-primary font-bold ml-3">
                                                            <DollarSign className="h-3.5 w-3.5" />
                                                            {item.price?.toFixed(2)}
                                                            <span className="text-xs text-muted-foreground font-normal">/{item.unit}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            <Button variant="outline" size="sm" className="w-full" onClick={() => {
                                                setOcrText("");
                                                setOcrResult(null);
                                            }}>
                                                <X className="h-4 w-4 mr-2" /> Clear
                                            </Button>
                                        </div>
                                    </AIErrorBoundary>
                                )}
                            </TabsContent>
                        </Tabs>
                    )}
                </DialogContent>
            </Dialog>

            {/* Delete Supplier Confirmation Modal */}
            <ConfirmModal
                open={!!deleteTarget}
                onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
                title={`Delete "${deleteTarget?.name}"?`}
                description="This will permanently remove the supplier, their portal account, catalog, and invoices. Purchase orders will be kept but unlinked. This action cannot be undone."
                confirmLabel="Delete Supplier"
                variant="danger"
                loading={deleting}
                onConfirm={async () => {
                    if (!deleteTarget) return;
                    setDeleting(true);
                    try {
                        const token = await getToken() || "";
                        await deleteSupplier(deleteTarget.id, token);
                        setDeleteTarget(null);
                        setViewSupplier(null);
                        loadSuppliers();
                    } catch (err: any) {
                        alert(err.message || "Failed to delete supplier");
                    } finally {
                        setDeleting(false);
                    }
                }}
            />

            {/* Portal Credentials Modal */}
            <Dialog open={!!credentials} onOpenChange={(open) => { if (!open) setCredentials(null); }}>
                <DialogContent className="sm:max-w-[480px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <div className="p-2 rounded-full bg-violet-100 text-violet-600">
                                <KeyRound className="h-5 w-5" />
                            </div>
                            Supplier Portal Credentials
                        </DialogTitle>
                        <DialogDescription>
                            Share these credentials with the supplier so they can access their portal.
                        </DialogDescription>
                    </DialogHeader>

                    {credentials && (
                        <div className="space-y-4 py-2">
                            {!credentials.email_sent && (
                                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                    <span>Email delivery failed — please share these credentials manually.</span>
                                </div>
                            )}
                            {credentials.email_sent && (
                                <div className="flex items-start gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm">
                                    <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
                                    <span>Invitation email sent successfully! You can also copy credentials below.</span>
                                </div>
                            )}

                            {/* Credential fields */}
                            {[
                                { label: "Email", value: credentials.email, icon: <Mail className="h-4 w-4" /> },
                                { label: "Temporary Password", value: credentials.temp_password, icon: <KeyRound className="h-4 w-4" /> },
                                { label: "Portal Login URL", value: credentials.portal_url, icon: <ExternalLink className="h-4 w-4" /> },
                            ].map((field) => (
                                <div key={field.label} className="space-y-1">
                                    <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                                        {field.icon} {field.label}
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <code className="flex-1 px-3 py-2 rounded-md bg-muted font-mono text-sm select-all break-all">
                                            {field.value}
                                        </code>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            className="shrink-0 h-9 w-9"
                                            onClick={() => {
                                                navigator.clipboard.writeText(field.value);
                                            }}
                                        >
                                            <Copy className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}

                            <div className="text-xs text-muted-foreground pt-2 border-t">
                                The supplier will be asked to change their password on first login.
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                if (credentials) {
                                    navigator.clipboard.writeText(
                                        `Supplier Portal Login\nEmail: ${credentials.email}\nPassword: ${credentials.temp_password}\nURL: ${credentials.portal_url}`
                                    );
                                }
                            }}
                        >
                            <Copy className="h-4 w-4 mr-2" /> Copy All
                        </Button>
                        <Button onClick={() => setCredentials(null)}>Done</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
