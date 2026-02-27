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
    product_name?: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    quantity_received?: number;
}

export interface PurchaseOrder {
    id: string;
    po_number: string;
    supplier_id: string;
    created_by: string;
    status: "draft" | "pending_approval" | "approved" | "sent" | "partially_received" | "received" | "cancelled";
    total_amount: number;
    expected_delivery: string | null;
    notes: string | null;
    sent_at: string | null;
    created_at: string;
    updated_at: string | null;
    line_items: POLineItem[];
    supplier_name: string | null;
    supplier_email: string | null;
}

// ─── API Functions ───────────────────────────────────────────────────

// Products
export const getProducts = (category?: string) => {
    const params = category ? `?category=${category}` : "";
    return apiFetch<Product[]>(`/api/products/${params}`);
};

// Supplier Catalog — products a specific supplier sells
export interface SupplierCatalogItem {
    id: string;
    product_id: string;
    product_name: string;
    sku: string | null;
    category: string | null;
    unit_price: number;
    currency: string;
    min_order_qty: number | null;
    available_quantity: number | null;
    lead_time_days: number | null;
}

export const getSupplierCatalog = (supplierId: string) =>
    apiFetch<SupplierCatalogItem[]>(`/api/purchase-orders/supplier-catalog/${supplierId}`);

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

export interface PortalCredentials {
    email: string;
    temp_password: string;
    portal_url: string;
    email_sent: boolean;
}

export const createSupplier = (data: Partial<Supplier> & { send_portal_invite?: boolean }, token: string) =>
    apiFetch<Supplier & { portal_credentials?: PortalCredentials }>("/api/suppliers/", { method: "POST", body: JSON.stringify(data) }, token);

export const deleteSupplier = (id: string, token: string) =>
    apiFetch<null>(`/api/suppliers/${id}`, { method: "DELETE" }, token);

export const resendSupplierInvite = (supplierId: string, token: string) =>
    apiFetch<{ message: string; portal_credentials: PortalCredentials }>(`/api/suppliers/${supplierId}/invite`, { method: "POST" }, token);

// Inventory
export const getInventory = () => apiFetch<InventoryItem[]>("/api/inventory/");
export const getLowStockAlerts = () => apiFetch<InventoryItem[]>("/api/inventory/alerts");
export const getStockMovements = (productId?: string) =>
    apiFetch<any[]>(`/api/inventory/movements${productId ? `?product_id=${productId}` : ""}`);
export const adjustStock = (data: {
    product_id: string;
    quantity: number;
    type?: string;
    notes?: string;
}, token: string) =>
    apiFetch<any>("/api/inventory/adjust", { method: "POST", body: JSON.stringify(data) }, token);

// Purchase Orders
export const getPurchaseOrders = (status?: string) => {
    const params = status ? `?status=${status}` : "";
    return apiFetch<PurchaseOrder[]>(`/api/purchase-orders/${params}`);
};

export const createPurchaseOrder = (data: any, token: string) =>
    apiFetch<PurchaseOrder>("/api/purchase-orders/", { method: "POST", body: JSON.stringify(data) }, token);

export const submitPO = (poId: string, token: string) =>
    apiFetch<PurchaseOrder>(`/api/purchase-orders/${poId}/submit`, { method: "POST" }, token);

export const receiveGoods = (poId: string, data: {
    items: Array<{
        line_item_id: string;
        quantity_received: number;
        condition?: string;
        storage_location?: string;
    }>;
    notes?: string;
}, token: string) =>
    apiFetch<any>(`/api/purchase-orders/${poId}/receive`, { method: "POST", body: JSON.stringify(data) }, token);

export const downloadPoPdf = (poId: string) => {
    window.open(`${API_BASE}/api/purchase-orders/${poId}/pdf`, "_blank");
};

export const sendPOToSupplier = (poId: string, token: string) =>
    apiFetch<{ message: string; sent_to: string; sent_at: string; po_status: string }>(
        `/api/purchase-orders/${poId}/send`, { method: "POST" }, token
    );

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
    type: "reorder" | "spend_anomaly" | "supplier_risk" | "price_anomaly";
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

