"use client";

import { useState, useEffect, useRef } from "react";
import { Bell, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModeToggle } from "@/components/ThemeToggle";
import { usePathname, useRouter } from "next/navigation";
import { getNotifications, getUnreadNotificationCount, markAllNotificationsRead, type Notification } from "@/lib/api";

export function Topbar() {
    const pathname = usePathname();
    const router = useRouter();
    const pageName = pathname?.split("/").pop()?.replace(/-/g, " ") || "Dashboard";

    const [notifOpen, setNotifOpen] = useState(false);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const popoverRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        getUnreadNotificationCount()
            .then((data) => setUnreadCount(data.count))
            .catch(() => setUnreadCount(0));
    }, []);

    const handleBellClick = async () => {
        if (!notifOpen) {
            try {
                const data = await getNotifications();
                setNotifications(data);
            } catch {
                setNotifications([]);
            }
        }
        setNotifOpen(!notifOpen);
    };

    const handleMarkAllRead = async () => {
        try {
            await markAllNotificationsRead();
            setUnreadCount(0);
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        } catch (err) {
            console.error(err);
        }
    };

    // Close popover when clicking outside
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                setNotifOpen(false);
            }
        };
        if (notifOpen) document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [notifOpen]);

    // Quick search navigation
    const searchRoutes = [
        { label: "Dashboard", path: "/dashboard" },
        { label: "Products", path: "/products" },
        { label: "Suppliers", path: "/suppliers" },
        { label: "Inventory", path: "/inventory" },
        { label: "Purchase Orders", path: "/purchase-orders" },
        { label: "Requisitions", path: "/requisitions" },
        { label: "Approvals", path: "/approvals" },
        { label: "Analytics", path: "/analytics" },
        { label: "AI Insights", path: "/ai-insights" },
        { label: "Settings", path: "/settings" },
    ];

    const filteredRoutes = searchQuery
        ? searchRoutes.filter(r => r.label.toLowerCase().includes(searchQuery.toLowerCase()))
        : [];

    return (
        <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-border/40 bg-background/80 backdrop-blur-md px-6 shadow-sm supports-[backdrop-filter]:bg-background/60">
            {/* Left: Page Title */}
            <div className="flex items-center gap-4">
                <h1 className="text-xl font-semibold text-foreground capitalize tracking-tight">{pageName}</h1>
            </div>

            {/* Right: Search + Actions */}
            <div className="flex items-center gap-3 md:gap-4">
                <div className="relative hidden w-64 md:block group">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input
                        type="search"
                        placeholder="Search pages..."
                        className="pl-9 h-9 bg-secondary/50 border-transparent focus:bg-background focus:border-primary/50 transition-all rounded-full"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onFocus={() => setSearchOpen(true)}
                        onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
                    />
                    {searchOpen && filteredRoutes.length > 0 && (
                        <div className="absolute top-full mt-1 left-0 right-0 bg-card border rounded-lg shadow-lg z-50 overflow-hidden">
                            {filteredRoutes.map((route) => (
                                <button
                                    key={route.path}
                                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted transition-colors flex items-center gap-2"
                                    onMouseDown={() => { router.push(route.path); setSearchQuery(""); }}
                                >
                                    {route.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {/* Notification Bell */}
                    <div className="relative" ref={popoverRef}>
                        <Button variant="ghost" size="icon" className="relative rounded-full hover:bg-secondary" onClick={handleBellClick}>
                            <Bell className="h-5 w-5 text-muted-foreground" />
                            {unreadCount > 0 && (
                                <span className="absolute top-1.5 right-1.5 h-4 w-4 rounded-full bg-destructive text-[10px] font-bold text-white flex items-center justify-center ring-2 ring-background">
                                    {unreadCount > 9 ? "9+" : unreadCount}
                                </span>
                            )}
                        </Button>

                        {/* Notifications Popover */}
                        {notifOpen && (
                            <div className="absolute right-0 top-full mt-2 w-80 bg-card border rounded-xl shadow-xl z-50 overflow-hidden">
                                <div className="flex items-center justify-between p-3 border-b">
                                    <h3 className="font-semibold text-sm">Notifications</h3>
                                    {notifications.length > 0 && (
                                        <Button variant="ghost" size="sm" className="text-xs h-7" onClick={handleMarkAllRead}>
                                            Mark all read
                                        </Button>
                                    )}
                                </div>
                                <div className="max-h-80 overflow-y-auto">
                                    {notifications.length === 0 ? (
                                        <div className="p-6 text-center text-sm text-muted-foreground">
                                            <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
                                            No notifications yet
                                        </div>
                                    ) : (
                                        notifications.slice(0, 10).map((n) => (
                                            <div
                                                key={n.id}
                                                className={`px-3 py-2.5 border-b last:border-0 hover:bg-muted/50 cursor-pointer transition-colors ${!n.is_read ? "bg-primary/5" : ""}`}
                                                onClick={() => { if (n.link) router.push(n.link); setNotifOpen(false); }}
                                            >
                                                <p className="text-sm font-medium">{n.title}</p>
                                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                                                <p className="text-[10px] text-muted-foreground mt-1">
                                                    {new Date(n.created_at).toLocaleString()}
                                                </p>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="w-px h-6 bg-border mx-1" />

                    <ModeToggle />
                </div>
            </div>
        </header>
    );
}
