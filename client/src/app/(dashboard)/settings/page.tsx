"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    Settings, Users, Shield, Bell, Database, UserPlus, Trash2, Edit, Save, Loader2,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUser, useAuth } from "@clerk/nextjs";
import {
    getTeamMembers, createTeamMember, updateTeamMember, deleteTeamMember,
    getAvailableRoles, getSystemSettings, updateSystemSettings,
    type TeamMember, type SystemSettings as SystemSettingsType,
} from "@/lib/api";

// Fallback role info for display
const ROLE_DISPLAY: Record<string, { label: string; color: string }> = {
    admin: { label: "Admin", color: "bg-red-100 text-red-700" },
    manager: { label: "Procurement Manager", color: "bg-purple-100 text-purple-700" },
    procurement_officer: { label: "Procurement Officer", color: "bg-blue-100 text-blue-700" },
    approver: { label: "Finance / Approver", color: "bg-green-100 text-green-700" },
    viewer: { label: "Viewer", color: "bg-gray-100 text-gray-700" },
};

export default function SettingsPage() {
    const { user } = useUser();
    const { getToken } = useAuth();
    const [team, setTeam] = useState<TeamMember[]>([]);
    const [roles, setRoles] = useState<Record<string, { label: string; description: string; permissions: string[] }>>({});
    const [loading, setLoading] = useState(true);
    const [addDialogOpen, setAddDialogOpen] = useState(false);
    const [editMember, setEditMember] = useState<TeamMember | null>(null);
    const [saving, setSaving] = useState(false);
    const [settingsSaving, setSettingsSaving] = useState(false);

    const [settings, setSettings] = useState<SystemSettingsType>({
        company_name: "ProcureAI Corp",
        currency: "USD",
        auto_approve_below: 1000,
        email_notifications: true,
        stock_alerts: true,
        approval_reminders: true,
        two_factor_auth: false,
    });

    const [form, setForm] = useState({
        full_name: "", email: "", role: "viewer", department: "", approval_limit: 0,
    });

    // Load team, roles, and settings from API
    useEffect(() => {
        const loadAll = async () => {
            setLoading(true);
            try {
                const [teamData, rolesData, settingsData] = await Promise.all([
                    getTeamMembers().catch(() => []),
                    getAvailableRoles().catch(() => ({})),
                    getSystemSettings().catch(() => settings),
                ]);
                setTeam(teamData);
                setRoles(rolesData);
                setSettings(settingsData);
            } catch (err) {
                console.error("Failed to load settings:", err);
            } finally {
                setLoading(false);
            }
        };
        loadAll();
    }, []);

    const openAdd = () => {
        setEditMember(null);
        setForm({ full_name: "", email: "", role: "viewer", department: "", approval_limit: 0 });
        setAddDialogOpen(true);
    };

    const openEdit = (member: TeamMember) => {
        setEditMember(member);
        setForm({
            full_name: member.full_name,
            email: member.email,
            role: member.role,
            department: member.department || "",
            approval_limit: member.approval_limit,
        });
        setAddDialogOpen(true);
    };

    const handleSaveMember = async () => {
        setSaving(true);
        try {
            const token = await getToken();
            if (editMember) {
                const updated = await updateTeamMember(editMember.id, form, token || "");
                setTeam(prev => prev.map(m => m.id === editMember.id ? updated : m));
            } else {
                const created = await createTeamMember(form, token || "");
                setTeam(prev => [...prev, created]);
            }
            setAddDialogOpen(false);
        } catch (err: any) {
            alert(err.message || "Failed to save member");
        } finally {
            setSaving(false);
        }
    };

    const handleRemoveMember = async (id: string) => {
        if (!confirm("Remove this team member?")) return;
        try {
            const token = await getToken();
            await deleteTeamMember(id, token || "");
            setTeam(prev => prev.filter(m => m.id !== id));
        } catch (err: any) {
            alert(err.message || "Failed to remove member");
        }
    };

    const handleSaveSettings = async () => {
        setSettingsSaving(true);
        try {
            const token = await getToken();
            const updated = await updateSystemSettings(settings, token || "");
            setSettings(updated);
        } catch (err: any) {
            alert(err.message || "Failed to save settings");
        } finally {
            setSettingsSaving(false);
        }
    };

    const getRoleInfo = (role: string) => ROLE_DISPLAY[role] || { label: role, color: "bg-gray-100 text-gray-700" };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                    <Settings className="h-8 w-8" /> Settings
                </h2>
                <p className="text-muted-foreground">Manage your system configuration, team roles, and preferences.</p>
            </div>

            <Tabs defaultValue="team" className="space-y-6">
                <TabsList className="grid grid-cols-4 w-full max-w-lg">
                    <TabsTrigger value="team"><Users className="mr-1 h-4 w-4" /> Team</TabsTrigger>
                    <TabsTrigger value="roles"><Shield className="mr-1 h-4 w-4" /> Roles</TabsTrigger>
                    <TabsTrigger value="notifications"><Bell className="mr-1 h-4 w-4" /> Alerts</TabsTrigger>
                    <TabsTrigger value="general"><Database className="mr-1 h-4 w-4" /> General</TabsTrigger>
                </TabsList>

                {/* ── Team Management ──────────────────────────── */}
                <TabsContent value="team" className="space-y-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle>Team Members ({team.length})</CardTitle>
                                <CardDescription>Manage who has access and their roles.</CardDescription>
                            </div>
                            <Button onClick={openAdd}>
                                <UserPlus className="mr-2 h-4 w-4" /> Add Member
                            </Button>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Email</TableHead>
                                        <TableHead>Role</TableHead>
                                        <TableHead>Department</TableHead>
                                        <TableHead>Approval Limit</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {team.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                                                No team members yet. Click &quot;Add Member&quot; to get started.
                                            </TableCell>
                                        </TableRow>
                                    ) : team.map((member) => {
                                        const role = getRoleInfo(member.role);
                                        return (
                                            <TableRow key={member.id} className="hover:bg-muted/50">
                                                <TableCell className="font-medium">{member.full_name}</TableCell>
                                                <TableCell className="text-muted-foreground text-sm">{member.email}</TableCell>
                                                <TableCell>
                                                    <Badge variant="secondary" className={`text-xs ${role.color}`}>
                                                        {role.label}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>{member.department || "—"}</TableCell>
                                                <TableCell>
                                                    {member.approval_limit > 0 ? `$${member.approval_limit.toLocaleString()}` : "—"}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className={member.is_active ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"}>
                                                        {member.is_active ? "Active" : "Inactive"}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end gap-1">
                                                        <Button variant="ghost" size="icon" onClick={() => openEdit(member)}>
                                                            <Edit className="h-4 w-4" />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" className="text-red-500" onClick={() => handleRemoveMember(member.id)}>
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ── Role Definitions ──────────────────────────── */}
                <TabsContent value="roles" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Role-Based Access Control (RBAC)</CardTitle>
                            <CardDescription>Each user is assigned a role that determines their access level.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {Object.entries(roles).length > 0 ? (
                                Object.entries(roles).map(([key, role]) => {
                                    const display = getRoleInfo(key);
                                    return (
                                        <div key={key} className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/30 transition-colors">
                                            <div className="flex items-center gap-4">
                                                <Badge variant="secondary" className={`${display.color} text-xs px-3 py-1`}>
                                                    {role.label}
                                                </Badge>
                                                <div>
                                                    <p className="text-sm font-medium">{role.description}</p>
                                                    <div className="flex gap-2 mt-1 flex-wrap">
                                                        {role.permissions.map((perm) => (
                                                            <Badge key={perm} variant="outline" className="text-[10px] h-5">
                                                                {perm}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                            <span className="text-xs text-muted-foreground">
                                                {team.filter(m => m.role === key).length} member(s)
                                            </span>
                                        </div>
                                    );
                                })
                            ) : (
                                <p className="text-center text-muted-foreground py-8">Loading roles...</p>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ── Notification Settings ──────────────────────────── */}
                <TabsContent value="notifications" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Notification Preferences</CardTitle>
                            <CardDescription>Control which notifications you receive.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-medium">Email Notifications</p>
                                    <p className="text-sm text-muted-foreground">Receive email alerts for important events</p>
                                </div>
                                <Switch checked={settings.email_notifications}
                                    onCheckedChange={(v) => setSettings({ ...settings, email_notifications: v })} />
                            </div>
                            <Separator />
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-medium">Low Stock Alerts</p>
                                    <p className="text-sm text-muted-foreground">Get notified when inventory drops below reorder point</p>
                                </div>
                                <Switch checked={settings.stock_alerts}
                                    onCheckedChange={(v) => setSettings({ ...settings, stock_alerts: v })} />
                            </div>
                            <Separator />
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-medium">Approval Reminders</p>
                                    <p className="text-sm text-muted-foreground">Remind approvers of pending purchase orders</p>
                                </div>
                                <Switch checked={settings.approval_reminders}
                                    onCheckedChange={(v) => setSettings({ ...settings, approval_reminders: v })} />
                            </div>
                            <Separator />
                            <Button onClick={handleSaveSettings} disabled={settingsSaving}>
                                {settingsSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                <Save className="mr-2 h-4 w-4" /> Save Preferences
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ── General Settings ──────────────────────────── */}
                <TabsContent value="general" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>General Configuration</CardTitle>
                            <CardDescription>System-wide settings for your procurement platform.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label>Company Name</Label>
                                    <Input value={settings.company_name}
                                        onChange={(e) => setSettings({ ...settings, company_name: e.target.value })} />
                                </div>
                                <div className="grid gap-2">
                                    <Label>Default Currency</Label>
                                    <Select value={settings.currency} onValueChange={(v) => setSettings({ ...settings, currency: v })}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="USD">USD ($)</SelectItem>
                                            <SelectItem value="EUR">EUR (€)</SelectItem>
                                            <SelectItem value="GBP">GBP (£)</SelectItem>
                                            <SelectItem value="INR">INR (₹)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <Separator />

                            <div className="grid gap-2">
                                <Label>Auto-Approve Threshold</Label>
                                <p className="text-sm text-muted-foreground">POs below this amount will be auto-approved.</p>
                                <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground">$</span>
                                    <Input type="number" className="w-40" value={settings.auto_approve_below}
                                        onChange={(e) => setSettings({ ...settings, auto_approve_below: parseInt(e.target.value) || 0 })} />
                                </div>
                            </div>

                            <Separator />

                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-medium">Two-Factor Authentication</p>
                                    <p className="text-sm text-muted-foreground">Require 2FA for all team members</p>
                                </div>
                                <Switch checked={settings.two_factor_auth}
                                    onCheckedChange={(v) => setSettings({ ...settings, two_factor_auth: v })} />
                            </div>

                            <Separator />

                            <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                                <div>
                                    <p className="font-medium">Logged in as</p>
                                    <p className="text-sm text-muted-foreground">{user?.primaryEmailAddress?.emailAddress || "Unknown"}</p>
                                </div>
                                <Badge variant="secondary" className="bg-red-100 text-red-700">Admin</Badge>
                            </div>

                            <Button className="w-full" onClick={handleSaveSettings} disabled={settingsSaving}>
                                {settingsSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                <Save className="mr-2 h-4 w-4" /> Save Settings
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Add/Edit Member Dialog */}
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>{editMember ? "Edit Team Member" : "Add Team Member"}</DialogTitle>
                        <DialogDescription>
                            {editMember ? "Update their role and permissions." : "Invite a new team member to the procurement system."}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label>Full Name</Label>
                            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="John Doe" />
                        </div>
                        <div className="grid gap-2">
                            <Label>Email</Label>
                            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                                placeholder="john@company.com" disabled={!!editMember} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label>Role</Label>
                                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(ROLE_DISPLAY).map(([key, r]) => (
                                            <SelectItem key={key} value={key}>{r.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <Label>Department</Label>
                                <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="Operations" />
                            </div>
                        </div>
                        <div className="grid gap-2">
                            <Label>Approval Limit ($)</Label>
                            <Input type="number" value={form.approval_limit}
                                onChange={(e) => setForm({ ...form, approval_limit: parseInt(e.target.value) || 0 })} />
                            <p className="text-xs text-muted-foreground">Maximum PO value this user can approve. Set to 0 for no approval authority.</p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSaveMember} disabled={saving || !form.full_name || !form.email}>
                            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {editMember ? "Save Changes" : "Add Member"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
