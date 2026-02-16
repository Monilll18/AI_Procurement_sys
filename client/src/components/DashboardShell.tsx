"use client";

import { RBACProvider } from "@/lib/rbac";

/**
 * Client-side wrapper for the dashboard layout.
 * Provides RBAC context to all dashboard pages.
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
    return <RBACProvider>{children}</RBACProvider>;
}