// ─── Supplier Price Updates (Buyer Review) ──────────────────────────

export interface PriceUpdateItem {
    id: string;
    supplier_id: string;
    supplier_name: string;
    product_id: string;
    product_name: string;
    current_price: number;
    proposed_price: number;
    change_percent: number;
    reason: string | null;
    effective_date: string;
    status: "pending" | "approved" | "rejected";
    review_notes: string | null;
    reviewed_at: string | null;
    created_at: string | null;
}

export const getPriceUpdates = (status?: string, token?: string) => {
    const params = status ? `?status=${status}` : "";
    return apiFetch<PriceUpdateItem[]>(`/api/supplier-prices/price-updates${params}`, {}, token);
};

export const approvePriceUpdate = (updateId: string, reviewNotes?: string, token?: string) =>
    apiFetch<{ message: string }>(
        `/api/supplier-prices/price-updates/${updateId}/approve${reviewNotes ? `?review_notes=${encodeURIComponent(reviewNotes)}` : ""}`,
        { method: "POST" },
        token,
    );

export const rejectPriceUpdate = (updateId: string, reviewNotes?: string, token?: string) =>
    apiFetch<{ message: string }>(
        `/api/supplier-prices/price-updates/${updateId}/reject${reviewNotes ? `?review_notes=${encodeURIComponent(reviewNotes)}` : ""}`,
        { method: "POST" },
        token,
    );

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


// ─── Company Config ─────────────────────────────────────────

export interface CompanyConfig {
    id: number;
    company_name: string;
    industry: string;
    company_size: string;
    base_currency: string;
    fiscal_year_start: number;
    tax_id?: string;
    address?: string;
    logo_url?: string;
    setup_completed: boolean;
    setup_step: number;
    expiry_tracking: boolean;
    batch_tracking: boolean;
    serial_tracking: boolean;
}

export interface IndustryOption {
    id: string;
    name: string;
    description: string;
}

export const getCompanyConfig = () =>
    apiFetch<CompanyConfig>("/api/company/");

export const updateCompanyConfig = (data: Partial<CompanyConfig>) =>
    apiFetch<CompanyConfig>("/api/company/", { method: "PUT", body: JSON.stringify(data) });

export const getIndustries = () =>
    apiFetch<{ industries: IndustryOption[] }>("/api/company/industries");

export const getIndustryTemplate = (industry: string) =>
    apiFetch<{ industry: string; categories: any[] }>(`/api/company/templates/${industry}`);

export const applyIndustryTemplate = (industry: string) =>
    apiFetch<{ message: string; categories_created: number }>(`/api/company/apply-template/${industry}`, { method: "POST" });


// ─── Categories ─────────────────────────────────────────────

export interface Category {
    id: string;
    name: string;
    slug: string;
    description?: string;
    icon?: string;
    parent_id?: string;
    sort_order: number;
    is_active: boolean;
    industry_template?: string;
    children: Category[];
}

export const getCategories = () =>
    apiFetch<Category[]>("/api/categories/");

export const getCategoryTree = () =>
    apiFetch<Category[]>("/api/categories/tree");

export const createCategory = (data: Partial<Category>) =>
    apiFetch<Category>("/api/categories/", { method: "POST", body: JSON.stringify(data) });

export const updateCategory = (id: string, data: Partial<Category>) =>
    apiFetch<Category>(`/api/categories/${id}`, { method: "PATCH", body: JSON.stringify(data) });

export const deleteCategory = (id: string) =>
    apiFetch<{ message: string }>(`/api/categories/${id}`, { method: "DELETE" });


// ─── Departments ────────────────────────────────────────────

export interface DepartmentData {
    id: string;
    name: string;
    code?: string;
    description?: string;
    annual_budget: number;
    monthly_budget: number;
    manager_id?: string;
    is_active: boolean;
}

export const getDepartments = () =>
    apiFetch<DepartmentData[]>("/api/departments/");

export const createDepartment = (data: Partial<DepartmentData>) =>
    apiFetch<DepartmentData>("/api/departments/", { method: "POST", body: JSON.stringify(data) });

