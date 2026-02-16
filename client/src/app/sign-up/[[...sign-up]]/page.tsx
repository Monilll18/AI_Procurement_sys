"use client";

import { SignUp } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { useTheme } from "next-themes";

export default function SignUpPage() {
    const { resolvedTheme } = useTheme();

    return (
        <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
            {/* Background Gradient Glow */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-primary/20 blur-[128px]" />
                <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-primary/10 blur-[100px]" />
            </div>

            <div className="relative z-10">
                <SignUp
                    appearance={{
                        baseTheme: resolvedTheme === "dark" ? dark : undefined,
                        elements: {
                            rootBox: "mx-auto",
                            card: "bg-card border-border shadow-2xl",
                        },
                    }}
                />
            </div>
        </div>
    );
}
