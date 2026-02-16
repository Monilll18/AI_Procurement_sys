"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Search, Package, Loader2, Plus, MoreHorizontal, Edit, Trash2 } from "lucide-react";
import { getProducts, createProduct, updateProduct, deleteProduct, type Product } from "@/lib/api";
import { useAuth } from "@clerk/nextjs";

const CATEGORIES = [
    "Accessories", "Audio", "Computing", "Display", "Input",
    "Networking", "Office Supplies", "Power", "Printing", "Software", "Storage",
];

export default function ProductsPage() {
    const { getToken } = useAuth();
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [saving, setSaving] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        name: "", sku: "", category: "Computing", unit: "pcs",
        reorder_point: 10, reorder_quantity: 50,
    });

    const loadProducts = () => {
        setLoading(true);
        getProducts()
            .then(setProducts)
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    useEffect(() => { loadProducts(); }, []);

    const filtered = products.filter(
        (p) =>
            p.name.toLowerCase().includes(search.toLowerCase()) ||
            p.sku.toLowerCase().includes(search.toLowerCase()) ||
            p.category.toLowerCase().includes(search.toLowerCase())
    );

    const openCreate = () => {
        setEditingProduct(null);
        setFormData({ name: "", sku: "", category: "Computing", unit: "pcs", reorder_point: 10, reorder_quantity: 50 });
        setDialogOpen(true);
    };

    const openEdit = (product: Product) => {
        setEditingProduct(product);
        setFormData({
            name: product.name, sku: product.sku, category: product.category,
            unit: product.unit, reorder_point: product.reorder_point, reorder_quantity: product.reorder_quantity,
        });
        setDialogOpen(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const token = await getToken() || "";
            if (editingProduct) {
                await updateProduct(editingProduct.id, formData, token);
            } else {
                await createProduct(formData, token);
            }
            setDialogOpen(false);
            loadProducts();
        } catch (err: any) {
            alert(err.message || "Failed to save product");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (product: Product) => {
        if (!confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
        try {
            const token = await getToken() || "";
            await deleteProduct(product.id, token);
            loadProducts();
        } catch (err: any) {
            alert(err.message || "Failed to delete product");
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Products</h2>
                    <p className="text-muted-foreground">
                        Manage your product catalog and thresholds.{" "}
                        <span className="text-xs">({products.length} total)</span>
                    </p>
                </div>
                <Button onClick={openCreate} className="w-full md:w-auto">
                    <Plus className="mr-2 h-4 w-4" /> Add Product
                </Button>
            </div>

            {/* Search */}
            <div className="flex items-center gap-4 rounded-lg border bg-card p-4 shadow-sm">
                <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search products by name, SKU, or category..."
                        className="pl-9"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            {/* Products Table */}
            <div className="rounded-xl border bg-card shadow-sm">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <span className="ml-3 text-muted-foreground">Loading products...</span>
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Product Name</TableHead>
                                <TableHead>SKU</TableHead>
                                <TableHead>Category</TableHead>
                                <TableHead>Unit</TableHead>
                                <TableHead>Reorder Point</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filtered.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                                        {search ? "No products match your search." : "No products found. Click 'Add Product' to create one."}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filtered.map((product) => (
                                    <TableRow key={product.id} className="group hover:bg-muted/50">
                                        <TableCell className="font-medium">{product.name}</TableCell>
                                        <TableCell className="text-muted-foreground font-mono text-xs">{product.sku}</TableCell>
                                        <TableCell>
                                            <Badge variant="secondary" className="text-xs">{product.category}</Badge>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">{product.unit}</TableCell>
                                        <TableCell>{product.reorder_point}</TableCell>
                                        <TableCell className="text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => openEdit(product)}>
                                                        <Edit className="mr-2 h-4 w-4" /> Edit
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onClick={() => handleDelete(product)}
                                                        className="text-red-600"
                                                    >
                                                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                )}
            </div>

            {/* Add/Edit Product Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>{editingProduct ? "Edit Product" : "Add New Product"}</DialogTitle>
                        <DialogDescription>
                            {editingProduct ? "Update product details below." : "Fill in the details to add a new product to your catalog."}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name">Product Name</Label>
                            <Input
                                id="name"
                                placeholder="e.g. Dell UltraSharp Monitor"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="sku">SKU</Label>
                                <Input
                                    id="sku"
                                    placeholder="e.g. MON-DELL-001"
                                    value={formData.sku}
                                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                                    disabled={!!editingProduct}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="unit">Unit</Label>
                                <Select value={formData.unit} onValueChange={(v) => setFormData({ ...formData, unit: v })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="pcs">Pieces</SelectItem>
                                        <SelectItem value="kg">Kilograms</SelectItem>
                                        <SelectItem value="liters">Liters</SelectItem>
                                        <SelectItem value="boxes">Boxes</SelectItem>
                                        <SelectItem value="sets">Sets</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="category">Category</Label>
                            <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {CATEGORIES.map((cat) => (
                                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="reorder_point">Reorder Point</Label>
                                <Input
                                    id="reorder_point"
                                    type="number"
                                    value={formData.reorder_point}
                                    onChange={(e) => setFormData({ ...formData, reorder_point: parseInt(e.target.value) || 0 })}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="reorder_quantity">Reorder Quantity</Label>
                                <Input
                                    id="reorder_quantity"
                                    type="number"
                                    value={formData.reorder_quantity}
                                    onChange={(e) => setFormData({ ...formData, reorder_quantity: parseInt(e.target.value) || 0 })}
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSave} disabled={saving || !formData.name || !formData.sku}>
                            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {editingProduct ? "Save Changes" : "Add Product"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