export const updateDepartment = (id: string, data: Partial<DepartmentData>) =>
    apiFetch<DepartmentData>(`/api/departments/${id}`, { method: "PATCH", body: JSON.stringify(data) });

export const deleteDepartment = (id: string) =>
    apiFetch<{ message: string }>(`/api/departments/${id}`, { method: "DELETE" });


// ─── Approval Rules ─────────────────────────────────────────

export interface ApprovalRuleData {
    id: string;
    name: string;
    description?: string;
    rule_type: string;
    priority: number;
    min_amount?: number;
    max_amount?: number;
    category_name?: string;
    urgency_level?: string;
    approver_role: string;
    approval_flow: string;
    sla_hours: number;
    auto_approve: boolean;
    escalate_after_hours?: number;
    is_active: boolean;
}

export const getApprovalRules = () =>
    apiFetch<ApprovalRuleData[]>("/api/approval-rules/");

export const createApprovalRule = (data: Partial<ApprovalRuleData>) =>
    apiFetch<ApprovalRuleData>("/api/approval-rules/", { method: "POST", body: JSON.stringify(data) });

export const updateApprovalRule = (id: string, data: Partial<ApprovalRuleData>) =>
    apiFetch<ApprovalRuleData>(`/api/approval-rules/${id}`, { method: "PATCH", body: JSON.stringify(data) });

export const deleteApprovalRule = (id: string) =>
    apiFetch<{ message: string }>(`/api/approval-rules/${id}`, { method: "DELETE" });

export const evaluateApprovalRules = (amount: number, category?: string, urgency?: string) =>
    apiFetch<{ required_approvers: any[] }>(`/api/approval-rules/evaluate?amount=${amount}${category ? `&category=${category}` : ''}${urgency ? `&urgency=${urgency}` : ''}`
        , { method: "POST" });


// ─── Purchase Requisitions ──────────────────────────────────

export interface PRLineItem {
    id?: string;
    product_id?: string;
    item_name: string;
    item_description?: string;
    quantity: number;
    estimated_unit_price: number;
    estimated_total?: number;
    unit: string;
}

export interface PurchaseRequisition {
    id: string;
    pr_number: string;
    title: string;
    description?: string;
    requested_by: string;
    department?: string;
    category?: string;
    priority: string;
    status: string;
    estimated_total: number;
    budget_code?: string;
    preferred_supplier_id?: string;
    needed_by?: string;
    submitted_at?: string;
    approved_at?: string;
    rejected_at?: string;
    approved_by?: string;
    rejection_reason?: string;
    po_id?: string;
    ai_suggested_supplier: boolean;
    ai_suggested_quantity: boolean;
    notes?: string;
    justification?: string;
    created_at?: string;
    line_items: PRLineItem[];
}

export const getRequisitions = (status?: string, priority?: string) => {
    let url = "/api/requisitions/";
    const params: string[] = [];
    if (status) params.push(`status=${status}`);
    if (priority) params.push(`priority=${priority}`);
    if (params.length) url += `?${params.join("&")}`;
    return apiFetch<PurchaseRequisition[]>(url);
};

export const getRequisition = (id: string) =>
    apiFetch<PurchaseRequisition>(`/api/requisitions/${id}`);

export const createRequisition = (data: any, token?: string | null) =>
    apiFetch<PurchaseRequisition>("/api/requisitions/", { method: "POST", body: JSON.stringify(data) }, token);

export const updateRequisition = (id: string, data: any, token?: string | null) =>
    apiFetch<PurchaseRequisition>(`/api/requisitions/${id}`, { method: "PATCH", body: JSON.stringify(data) }, token);

export const submitRequisition = (id: string, token?: string | null) =>
    apiFetch<{ message: string }>(`/api/requisitions/${id}/submit`, { method: "POST" }, token);

export const approveRequisition = (id: string, token?: string | null) =>
    apiFetch<{ message: string }>(`/api/requisitions/${id}/approve`, { method: "POST" }, token);

