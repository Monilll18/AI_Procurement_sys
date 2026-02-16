import type { Metadata } from "next";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { ThemeSelector } from "@/components/ThemeSelector";
import { DashboardShell } from "@/components/DashboardShell";

export const metadata: Metadata = {
    title: "Dashboard - AI Procurement SaaS",
    description: "Overview of your procurement operations",
};

export default function DashboardLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <DashboardShell>
            <div className="flex min-h-screen bg-muted/30 text-foreground">
                {/* Sidebar */}
                <Sidebar />

                {/* Main Content Area */}
                <div className="flex flex-1 flex-col overflow-hidden h-screen">
                    {/* Topbar */}
                    <Topbar />

                    {/* Page Content */}
                    <main className="flex-1 overflow-y-auto p-4 md:p-8 scrollbar-hide">
                        {children}
                    </main>

                    {/* Floating Theme Selector */}
                    <ThemeSelector />
                </div>
            </div>
        </DashboardShell>
    );
}
