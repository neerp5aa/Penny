"use client";

import { useState } from "react";
import { Copy, Pencil, Plus, Sparkles, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { Budget, Dashboard, Transaction } from "@/lib/api";
import { addMonths, formatMonth, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CashFlowChart, CategoryBars, categoryColours } from "./charts";
import { cad, EmptyState, SectionHeading } from "./shared";
import { TransactionsPanel } from "./transactions-panel";
import { useHistory } from "./use-history";

type Props = {
  dashboard: Dashboard;
  historyVersion: number;
  onAsk: (question: string) => void;
  onSelectMonth: (month: string) => void;
  onAddTransaction: () => void;
  onEditTransaction: (item: Transaction) => void;
  onDeleteTransaction: (item: Transaction) => void;
  onAddBudget: () => void;
  onEditBudget: (item: Budget) => void;
  onCopyBudgets: (fromMonth: string) => void;
};

export function budgetStatus(budget: Budget): { label: string; tone: "danger" | "gold" | "accent"; bar: string } {
  if (budget.remaining_cents < 0) return { label: `${cad(-budget.remaining_cents)} over`, tone: "danger", bar: "bg-danger" };
  if (budget.usage_basis_points >= 9_000) return { label: `${cad(budget.remaining_cents)} left`, tone: "gold", bar: "bg-gold" };
  return { label: `${cad(budget.remaining_cents)} left`, tone: "accent", bar: "bg-accent" };
}

export function SpendingView(props: Props) {
  const { dashboard } = props;
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <SpendingSummary dashboard={dashboard} />
      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr] [&>*]:min-w-0">
        <Budgets {...props} />
        <Wants dashboard={dashboard} onAsk={props.onAsk} />
      </div>
      <TransactionsPanel dashboard={dashboard} title={`Transactions · ${formatMonth(dashboard.active_month)}`} description="Categories are picked automatically from the merchant name. Export any view as CSV." onAdd={props.onAddTransaction} onEdit={props.onEditTransaction} onDelete={props.onDeleteTransaction} />
      <Trends dashboard={dashboard} historyVersion={props.historyVersion} onSelectMonth={props.onSelectMonth} />
    </div>
  );
}

