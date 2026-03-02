"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Building2, Lock, Mail } from "lucide-react";
import {
    supplierLogin, setSupplierToken, setStoredSupplierUser,
} from "@/lib/supplier-api";

export default function SupplierLoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const res = await supplierLogin(email.trim(), password);
            setSupplierToken(res.access_token);
            setStoredSupplierUser(res.user);

            if (res.user.must_change_password) {
                router.push("/supplier-portal/activate?change=1");
            } else {
                router.push("/supplier-portal/dashboard");
            }
        } catch (err: any) {
            setError(err.message || "Login failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-950 via-gray-900 to-black p-4">
            <div className="w-full max-w-md space-y-6">
                {/* Logo */}
                <div className="text-center space-y-2">
                    <div className="mx-auto h-14 w-14 rounded-2xl bg-violet-600 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-violet-500/30">
                        SP
                    </div>
                    <h1 className="text-2xl font-bold text-white">Supplier Portal</h1>
                    <p className="text-violet-300/70 text-sm">Sign in to manage your purchase orders</p>
                </div>

                <Card className="border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-white text-lg">Sign In</CardTitle>
                        <CardDescription className="text-gray-400">
                            Use the credentials sent to you by your buyer
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleLogin} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="email" className="text-gray-300">Email</Label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="your@email.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-violet-500"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="password" className="text-gray-300">Password</Label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                                    <Input
                                        id="password"
                                        type="password"
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-violet-500"
                                    />
                                </div>
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
                                        Signing in...
                                    </>
                                ) : (
                                    "Sign In"
                                )}
                            </Button>
                        </form>

                        <div className="text-center">
                            <a
                                href="/supplier-portal/reset-password"
                                className="text-sm text-gray-400 hover:text-violet-400 hover:underline"
                            >
                                Forgot your password?
                            </a>
                        </div>

                        <div className="mt-2 text-center">
                            <p className="text-sm text-gray-500">
                                First time?{" "}
                                <a
                                    href="/supplier-portal/activate"
                                    className="text-violet-400 hover:underline font-medium"
                                >
                                    Activate your account
                                </a>
                            </p>
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
