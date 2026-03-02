"use client";

import { useEffect, useState, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
    LayoutDashboard, ShoppingCart, Truck, DollarSign, FileText,
    Settings, LogOut, Menu, ChevronLeft, Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    getStoredSupplierUser, clearSupplierSession,
    type SupplierAuthUser,
} from "@/lib/supplier-api";

const portalNav = [
    { href: "/supplier-portal/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/supplier-portal/purchase-orders", label: "Purchase Orders", icon: ShoppingCart },
    { href: "/supplier-portal/shipments", label: "Shipments", icon: Truck },
    { href: "/supplier-portal/catalog", label: "Catalog & Pricing", icon: DollarSign },
    { href: "/supplier-portal/invoices", label: "Invoices", icon: FileText },
];

export default function SupplierPortalLayout({ children }: { children: ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [user, setUser] = useState<SupplierAuthUser | null>(null);
    const [collapsed, setCollapsed] = useState(false);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        // Allow login and activate pages without auth
        const isPublicPage =
            pathname.includes("/login") || pathname.includes("/activate") || pathname.includes("/reset-password");

        const stored = getStoredSupplierUser();
        if (!stored && !isPublicPage) {
            router.replace("/supplier-portal/login");
            return;
        }
        setUser(stored);
        setReady(true);
    }, [pathname, router]);

    // Public pages (login, activate) skip the sidebar layout
    const isPublicPage =
        pathname.includes("/login") || pathname.includes("/activate") || pathname.includes("/reset-password");

    if (isPublicPage) {
        return <>{children}</>;
    }

    if (!ready) return null;

    const handleLogout = () => {
        clearSupplierSession();
        router.replace("/supplier-portal/login");
    };

    return (
        <div className="flex h-screen bg-background">
            {/* Sidebar */}
            <aside
                className={cn(
                    "flex flex-col border-r border-border bg-card transition-all duration-300 relative z-40",
                    collapsed ? "w-20" : "w-64"
                )}
            >
                {/* Header */}
                <div className="flex h-16 items-center justify-between px-4 border-b border-border/50">
                    {!collapsed && (
                        <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-lg bg-violet-600 flex items-center justify-center text-white font-bold shadow-lg shadow-violet-500/20">
                                SP
                            </div>
                            <span className="font-bold text-lg tracking-tight">Supplier Portal</span>
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

                {/* Nav */}
                <nav className="flex-1 space-y-1 p-3 overflow-y-auto py-6">
                    {portalNav.map((item) => {
                        const isActive = pathname.startsWith(item.href);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 group",
                                    isActive
                                        ? "bg-violet-600 text-white shadow-md shadow-violet-500/25"
                                        : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                                    collapsed && "justify-center px-2"
                                )}
                            >
                                <item.icon className={cn("h-5 w-5 shrink-0", isActive ? "text-white" : "text-muted-foreground group-hover:text-violet-500")} />
                                {!collapsed && <span>{item.label}</span>}
                            </Link>
                        );
                    })}
                </nav>

                {/* User Section */}
                <div className="p-4 border-t border-border/50">
                    <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
                        <div className="h-10 w-10 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-violet-600 font-bold text-sm shrink-0">
                            {user?.full_name?.[0] || user?.email?.[0] || "S"}
                        </div>
                        {!collapsed && user && (
                            <div className="flex flex-col flex-1 overflow-hidden">
                                <span className="text-sm font-medium truncate">{user.full_name || user.email}</span>
                                <span className="text-xs text-muted-foreground truncate">{user.supplier_name}</span>
                            </div>
                        )}
                        {!collapsed && (
                            <Button variant="ghost" size="icon" onClick={handleLogout} className="text-muted-foreground hover:text-red-500">
                                <LogOut className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto">
                <div className="p-6 max-w-7xl mx-auto">
                    {children}
                </div>
            </main>
        </div>
    );
}
