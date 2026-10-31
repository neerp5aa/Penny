"use client";

import { type FormEvent, useEffect, useState } from "react";
import { CalendarClock, Check, ChevronRight, Hand, Info, LoaderCircle, Lock, Pencil, Plus, Repeat, Sparkles, Trash2, Tv, Wand2, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import { type Bill, type BillFrequency, type BillHistory, type Dashboard, dashboardApi, type RecurringExpense } from "@/lib/api";
import { formatLongDate, formatShortDate } from "@/lib/format";
import { centsToInput, parseCadToCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { FREQUENCIES, PaymentMode } from "./bill-options";
import { categoryOptions } from "./dialogs";
import { cad, describeError, dueLabel, EmptyState, Field } from "./shared";

export type BillInput = Omit<Bill, "id" | "last_paid_on">;
export type RecurringActions = {
  onMarkPaid: (bill: Bill) => void;
  onSave: (id: string | null, body: BillInput) => Promise<string | null>;
  onDelete: (bill: Bill) => void;
};
type Props = RecurringActions & { dashboard: Dashboard; onAsk: (question: string) => void };

const FREQUENCY_SHORT: Record<BillFrequency, string> = { weekly: "weekly", biweekly: "every 2 weeks", monthly: "monthly", yearly: "yearly" };

const billInput = (bill: Bill): BillInput => ({ name: bill.name, amount_cents: bill.amount_cents, category_id: bill.category_id, account_id: bill.account_id, frequency: bill.frequency, next_due: bill.next_due, auto_record: bill.auto_record });

export function RecurringView({ dashboard, onAsk, onMarkPaid, onSave, onDelete }: Props) {
  const summary = dashboard.recurring;
  const [editing, setEditing] = useState<Bill | BillInput | "new" | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const bills = new Map(dashboard.bills.map((bill) => [bill.id, bill]));
  const soon = summary.items.filter((item) => item.days_until_due <= 7);
  const later = summary.items.filter((item) => item.days_until_due > 7);
  const viewed = viewing ? bills.get(viewing) ?? null : null;

  return (
    <div className="space-y-5">
      <section aria-labelledby="fixed-title" className="overflow-hidden rounded-[var(--radius-card)] bg-hero p-5 text-white shadow-[var(--shadow-raised)] sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm text-white/75"><Lock className="size-4" aria-hidden="true" />Fixed monthly expenses</p>
            <h2 id="fixed-title" className="tabular mt-1 text-4xl font-semibold tracking-tight">{cad(summary.fixed_monthly_cents)}<span className="text-lg font-normal text-white/70"> / month</span></h2>
            <p className="mt-2 max-w-md text-sm text-white/75">What leaves every month no matter what.{summary.share_of_income_basis_points !== null && <> About <span className="font-semibold text-white">{Math.round(summary.share_of_income_basis_points / 100)}%</span> of your typical income.</>}</p>
          </div>
          <dl className="grid grid-cols-3 gap-2 text-center sm:min-w-80">
            <HeroStat label="Before payday" value={cad(summary.due_before_payday_cents)} />
            <HeroStat label="Next 7 days" value={cad(summary.due_next_7_days_cents)} />
            <HeroStat label="Subscriptions" value={cad(summary.subscriptions_monthly_cents)} />
          </dl>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">Tap a bill to see its payment history or change how it’s paid.</p>
        <Button onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden="true" />Add a bill</Button>
      </div>

      {summary.suggestions.length > 0 && (
        <Card className="border-accent/30 p-5">
          <h2 className="flex items-center gap-2 font-semibold text-ink"><Wand2 className="size-4 text-accent" aria-hidden="true" />Found in your history</h2>
          <p className="mt-1 text-sm text-ink-muted">These charge the same amount every month. Add them so they’re tracked.</p>
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
        <Card className="p-5"><EmptyState icon={Repeat} title="No recurring expenses yet" description="Add rent, your phone plan, and subscriptions, or tick “Recurring” when you add a transaction." action={<Button size="sm" onClick={() => setEditing("new")}>Add a bill</Button>} /></Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
          <Group title="Due in the next 7 days" empty="Nothing due this week." items={soon} onOpen={setViewing} />
          <Group title="Later" empty="Nothing else scheduled." items={later} onOpen={setViewing} />
        </div>
      )}

      {summary.subscriptions_monthly_cents > 0 && (
        <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm text-ink-muted"><Tv className="size-4 shrink-0 text-[#7047b7] dark:text-[#c1a5ee]" aria-hidden="true" />{cad(summary.subscriptions_monthly_cents)} a month on subscriptions. Small charges add up over a year.</p>
          <Button variant="outline" onClick={() => onAsk("Are any of my subscriptions worth cancelling? What would it save me in a year?")}><Sparkles className="size-4" aria-hidden="true" />Review with Penny</Button>
        </Card>
      )}
      <p className="flex gap-2 px-1 text-xs leading-relaxed text-ink-subtle"><Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{summary.methodology}</p>

      <BillDetail dashboard={dashboard} bill={viewed} onClose={() => setViewing(null)} onMarkPaid={onMarkPaid} onSave={onSave} onEdit={(bill) => { setViewing(null); setEditing(bill); }} onDelete={(bill) => { setViewing(null); onDelete(bill); }} />
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

function Group({ title, empty, items, onOpen }: { title: string; empty: string; items: RecurringExpense[]; onOpen: (id: string) => void }) {
  return (
    <Card className="p-5">
      <h2 className="font-semibold text-ink">{title}</h2>
      {items.length === 0 ? <p className="mt-2 text-sm text-ink-subtle">{empty}</p> : (
        <ul className="mt-2 space-y-1">
          {items.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => onOpen(item.id)} className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 text-left transition-colors hover:bg-sage-soft">
                <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", item.kind === "subscription" ? "bg-[#f2ecff] text-[#7047b7] dark:bg-[#302847] dark:text-[#c1a5ee]" : "bg-info-soft text-info")} aria-hidden="true">{item.kind === "subscription" ? <Tv className="size-4" /> : <Repeat className="size-4" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{item.name}</span>
                  <span className="block truncate text-xs text-ink-subtle"><span className={cn(item.days_until_due <= 3 && "font-semibold text-gold-strong")}>{dueLabel(item.days_until_due)}</span> · {FREQUENCY_SHORT[item.frequency]} · {item.auto_record ? "auto-paid" : "you mark paid"}</span>
                </span>
                <span className="tabular text-sm font-semibold text-ink">{cad(item.amount_cents)}</span>
                <ChevronRight className="size-4 shrink-0 text-ink-subtle" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** One bill: how it's paid, the next payment, and every payment so far. */
function BillDetail({ dashboard, bill, onClose, onMarkPaid, onSave, onEdit, onDelete }: { dashboard: Dashboard; bill: Bill | null; onClose: () => void; onMarkPaid: (bill: Bill) => void; onSave: Props["onSave"]; onEdit: (bill: Bill) => void; onDelete: (bill: Bill) => void }) {
  const [history, setHistory] = useState<BillHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const accounts = new Map(dashboard.accounts.map((account) => [account.id, account.name]));
  const item = bill ? dashboard.recurring.items.find((entry) => entry.id === bill.id) : undefined;

  useEffect(() => {
    if (!bill) return;
    let active = true;
    dashboardApi.billHistory(bill.id)
      .then((data) => { if (active) { setHistory(data); setError(null); } })
      .catch((reason: unknown) => { if (active) setError(describeError(reason, "History couldn’t load").detail); });
    return () => { active = false; };
  }, [bill, dashboard]);

  async function setMode(auto: boolean) {
    if (!bill || auto === bill.auto_record) return;
    setSaving(true);
    const result = await onSave(bill.id, { ...billInput(bill), auto_record: auto });
    setSaving(false);
    if (result) setError(result);
  }

  return (
    <Dialog open={bill !== null} onOpenChange={(open) => { if (!open) { onClose(); setHistory(null); } }}>
      <DialogContent className="sm:max-w-xl">
        {bill && (
          <>
            <DialogHeader>
              <DialogTitle>{bill.name}</DialogTitle>
              <DialogDescription><span className="tabular font-semibold text-ink">{cad(bill.amount_cents)}</span> {FREQUENCY_SHORT[bill.frequency]} from {accounts.get(bill.account_id) ?? "an account"}</DialogDescription>
            </DialogHeader>
            <div className="space-y-5">
              <div className="flex flex-col gap-3 rounded-2xl bg-sage-soft p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-surface text-gold-strong" aria-hidden="true"><CalendarClock className="size-5" /></span>
                  <div><p className="text-xs text-ink-subtle">Next payment</p><p className="font-semibold text-ink">{formatLongDate(bill.next_due)}{item && <span className={cn("ml-2 text-sm font-medium", item.days_until_due <= 3 ? "text-gold-strong" : "text-ink-subtle")}>{dueLabel(item.days_until_due)}</span>}</p></div>
                </div>
                <Button variant={bill.auto_record ? "outline" : "default"} onClick={() => onMarkPaid(bill)}><Check className="size-4" aria-hidden="true" />{bill.auto_record ? "Pay early" : "Mark paid"}</Button>
              </div>

              <PaymentMode value={bill.auto_record} onChange={(auto) => void setMode(auto)} disabled={saving} />

              {error && <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger">{error}</p>}
              {!history ? <div className="grid h-32 place-items-center rounded-2xl bg-sage-soft"><LoaderCircle className="size-5 animate-spin text-accent" aria-hidden="true" /></div> : (
                <>
                  <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Stat label="Payments" value={String(history.payment_count)} />
                    <Stat label="Total paid" value={cad(history.total_paid_cents)} />
                    <Stat label="This year" value={cad(history.paid_this_year_cents)} />
                    <Stat label="Average" value={cad(history.average_cents)} />
                  </dl>
                  <section aria-labelledby="payment-history">
                    <h3 id="payment-history" className="text-sm font-semibold text-ink">Payment history</h3>
                    {history.payments.length === 0 ? <p className="mt-2 text-sm text-ink-subtle">No payments recorded yet.</p> : (
                      <ol className="mt-2 max-h-72 divide-y divide-line overflow-y-auto rounded-2xl border border-line">
                        {history.payments.map((payment) => (
                          <li key={payment.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                            <span className="w-24 shrink-0 text-ink-muted">{formatShortDate(payment.occurred_on)} {payment.occurred_on.slice(0, 4)}</span>
                            <span className="min-w-0 flex-1 truncate text-ink-subtle"><span className="hidden sm:inline">{accounts.get(payment.account_id) ?? "—"}</span></span>
                            <PaymentBadge automatically={payment.paid_automatically} />
                            <span className="tabular w-20 shrink-0 text-right font-semibold text-ink">{cad(payment.amount_cents)}</span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </section>
                </>
              )}

              <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-between">
                <Button variant="destructive-soft" onClick={() => onDelete(bill)}><Trash2 className="size-4" aria-hidden="true" />Delete bill</Button>
                <Button variant="outline" onClick={() => onEdit(bill)}><Pencil className="size-4" aria-hidden="true" />Edit details</Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Auto-paid, marked paid by the user, or simply recorded (history or a manual entry). */
function PaymentBadge({ automatically }: { automatically: boolean | null }) {
  if (automatically === true) return <Badge tone="accent" className="shrink-0"><Zap className="size-3" aria-hidden="true" />Auto</Badge>;
  if (automatically === false) return <Badge tone="info" className="shrink-0"><Hand className="size-3" aria-hidden="true" />You marked paid</Badge>;
  return <Badge tone="neutral" className="shrink-0">Recorded</Badge>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-sage-soft p-3"><dt className="text-xs text-ink-subtle">{label}</dt><dd className="tabular mt-0.5 truncate font-semibold text-ink">{value}</dd></div>;
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
      <PaymentMode value={autoRecord} onChange={setAutoRecord} />
      {error && <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger">{error}</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        {onDelete && <Button variant="destructive-soft" onClick={onDelete} disabled={busy}>Delete bill</Button>}
        <Button type="submit" className="flex-1" disabled={busy}>{draft && "id" in draft ? "Save bill" : "Add bill"}</Button>
      </div>
    </form>
  );
}
