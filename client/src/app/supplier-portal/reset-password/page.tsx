"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, Loader2, CheckCircle, ArrowLeft, Mail } from "lucide-react";
import { toast } from "sonner";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function ResetPasswordPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-gray-950 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-violet-500" /></div>}>
            <ResetPasswordContent />
        </Suspense>
    );
}

function ResetPasswordContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const tokenFromUrl = searchParams.get("token");

    // Step 1: Request reset (enter email)
    // Step 2: Set new password (after receiving token)
    const [step, setStep] = useState<"request" | "reset">(tokenFromUrl ? "reset" : "request");

    // Request reset state
    const [email, setEmail] = useState("");
    const [requesting, setRequesting] = useState(false);
    const [resetUrl, setResetUrl] = useState("");

    // Reset password state
    const [token, setToken] = useState(tokenFromUrl || "");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [resetting, setResetting] = useState(false);
    const [success, setSuccess] = useState(false);

    const handleRequestReset = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim()) return;
        setRequesting(true);

        try {
            const res = await fetch(`${API_BASE}/api/supplier-auth/forgot-password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email.trim().toLowerCase() }),
            });
            const data = await res.json();

            if (data.reset_url) {
                setResetUrl(data.reset_url);
                setToken(data.token);
                toast.success("Reset link generated! Click below to reset your password.");
            } else {
                toast.info(data.message || "If that email exists, a reset link has been sent.");
            }
        } catch (err: any) {
            toast.error(err.message || "Failed to request reset");
        } finally {
            setRequesting(false);
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            toast.error("Passwords do not match");
            return;
        }
        if (newPassword.length < 8) {
            toast.error("Password must be at least 8 characters");
            return;
        }
        setResetting(true);

        try {
            const res = await fetch(`${API_BASE}/api/supplier-auth/reset-password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, new_password: newPassword }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || "Reset failed");
            }

            const data = await res.json();

            // Auto-login with returned token
            if (data.access_token && data.user) {
                localStorage.setItem("supplier_token", data.access_token);
                localStorage.setItem("supplier_user", JSON.stringify(data.user));
            }

            setSuccess(true);
            toast.success("Password reset successfully!");

            // Redirect to dashboard after 2s
            setTimeout(() => {
                router.push("/supplier-portal/dashboard");
            }, 2000);
        } catch (err: any) {
            toast.error(err.message || "Failed to reset password");
        } finally {
            setResetting(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center p-4">
            <div className="w-full max-w-md space-y-4">
                <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-lg shadow-2xl">
                    <CardHeader className="text-center pb-2">
                        <div className="mx-auto w-14 h-14 rounded-full bg-violet-600/20 flex items-center justify-center mb-3">
                            <KeyRound className="h-7 w-7 text-violet-400" />
                        </div>
                        <CardTitle className="text-xl text-white">
                            {success ? "Password Reset!" : step === "request" ? "Forgot Password" : "Set New Password"}
                        </CardTitle>
                        <p className="text-sm text-gray-400 mt-1">
                            {success
                                ? "Redirecting to your dashboard..."
                                : step === "request"
                                    ? "Enter your email to receive a password reset link"
                                    : "Enter your new password below"}
                        </p>
                    </CardHeader>

                    <CardContent className="space-y-4 pt-2">
                        {success ? (
                            <div className="text-center py-6">
                                <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                                <p className="text-green-400 font-semibold">Your password has been reset</p>
                                <p className="text-sm text-gray-500 mt-1">You are now logged in</p>
                            </div>
                        ) : step === "request" ? (
                            <>
                                <form onSubmit={handleRequestReset} className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="email" className="text-gray-300">Email Address</Label>
                                        <Input
                                            id="email"
                                            type="email"
                                            placeholder="supplier@example.com"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            required
                                            className="bg-gray-800 border-gray-700 text-white"
                                        />
                                    </div>
                                    <Button
                                        type="submit"
                                        className="w-full bg-violet-600 hover:bg-violet-700 text-white"
                                        disabled={requesting}
                                    >
                                        {requesting ? (
                                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating Reset Link...</>
                                        ) : (
                                            <><Mail className="mr-2 h-4 w-4" /> Get Reset Link</>
                                        )}
                                    </Button>
                                </form>

                                {/* Show reset link when generated */}
                                {resetUrl && (
                                    <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 space-y-3">
                                        <p className="text-sm text-green-400 font-medium">✅ Reset link generated!</p>
                                        <p className="text-xs text-gray-400">
                                            In production, this link would be emailed. For now, click below:
                                        </p>
                                        <Button
                                            className="w-full bg-green-600 hover:bg-green-700 text-white"
                                            onClick={() => {
                                                setStep("reset");
                                            }}
                                        >
                                            <KeyRound className="mr-2 h-4 w-4" /> Reset Password Now
                                        </Button>
                                        <p className="text-xs text-gray-500 text-center">
                                            Link expires in 1 hour
                                        </p>
                                    </div>
                                )}
                            </>
                        ) : (
                            <form onSubmit={handleResetPassword} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="new-password" className="text-gray-300">New Password</Label>
                                    <Input
                                        id="new-password"
                                        type="password"
                                        placeholder="Minimum 8 characters"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        required
                                        minLength={8}
                                        className="bg-gray-800 border-gray-700 text-white"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="confirm-password" className="text-gray-300">Confirm Password</Label>
                                    <Input
                                        id="confirm-password"
                                        type="password"
                                        placeholder="Re-enter password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        required
                                        minLength={8}
                                        className="bg-gray-800 border-gray-700 text-white"
                                    />
                                    {confirmPassword && newPassword !== confirmPassword && (
                                        <p className="text-xs text-red-400">Passwords do not match</p>
                                    )}
                                </div>
                                <Button
                                    type="submit"
                                    className="w-full bg-violet-600 hover:bg-violet-700 text-white"
                                    disabled={resetting || newPassword !== confirmPassword || newPassword.length < 8}
                                >
                                    {resetting ? (
                                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Resetting...</>
                                    ) : (
                                        <><KeyRound className="mr-2 h-4 w-4" /> Reset Password</>
                                    )}
                                </Button>
                            </form>
                        )}

                        <div className="text-center pt-2">
                            <a
                                href="/supplier-portal/login"
                                className="text-sm text-violet-400 hover:underline inline-flex items-center gap-1"
                            >
                                <ArrowLeft className="h-3 w-3" /> Back to Login
                            </a>
                        </div>
                    </CardContent>
                </Card>

                <p className="text-center text-xs text-gray-600">
                    Powered by ProcureAI
                </p>
            </div>
        </div>
    );
}
