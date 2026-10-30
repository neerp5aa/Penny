"use client";

import { FormEvent, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, LoaderCircle, PiggyBank, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import { type AccountType, type Budget, type Category, type CategorySuggestion, type Dashboard, dashboardApi, type SavingsGoal, type Transaction, type TransactionWrite } from "@/lib/api";
import { DatePicker } from "@/components/ui/date-picker";
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

/** Runs a create call (category, account), applies the new dashboard, and returns it or an error. */
export type InlineCreate = (action: () => Promise<Dashboard>) => Promise<Dashboard | string>;

export function TransactionDialog({ target, dashboard, onClose, onSubmit, onRequestDelete, onCreate }: {
  target: Transaction | "new" | null;
  dashboard: Dashboard;
  onClose: () => void;
  onSubmit: (id: string | null, body: TransactionWrite) => Promise<string | null>;
  onRequestDelete: (item: Transaction) => void;
  onCreate: InlineCreate;
}) {
  const item = target && target !== "new" ? target : null;
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? "Edit transaction" : "Add a transaction"}</DialogTitle>
          <DialogDescription>{item ? "Totals recalculate as soon as you save." : "Penny picks a category from the description. You can change it."}</DialogDescription>
        </DialogHeader>
        <TransactionForm key={item?.id ?? "new"} item={item} dashboard={dashboard} onCreate={onCreate} onSubmit={(body) => onSubmit(item?.id ?? null, body)} onRequestDelete={item ? () => onRequestDelete(item) : undefined} />
      </DialogContent>
    </Dialog>
  );
}

const KIND_STYLE = {
  spending: { label: "Money out", icon: ArrowUpRight, sign: "−", on: "border-danger bg-danger-soft text-danger", button: "bg-danger text-on-danger hover:bg-danger-hover" },
  income: { label: "Money in", icon: ArrowDownLeft, sign: "+", on: "border-zone-green bg-zone-green-soft text-[#0d7a4d] dark:text-zone-green", button: "bg-zone-green text-white hover:brightness-95" },
} as const;

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = { chequing: "Chequing", savings: "Savings", credit: "Credit card", cash: "Cash", investment: "Investment", other: "Other" };

/** Categories for one kind, with subcategories listed under their parent ("Food › Groceries"). */
export function categoryOptions(categories: Category[], kind: Category["kind"]): { id: string; label: string }[] {
  const own = categories.filter((category) => category.kind === kind);
  return own.filter((category) => !category.parent_id).flatMap((parent) => [
    { id: parent.id, label: parent.name },
    ...own.filter((child) => child.parent_id === parent.id).map((child) => ({ id: child.id, label: `${parent.name} › ${child.name}` })),
  ]);
}

const NEW = "__new__";

