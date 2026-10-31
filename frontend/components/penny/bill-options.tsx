"use client";

import { Check, Hand, Zap } from "lucide-react";
import type { BillFrequency } from "@/lib/api";
import { cn } from "@/lib/utils";

export const FREQUENCIES: { value: BillFrequency; label: string }[] = [
  { value: "weekly", label: "Every week" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Every month" },
  { value: "yearly", label: "Every year" },
];

/** The next due date one period after `day` (YYYY-MM-DD), clamping to short months. */
export function nextAfter(day: string, frequency: BillFrequency): string {
  const [year, month, date] = day.split("-").map(Number);
  const pad = (value: number) => String(value).padStart(2, "0");
  if (frequency === "weekly" || frequency === "biweekly") {
    const next = new Date(year, month - 1, date + (frequency === "weekly" ? 7 : 14));
    return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
  }
  const index = year * 12 + month - 1 + (frequency === "yearly" ? 12 : 1);
  const nextYear = Math.floor(index / 12);
  const nextMonth = (index % 12) + 1;
  const lastDay = new Date(nextYear, nextMonth, 0).getDate();
  return `${nextYear}-${pad(nextMonth)}-${pad(Math.min(date, lastDay))}`;
}

/** Auto vs manual payment, as two clear choices with what each one means. */
export function PaymentMode({ value, onChange, disabled }: { value: boolean; onChange: (auto: boolean) => void; disabled?: boolean }) {
  const options = [
    { auto: true, icon: Zap, title: "Pay automatically", body: "Recorded for you on each due date. Best for fixed amounts like rent or a phone plan." },
    { auto: false, icon: Hand, title: "I’ll mark it paid", body: "Penny reminds you, and you tap Paid. Best for bills that change, like electricity." },
  ];
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-ink">How it’s paid</legend>
      <div role="radiogroup" className="mt-2 grid gap-2 sm:grid-cols-2">
        {options.map(({ auto, icon: Icon, title, body }) => {
          const selected = value === auto;
          return (
            <button key={title} type="button" role="radio" aria-checked={selected} disabled={disabled} onClick={() => onChange(auto)} className={cn("flex items-start gap-3 rounded-2xl border-2 p-3 text-left transition-colors disabled:opacity-60", selected ? "border-primary bg-primary-soft" : "border-line hover:bg-sage-soft")}>
              <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", selected ? "bg-primary text-on-primary" : "bg-sage text-ink-muted")} aria-hidden="true"><Icon className="size-4" /></span>
              <span><span className="flex items-center gap-1.5 text-sm font-semibold text-ink">{title}{selected && <Check className="size-4 text-primary" aria-hidden="true" />}</span><span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{body}</span></span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

