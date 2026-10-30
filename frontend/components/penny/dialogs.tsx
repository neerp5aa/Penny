"use client";

import { FormEvent, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, LoaderCircle, PiggyBank, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import type { Budget, Dashboard, SavingsGoal, Transaction, TransactionWrite } from "@/lib/api";
import { defaultTransactionDate, formatMonth } from "@/lib/format";
import { centsToInput, parseCadToCents } from "@/lib/money";
import { cad, Field } from "./shared";
import { cn } from "@/lib/utils";

/** Resolves to an error message to show in the dialog, or null on success. */
type Submit<T> = (body: T) => Promise<string | null>;

function parseAmount(value: FormDataEntryValue | null): { cents: number } | { error: string } {
  try {
    const cents = parseCadToCents(String(value ?? ""));
    return cents > 0 ? { cents } : { error: "Enter an amount greater than $0.00" };
  } catch (reason) {
    return { error: reason instanceof Error ? reason.message : "Enter a valid amount" };
  }
}

function FormError({ message }: { message: string }) {
  return message ? <p role="alert" className="rounded-xl border border-danger/25 bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger">{message}</p> : null;
}

function SubmitButton({ busy, label, className }: { busy: boolean; label: string; className?: string }) {
  return (
    <Button type="submit" disabled={busy} className={cn("flex-1", className)}>
      {busy ? <><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />Saving…</> : label}
    </Button>
  );
}

// ---------------------------------------------------------------------------------------------
// Transactions

export function TransactionDialog({ target, dashboard, onClose, onSubmit, onRequestDelete }: {
  target: Transaction | "new" | null;
  dashboard: Dashboard;
  onClose: () => void;
  onSubmit: (id: string | null, body: TransactionWrite) => Promise<string | null>;
  onRequestDelete: (item: Transaction) => void;
}) {
  const item = target && target !== "new" ? target : null;
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? "Edit transaction" : "Add a transaction"}</DialogTitle>
          <DialogDescription>{item ? "Update the details below. Totals recalculate as soon as you save." : "Record money coming in or going out. Penny updates your totals right away."}</DialogDescription>
        </DialogHeader>
        <TransactionForm item={item} dashboard={dashboard} onSubmit={(body) => onSubmit(item?.id ?? null, body)} onRequestDelete={item ? () => onRequestDelete(item) : undefined} />
      </DialogContent>
    </Dialog>
  );
}

