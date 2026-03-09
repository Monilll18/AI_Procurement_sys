"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useUser, useAuth } from "@clerk/nextjs";
import type { TeamMember } from "@/lib/api";

/**
 * RBAC (Role-Based Access Control) context for the frontend.
 *
 * How roles work:
 *   • admin              – Full access: manage users, settings, ALL data
 *   • manager            – Create/approve POs, analytics, manage suppliers
 *   • procurement_officer – Create POs, manage products, inventory
 *   • approver (finance) – View budgets, analytics, approve high-value POs
 *   • viewer             – Read-only access to dashboards and reports
 *
 * On first sign-in, the backend auto-assigns a role based on .env email mapping.
 * Admins can override roles anytime from the Settings page.
 */

// ─── Permission Map ─────────────────────────────────────────────────

const PERMISSIONS: Record<string, string[]> = {
    admin: [
        "view_dashboard", "view_products", "create_product", "edit_product", "delete_product",
        "view_suppliers", "create_supplier", "edit_supplier", "delete_supplier",
        "view_inventory", "adjust_stock",
        "view_purchase_orders", "create_po", "edit_po", "delete_po",
        "view_approvals", "approve_po", "reject_po", "approve_pr", "reject_pr",
        "view_analytics", "export_reports",
        "view_ai_insights",
        "view_requisitions", "create_requisition",
        "view_settings", "manage_users", "manage_settings",
        "view_notifications",
    ],
    manager: [
        "view_dashboard", "view_products", "create_product", "edit_product",
        "view_suppliers", "create_supplier", "edit_supplier",
        "view_inventory", "adjust_stock",
        "view_purchase_orders", "create_po", "edit_po",
        "view_approvals", "approve_pr", "reject_pr",
        "view_analytics", "export_reports",
        "view_ai_insights",
        "view_requisitions", "create_requisition",
        "view_notifications",
    ],
    procurement_officer: [
        "view_dashboard", "view_products", "create_product", "edit_product",
        "view_suppliers",
        "view_inventory", "adjust_stock",
        "view_purchase_orders", "create_po", "edit_po",
        "view_requisitions", "create_requisition",
        "view_notifications",
    ],
    approver: [
        "view_dashboard", "view_products",
        "view_suppliers",
        "view_inventory",
        "view_purchase_orders",
        "view_approvals", "approve_pr", "reject_pr",
        "view_analytics", "export_reports",
        "view_ai_insights",
        "view_notifications",
    ],
    viewer: [
        "view_dashboard", "view_products",
        "view_suppliers",
        "view_inventory",
        "view_purchase_orders",
        "view_analytics",
        "view_ai_insights",
        "view_notifications",
    ],
};

// ─── Context Type ───────────────────────────────────────────────────

interface RBACContextType {
    profile: TeamMember | null;
    role: string;
    loading: boolean;
    /** Check if user has a specific permission */
    can: (permission: string) => boolean;
    /** Check if user has ANY of the listed permissions */
    canAny: (...permissions: string[]) => boolean;
    /** Check if user role is one of the given roles */
    isRole: (...roles: string[]) => boolean;
}

const RBACContext = createContext<RBACContextType>({
    profile: null,
    role: "viewer",
    loading: true,
    can: () => false,
    canAny: () => false,
    isRole: () => false,
});

// ─── Provider ───────────────────────────────────────────────────────

export function RBACProvider({ children }: { children: React.ReactNode }) {
    const { user, isLoaded } = useUser();
    const { getToken } = useAuth();
    const [profile, setProfile] = useState<TeamMember | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!isLoaded || !user) {
            setLoading(false);
            return;
        }

        const fetchProfile = async () => {
            try {
                const token = await getToken();
                if (!token) { setLoading(false); return; }

                // Pass email & name so backend can auto-create on first login
                const email = user.primaryEmailAddress?.emailAddress || "";
                const name = user.fullName || user.firstName || "User";
                const url = `/api/users/me?email=${encodeURIComponent(email)}&full_name=${encodeURIComponent(name)}`;

                const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
                const res = await fetch(`${API_BASE}${url}`, {
                    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                });

                if (res.ok) {
                    const data = await res.json();
                    console.log("[RBAC] Profile loaded:", data.email, "→ role:", data.role);
                    setProfile(data);
                } else {
                    const err = await res.text();
                    console.error("[RBAC] Profile fetch failed:", res.status, err);
                }
            } catch (err) {
                console.error("[RBAC] Network error fetching profile:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchProfile();
    }, [isLoaded, user]);

    const role = profile?.role || "viewer";
    const perms = PERMISSIONS[role] || PERMISSIONS.viewer;

    const can = (permission: string) => perms.includes(permission);
    const canAny = (...permissions: string[]) => permissions.some((p) => perms.includes(p));
    const isRole = (...roles: string[]) => roles.includes(role);

    return (
        <RBACContext.Provider value={{ profile, role, loading, can, canAny, isRole }}>
            {children}
        </RBACContext.Provider>
    );
}

// ─── Hook ───────────────────────────────────────────────────────────

export function useRBAC() {
    return useContext(RBACContext);
}
