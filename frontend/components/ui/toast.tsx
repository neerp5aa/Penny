"use client";

import * as React from "react";
import { CircleAlert, CircleCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "error";
type ToastAction = { label: string; onClick: () => void };
type ToastInput = { title: string; description?: string; tone?: ToastTone; action?: ToastAction };
type ToastItem = ToastInput & { id: number; tone: ToastTone };

const ToastContext = React.createContext<((toast: ToastInput) => void) | null>(null);
const SUCCESS_MS = 6000;

/** Minimal toast queue: success toasts auto-dismiss; errors stay until dismissed. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const nextId = React.useRef(1);
  const dismiss = React.useCallback((id: number) => setToasts((items) => items.filter((item) => item.id !== id)), []);
  const show = React.useCallback((toast: ToastInput) => {
    const id = nextId.current++;
    const tone = toast.tone ?? "success";
    setToasts((items) => [...items.slice(-2), { ...toast, id, tone }]);
    if (tone === "success") window.setTimeout(() => dismiss(id), SUCCESS_MS);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:left-auto lg:right-6 lg:items-end">
        {toasts.map((toast) => (
          <div key={toast.id} role={toast.tone === "error" ? "alert" : "status"} className={cn("pointer-events-auto flex w-full max-w-sm animate-enter items-start gap-3 rounded-2xl border bg-surface p-3 pl-4 shadow-[var(--shadow-raised)]", toast.tone === "error" ? "border-danger/30" : "border-line")}>
            {toast.tone === "error" ? <CircleAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" /> : <CircleCheck className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />}
            <div className="min-w-0 flex-1 py-0.5">
              <p className="text-sm font-semibold text-ink">{toast.title}</p>
              {toast.description && <p className="mt-0.5 text-sm text-ink-muted">{toast.description}</p>}
            </div>
            {toast.action && (
              <button type="button" onClick={() => { toast.action?.onClick(); dismiss(toast.id); }} className="min-h-10 shrink-0 rounded-lg px-3 text-sm font-semibold text-accent-strong hover:bg-accent-soft">
                {toast.action.label}
              </button>
            )}
            <button type="button" aria-label="Dismiss notification" onClick={() => dismiss(toast.id)} className="grid size-10 shrink-0 place-items-center rounded-lg text-ink-subtle hover:bg-sage-soft">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const toast = React.useContext(ToastContext);
  if (!toast) throw new Error("useToast must be used inside ToastProvider");
  return toast;
}