export const rejectRequisition = (id: string, reason?: string, token?: string | null) =>
    apiFetch<{ message: string }>(`/api/requisitions/${id}/reject?reason=${encodeURIComponent(reason || '')}`, { method: "POST" }, token);

export const convertPRtoPO = (id: string, token?: string | null) =>
    apiFetch<{ message: string; po_id: string; po_number: string }>(`/api/requisitions/${id}/convert-to-po`, { method: "POST" }, token);

export const getRequisitionStats = () =>
    apiFetch<{ total: number; by_status: Record<string, number>; pending_review: number }>("/api/requisitions/stats/summary");

// ─── AI / LLM ───────────────────────────────────────────────────

export interface AIParsedRequest {
    title: string;
    department: string | null;
    urgency: string;
    purpose: string;
    items: {
        item_name: string;
        matched_sku: string | null;
        matched_product_id: string | null;
        quantity: number;
        unit: string;
        estimated_unit_price: number;
        reason: string;
    }[];
    needed_by_days: number | null;
    ai_notes: string;
}

export interface AIChatResponse {
    answer: string;
    intent: string;
    success: boolean;
    usage?: { total_tokens: number };
}

export interface AIHealthResponse {
    llm_configured: boolean;
    llm_provider: string;
    model: string;
    endpoints: string[];
}

export const aiParseRequest = (userInput: string, includeStock = true) =>
    apiFetch<{ parsed: AIParsedRequest; raw_response?: string; usage?: any }>("/api/ai/parse-request", {
        method: "POST",
        body: JSON.stringify({ user_input: userInput, include_stock: includeStock }),
    });

export const aiChat = (question: string, userName?: string, userRole?: string) =>
    apiFetch<AIChatResponse>("/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({ question, user_name: userName, user_role: userRole }),
    });

export const aiExplainSupplier = (productName: string, quantity: number, supplierScores: any[], urgency = "medium") =>
    apiFetch<{ explanation: string; usage?: any }>("/api/ai/explain-supplier", {
        method: "POST",
        body: JSON.stringify({ product_name: productName, quantity, supplier_scores: supplierScores, urgency }),
    });

export const aiParseEmail = (emailText: string) =>
    apiFetch<{ parsed: any; usage?: any }>("/api/ai/parse-email", {
        method: "POST",
        body: JSON.stringify({ email_text: emailText }),
    });

export const aiParsePriceSheet = (rawText: string) =>
    apiFetch<{ parsed: any; usage?: any }>("/api/ai/parse-price-sheet", {
        method: "POST",
        body: JSON.stringify({ raw_text: rawText }),
    });

export const aiHealth = () => apiFetch<AIHealthResponse>("/api/ai/health");

// ─── ML Endpoints ───────────────────────────────────────

export interface SupplierScore {
    supplier_id: string;
    supplier_name: string;
    total_score: number;
    rank?: number;
    breakdown: {
        price: { score: number; weight: number; weighted: number };
        delivery: { score: number; weight: number; weighted: number };
        quality: { score: number; weight: number; weighted: number };
        response: { score: number; weight: number; weighted: number };
    };
    metadata: Record<string, any>;
}

export interface PriceAnomalyResult {
    is_anomaly: boolean;
    confidence: number;
    reason: string;
    new_price: number;
    historical_avg: number;
    deviation_pct: number;
    product_name?: string;
}

export const aiScoreSupplier = (supplierId: string, productId?: string) =>
    apiFetch<SupplierScore>(`/api/ai/score-supplier/${supplierId}${productId ? `?product_id=${productId}` : ""}`);

export const aiRankSuppliers = (productId: string, limit = 5) =>
    apiFetch<SupplierScore[]>(`/api/ai/rank-suppliers/${productId}?limit=${limit}`);

export const aiCheckPrice = (productId: string, newPrice: number) =>
    apiFetch<PriceAnomalyResult>("/api/ai/check-price", {
        method: "POST",
        body: JSON.stringify({ product_id: productId, new_price: newPrice }),
    });

export const aiGetPriceAnomalies = () =>
    apiFetch<PriceAnomalyResult[]>("/api/ai/price-anomalies");

