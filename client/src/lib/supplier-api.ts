/**
 * Supplier Portal API helpers.
 * Uses supplier JWT tokens (stored in localStorage), NOT Clerk.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function getSupplierToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("supplier_token");
}

export function setSupplierToken(token: string) {
    localStorage.setItem("supplier_token", token);
}

export function clearSupplierSession() {
    localStorage.removeItem("supplier_token");
    localStorage.removeItem("supplier_user");
}

export function getStoredSupplierUser(): SupplierAuthUser | null {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem("supplier_user");
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

export function setStoredSupplierUser(user: SupplierAuthUser) {
    localStorage.setItem("supplier_user", JSON.stringify(user));
}

async function supplierFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = getSupplierToken();
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(options.headers as Record<string, string>),
    };
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

    if (res.status === 401) {
        clearSupplierSession();
        if (typeof window !== "undefined") {
            window.location.href = "/supplier-portal/login";
        }
        throw new Error("Session expired");
    }

    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Request failed" }));
        throw new Error(err.detail || `Error ${res.status}`);
    }

    return res.json();
}

// ─── Types ──────────────────────────────────────────────

export interface SupplierAuthUser {
    id: string;
    email: string;
    full_name: string | null;
    role: string;
    supplier_id: string;
    supplier_name: string | null;
    must_change_password?: boolean;
}

export interface LoginResponse {
    access_token: string;
    token_type: string;
    user: SupplierAuthUser;
}

export interface DashboardData {
    supplier: {
        id: string;
        name: string;
        email: string;
        rating: number;
    };
    stats: {
        total_pos: number;
        new_pos: number;
        in_progress: number;
        completed: number;
        total_value: number;
        pending_value: number;
        total_shipments: number;
        active_shipments: number;
    };
    user: {
        full_name: string;
        email: string;
        role: string;
    };
}

export interface SupplierPOLineItem {
    id: string;
    product_name: string;
    product_id: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    quantity_received: number;
}

export interface SupplierPO {
    id: string;
    po_number: string;
    status: string;
    total_amount: number;
    expected_delivery: string | null;
    notes: string | null;
    sent_at: string | null;
    created_at: string | null;
    shipment_count: number;
    latest_shipment: {
        id: string;
        number: string;
        status: string;
        carrier: string | null;
        tracking_number: string | null;
    } | null;
    line_items: SupplierPOLineItem[];
}

export interface ShipmentItem {
    id: string;
    product_name: string;
    quantity_shipped: number;
    quantity_ordered: number;
    unit_price: number;
}

export interface SupplierShipment {
    id: string;
    shipment_number: string;
    po_id: string;
    po_number: string | null;
    shipment_type: string;
    status: string;
    carrier: string | null;
    tracking_number: string | null;
    tracking_url: string | null;
    estimated_delivery: string | null;
    actual_delivery: string | null;
    notes: string | null;
    dispatched_at: string | null;
    delivered_at: string | null;
    created_at: string | null;
    items: ShipmentItem[];
}

// ─── Auth APIs ──────────────────────────────────────────

export const supplierLogin = (email: string, password: string) =>
    supplierFetch<LoginResponse>("/api/supplier-auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
    });

export const supplierActivate = (token: string, new_password: string) =>
    supplierFetch<LoginResponse>("/api/supplier-auth/activate", {
        method: "POST",
        body: JSON.stringify({ token, new_password }),
    });

export const supplierChangePassword = (current_password: string, new_password: string) =>
    supplierFetch<{ message: string }>("/api/supplier-auth/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password, new_password }),
    });

export const supplierGetProfile = () =>
    supplierFetch<SupplierAuthUser>("/api/supplier-auth/me");

// ─── Portal APIs ────────────────────────────────────────

export const getSupplierDashboard = () =>
    supplierFetch<DashboardData>("/api/supplier-portal/dashboard");

export const getSupplierPOs = (status?: string) => {
    const params = status ? `?status=${status}` : "";
    return supplierFetch<SupplierPO[]>(`/api/supplier-portal/purchase-orders${params}`);
};

export const getSupplierPODetail = (poId: string) =>
    supplierFetch<SupplierPO>(`/api/supplier-portal/purchase-orders/${poId}`);

export const supplierAcceptPO = (poId: string, notes?: string) =>
    supplierFetch<{ message: string }>(`/api/supplier-portal/purchase-orders/${poId}/accept`, {
        method: "POST",
        body: JSON.stringify({ notes }),
    });

export const supplierRejectPO = (poId: string, reason: string) =>
    supplierFetch<{ message: string }>(`/api/supplier-portal/purchase-orders/${poId}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason }),
    });

export const supplierPartialAccept = (poId: string, items: { line_item_id: string; available_qty: number }[], reason?: string) =>
    supplierFetch<{ message: string }>(`/api/supplier-portal/purchase-orders/${poId}/partial`, {
        method: "POST",
        body: JSON.stringify({ items, reason }),
    });

// ─── Shipment APIs ──────────────────────────────────────

export const createShipment = (data: {
    po_id: string;
    shipment_type?: string;
    carrier?: string;
    tracking_number?: string;
    tracking_url?: string;
    estimated_delivery?: string;
    notes?: string;
    items: { line_item_id: string; quantity_shipped: number }[];
}) =>
    supplierFetch<{ message: string; shipment_id: string; shipment_number: string }>(
        "/api/supplier-portal/shipments",
        { method: "POST", body: JSON.stringify(data) },
    );

export const getShipments = (status?: string) => {
    const params = status ? `?status=${status}` : "";
    return supplierFetch<SupplierShipment[]>(`/api/supplier-portal/shipments${params}`);
};

export const getShipment = (id: string) =>
    supplierFetch<SupplierShipment>(`/api/supplier-portal/shipments/${id}`);

export const updateShipment = (id: string, data: {
    status: string;
    tracking_number?: string;
    tracking_url?: string;
    carrier?: string;
    notes?: string;
}) =>
    supplierFetch<{ message: string }>(`/api/supplier-portal/shipments/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
    });

// ─── Catalog & Pricing Types ────────────────────────────

export interface CatalogItem {
    id: string;
    product_id: string;
    product_name: string;
    category: string | null;
    unit_price: number;
    currency: string;
    min_order_qty: number | null;
    available_quantity: number | null;
    lead_time_days: number | null;
    valid_from: string | null;
    valid_to: string | null;
}

export interface PriceUpdate {
    id: string;
    product_id: string;
    product_name: string;
    current_price: number;
    proposed_price: number;
    change_percent: number;
    reason: string | null;
    effective_date: string;
    status: string;
    review_notes: string | null;
    created_at: string | null;
}

// ─── Catalog APIs ───────────────────────────────────────

export const getCatalog = () =>
    supplierFetch<CatalogItem[]>("/api/supplier-portal/catalog");

export interface AvailableProduct {
    id: string;
    name: string;
    sku: string;
    category: string;
    unit: string;
}

export const getAvailableProducts = () =>
    supplierFetch<AvailableProduct[]>("/api/supplier-portal/catalog/available-products");

export const addToCatalog = (data: {
    product_id: string;
    unit_price: number;
    currency?: string;
    min_order_qty?: number;
    available_quantity?: number;
    lead_time_days?: number;
}) =>
    supplierFetch<{ message: string; id: string; product_name: string }>("/api/supplier-portal/catalog/add", {
        method: "POST",
        body: JSON.stringify(data),
    });

export const removeFromCatalog = (priceId: string) =>
    supplierFetch<{ message: string }>(`/api/supplier-portal/catalog/${priceId}`, {
        method: "DELETE",
    });

export const updateCatalogStock = (priceId: string, available_quantity: number) =>
    supplierFetch<{ message: string }>(`/api/supplier-portal/catalog/${priceId}/stock`, {
        method: "PATCH",
        body: JSON.stringify({ available_quantity }),
    });

export const submitPriceUpdate = (data: {
    product_id: string;
    proposed_price: number;
    effective_date: string;
    reason?: string;
}) =>
    supplierFetch<{ message: string; id: string; change_percent: number }>("/api/supplier-portal/catalog/price-update", {
        method: "POST",
        body: JSON.stringify(data),
    });

export const getPriceUpdates = (status?: string) => {
    const params = status ? `?status=${status}` : "";
    return supplierFetch<PriceUpdate[]>(`/api/supplier-portal/catalog/price-updates${params}`);
};

// ─── Invoice Types ──────────────────────────────────────

export interface InvoiceLineItemT {
    id: string;
    description: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    tax_rate: number | null;
    po_quantity: number | null;
    po_unit_price: number | null;
    quantity_match: boolean | null;
    price_match: boolean | null;
}

export interface SupplierInvoiceT {
    id: string;
    invoice_number: string;
    po_id: string;
    po_number: string | null;
    status: string;
    invoice_date: string | null;
    due_date: string | null;
    subtotal: number;
    tax_amount: number;
    total_amount: number;
    currency: string;
    notes: string | null;
    match_status: string | null;
    match_notes: string | null;
    review_notes: string | null;
    submitted_at: string | null;
    approved_at: string | null;
    paid_at: string | null;
    created_at: string | null;
    line_items: InvoiceLineItemT[];
}

// ─── Invoice APIs ───────────────────────────────────────

export const createInvoice = (data: {
    po_id: string;
    invoice_date: string;
    due_date?: string;
    tax_rate?: number;
    notes?: string;
    items: { po_line_item_id: string; description: string; quantity: number; unit_price: number }[];
}) =>
    supplierFetch<{ message: string; invoice_id: string; invoice_number: string; match_status: string; match_notes: string | null }>("/api/supplier-portal/invoices", {
        method: "POST",
        body: JSON.stringify(data),
    });

export const getInvoices = (status?: string) => {
    const params = status ? `?status=${status}` : "";
    return supplierFetch<SupplierInvoiceT[]>(`/api/supplier-portal/invoices${params}`);
};

export const getInvoice = (id: string) =>
    supplierFetch<SupplierInvoiceT>(`/api/supplier-portal/invoices/${id}`);

export const submitInvoice = (id: string) =>
    supplierFetch<{ message: string; status: string }>(`/api/supplier-portal/invoices/${id}/submit`, {
        method: "POST",
    });

export const downloadInvoicePdf = async (id: string, filename: string = "invoice.pdf") => {
    const token = localStorage.getItem("supplier_token");
    const res = await fetch(`${API_BASE}/api/supplier-portal/invoices/${id}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to download invoice PDF");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
};
