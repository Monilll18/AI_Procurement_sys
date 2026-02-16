"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, Truck, Star, Phone, Mail, MapPin, Loader2, Plus } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getSuppliers, createSupplier, type Supplier } from "@/lib/api";
import { useAuth } from "@clerk/nextjs";

export default function SuppliersPage() {
    const { getToken } = useAuth();
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [viewSupplier, setViewSupplier] = useState<Supplier | null>(null);

    const [formData, setFormData] = useState({
        name: "", email: "", phone: "", address: "", rating: 4.0, status: "active" as const,
    });

    const loadSuppliers = () => {
        setLoading(true);
        getSuppliers()
            .then(setSuppliers)
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    useEffect(() => { loadSuppliers(); }, []);

    const filtered = suppliers.filter(
        (s) =>
            s.name.toLowerCase().includes(search.toLowerCase()) ||
            (s.email && s.email.toLowerCase().includes(search.toLowerCase()))
    );

    const openCreate = () => {
        setFormData({ name: "", email: "", phone: "", address: "", rating: 4.0, status: "active" });
        setDialogOpen(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const token = await getToken() || "";
            await createSupplier(formData, token);
            setDialogOpen(false);
            loadSuppliers();
        } catch (err: any) {
            alert(err.message || "Failed to add supplier");
        } finally {
            setSaving(false);
        }
    };

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
                <Button onClick={openCreate}>
                    <Plus className="mr-2 h-4 w-4" /> Add Supplier
                </Button>
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

            {/* View Supplier Detail Dialog */}
            <Dialog open={!!viewSupplier} onOpenChange={() => setViewSupplier(null)}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>{viewSupplier?.name}</DialogTitle>
                        <DialogDescription>Supplier details and contact information</DialogDescription>
                    </DialogHeader>
                    {viewSupplier && (
                        <div className="space-y-4 py-4">
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
                            <div className="text-xs text-muted-foreground border-t pt-3">
                                Added on {new Date(viewSupplier.created_at).toLocaleDateString()}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
