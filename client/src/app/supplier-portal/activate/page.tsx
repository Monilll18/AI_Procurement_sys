"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck, Lock, CheckCircle } from "lucide-react";
import {
    supplierActivate, setSupplierToken, setStoredSupplierUser,
} from "@/lib/supplier-api";

export default function SupplierActivatePage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get("token") || "";
    const isChangePassword = searchParams.get("change") === "1";

    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);

    const handleActivate = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (newPassword.length < 8) {
            setError("Password must be at least 8 characters");
            return;
        }
        if (newPassword !== confirmPassword) {
            setError("Passwords do not match");
            return;
        }

        setLoading(true);
        try {
            const res = await supplierActivate(token, newPassword);
            setSupplierToken(res.access_token);
            setStoredSupplierUser(res.user);
            setSuccess(true);

            setTimeout(() => {
                router.push("/supplier-portal/dashboard");
            }, 1500);
        } catch (err: any) {
            setError(err.message || "Activation failed");
        } finally {
            setLoading(false);
        }
    };

    if (!token && !isChangePassword) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-950 via-gray-900 to-black p-4">
                <Card className="w-full max-w-md border-white/10 bg-white/5 backdrop-blur-xl">
                    <CardContent className="py-12 text-center">
                        <ShieldCheck className="h-12 w-12 mx-auto mb-4 text-violet-400 opacity-50" />
                        <p className="text-white font-semibold">No activation token found</p>
                        <p className="text-gray-400 text-sm mt-2">
                            Check your invitation email for the correct activation link.
                        </p>
                        <Button
                            variant="outline"
                            className="mt-4 border-white/10 text-gray-300 hover:bg-white/5"
                            onClick={() => router.push("/supplier-portal/login")}
                        >
                            Go to Login
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-950 via-gray-900 to-black p-4">
            <div className="w-full max-w-md space-y-6">
                <div className="text-center space-y-2">
                    <div className="mx-auto h-14 w-14 rounded-2xl bg-violet-600 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-violet-500/30">
                        SP
                    </div>
                    <h1 className="text-2xl font-bold text-white">
                        {isChangePassword ? "Set New Password" : "Activate Account"}
                    </h1>
                    <p className="text-violet-300/70 text-sm">
                        {isChangePassword
                            ? "You must set a new password before continuing"
                            : "Create a secure password for your supplier portal"}
                    </p>
                </div>

                <Card className="border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl">
                    <CardContent className="pt-6">
                        {success ? (
                            <div className="text-center py-6 space-y-3">
                                <CheckCircle className="h-12 w-12 mx-auto text-green-400" />
                                <p className="text-white font-semibold text-lg">Account Activated!</p>
                                <p className="text-gray-400 text-sm">Redirecting to dashboard...</p>
                            </div>
                        ) : (
                            <form onSubmit={handleActivate} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="new-password" className="text-gray-300">New Password</Label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                                        <Input
                                            id="new-password"
                                            type="password"
                                            placeholder="At least 8 characters"
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            required
                                            minLength={8}
                                            className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-violet-500"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="confirm-password" className="text-gray-300">Confirm Password</Label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                                        <Input
                                            id="confirm-password"
                                            type="password"
                                            placeholder="Re-enter password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            required
                                            className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-violet-500"
                                        />
                                    </div>
                                </div>

                                <div className="text-xs text-gray-500 space-y-1">
                                    <p className={newPassword.length >= 8 ? "text-green-400" : ""}>
                                        {newPassword.length >= 8 ? "✓" : "○"} At least 8 characters
                                    </p>
                                    <p className={newPassword === confirmPassword && newPassword.length > 0 ? "text-green-400" : ""}>
                                        {newPassword === confirmPassword && newPassword.length > 0 ? "✓" : "○"} Passwords match
                                    </p>
                                </div>

                                {error && (
                                    <div className="px-3 py-2 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                                        {error}
                                    </div>
                                )}

                                <Button
                                    type="submit"
                                    className="w-full bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-500/20"
                                    disabled={loading}
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Activating...
                                        </>
                                    ) : (
                                        <>
                                            <ShieldCheck className="mr-2 h-4 w-4" />
                                            Activate & Continue
                                        </>
                                    )}
                                </Button>
                            </form>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
