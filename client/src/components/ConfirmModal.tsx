"use client";

import { ReactNode } from "react";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, Trash2, Info } from "lucide-react";

export type ConfirmVariant = "danger" | "warning" | "info";

interface ConfirmModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
    title: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: ConfirmVariant;
    loading?: boolean;
    icon?: ReactNode;
}

const VARIANT_STYLES: Record<ConfirmVariant, {
    iconBg: string;
    iconColor: string;
    buttonClass: string;
    defaultIcon: ReactNode;
}> = {
    danger: {
        iconBg: "bg-red-100 dark:bg-red-900/30",
        iconColor: "text-red-600 dark:text-red-400",
        buttonClass: "bg-red-600 hover:bg-red-700 text-white",
        defaultIcon: <Trash2 className="h-5 w-5" />,
    },
    warning: {
        iconBg: "bg-amber-100 dark:bg-amber-900/30",
        iconColor: "text-amber-600 dark:text-amber-400",
        buttonClass: "bg-amber-600 hover:bg-amber-700 text-white",
        defaultIcon: <AlertTriangle className="h-5 w-5" />,
    },
    info: {
        iconBg: "bg-blue-100 dark:bg-blue-900/30",
        iconColor: "text-blue-600 dark:text-blue-400",
        buttonClass: "bg-blue-600 hover:bg-blue-700 text-white",
        defaultIcon: <Info className="h-5 w-5" />,
    },
};

export function ConfirmModal({
    open,
    onOpenChange,
    onConfirm,
    title,
    description,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    variant = "danger",
    loading = false,
    icon,
}: ConfirmModalProps) {
    const style = VARIANT_STYLES[variant];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[420px]">
                <DialogHeader>
                    <div className="flex items-start gap-4">
                        <div className={`p-2.5 rounded-full ${style.iconBg} ${style.iconColor} shrink-0`}>
                            {icon || style.defaultIcon}
                        </div>
                        <div>
                            <DialogTitle className="text-lg">{title}</DialogTitle>
                            <DialogDescription className="mt-1.5 text-sm">
                                {description}
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>
                <DialogFooter className="gap-2 sm:gap-0 mt-2">
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={loading}
                    >
                        {cancelLabel}
                    </Button>
                    <Button
                        className={style.buttonClass}
                        onClick={onConfirm}
                        disabled={loading}
                    >
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
