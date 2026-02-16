from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

from app.routers import (
    products, suppliers, inventory, purchase_orders, approvals,
    analytics, insights, supplier_prices, notifications, audit_logs, budgets,
    users, settings
)

load_dotenv()

app = FastAPI(
    title="ProcureAI API",
    description="AI-powered Procurement Management System API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — Allow frontend access
frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routers
app.include_router(products.router, prefix="/api/products", tags=["Products"])
app.include_router(suppliers.router, prefix="/api/suppliers", tags=["Suppliers"])
app.include_router(inventory.router, prefix="/api/inventory", tags=["Inventory"])
app.include_router(purchase_orders.router, prefix="/api/purchase-orders", tags=["Purchase Orders"])
app.include_router(approvals.router, prefix="/api/approvals", tags=["Approvals"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["Analytics"])
app.include_router(insights.router, prefix="/api/insights", tags=["AI Insights"])
app.include_router(supplier_prices.router, prefix="/api/supplier-prices", tags=["Supplier Prices"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["Notifications"])
app.include_router(audit_logs.router, prefix="/api/audit-logs", tags=["Audit Logs"])
app.include_router(budgets.router, prefix="/api/budgets", tags=["Budgets"])
app.include_router(users.router, prefix="/api/users", tags=["Users"])
app.include_router(settings.router, prefix="/api/settings", tags=["Settings"])


@app.get("/", tags=["Health"])
async def health_check():
    return {
        "status": "healthy",
        "service": "ProcureAI API",
        "version": "1.0.0",
    }


@app.get("/api/health", tags=["Health"])
async def api_health():
    return {"status": "ok"}