function TransactionForm({ item, dashboard, onSubmit, onRequestDelete, onCreate }: { item: Transaction | null; dashboard: Dashboard; onSubmit: Submit<TransactionWrite>; onRequestDelete?: () => void; onCreate: InlineCreate }) {
  const [kind, setKind] = useState<Transaction["kind"]>(item?.kind ?? "spending");
  const [amountError, setAmountError] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState(item?.category_id ?? "");
  const [categoryTouched, setCategoryTouched] = useState(Boolean(item));
  const [suggestion, setSuggestion] = useState<CategorySuggestion | null>(null);
  const [account, setAccount] = useState(item?.account_id ?? dashboard.accounts.find((a) => a.account_type === "chequing")?.id ?? dashboard.accounts[0]?.id ?? "");
  const [date, setDate] = useState(item?.occurred_on ?? defaultTransactionDate(dashboard.active_month));
  const [adding, setAdding] = useState<"category" | "account" | null>(null);
  const style = KIND_STYLE[kind];
  const options = categoryOptions(dashboard.categories, kind);

  function switchKind(next: Transaction["kind"]) {
    setKind(next);
    if (dashboard.categories.find((c) => c.id === category)?.kind !== next) { setCategory(""); setCategoryTouched(false); setSuggestion(null); }
  }

  /** Fills in the category from the merchant name, unless the user already picked one. */
  async function suggestCategory(description: string) {
    if (categoryTouched || !description.trim()) return;
    try {
      const result = await dashboardApi.suggestCategory(description.trim(), kind);
      setSuggestion(result);
      if (result.category_id) setCategory(result.category_id);
    } catch { /* Suggestions are optional; the user can still pick a category. */ }
  }

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
      account_id: account,
      category_id: category || null,
      amount_cents: amount.cents,
      kind,
      occurred_on: date,
    });
    setBusy(false);
    if (error) setFormError(error);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div role="radiogroup" aria-label="Type" className="grid grid-cols-2 gap-2">
        {(["spending", "income"] as const).map((value) => {
          const option = KIND_STYLE[value];
          const Icon = option.icon;
          const selected = kind === value;
          return (
            <button key={value} type="button" role="radio" aria-checked={selected} onClick={() => switchKind(value)} className={cn("flex min-h-14 items-center justify-center gap-2 rounded-2xl border-2 text-base font-semibold transition-colors", selected ? option.on : "border-line text-ink-muted hover:bg-sage-soft")}>
              <Icon className="size-5" aria-hidden="true" />{option.label}
            </button>
          );
        })}
      </div>

      <Field label="Amount (CAD)" error={amountError}>
        {(props) => (
          <div className={cn("flex items-center rounded-2xl border-2 px-4 transition-colors focus-within:ring-4 focus-within:ring-accent/15", style.on)}>
            <span className="tabular shrink-0 whitespace-nowrap text-3xl font-semibold" aria-hidden="true">{style.sign}$</span>
            <input {...props} name="amount" inputMode="decimal" autoComplete="off" placeholder="0.00" defaultValue={item ? centsToInput(String(item.amount_cents)) : ""} required className="tabular min-h-16 w-full min-w-0 bg-transparent px-1 text-3xl font-semibold text-ink placeholder:text-ink-subtle/60 focus:outline-none" />
          </div>
        )}
      </Field>

      <Field label="Description">
        {(props) => <Input {...props} name="description" placeholder={kind === "income" ? "e.g. Harbour Books pay" : "e.g. Starbucks"} defaultValue={item?.description} required maxLength={160} onBlur={(event) => void suggestCategory(event.target.value)} />}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category" hint={suggestion?.category_name && !categoryTouched && category === suggestion.category_id ? `Picked automatically${suggestion.necessity ? ` · a ${suggestion.necessity}` : ""}` : undefined}>
          {(props) => (
            <Select {...props} value={category} onChange={(event) => { if (event.target.value === NEW) { setAdding("category"); return; } setCategory(event.target.value); setCategoryTouched(true); }}>
              <option value="">Uncategorized</option>
              {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              <option value={NEW}>+ New {kind === "income" ? "income type" : "category"}…</option>
            </Select>
          )}
        </Field>
        <Field label={kind === "income" ? "Paid into" : "Paid from"}>
          {(props) => (
            <Select {...props} value={account} onChange={(event) => { if (event.target.value === NEW) { setAdding("account"); return; } setAccount(event.target.value); }} required>
              {dashboard.accounts.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
              <option value={NEW}>+ New account…</option>
            </Select>
          )}
        </Field>
      </div>

      {adding === "category" && <NewCategory kind={kind} dashboard={dashboard} onCreate={onCreate} onDone={(id) => { setAdding(null); if (id) { setCategory(id); setCategoryTouched(true); } }} />}
      {adding === "account" && <NewAccount onCreate={onCreate} onDone={(id) => { setAdding(null); if (id) setAccount(id); }} />}

      <Field label="Date">
        {(props) => <DatePicker id={props.id} aria-describedby={props["aria-describedby"]} value={date} onChange={setDate} />}
      </Field>

      <FormError message={formError} />
      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row">
        {onRequestDelete && <Button variant="destructive-soft" onClick={onRequestDelete} disabled={busy}><Trash2 className="size-4" aria-hidden="true" />Delete</Button>}
        <Button type="submit" disabled={busy} className={cn("min-h-12 flex-1", style.button)}>
          {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
          {item ? "Save changes" : kind === "income" ? "Add money in" : "Add money out"}
        </Button>
      </div>
    </form>
  );
}

/** Inline "new category" form; reports the created id (or null if cancelled). */
function NewCategory({ kind, dashboard, onCreate, onDone }: { kind: Category["kind"]; dashboard: Dashboard; onCreate: InlineCreate; onDone: (id: string | null) => void }) {
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const [error, setError] = useState("");
  const parents = dashboard.categories.filter((c) => c.kind === kind && !c.parent_id);
  async function save() {
    if (!name.trim()) { setError("Give it a name"); return; }
    const result = await onCreate(() => dashboardApi.createCategory({ name: name.trim(), kind, parent_id: parent || null }));
    if (typeof result === "string") { setError(result); return; }
    onDone(result.categories.find((c) => c.kind === kind && c.name.toLowerCase() === name.trim().toLowerCase())?.id ?? null);
  }
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-sage-soft p-3">
      <p className="text-sm font-semibold text-ink">New {kind === "income" ? "income type" : "category"}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input aria-label="Name" placeholder={kind === "income" ? "e.g. Tutoring" : "e.g. Pets"} value={name} onChange={(event) => setName(event.target.value)} maxLength={40} autoFocus />
        {kind === "spending" && (
          <Select aria-label="Put it under" value={parent} onChange={(event) => setParent(event.target.value)}>
            <option value="">Top-level category</option>
            {parents.map((option) => <option key={option.id} value={option.id}>Under {option.name}</option>)}
          </Select>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2"><Button size="sm" onClick={() => void save()}>Add</Button><Button size="sm" variant="ghost" onClick={() => onDone(null)}>Cancel</Button></div>
    </div>
  );
}

function NewAccount({ onCreate, onDone }: { onCreate: InlineCreate; onDone: (id: string | null) => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("chequing");
  const [limit, setLimit] = useState("");
  const [error, setError] = useState("");
  async function save() {
    if (!name.trim()) { setError("Give it a name"); return; }
    let limitCents: number | null = null;
    if (type === "credit") {
      try { limitCents = parseCadToCents(limit); } catch { setError("Enter the card’s credit limit"); return; }
      if (limitCents <= 0) { setError("Enter the card’s credit limit"); return; }
    }
    const result = await onCreate(() => dashboardApi.createAccount({ name: name.trim(), account_type: type, balance_cents: 0, credit_limit_cents: limitCents }));
    if (typeof result === "string") { setError(result); return; }
    onDone(result.accounts.find((a) => a.name === name.trim())?.id ?? null);
  }
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-sage-soft p-3">
      <p className="text-sm font-semibold text-ink">New account</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input aria-label="Account name" placeholder="e.g. Wallet cash" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} autoFocus />
        <Select aria-label="Account type" value={type} onChange={(event) => setType(event.target.value as AccountType)}>
          {Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
        {type === "credit" && <Input aria-label="Credit limit (CAD)" inputMode="decimal" placeholder="Credit limit, e.g. 1500" value={limit} onChange={(event) => setLimit(event.target.value)} />}
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2"><Button size="sm" onClick={() => void save()}>Add</Button><Button size="sm" variant="ghost" onClick={() => onDone(null)}>Cancel</Button></div>
    </div>
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
  const choices = categoryOptions(dashboard.categories, "spending").filter((option) => item?.category_id === option.id || !budgeted.has(option.id));

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
            {choices.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
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