function TransactionForm({ item, dashboard, onSubmit, onRequestDelete }: { item: Transaction | null; dashboard: Dashboard; onSubmit: Submit<TransactionWrite>; onRequestDelete?: () => void }) {
  const [kind, setKind] = useState<Transaction["kind"]>(item?.kind ?? "spending");
  const [amountError, setAmountError] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const month = formatMonth(dashboard.active_month);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    const form = new FormData(event.currentTarget);
    const amount = parseAmount(form.get("amount"));
    if ("error" in amount) { setAmountError(amount.error); return; }
    setAmountError("");
    setBusy(true);
    const error = await onSubmit({
      description: String(form.get("description")).trim(),
      account_id: String(form.get("account_id")),
      category_id: String(form.get("category_id")) || null,
      amount_cents: amount.cents,
      kind,
      occurred_on: String(form.get("occurred_on")),
    });
    setBusy(false);
    if (error) setFormError(error);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset>
        <legend className="text-sm font-semibold text-ink">Type</legend>
        <div className="mt-1.5 grid grid-cols-2 gap-2 rounded-xl bg-sage-soft p-1">
          {([["spending", "Money out", ArrowUpRight], ["income", "Money in", ArrowDownLeft]] as const).map(([value, label, Icon]) => (
            <label key={value} className={cn("flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent", kind === value ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink")}>
              <input type="radio" name="kind" value={value} checked={kind === value} onChange={() => setKind(value)} className="sr-only" />
              <Icon className={cn("size-4", value === "income" ? "text-accent" : "text-ink-subtle")} aria-hidden="true" />{label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-[1fr_1.4fr]">
        <Field label="Amount (CAD)" error={amountError}>
          {(props) => <Input {...props} name="amount" inputMode="decimal" autoComplete="off" placeholder="0.00" defaultValue={item ? centsToInput(String(item.amount_cents)) : ""} required />}
        </Field>
        <Field label="Description">
          {(props) => <Input {...props} name="description" placeholder={kind === "income" ? "e.g. Part-time pay" : "e.g. Groceries"} defaultValue={item?.description} required maxLength={160} />}
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category">
          {(props) => (
            <Select {...props} name="category_id" defaultValue={item?.category_id ?? ""}>
              <option value="">Uncategorized</option>
              {dashboard.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Account">
          {(props) => (
            <Select {...props} name="account_id" defaultValue={item?.account_id ?? dashboard.accounts[0]?.id} required>
              {dashboard.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </Select>
          )}
        </Field>
      </div>
      <Field label="Date" hint={`Only ${month} transactions count toward this month’s totals.`}>
        {(props) => <Input {...props} name="occurred_on" type="date" defaultValue={item?.occurred_on ?? defaultTransactionDate(dashboard.active_month)} required />}
      </Field>
      <FormError message={formError} />
      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row">
        {onRequestDelete && <Button variant="destructive-soft" onClick={onRequestDelete} disabled={busy}><Trash2 className="size-4" aria-hidden="true" />Delete</Button>}
        <SubmitButton busy={busy} label={item ? "Save changes" : "Add transaction"} />
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------------------------
// Budgets

export function BudgetDialog({ target, dashboard, onClose, onSubmit, onRequestDelete }: {
  target: Budget | "new" | null;
  dashboard: Dashboard;
  onClose: () => void;
  onSubmit: (id: string | null, body: { category_id: string; limit_cents: number }) => Promise<string | null>;
  onRequestDelete: (item: Budget) => void;
}) {
  const item = target && target !== "new" ? target : null;
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? `${item.category_name} budget` : "Add a monthly budget"}</DialogTitle>
          <DialogDescription>Set how much you plan to spend in a category for {formatMonth(dashboard.active_month)}. Spending is added up from your transactions.</DialogDescription>
        </DialogHeader>
        <BudgetForm item={item} dashboard={dashboard} onSubmit={(body) => onSubmit(item?.id ?? null, body)} onRequestDelete={item ? () => onRequestDelete(item) : undefined} />
      </DialogContent>
    </Dialog>
  );
}

function BudgetForm({ item, dashboard, onSubmit, onRequestDelete }: { item: Budget | null; dashboard: Dashboard; onSubmit: Submit<{ category_id: string; limit_cents: number }>; onRequestDelete?: () => void }) {
  const [amountError, setAmountError] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const budgeted = useMemo(() => new Set(dashboard.budgets.map((budget) => budget.category_id)), [dashboard.budgets]);
  const choices = dashboard.categories.filter((category) => item?.category_id === category.id || (!budgeted.has(category.id) && category.name !== "Income"));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    const form = new FormData(event.currentTarget);
    let limit: number;
    try { limit = parseCadToCents(String(form.get("limit"))); } catch (reason) { setAmountError(reason instanceof Error ? reason.message : "Enter a valid amount"); return; }
    setAmountError("");
    setBusy(true);
    const error = await onSubmit({ category_id: item?.category_id ?? String(form.get("category_id")), limit_cents: limit });
    setBusy(false);
    if (error) setFormError(error);
  }

  if (!item && choices.length === 0) {
    return <p className="rounded-xl bg-sage-soft p-4 text-sm text-ink-muted">Every spending category already has a budget this month. Edit an existing budget instead.</p>;
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Category" hint={item ? "To budget a different category, add a new budget." : undefined}>
        {(props) => (
          <Select {...props} name="category_id" defaultValue={item?.category_id ?? choices[0]?.id} disabled={Boolean(item)} required>
            {choices.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </Select>
        )}
      </Field>
      <Field label="Monthly limit (CAD)" error={amountError} hint={item ? `You’ve spent ${cad(item.spent_cents)} in ${item.category_name} so far this month.` : undefined}>
        {(props) => <Input {...props} name="limit" inputMode="decimal" autoComplete="off" placeholder="0.00" defaultValue={item ? centsToInput(String(item.limit_cents)) : ""} required autoFocus={Boolean(item)} />}
      </Field>
      <FormError message={formError} />
      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row">
        {onRequestDelete && <Button variant="destructive-soft" onClick={onRequestDelete} disabled={busy}><Trash2 className="size-4" aria-hidden="true" />Delete</Button>}
        <SubmitButton busy={busy} label="Save budget" />
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------------------------
// Savings goals

export type GoalBody = { name: string; target_cents: number; current_cents: number; target_date: string | null; status?: "active" | "paused" };

export function GoalDialog({ target, onClose, onSubmit, onRequestDelete }: {
  target: SavingsGoal | "new" | null;
  onClose: () => void;
  onSubmit: (id: string | null, body: GoalBody) => Promise<string | null>;
  onRequestDelete: (item: SavingsGoal) => void;
}) {
  const item = target && target !== "new" ? target : null;
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? "Edit savings goal" : "Create a savings goal"}</DialogTitle>
          <DialogDescription>Give your savings a destination. You can change these details any time.</DialogDescription>
        </DialogHeader>
        <GoalForm item={item} onSubmit={(body) => onSubmit(item?.id ?? null, body)} onRequestDelete={item ? () => onRequestDelete(item) : undefined} />
      </DialogContent>
    </Dialog>
  );
}

function GoalForm({ item, onSubmit, onRequestDelete }: { item: SavingsGoal | null; onSubmit: Submit<GoalBody>; onRequestDelete?: () => void }) {
  const [errors, setErrors] = useState<{ current?: string; target?: string }>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    const form = new FormData(event.currentTarget);
    const target = parseAmount(form.get("target"));
    let current: { cents: number } | { error: string };
    try { current = { cents: parseCadToCents(String(form.get("current"))) }; } catch (reason) { current = { error: reason instanceof Error ? reason.message : "Enter a valid amount" }; }
    const next: typeof errors = {};
    if ("error" in target) next.target = target.error;
    if ("error" in current) next.current = current.error;
    if (!next.target && !next.current && "cents" in target && "cents" in current && current.cents > target.cents) next.current = "Saved so far can’t be more than the target.";
    setErrors(next);
    if (next.target || next.current || !("cents" in target) || !("cents" in current)) return;
    setBusy(true);
    const status = form.get("status");
    const error = await onSubmit({ name: String(form.get("name")).trim(), target_cents: target.cents, current_cents: current.cents, target_date: String(form.get("target_date")) || null, ...(status === "active" || status === "paused" ? { status } : {}) });
    setBusy(false);
    if (error) setFormError(error);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="What are you saving for?">
        {(props) => <Input {...props} name="name" placeholder="e.g. Winter emergency fund" defaultValue={item?.name} required maxLength={100} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Target (CAD)" error={errors.target}>
          {(props) => <Input {...props} name="target" inputMode="decimal" autoComplete="off" placeholder="0.00" defaultValue={item ? centsToInput(String(item.target_cents)) : ""} required />}
        </Field>
        <Field label="Saved so far (CAD)" error={errors.current}>
          {(props) => <Input {...props} name="current" inputMode="decimal" autoComplete="off" defaultValue={item ? centsToInput(String(item.current_cents)) : "0.00"} required />}
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Target date" hint="Optional">
          {(props) => <Input {...props} name="target_date" type="date" defaultValue={item?.target_date ?? ""} />}
        </Field>
        {item && item.status !== "completed" && (
          <Field label="Status" hint="Paused goals keep their progress.">
            {(props) => (
              <Select {...props} name="status" defaultValue={item.status}>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
              </Select>
            )}
          </Field>
        )}
      </div>
      <FormError message={formError} />
      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row">
        {onRequestDelete && <Button variant="destructive-soft" onClick={onRequestDelete} disabled={busy}><Trash2 className="size-4" aria-hidden="true" />Delete</Button>}
        <SubmitButton busy={busy} label={item ? "Save goal" : "Create goal"} />
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------------------------
// Add money to a goal

export function AddMoneyDialog({ goal, onClose, onSubmit }: { goal: SavingsGoal | null; onClose: () => void; onSubmit: (goal: SavingsGoal, amountCents: number) => Promise<string | null> }) {
  return (
    <Dialog open={goal !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {goal && (
          <>
            <DialogHeader>
              <DialogTitle>Add money to {goal.name}</DialogTitle>
              <DialogDescription>Saved {cad(goal.current_cents)} of {cad(goal.target_cents)} so far. This records a fictional contribution toward the goal.</DialogDescription>
            </DialogHeader>
            <AddMoneyForm goal={goal} onSubmit={(amount) => onSubmit(goal, amount)} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AddMoneyForm({ goal, onSubmit }: { goal: SavingsGoal; onSubmit: Submit<number> }) {
  const [value, setValue] = useState("");
  const [amountError, setAmountError] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    const amount = parseAmount(value);
    if ("error" in amount) { setAmountError(amount.error); return; }
    setAmountError("");
    setBusy(true);
    const error = await onSubmit(amount.cents);
    setBusy(false);
    if (error) setFormError(error);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Amount (CAD)" error={amountError}>
        {(props) => <Input {...props} value={value} onChange={(event) => setValue(event.target.value)} inputMode="decimal" autoComplete="off" placeholder="0.00" required autoFocus />}
      </Field>
      <div className="flex flex-wrap gap-2" aria-label="Quick amounts">
        {["10.00", "25.00", "50.00", "100.00"].map((quick) => (
          <button key={quick} type="button" onClick={() => setValue(quick)} className={cn("min-h-10 rounded-full border px-3.5 text-sm font-semibold transition-colors", value === quick ? "border-accent bg-accent-soft text-accent-strong" : "border-line text-ink-muted hover:border-line-strong hover:text-ink")}>
            ${quick.replace(".00", "")}
          </button>
        ))}
      </div>
      <FormError message={formError} />
      <div className="flex pt-1">
        <Button type="submit" disabled={busy} className="flex-1">
          {busy ? <><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />Adding…</> : <><PiggyBank className="size-4" aria-hidden="true" />Add to {goal.name}</>}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------------------------
// Confirmation

export type ConfirmRequest = { title: string; description: string; confirmLabel: string; onConfirm: () => Promise<string | null> };

export function ConfirmDialog({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {request && <ConfirmBody request={request} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function ConfirmBody({ request, onClose }: { request: ConfirmRequest; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function confirm() {
    setBusy(true);
    setError("");
    const message = await request.onConfirm();
    setBusy(false);
    if (message) setError(message);
    else onClose();
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>{request.title}</DialogTitle>
        <DialogDescription>{request.description}</DialogDescription>
      </DialogHeader>
      <FormError message={error} />
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="destructive" onClick={() => void confirm()} disabled={busy}>
          {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Trash2 className="size-4" aria-hidden="true" />}{request.confirmLabel}
        </Button>
      </div>
    </>
  );
}
