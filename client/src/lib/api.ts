/**
 * Central API client — talks to the FastAPI backend.
 * Uses Clerk's session token for authenticated requests.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ─── Generic Fetch Wrapper ──────────────────────────────────────────

async function apiFetch<T>(
    endpoint: string,
    options: RequestInit = {},
    token?: string | null
): Promise<T> {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(options.headers as Record<string, string>),
    };

    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
    });

    if (!res.ok) {
        const error = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(error.detail || `API Error: ${res.status}`);
    }

    // Handle 204 No Content
    if (res.status === 204) return null as T;
    return res.json();
}

// ─── Types ───────────────────────────────────────────────────────────

export interface Product {
    id: string;
    sku: string;
    name: string;
    category: string;
    unit: string;
    reorder_point: number;
    reorder_quantity: number;
    created_at: string;
    updated_at: string | null;
}

export interface Supplier {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    rating: number;
    status: "active" | "inactive" | "blacklisted";
    created_at: string;
    updated_at: string | null;
}

export interface InventoryItem {
    id: string;
    product_id: string;
    current_stock: number;
    min_stock: number;
    max_stock: number;
    last_updated: string | null;
    product_name: string | null;
    product_sku: string | null;
}

export interface POLineItem {
    id: string;
    product_id: string;
    quantity: number;
    unit_price: number;
    total_price: number;
}

export interface PurchaseOrder {
    id: string;
    po_number: string;
    supplier_id: string;
    created_by: string;
    status: "draft" | "pending_approval" | "approved" | "sent" | "received" | "cancelled";
    total_amount: number;
    expected_delivery: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string | null;
    line_items: POLineItem[];
    supplier_name: string | null;
}

// ─── API Functions ───────────────────────────────────────────────────

// Products
export const getProducts = (category?: string) => {
    const params = category ? `?category=${category}` : "";
    return apiFetch<Product[]>(`/api/products/${params}`);
};

export const createProduct = (data: Partial<Product>, token: string) =>
    apiFetch<Product>("/api/products/", { method: "POST", body: JSON.stringify(data) }, token);

export const updateProduct = (id: string, data: Partial<Product>, token: string) =>
    apiFetch<Product>(`/api/products/${id}`, { method: "PATCH", body: JSON.stringify(data) }, token);

export const deleteProduct = (id: string, token: string) =>
    apiFetch<null>(`/api/products/${id}`, { method: "DELETE" }, token);

// Suppliers
export const getSuppliers = (status?: string) => {
    const params = status ? `?status=${status}` : "";
    return apiFetch<Supplier[]>(`/api/suppliers/${params}`);
};

export const createSupplier = (data: Partial<Supplier>, token: string) =>
    apiFetch<Supplier>("/api/suppliers/", { method: "POST", body: JSON.stringify(data) }, token);

// Inventory
export const getInventory = () => apiFetch<InventoryItem[]>("/api/inventory/");
export const getLowStockAlerts = () => apiFetch<InventoryItem[]>("/api/inventory/alerts");

// Purchase Orders
export const getPurchaseOrders = (status?: string) => {
    const params = status ? `?status=${status}` : "";
    return apiFetch<PurchaseOrder[]>(`/api/purchase-orders/${params}`);
};

export const createPurchaseOrder = (data: any, token: string) =>
    apiFetch<PurchaseOrder>("/api/purchase-orders/", { method: "POST", body: JSON.stringify(data) }, token);

// Approvals
export const approvePO = (poId: string, token: string) =>
    apiFetch<any>(`/api/approvals/${poId}/approve`, { method: "POST" }, token);

export const rejectPO = (poId: string, token: string) =>
    apiFetch<any>(`/api/approvals/${poId}/reject`, { method: "POST" }, token);

// Dashboard Stats
export interface DashboardStats {
    totalProducts: number;
    totalSuppliers: number;
    totalPOs: number;
    totalSpend: number;
    lowStockCount: number;
    pendingApprovals: number;
    recentOrders: PurchaseOrder[];
    inventoryAlerts: InventoryItem[];
}

export async function getDashboardStats(): Promise<DashboardStats> {
    const [products, suppliers, orders, inventory, alerts] = await Promise.all([
        getProducts(),
        getSuppliers(),
        getPurchaseOrders(),
        getInventory(),
        getLowStockAlerts(),
    ]);

    const totalSpend = orders.reduce((sum, po) => sum + po.total_amount, 0);
    const pendingApprovals = orders.filter((po) => po.status === "pending_approval").length;

    return {
        totalProducts: products.length,
        totalSuppliers: suppliers.length,
        totalPOs: orders.length,
        totalSpend,
        lowStockCount: alerts.length,
        pendingApprovals,
        recentOrders: orders.slice(0, 5),
        inventoryAlerts: alerts.slice(0, 5),
    };
}

// ─── Analytics ───────────────────────────────────────────────────────

export interface CategorySpend {
    name: string;
    value: number;
}

export interface SupplierPerformance {
    name: string;
    rating: number;
    orders: number;
    totalSpend: number;
}

export interface MonthlySpend {
    name: string;
    total: number;
    orders: number;
}

export interface AnalyticsSummary {
    totalSpend: number;
    avgOrderValue: number;
    activeSuppliers: number;
    monthlyOrders: number;
}

export const getSpendByCategory = () =>
    apiFetch<CategorySpend[]>("/api/analytics/spend-by-category");

export const getSupplierPerformance = () =>
    apiFetch<SupplierPerformance[]>("/api/analytics/supplier-performance");

export const getMonthlySpend = () =>
    apiFetch<MonthlySpend[]>("/api/analytics/monthly-spend");

export const getAnalyticsSummary = () =>
    apiFetch<AnalyticsSummary[]>("/api/analytics/summary");

// ─── AI Insights ─────────────────────────────────────────────────────

export interface Insight {
    type: "reorder" | "spend_anomaly" | "supplier_risk";
    severity: "critical" | "warning" | "info";
    title: string;
    description: string;
    impact: string;
    action: string;
    metadata: Record<string, any>;
}

export interface ForecastPoint {
    month: string;
    actual: number | null;
    predicted: number | null;
}

export const getInsights = () =>
    apiFetch<Insight[]>("/api/insights/");

export const getForecast = () =>
    apiFetch<ForecastPoint[]>("/api/insights/forecast");

// ─── Pending Approvals ───────────────────────────────────────────────

export const getPendingApprovals = () =>
    apiFetch<PurchaseOrder[]>("/api/purchase-orders/?status=pending_approval");

// ─── Notifications ───────────────────────────────────────────────────

export interface Notification {
    id: string;
    user_id: string;
    type: string;
    title: string;
    message: string;
    link: string | null;
    is_read: boolean;
    created_at: string;
}

export const getNotifications = () =>
    apiFetch<Notification[]>("/api/notifications/");

export const getUnreadNotificationCount = () =>
    apiFetch<{ count: number }>("/api/notifications/unread-count");

export const markNotificationRead = (id: string) =>
    apiFetch<null>(`/api/notifications/${id}/read`, { method: "PATCH" });

export const markAllNotificationsRead = () =>
    apiFetch<null>("/api/notifications/mark-all-read", { method: "PATCH" });

// ─── Budgets ─────────────────────────────────────────────────────────

export interface BudgetVsActual {
    category: string;
    department: string;
    allocated: number;
    actual_spend: number;
    utilization: number;
    period: string;
}

export const getBudgetVsActual = () =>
    apiFetch<BudgetVsActual[]>("/api/budgets/vs-actual");

// ─── Supplier Price Comparison ───────────────────────────────────────

export interface SupplierPriceComparison {
    supplier_id: string;
    supplier_name: string;
    unit_price: number;
    rating: number;
    value_score: number;
}

export const getSupplierPriceComparison = (productId: string) =>
    apiFetch<SupplierPriceComparison[]>(`/api/supplier-prices/compare/${productId}`);

// ─── Users / Team Management ─────────────────────────────────────────

export interface TeamMember {
    id: string;
    clerk_id?: string;
    email: string;
    full_name: string;
    role: string;
    department: string | null;
    approval_limit: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export const getTeamMembers = () =>
    apiFetch<TeamMember[]>("/api/users/");

export const getMyProfile = (token: string) =>
    apiFetch<TeamMember>("/api/users/me", {}, token);

export const createTeamMember = (data: Partial<TeamMember>, token: string) =>
    apiFetch<TeamMember>("/api/users/", { method: "POST", body: JSON.stringify(data) }, token);

export const updateTeamMember = (id: string, data: Partial<TeamMember>, token: string) =>
    apiFetch<TeamMember>(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }, token);

export const deleteTeamMember = (id: string, token: string) =>
    apiFetch<{ message: string }>(`/api/users/${id}`, { method: "DELETE" }, token);

export const getAvailableRoles = () =>
    apiFetch<Record<string, { label: string; description: string; permissions: string[] }>>("/api/users/roles/list");

// ─── System Settings ─────────────────────────────────────────────────

export interface SystemSettings {
    company_name: string;
    currency: string;
    auto_approve_below: number;
    email_notifications: boolean;
    stock_alerts: boolean;
    approval_reminders: boolean;
    two_factor_auth: boolean;
}

export const getSystemSettings = () =>
    apiFetch<SystemSettings>("/api/settings/");

export const updateSystemSettings = (data: Partial<SystemSettings>, token: string) =>
    apiFetch<SystemSettings>("/api/settings/", { method: "PUT", body: JSON.stringify(data) }, token);
