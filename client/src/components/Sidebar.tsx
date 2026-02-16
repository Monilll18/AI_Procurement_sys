"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
    LayoutDashboard,
    Package,
    Truck,
    ClipboardList,
    FileText,
    ShoppingCart,
    BarChart3,
    Settings,
    Brain,
    Menu,
    ChevronLeft,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { UserButton, useUser } from "@clerk/nextjs";
import { useRBAC } from "@/lib/rbac";

const ROLE_LABELS: Record<string, string> = {
    admin: "Admin",
    manager: "Manager",
    procurement_officer: "Officer",
    approver: "Finance",
    viewer: "Viewer",
};

const ROLE_COLORS: Record<string, string> = {
    admin: "bg-red-500/15 text-red-400 border border-red-500/30",
    manager: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
    procurement_officer: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
    approver: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
    viewer: "bg-zinc-500/15 text-zinc-400 border border-zinc-500/30",
};

const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, perm: "view_dashboard" },
    { href: "/products", label: "Products", icon: Package, perm: "view_products" },
    { href: "/suppliers", label: "Suppliers", icon: Truck, perm: "view_suppliers" },
    { href: "/inventory", label: "Inventory", icon: ClipboardList, perm: "view_inventory" },
    { href: "/requisitions", label: "Requests", icon: FileText, perm: "view_requisitions" },
    { href: "/approvals", label: "Approvals", icon: FileText, perm: "view_approvals" },
    { href: "/purchase-orders", label: "Orders", icon: ShoppingCart, perm: "view_purchase_orders" },
    { href: "/ai-insights", label: "AI Insights", icon: Brain, perm: "view_ai_insights" },
    { href: "/analytics", label: "Analytics", icon: BarChart3, perm: "view_analytics" },
    { href: "/settings", label: "Settings", icon: Settings, perm: "view_settings" },
];

export function Sidebar() {
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(false);
    const { user } = useUser();
    const { role, can } = useRBAC();

    // Filter nav items based on the user's permissions
    const visibleItems = navItems.filter((item) => can(item.perm));

    return (
        <aside
            className={cn(
                "flex flex-col border-r border-border bg-card text-card-foreground transition-all duration-300 relative z-40",
                collapsed ? "w-20" : "w-64"
            )}
        >
            {/* Sidebar Header */}
            <div className="flex h-16 items-center justify-between px-4 border-b border-border/50">
                {!collapsed && (
                    <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold shadow-lg shadow-primary/20">
                            AI
                        </div>
                        <span className="font-bold text-lg tracking-tight">ProcureAI</span>
                    </div>
                )}
                <Button
                    variant="ghost"
                    size="icon"
                    className={cn("text-muted-foreground hover:bg-secondary", collapsed && "mx-auto")}
                    onClick={() => setCollapsed(!collapsed)}
                >
                    {collapsed ? <Menu className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
                </Button>
            </div>

            {/* Navigation Links */}
            <nav className="flex-1 space-y-1 p-3 overflow-y-auto py-6">
                {visibleItems.map((item) => {
                    const isActive = pathname.startsWith(item.href);
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 group relative overflow-hidden",
                                isActive
                                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                                collapsed && "justify-center px-2"
                            )}
                        >
                            <item.icon className={cn("h-5 w-5 shrink-0", isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-primary")} />
                            {!collapsed && <span>{item.label}</span>}
                        </Link>
                    );
                })}
            </nav>

            {/* User Section — Clerk UserButton + Role Badge */}
            <div className="p-4 border-t border-border/50 bg-secondary/10">
                <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
                    <UserButton
                        afterSignOutUrl="/"
                        appearance={{
                            elements: {
                                avatarBox: "h-10 w-10",
                            },
                        }}
                    />
                    {!collapsed && user && (
                        <div className="flex flex-col flex-1 overflow-hidden">
                            <span className="text-sm font-medium truncate">
                                {user.fullName || user.firstName || "User"}
                            </span>
                            <span className={cn(
                                "text-[10px] font-semibold px-1.5 py-0.5 rounded-md w-fit mt-0.5 uppercase tracking-wider",
                                ROLE_COLORS[role] || ROLE_COLORS.viewer
                            )}>
                                {ROLE_LABELS[role] || "Viewer"}
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </aside>
    );
}