export const aiFraudScan = () =>
    apiFetch<any[]>("/api/ai/fraud-scan");

// ─── New AI Endpoints ────────────────────────────────────

export interface PODraft {
    email_subject: string;
    email_body: string;
    po_document: string;
    special_notes: string[];
    estimated_delivery_note: string;
}

export interface InvoiceMatch {
    invoice_extracted: {
        invoice_number: string | null;
        invoice_date: string | null;
        supplier_name: string | null;
        total_amount: number | null;
        line_items: Array<{ description: string; quantity: number; unit_price: number; total: number }>;
        payment_terms: string | null;
        due_date: string | null;
    };
    match_result: "approved" | "discrepancy" | "rejected";
    match_score: number;
    discrepancies: Array<{
        type: string;
        description: string;
        po_value: string;
        invoice_value: string;
        financial_impact: number;
    }>;
    recommended_action: string;
    action_reason: string;
    total_dispute_amount: number;
}

export interface ProductForecast {
    product_id: string;
    product_name: string;
    sku: string;
    unit: string;
    avg_monthly_qty: number;
    next_month_forecast: number;
    reorder_point: number;
    reorder_quantity: number;
    order_frequency: number;
    urgency: "critical" | "high" | "normal";
}

export const aiGeneratePO = (data: {
    po_number: string;
    total_amount: number;
    supplier_id: string;
    line_items: Array<{ product_name: string; quantity: number; unit: string; unit_price: number; total_price: number }>;
    required_by?: string;
    payment_terms?: string;
    purpose?: string;
}) =>
    apiFetch<{ draft: PODraft; usage?: any }>("/api/ai/generate-po", {
        method: "POST",
        body: JSON.stringify(data),
    });

export const aiMatchInvoice = (data: {
    invoice_text: string;
    po_id?: string;
    po_number?: string;
    po_total?: number;
    po_supplier_name?: string;
    po_line_items?: any[];
    received_items?: any[];
}) =>
    apiFetch<{ match: InvoiceMatch; usage?: any }>("/api/ai/match-invoice", {
        method: "POST",
        body: JSON.stringify(data),
    });

export const aiGetProductForecast = () =>
    apiFetch<ProductForecast[]>("/api/insights/forecast/products");

// ─── Supplier Simulator ─────────────────────────────────────

export interface SupplierResponseData {
    id: string;
    response_type: "accepted" | "rejected" | "counter_offer" | "partial_fulfillment";
    message: string;
    counter_price: number | null;
    original_price: number | null;
    available_quantity: number | null;
    ordered_quantity: number | null;
    responded_at: string | null;
}

export interface SimulatorPO {
    id: string;
    po_number: string;
    supplier_name: string;
    supplier_email: string | null;
    total_amount: number;
    status: string;
    sent_at: string | null;
    line_items: Array<{
        id: string;
        product_name: string;
        quantity: number;
        unit_price: number;
        total_price: number;
    }>;
    responses: SupplierResponseData[];
}

export const getSimulatorSentPOs = () =>
    apiFetch<SimulatorPO[]>("/api/simulator/sent-pos");

export const simulateAccept = (poId: string) =>
    apiFetch<{ message: string; response_type: string }>(`/api/simulator/accept/${poId}`, { method: "POST" });

export const simulateReject = (poId: string) =>
    apiFetch<{ message: string; response_type: string }>(`/api/simulator/reject/${poId}`, { method: "POST" });

export const simulateCounter = (poId: string, data?: { price_increase_percent?: number; reason?: string }) =>
    apiFetch<{ message: string; response_type: string; original_price: number; counter_price: number; increase_percent: number }>(
        `/api/simulator/counter/${poId}`, { method: "POST", body: JSON.stringify(data || {}) }
    );

export const simulatePartial = (poId: string, data?: { fulfillment_percent?: number; reason?: string }) =>
    apiFetch<{ message: string; response_type: string; ordered_quantity: number; available_quantity: number; fulfillment_percent: number }>(
        `/api/simulator/partial/${poId}`, { method: "POST", body: JSON.stringify(data || {}) }
    );
