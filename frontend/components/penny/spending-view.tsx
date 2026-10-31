"use client";

import { useState } from "react";
import { Copy, Pencil, Plus, ReceiptText, Repeat, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { Budget, Dashboard, Transaction } from "@/lib/api";
import { addMonths } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CashFlowChart, CategoryBars, categoryColours } from "./charts";
import { type RecurringActions, RecurringView } from "./recurring-view";
import { cad, EmptyState, SectionHeading } from "./shared";
import { TransactionsPanel } from "./transactions-panel";
import { useHistory } from "./use-history";

export type SpendingTab = "transactions" | "recurring";

type Props = {
  dashboard: Dashboard;
  historyVersion: number;
  tab: SpendingTab;
  onTabChange: (tab: SpendingTab) => void;
  recurring: RecurringActions;
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

const TABS: { id: SpendingTab; label: string; icon: typeof ReceiptText }[] = [
  { id: "transactions", label: "Transactions", icon: ReceiptText },
  { id: "recurring", label: "Recurring", icon: Repeat },
];

export function SpendingView(props: Props) {
  const { dashboard, tab } = props;
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div role="tablist" aria-label="Spending sections" className="inline-flex rounded-xl bg-sage-soft p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" role="tab" id={`spending-tab-${id}`} aria-selected={tab === id} aria-controls={`spending-panel-${id}`} onClick={() => props.onTabChange(id)} className={cn("inline-flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors", tab === id ? "bg-surface text-ink shadow-sm" : "text-ink-subtle hover:text-ink")}>
            <Icon className="size-4" aria-hidden="true" />{label}
            {id === "recurring" && <span className="tabular rounded-full bg-sage px-1.5 text-xs text-ink-muted">{dashboard.recurring.items.length}</span>}
          </button>
        ))}
      </div>
      {tab === "transactions" ? (
        <div id="spending-panel-transactions" role="tabpanel" aria-labelledby="spending-tab-transactions" className="space-y-8">
          <TransactionsPanel dashboard={dashboard} onAdd={props.onAddTransaction} onEdit={props.onEditTransaction} onDelete={props.onDeleteTransaction} />
          <Budgets {...props} />
          <Trends dashboard={dashboard} historyVersion={props.historyVersion} onSelectMonth={props.onSelectMonth} />
        </div>
      ) : (
        <div id="spending-panel-recurring" role="tabpanel" aria-labelledby="spending-tab-recurring">
          <RecurringView dashboard={dashboard} onAsk={props.onAsk} {...props.recurring} />
        </div>
      )}
    </div>
  );
}

function Budgets({ dashboard, onAddBudget, onEditBudget, onCopyBudgets }: Props) {
  const { totals, period } = dashboard;
  const previousMonth = addMonths(dashboard.active_month, -1);
  const canCopy = dashboard.data_months.includes(previousMonth);
  const editable = period.single_month;
  const carried = dashboard.budgets.some((budget) => budget.carried_over);
  const over = totals.budget_remaining_cents < 0;
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-ink">Budgets</h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            <span className="tabular font-semibold text-ink">{cad(totals.spending_cents)}</span> of <span className="tabular">{cad(totals.total_budget_cents)}</span> spent {period.phrase} ·{" "}
            <span className={cn("tabular font-semibold", over ? "text-danger" : "text-accent-strong")}>{cad(Math.abs(totals.budget_remaining_cents))} {over ? "over" : "left"}</span>
          </p>
        </div>
        {editable && (
          <div className="flex gap-2">
            {canCopy && dashboard.budgets.length === 0 && <Button variant="outline" size="sm" onClick={() => onCopyBudgets(previousMonth)}><Copy className="size-4" aria-hidden="true" />Copy last month</Button>}
            <Button variant="secondary" size="sm" onClick={onAddBudget}><Plus className="size-4" aria-hidden="true" />Add budget</Button>
          </div>
        )}
      </div>
      {!editable && <p className="mt-3 rounded-xl bg-sage-soft px-3 py-2 text-xs text-ink-muted">Limits are combined across {period.month_count} months{period.label.includes("–") ? ", prorated for partial months" : ""}. Pick a single month to edit them.</p>}
      {carried && editable && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-info-soft px-3 py-2 text-sm text-ink">
          <span>Carried over from last month. Keep them as they are?</span>
          <Button size="sm" onClick={() => onCopyBudgets(previousMonth)}>Keep these budgets</Button>
        </div>
      )}
      {dashboard.budgets.length === 0 ? (
        <EmptyState className="mt-4" icon={Target} title="No budgets yet" description="Set a monthly limit for a category to track it here." />
      ) : (
        <ul className="mt-5 grid gap-x-8 gap-y-5 md:grid-cols-2">
          {[...dashboard.budgets].sort((a, b) => b.usage_basis_points - a.usage_basis_points).map((budget) => {
            const status = budgetStatus(budget);
            return (
              <li key={budget.id}>
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-semibold text-ink">{budget.category_name}</span>
                  <span className="flex items-center gap-1">
                    <span className={cn("text-sm font-medium", status.tone === "danger" ? "text-danger" : status.tone === "gold" ? "text-gold-strong" : "text-ink-muted")}>{status.label}</span>
                    {editable && !budget.carried_over && <button type="button" onClick={() => onEditBudget(budget)} className="grid size-10 place-items-center rounded-lg text-ink-subtle hover:bg-sage-soft hover:text-ink" aria-label={`Edit ${budget.category_name} budget`}><Pencil className="size-3.5" aria-hidden="true" /></button>}
                  </span>
                </div>
                <Progress className="mt-1" value={Math.min(100, budget.usage_basis_points / 100)} indicatorClassName={status.bar} aria-label={`${budget.category_name}: ${Math.floor(budget.usage_basis_points / 100)}% used`} />
                <p className="tabular mt-1 text-xs text-ink-subtle">{cad(budget.spent_cents)} of {cad(budget.limit_cents)}</p>
              </li>
            );
          })}
        </ul>
      )}
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