function SpendingSummary({ dashboard }: { dashboard: Dashboard }) {
  const { totals, spending_classification: split } = dashboard;
  const over = totals.budget_remaining_cents < 0;
  return (
    <section aria-label="Spending summary" className="grid gap-3 sm:grid-cols-3">
      <Card className="p-5">
        <p className="text-sm text-ink-subtle">Spent this month</p>
        <p className="tabular mt-1 text-2xl font-semibold tracking-tight text-ink">{cad(totals.spending_cents)}</p>
        <p className="mt-1 text-xs text-ink-subtle">of {cad(totals.total_budget_cents)} planned</p>
      </Card>
      <Card className="p-5">
        <p className="text-sm text-ink-subtle">{over ? "Over budget" : "Left to spend"}</p>
        <p className={cn("tabular mt-1 text-2xl font-semibold tracking-tight", over ? "text-danger" : "text-accent-strong")}>{cad(Math.abs(totals.budget_remaining_cents))}</p>
        <p className="mt-1 text-xs text-ink-subtle">Safe to spend after bills: {cad(dashboard.spending_power_cents)}</p>
      </Card>
      <Card className="p-5">
        <p className="text-sm text-ink-subtle">Needs vs wants</p>
        <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-sage" role="img" aria-label={`Needs ${Math.round(split.needs_basis_points / 100)} percent, wants ${Math.round(split.wants_basis_points / 100)} percent`}>
          <span className="bg-info" style={{ width: `${split.needs_basis_points / 100}%` }} />
          <span className="bg-gold" style={{ width: `${split.wants_basis_points / 100}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-xs">
          <span className="text-ink-muted"><span className="mr-1 inline-block size-2 rounded-full bg-info" aria-hidden="true" />Needs {cad(split.needs_cents)}</span>
          <span className="text-ink-muted"><span className="mr-1 inline-block size-2 rounded-full bg-gold" aria-hidden="true" />Wants {cad(split.wants_cents)}</span>
        </div>
      </Card>
    </section>
  );
}

function Budgets({ dashboard, onAddBudget, onEditBudget, onCopyBudgets }: Props) {
  const previousMonth = addMonths(dashboard.active_month, -1);
  const canCopy = dashboard.data_months.includes(previousMonth);
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight text-ink">Budgets</h2>
        <div className="flex gap-2">
          {canCopy && dashboard.budgets.length === 0 && <Button variant="outline" size="sm" onClick={() => onCopyBudgets(previousMonth)}><Copy className="size-4" aria-hidden="true" />Copy last month</Button>}
          <Button variant="secondary" size="sm" onClick={onAddBudget}><Plus className="size-4" aria-hidden="true" />Add</Button>
        </div>
      </div>
      {dashboard.budgets.length === 0 ? (
        <EmptyState className="mt-4" icon={Target} title="No budgets yet" description="Set a monthly limit for a category to track it here." />
      ) : (
        <ul className="mt-4 space-y-4">
          {[...dashboard.budgets].sort((a, b) => b.usage_basis_points - a.usage_basis_points).map((budget) => {
            const status = budgetStatus(budget);
            return (
              <li key={budget.id}>
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-semibold text-ink">{budget.category_name}</span>
                  <span className="flex items-center gap-1">
                    <span className={cn("text-sm font-medium", status.tone === "danger" ? "text-danger" : status.tone === "gold" ? "text-gold-strong" : "text-ink-muted")}>{status.label}</span>
                    <button type="button" onClick={() => onEditBudget(budget)} className="grid size-11 place-items-center rounded-lg text-ink-subtle hover:bg-sage-soft hover:text-ink" aria-label={`Edit ${budget.category_name} budget`}><Pencil className="size-3.5" aria-hidden="true" /></button>
                  </span>
                </div>
                <Progress value={Math.min(100, budget.usage_basis_points / 100)} indicatorClassName={status.bar} aria-label={`${budget.category_name}: ${Math.floor(budget.usage_basis_points / 100)}% used`} />
                <p className="tabular mt-1 text-xs text-ink-subtle">{cad(budget.spent_cents)} of {cad(budget.limit_cents)}</p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** Spending Penny labelled a want: the easiest place to find savings, without judgement. */
function Wants({ dashboard, onAsk }: { dashboard: Dashboard; onAsk: (question: string) => void }) {
  const wants = dashboard.transactions.filter((item) => item.necessity === "want").sort((a, b) => b.amount_cents - a.amount_cents);
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-lg font-semibold tracking-tight text-ink">Wants this month</h2>
      <p className="mt-1 text-sm text-ink-subtle">Nice-to-haves, not essentials. Wants are fine; seeing them helps you choose.</p>
      <p className="tabular mt-4 text-3xl font-semibold tracking-tight text-gold-strong">{cad(dashboard.spending_classification.wants_cents)}</p>
      {wants.length === 0 ? <p className="mt-3 text-sm text-ink-subtle">No wants recorded this month.</p> : (
        <ul className="mt-3 divide-y divide-line">
          {wants.slice(0, 5).map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0"><span className="block truncate font-medium text-ink">{item.description}</span><span className="text-xs text-ink-subtle">{item.category} · {formatShortDate(item.occurred_on)}</span></span>
              <span className="tabular shrink-0 font-semibold text-ink">{cad(item.amount_cents)}</span>
            </li>
          ))}
        </ul>
      )}
      {wants.length > 0 && <Button variant="outline" className="mt-4 w-full" onClick={() => onAsk("Which of my wants this month could I cut back on, and what would it save me?")}><Sparkles className="size-4" aria-hidden="true" />Ask Penny where to trim</Button>}
    </Card>
  );
}

function Trends({ dashboard, historyVersion, onSelectMonth }: { dashboard: Dashboard; historyVersion: number; onSelectMonth: (month: string) => void }) {
  const [range, setRange] = useState<6 | 12>(6);
  const history = useHistory(addMonths(dashboard.active_month, -(range - 1)), dashboard.active_month, historyVersion);
  const colourFor = categoryColours(dashboard.categories);
  return (
    <section aria-labelledby="trends-title">
      <SectionHeading id="trends-title" title="Trends" description="Select a month to open it." action={
        <div className="flex rounded-xl bg-sage-soft p-1" role="radiogroup" aria-label="Range">
          {([6, 12] as const).map((value) => <button key={value} type="button" role="radio" aria-checked={range === value} onClick={() => setRange(value)} className={cn("min-h-10 rounded-lg px-3 text-sm font-semibold", range === value ? "bg-surface text-ink shadow-sm" : "text-ink-subtle")}>{value} months</button>)}
        </div>
      } />
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr] [&>*]:min-w-0">
        <Card className="p-5">{history.data ? <CashFlowChart months={history.data.months} selectedMonth={dashboard.active_month} onSelectMonth={onSelectMonth} height={240} /> : <div className="h-[240px] animate-pulse rounded-xl bg-sage-soft" />}</Card>
        <Card className="p-5"><h3 className="mb-3 font-semibold text-ink">Top categories</h3>{history.data ? <CategoryBars items={history.data.categories} colourFor={colourFor} limit={6} /> : <div className="h-48 animate-pulse rounded-xl bg-sage-soft" />}</Card>
      </div>
      {history.error && <p role="alert" className="mt-3 rounded-xl bg-danger-soft p-3 text-sm text-danger">{history.error}</p>}
    </section>
  );
}
