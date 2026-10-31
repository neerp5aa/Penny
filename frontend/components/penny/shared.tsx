"use client";

import { useId } from "react";
import { Bot, GraduationCap, Home, Landmark, ReceiptText, Settings, Target, TrendingUp, type LucideIcon } from "lucide-react";
import { Label } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { formatCad } from "@/lib/money";
import { cn } from "@/lib/utils";

export type View = "today" | "spending" | "accounts" | "recurring" | "goals" | "invest" | "learn" | "ai" | "settings";

/** `primary` items sit in the phone tab bar; the rest live under "More". */
export const NAVIGATION: { id: View; label: string; title: string; description: string; icon: LucideIcon; primary: boolean }[] = [
  { id: "today", label: "Home", title: "Today", description: "Your Money Score, streaks, and what’s coming up.", icon: Home, primary: true },
  { id: "spending", label: "Spending", title: "Spending", description: "Transactions, recurring bills, and budgets.", icon: ReceiptText, primary: true },
  { id: "accounts", label: "Accounts", title: "Accounts", description: "Every account’s balance, and what it all adds up to.", icon: Landmark, primary: false },
  { id: "goals", label: "Goals", title: "Goals", description: "Save on purpose and see what it takes each month.", icon: Target, primary: true },
  { id: "invest", label: "Invest", title: "Invest", description: "Learn how investing works in Canada, at your own pace.", icon: TrendingUp, primary: false },
  { id: "learn", label: "Learn", title: "Learn", description: "Lessons and challenges for Canada or the US, from Easy to Hard.", icon: GraduationCap, primary: false },
  { id: "ai", label: "Penny AI", title: "Penny AI", description: "Your money coach. It knows your numbers and helps you decide.", icon: Bot, primary: true },
  { id: "settings", label: "Settings", title: "Settings", description: "Appearance, reminders, and how your data is protected.", icon: Settings, primary: false },
];

/** Formats integer cents from the API. Display only; never feed the result back into maths. */
export const cad = (cents: number, showSign = false) => formatCad(String(cents), showSign);

/** Turns API/network failures into plain-language messages without hiding the original detail. */
export function describeError(reason: unknown, fallback: string): { title: string; detail: string; needsSignIn: boolean } {
  if (reason instanceof ApiError) {
    if (reason.status === 401) return { title: "Please sign in", detail: "Sign in to see your Penny dashboard.", needsSignIn: true };
    if (reason.status === 403) return { title: "This account has no demo data yet", detail: "You’re signed in, but this account isn’t linked to the fictional Penny data set. Ask the team to link it, or sign in with the demo account.", needsSignIn: true };
    if (reason.status === 503) return { title: "Sign-in check unavailable", detail: "Penny couldn’t reach the sign-in service to verify you. Try again in a moment.", needsSignIn: false };
    return { title: fallback, detail: reason.message, needsSignIn: false };
  }
  if (reason instanceof TypeError) return { title: "Can’t reach Penny’s server", detail: "Check your connection, or make sure the Penny API is running, then try again.", needsSignIn: false };
  return { title: fallback, detail: reason instanceof Error ? reason.message : "Something went wrong.", needsSignIn: false };
}

type FieldControlProps = { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean };

export function Field({ label, hint, error, className, children }: { label: string; hint?: string; error?: string; className?: string; children: (props: FieldControlProps) => React.ReactNode }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("min-w-0", className)}>
      <Label htmlFor={id}>{label}</Label>
      <div className="mt-1.5">{children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}</div>
      {hint && <p id={hintId} className="mt-1.5 text-xs text-ink-subtle">{hint}</p>}
      {error && <p id={errorId} className="mt-1.5 text-sm font-medium text-danger">{error}</p>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action, className }: { icon: LucideIcon; title: string; description: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid place-items-center rounded-2xl border border-dashed border-line-strong bg-sage-soft/50 px-4 py-10 text-center", className)}>
      <div className="grid size-11 place-items-center rounded-xl bg-surface text-accent-strong shadow-[var(--shadow-card)]"><Icon className="size-5" aria-hidden="true" /></div>
      <p className="mt-4 font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-ink-subtle">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function SectionHeading({ eyebrow, title, description, action, id }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode; id?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-strong">{eyebrow}</p>}
        <h2 id={id} className="mt-1 text-xl font-semibold tracking-tight text-ink">{title}</h2>
        {description && <p className="mt-1 text-sm text-ink-subtle">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Staggered entrance; delay is capped so content never waits on decoration. */
export function enterStyle(index: number): React.CSSProperties {
  return { animationDelay: `${Math.min(index, 6) * 40}ms` };
}

/** "Due today", "Due tomorrow", "Due in 5 days", or "Overdue". */
export function dueLabel(days: number): string {
  if (days < 0) return "Overdue";
  if (days === 0) return "Due today";
  return days === 1 ? "Due tomorrow" : `Due in ${days} days`;
}
