"use client";

import { useState, useRef, useEffect } from "react";
import { aiChat, aiHealth } from "@/lib/api";
import {
    MessageCircle,
    X,
    Send,
    Bot,
    User,
    Sparkles,
    Loader2,
    ChevronDown,
} from "lucide-react";

interface Message {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    intent?: string;
    timestamp: Date;
}

const SUGGESTED_QUESTIONS = [
    "How much did we spend this month?",
    "Which supplier is cheapest for paper?",
    "Show me all overdue deliveries",
    "What items are low in stock?",
    "How many purchase orders are pending?",
];

export function AIChatWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Check AI health on mount
    useEffect(() => {
        aiHealth()
            .then((res) => setIsConfigured(res.llm_configured))
            .catch(() => setIsConfigured(false));
    }, []);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Focus input when opened
    useEffect(() => {
        if (isOpen) inputRef.current?.focus();
    }, [isOpen]);

    // Welcome message
    useEffect(() => {
        if (isOpen && messages.length === 0) {
            setMessages([
                {
                    id: "welcome",
                    role: "assistant",
                    content:
                        "👋 Hi! I'm your AI procurement assistant. Ask me anything about your orders, suppliers, spending, or inventory.",
                    timestamp: new Date(),
                },
            ]);
        }
    }, [isOpen]);

    const sendMessage = async (text?: string) => {
        const question = text || input.trim();
        if (!question || isLoading) return;

        const userMsg: Message = {
            id: Date.now().toString(),
            role: "user",
            content: question,
            timestamp: new Date(),
        };

        setMessages((prev) => [...prev, userMsg]);
        setInput("");
        setIsLoading(true);

        try {
            const res = await aiChat(question);
            const botMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: res.answer ? "assistant" : "system",
                content: res.answer || "⚠️ AI service unavailable — please restart the backend server after updating the API key in `.env`.",
                intent: res.answer ? res.intent : undefined,
                timestamp: new Date(),
            };
            setMessages((prev) => [...prev, botMsg]);
        } catch (err: any) {
            setMessages((prev) => [
                ...prev,
                {
                    id: (Date.now() + 1).toString(),
                    role: "system",
                    content: `Sorry, I encountered an error: ${err.message || "Please try again."}`,
                    timestamp: new Date(),
                },
            ]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    return (
        <>
            {/* Floating Chat Button */}
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/25 transition-all duration-300 hover:scale-110 hover:shadow-xl hover:shadow-violet-500/30"
                    title="AI Assistant"
                >
                    <Sparkles className="h-6 w-6" />
                    {/* Pulse indicator */}
                    <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-green-500"></span>
                    </span>
                </button>
            )}

            {/* Chat Panel */}
            {isOpen && (
                <div className="fixed bottom-6 right-6 z-50 flex w-96 flex-col overflow-hidden rounded-2xl border border-border/50 bg-background shadow-2xl shadow-black/10"
                    style={{ height: "min(600px, calc(100vh - 100px))" }}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-border/50 bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3">
                        <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                                <Bot className="h-5 w-5 text-white" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-white">
                                    AI Procurement Assistant
                                </p>
                                <p className="text-xs text-white/70">
                                    Powered by GROQ
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="rounded-lg p-1 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-hide">
                        {messages.map((msg) => (
                            <div
                                key={msg.id}
                                className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                            >
                                {/* Avatar */}
                                <div
                                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${msg.role === "user"
                                        ? "bg-primary text-primary-foreground"
                                        : msg.role === "system"
                                            ? "bg-destructive/10 text-destructive"
                                            : "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                                        }`}
                                >
                                    {msg.role === "user" ? (
                                        <User className="h-4 w-4" />
                                    ) : (
                                        <Bot className="h-4 w-4" />
                                    )}
                                </div>

                                {/* Bubble */}
                                <div
                                    className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${msg.role === "user"
                                        ? "bg-primary text-primary-foreground rounded-br-md"
                                        : msg.role === "system"
                                            ? "bg-destructive/10 text-destructive rounded-bl-md"
                                            : "bg-muted rounded-bl-md"
                                        }`}
                                >
                                    <p className="whitespace-pre-wrap">{msg.content}</p>
                                    {msg.intent && msg.role === "assistant" && (
                                        <span className="mt-1 inline-block rounded-full bg-violet-100 dark:bg-violet-900/30 px-2 py-0.5 text-[10px] text-violet-600 dark:text-violet-400">
                                            {msg.intent}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}

                        {/* Loading indicator */}
                        {isLoading && (
                            <div className="flex gap-2">
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                                    <Bot className="h-4 w-4" />
                                </div>
                                <div className="rounded-2xl rounded-bl-md bg-muted px-4 py-3">
                                    <div className="flex items-center gap-1">
                                        <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:0ms]"></div>
                                        <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:150ms]"></div>
                                        <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:300ms]"></div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    {/* Suggested Questions (show when few messages) */}
                    {messages.length <= 1 && !isLoading && (
                        <div className="border-t border-border/30 px-3 py-2">
                            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                Suggested
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {SUGGESTED_QUESTIONS.map((q, i) => (
                                    <button
                                        key={i}
                                        onClick={() => sendMessage(q)}
                                        className="rounded-full border border-border/50 bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                    >
                                        {q}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Input */}
                    <div className="border-t border-border/50 px-3 py-2.5">
                        {isConfigured === false && (
                            <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">
                                ⚠️ AI not configured — add ZHIPU_API_KEY to .env
                            </p>
                        )}
                        <div className="flex items-center gap-2">
                            <input
                                ref={inputRef}
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Ask about orders, spend, suppliers..."
                                className="flex-1 rounded-xl border border-border/50 bg-muted/50 px-3.5 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/20"
                                disabled={isLoading}
                            />
                            <button
                                onClick={() => sendMessage()}
                                disabled={!input.trim() || isLoading}
                                className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white transition-all hover:opacity-90 disabled:opacity-40"
                            >
                                {isLoading ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Send className="h-4 w-4" />
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
