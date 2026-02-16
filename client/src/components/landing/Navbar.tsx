"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/ThemeToggle";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SignInButton, SignUpButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";

export function Navbar() {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <nav className="fixed top-0 w-full z-50 glass">
            <div className="container mx-auto flex items-center justify-between px-6 h-16">
                {/* Logo */}
                <Link href="/" className="flex items-center gap-2 font-bold text-xl tracking-tight text-foreground">
                    <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
                        AI
                    </div>
                    <span>ProcureAI</span>
                </Link>

                {/* Desktop Nav */}
                <div className="hidden md:flex items-center gap-8">
                    <Link href="#features" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Features</Link>
                    <Link href="#testimonials" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Testimonials</Link>
                    <Link href="#pricing" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Pricing</Link>
                    <Link href="#faq" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">FAQ</Link>
                </div>

                {/* Actions */}
                <div className="hidden md:flex items-center gap-4">
                    <ModeToggle />

                    {/* Show auth buttons when signed out */}
                    <SignedOut>
                        <SignInButton mode="modal">
                            <Button variant="ghost" className="text-muted-foreground hover:text-foreground">Log in</Button>
                        </SignInButton>
                        <SignUpButton mode="modal">
                            <Button className="font-semibold shadow-lg shadow-primary/25">Get Started</Button>
                        </SignUpButton>
                    </SignedOut>

                    {/* Show user button + dashboard link when signed in */}
                    <SignedIn>
                        <Link href="/dashboard">
                            <Button variant="ghost" className="text-muted-foreground hover:text-foreground">Dashboard</Button>
                        </Link>
                        <UserButton afterSignOutUrl="/" />
                    </SignedIn>
                </div>

                {/* Mobile Toggle */}
                <button className="md:hidden text-foreground" onClick={() => setIsOpen(!isOpen)}>
                    {isOpen ? <X /> : <Menu />}
                </button>
            </div>

            {/* Mobile Menu */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="md:hidden bg-background border-b border-border"
                    >
                        <div className="flex flex-col p-6 space-y-4">
                            <Link href="#features" onClick={() => setIsOpen(false)} className="text-lg font-medium text-foreground">Features</Link>
                            <Link href="#pricing" onClick={() => setIsOpen(false)} className="text-lg font-medium text-foreground">Pricing</Link>
                            <Link href="#faq" onClick={() => setIsOpen(false)} className="text-lg font-medium text-foreground">FAQ</Link>
                            <div className="h-px bg-border my-2" />

                            <SignedOut>
                                <SignInButton mode="modal">
                                    <Button variant="outline" className="w-full justify-start">Log in</Button>
                                </SignInButton>
                                <SignUpButton mode="modal">
                                    <Button className="w-full">Get Started</Button>
                                </SignUpButton>
                            </SignedOut>

                            <SignedIn>
                                <Link href="/dashboard" onClick={() => setIsOpen(false)}>
                                    <Button variant="outline" className="w-full">Dashboard</Button>
                                </Link>
                            </SignedIn>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </nav>
    );
}
