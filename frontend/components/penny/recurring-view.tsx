"use client";

import { type FormEvent, useState } from "react";
import { Check, Info, Lock, Pencil, Plus, Repeat, Sparkles, Tv, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import type { Bill, BillFrequency, Dashboard, RecurringExpense } from "@/lib/api";
import { formatShortDate } from "@/lib/format";
import { centsToInput, parseCadToCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { categoryOptions } from "./dialogs";
import { cad, dueLabel, EmptyState, Field } from "./shared";

export type BillInput = Omit<Bill, "id" | "last_paid_on">;
type Props = {
  dashboard: Dashboard;
  onAsk: (question: string) => void;
  onMarkPaid: (bill: Bill) => void;
  onSave: (id: string | null, body: BillInput) => Promise<string | null>;
  onDelete: (bill: Bill) => void;
};

const FREQUENCIES: { value: BillFrequency; label: string }[] = [
  { value: "weekly", label: "Every week" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Every month" },
  { value: "yearly", label: "Every year" },
];
const FREQUENCY_SHORT: Record<BillFrequency, string> = { weekly: "weekly", biweekly: "every 2 weeks", monthly: "monthly", yearly: "yearly" };

export function RecurringView({ dashboard, onAsk, onMarkPaid, onSave, onDelete }: Props) {
  const summary = dashboard.recurring;
  const [editing, setEditing] = useState<Bill | BillInput | "new" | null>(null);
  const bills = new Map(dashboard.bills.map((bill) => [bill.id, bill]));
  const soon = summary.items.filter((item) => item.days_until_due <= 7);
  const later = summary.items.filter((item) => item.days_until_due > 7);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <section aria-labelledby="fixed-title" className="overflow-hidden rounded-[var(--radius-card)] bg-hero p-5 text-white shadow-[var(--shadow-raised)] sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm text-white/75"><Lock className="size-4" aria-hidden="true" />Fixed monthly expenses</p>
            <h2 id="fixed-title" className="tabular mt-1 text-4xl font-semibold tracking-tight">{cad(summary.fixed_monthly_cents)}<span className="text-lg font-normal text-white/70"> / month</span></h2>
            <p className="mt-2 max-w-md text-sm text-white/75">What leaves every month no matter what.{summary.share_of_income_basis_points !== null && <> About <span className="font-semibold text-white">{Math.round(summary.share_of_income_basis_points / 100)}%</span> of your typical income.</>}</p>
          </div>
          <dl className="grid grid-cols-3 gap-2 text-center sm:min-w-80">
            <HeroStat label="Before payday" value={cad(summary.due_before_payday_cents)} />
            <HeroStat label="Essentials" value={cad(summary.needs_monthly_cents)} />
            <HeroStat label="Subscriptions" value={cad(summary.wants_monthly_cents)} />
          </dl>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">Set bills up once. Auto bills are paid on their due date; the rest wait for you to tap Paid.</p>
        <Button onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden="true" />Add a bill</Button>
      </div>

      {summary.suggestions.length > 0 && (
        <Card className="border-accent/30 p-5">
          <h2 className="flex items-center gap-2 font-semibold text-ink"><Wand2 className="size-4 text-accent" aria-hidden="true" />Found in your history</h2>
          <p className="mt-1 text-sm text-ink-muted">These charge the same amount every month. Add them so they land on your forecast.</p>
          <ul className="mt-3 divide-y divide-line">
            {summary.suggestions.map((item) => (
              <li key={item.name} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0"><span className="block truncate text-sm font-semibold text-ink">{item.name}</span><span className="text-xs text-ink-subtle">{cad(item.amount_cents)} · next around {formatShortDate(item.next_due)}</span></span>
                <Button size="sm" variant="secondary" onClick={() => setEditing({ name: item.name, amount_cents: item.amount_cents, category_id: item.category_id, account_id: defaultAccount(dashboard), frequency: "monthly", next_due: item.next_due, auto_record: true })}>Add</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {summary.items.length === 0 ? (
        <Card className="p-5"><EmptyState icon={Repeat} title="No bills yet" description="Add rent, your phone plan, and subscriptions so they show up on your payday forecast." action={<Button size="sm" onClick={() => setEditing("new")}>Add a bill</Button>} /></Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr] [&>*]:min-w-0">
          <div className="space-y-5">
            <Group title="Due in the next 7 days" empty="Nothing due this week." items={soon} bills={bills} onMarkPaid={onMarkPaid} onEdit={setEditing} />
            <Group title="Later" empty="Nothing else scheduled." items={later} bills={bills} onMarkPaid={onMarkPaid} onEdit={setEditing} />
          </div>
          <div className="space-y-5">
            <Card className="p-5">
              <h2 className="flex items-center gap-2 font-semibold text-ink"><Tv className="size-4 text-[#7047b7] dark:text-[#c1a5ee]" aria-hidden="true" />Subscriptions</h2>
              <p className="mt-2 text-sm text-ink-muted">{cad(summary.wants_monthly_cents)} a month on nice-to-haves. Small charges add up over a year.</p>
              <Button variant="outline" className="mt-3 w-full" onClick={() => onAsk("Are any of my subscriptions worth cancelling? What would it save me in a year?")}><Sparkles className="size-4" aria-hidden="true" />Review with Penny</Button>
            </Card>
            <p className="flex gap-2 px-1 text-xs leading-relaxed text-ink-subtle"><Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{summary.methodology} Paying a bill records it as a transaction on its account.</p>
          </div>
        </div>
      )}

      <BillDialog dashboard={dashboard} target={editing} onClose={() => setEditing(null)} onSave={onSave} onDelete={(bill) => { setEditing(null); onDelete(bill); }} />
    </div>
  );
}

function defaultAccount(dashboard: Dashboard): string {
  return dashboard.accounts.find((account) => account.account_type === "chequing")?.id ?? dashboard.accounts[0]?.id ?? "";
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-white/10 p-2.5"><dt className="text-[11px] text-white/70">{label}</dt><dd className="tabular mt-0.5 truncate text-sm font-semibold">{value}</dd></div>;
}

function Group({ title, empty, items, bills, onMarkPaid, onEdit }: { title: string; empty: string; items: RecurringExpense[]; bills: Map<string, Bill>; onMarkPaid: (bill: Bill) => void; onEdit: (bill: Bill) => void }) {
  return (
    <Card className="p-5">
      <h2 className="font-semibold text-ink">{title}</h2>
      {items.length === 0 ? <p className="mt-2 text-sm text-ink-subtle">{empty}</p> : (
        <ul className="mt-2 divide-y divide-line">
          {items.map((item) => {
            const bill = bills.get(item.id);
            if (!bill) return null;
            const urgent = item.days_until_due <= 3;
            return (
              <li key={item.id} className="flex items-center gap-2.5 py-3 sm:gap-3">
                <span className={cn("hidden size-10 shrink-0 place-items-center rounded-xl min-[400px]:grid", item.kind === "subscription" ? "bg-[#f2ecff] text-[#7047b7] dark:bg-[#302847] dark:text-[#c1a5ee]" : "bg-info-soft text-info")} aria-hidden="true">{item.kind === "subscription" ? <Tv className="size-4" /> : <Repeat className="size-4" />}</span>
                <button type="button" onClick={() => onEdit(bill)} className="min-h-11 min-w-0 flex-1 text-left" aria-label={`Edit ${item.name}`}>
                  <span className="flex items-center gap-1.5"><span className="truncate text-sm font-semibold text-ink">{item.name}</span><Pencil className="size-3 shrink-0 text-ink-subtle" aria-hidden="true" /></span>
                  <span className="flex flex-wrap items-center gap-1.5 text-xs text-ink-subtle">
                    <span className={cn(urgent && "font-semibold text-gold-strong")}>{dueLabel(item.days_until_due)}</span>
                    <span>· {formatShortDate(item.next_due)} · {FREQUENCY_SHORT[item.frequency]}</span>
                    <Badge tone={item.necessity === "need" ? "info" : "gold"} className="px-1.5 py-0">{item.necessity === "need" ? "Need" : "Want"}</Badge>
                  </span>
                </button>
                <p className="tabular text-sm font-semibold text-ink">{cad(item.amount_cents)}</p>
                {item.auto_record
                  ? <Badge tone="accent" title="Marked paid automatically on its due date">Auto</Badge>
                  : <Button variant="outline" size="sm" className="min-w-11 px-2.5 sm:px-3" onClick={() => onMarkPaid(bill)} aria-label={`Mark ${item.name} paid`}><Check className="size-4" aria-hidden="true" /><span className="hidden sm:inline">Paid</span></Button>}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function BillDialog({ dashboard, target, onClose, onSave, onDelete }: { dashboard: Dashboard; target: Bill | BillInput | "new" | null; onClose: () => void; onSave: Props["onSave"]; onDelete: (bill: Bill) => void }) {
  const existing = target && target !== "new" && "id" in target ? target : null;
  const draft = target === "new" ? null : target;
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Edit bill" : "Add a bill"}</DialogTitle>
          <DialogDescription>It will show on your payday forecast on every due date.</DialogDescription>
        </DialogHeader>
        {target !== null && <BillForm key={existing?.id ?? draft?.name ?? "new"} dashboard={dashboard} draft={draft} onSubmit={async (body) => { const error = await onSave(existing?.id ?? null, body); if (!error) onClose(); return error; }} onDelete={existing ? () => onDelete(existing) : undefined} />}
      </DialogContent>
    </Dialog>
  );
}

function BillForm({ dashboard, draft, onSubmit, onDelete }: { dashboard: Dashboard; draft: BillInput | Bill | null; onSubmit: (body: BillInput) => Promise<string | null>; onDelete?: () => void }) {
  const [frequency, setFrequency] = useState<BillFrequency>(draft?.frequency ?? "monthly");
  const [nextDue, setNextDue] = useState(draft?.next_due ?? dashboard.money_calendar.today ?? dashboard.current_month);
  const [autoRecord, setAutoRecord] = useState(draft?.auto_record ?? true);
  const [amountError, setAmountError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    let cents: number;
    try { cents = parseCadToCents(String(form.get("amount"))); } catch (reason) { setAmountError(reason instanceof Error ? reason.message : "Enter an amount"); return; }
    if (cents <= 0) { setAmountError("Enter an amount greater than $0.00"); return; }
    setAmountError("");
    setBusy(true);
    const result = await onSubmit({
      name: String(form.get("name")).trim(),
      amount_cents: cents,
      category_id: String(form.get("category_id")) || null,
      account_id: String(form.get("account_id")),
      frequency,
      next_due: nextDue,
      auto_record: autoRecord,
    });
    setBusy(false);
    if (result) setError(result);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[1.4fr_1fr]">
        <Field label="Name">{(props) => <Input {...props} name="name" defaultValue={draft?.name} placeholder="e.g. Rent, Netflix" required maxLength={80} />}</Field>
        <Field label="Amount (CAD)" error={amountError}>{(props) => <Input {...props} name="amount" inputMode="decimal" defaultValue={draft ? centsToInput(String(draft.amount_cents)) : ""} placeholder="0.00" required />}</Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="How often">{(props) => <Select {...props} value={frequency} onChange={(event) => setFrequency(event.target.value as BillFrequency)}>{FREQUENCIES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select>}</Field>
        <Field label="Next due">{(props) => <DatePicker id={props.id} value={nextDue} onChange={setNextDue} />}</Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category" hint="Leave blank and Penny will pick one from the name.">{(props) => (
          <Select {...props} name="category_id" defaultValue={draft?.category_id ?? ""}>
            <option value="">Pick for me</option>
            {categoryOptions(dashboard.categories, "spending").map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </Select>
        )}</Field>
        <Field label="Paid from">{(props) => <Select {...props} name="account_id" defaultValue={draft?.account_id ?? defaultAccount(dashboard)}>{dashboard.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</Select>}</Field>
      </div>
      <label className="flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-xl border border-line p-3">
        <span><span className="block text-sm font-semibold text-ink">Mark paid automatically</span><span className="block text-xs text-ink-subtle">Best for fixed amounts like rent. Turn off for bills that change, like electricity.</span></span>
        <input type="checkbox" checked={autoRecord} onChange={(event) => setAutoRecord(event.target.checked)} className="size-5 shrink-0 accent-[var(--color-accent)]" />
      </label>
      {error && <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger">{error}</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        {onDelete && <Button variant="destructive-soft" onClick={onDelete} disabled={busy}>Delete bill</Button>}
        <Button type="submit" className="flex-1" disabled={busy}>{draft && "id" in draft ? "Save bill" : "Add bill"}</Button>
      </div>
    </form>
  );
}
