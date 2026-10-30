"use client";

import { Copy, Pencil, Plus, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { Budget, Dashboard, Transaction } from "@/lib/api";
import { addMonths, formatMonth } from "@/lib/format";
import { cn } from "@/lib/utils";
import { budgetStatus } from "./home-view";
import type { Density } from "./preferences";
import { cad, EmptyState, enterStyle, SectionHeading } from "./shared";
import { TransactionsPanel } from "./transactions-panel";

type Props = {
  dashboard: Dashboard;
  density: Density;
  onAddTransaction: () => void;
  onEditTransaction: (item: Transaction) => void;
  onDeleteTransaction: (item: Transaction) => void;
  onAddBudget: () => void;
  onEditBudget: (item: Budget) => void;
  onCopyBudgets: (fromMonth: string) => void;
};

export function BudgetView({ dashboard, density, onAddTransaction, onEditTransaction, onDeleteTransaction, onAddBudget, onEditBudget, onCopyBudgets }: Props) {
  const { totals } = dashboard;
  const over = totals.budget_remaining_cents < 0;
  const previousMonth = addMonths(dashboard.active_month, -1);
  const canCopy = dashboard.data_months.includes(previousMonth);
  const compact = density === "compact";
  const statusLabel = (tone: string) => (tone === "danger" ? "Over" : tone === "gold" ? "Almost there" : "On track");

  return (
    <div className={compact ? "space-y-5" : "space-y-8"}>
      <section aria-label="Budget totals" className="grid animate-enter grid-cols-3 divide-x divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]">
        {[
          { label: "Planned", value: cad(totals.total_budget_cents), className: "text-ink" },
          { label: "Spent", value: cad(totals.spending_cents), className: "text-ink" },
          { label: over ? "Over by" : "Left", value: cad(over ? -totals.budget_remaining_cents : totals.budget_remaining_cents), className: over ? "text-danger" : "text-accent-strong" },
        ].map((item) => (
          <div key={item.label} className={cn("min-w-0", compact ? "p-3 sm:p-4" : "p-4 sm:p-6")}>
            <p className="text-xs font-medium text-ink-subtle sm:text-sm">{item.label}</p>
            <p className={cn("tabular mt-1 truncate whitespace-nowrap text-lg font-semibold tracking-tight sm:text-2xl", item.className)}>{item.value}</p>
          </div>
        ))}
      </section>

      <TransactionsPanel dashboard={dashboard} title={`Transactions · ${formatMonth(dashboard.active_month)}`} description="Search by merchant, filter by date, category, or type, and expand a row for details." onAdd={onAddTransaction} onEdit={onEditTransaction} onDelete={onDeleteTransaction} />

      <section aria-labelledby="category-budgets">
        <SectionHeading
          id="category-budgets"
          title={`Category budgets · ${formatMonth(dashboard.active_month)}`}
          description="Set how much you plan to spend in each category. Use Edit to change a limit."
          action={
            <div className="flex flex-wrap gap-2">
              {canCopy && <Button variant="outline" onClick={() => onCopyBudgets(previousMonth)}><Copy className="size-4" aria-hidden="true" />Copy {formatMonth(previousMonth).split(" ")[0]}’s limits</Button>}
              <Button variant="secondary" onClick={onAddBudget}><Plus className="size-4" aria-hidden="true" />Add budget</Button>
            </div>
          }
        />
        {dashboard.budgets.length === 0 ? (
          <Card className="p-5">
            <EmptyState icon={Target} title={`No budgets for ${formatMonth(dashboard.active_month)} yet`} description="Start from last month’s limits, or set a new one for a category." action={
              <div className="flex flex-wrap justify-center gap-2">
                {canCopy && <Button size="sm" onClick={() => onCopyBudgets(previousMonth)}><Copy className="size-4" aria-hidden="true" />Copy last month</Button>}
                <Button size="sm" variant="outline" onClick={onAddBudget}>Add a budget</Button>
              </div>
            } />
          </Card>
        ) : compact ? (
          <Card className="overflow-hidden">
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[32rem] text-sm">
                <caption className="sr-only">Category budgets for {formatMonth(dashboard.active_month)}</caption>
                <thead className="bg-sage-soft text-left text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                  <tr><th scope="col" className="py-2.5 pl-5 pr-3">Category</th><th scope="col" className="w-40 px-3 py-2.5">Used</th><th scope="col" className="px-3 py-2.5 text-right">Spent</th><th scope="col" className="px-3 py-2.5 text-right">Limit</th><th scope="col" className="px-3 py-2.5 text-right">Left</th><th scope="col" className="py-2.5 pl-3 pr-4"><span className="sr-only">Edit</span></th></tr>
                </thead>
                <tbody>
                  {dashboard.budgets.map((budget) => {
                    const status = budgetStatus(budget);
                    return (
                      <tr key={budget.id} className="border-t border-line">
                        <th scope="row" className="py-2 pl-5 pr-3 text-left font-medium text-ink">{budget.category_name}</th>
                        <td className="px-3"><Progress className="h-1.5" value={budget.usage_basis_points / 100} indicatorClassName={status.bar} aria-label={`${budget.category_name} usage`} /></td>
                        <td className="tabular whitespace-nowrap px-3 text-right">{cad(budget.spent_cents)}</td>
                        <td className="tabular whitespace-nowrap px-3 text-right text-ink-muted">{cad(budget.limit_cents)}</td>
                        <td className={cn("tabular whitespace-nowrap px-3 text-right font-semibold", status.tone === "danger" ? "text-danger" : status.tone === "gold" ? "text-gold-strong" : "text-ink")}>{cad(budget.remaining_cents)}</td>
                        <td className="py-1 pl-3 pr-3 text-right"><Button variant="ghost" size="sm" onClick={() => onEditBudget(budget)} aria-label={`Edit ${budget.category_name} budget`}><Pencil className="size-3.5" aria-hidden="true" />Edit</Button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {dashboard.budgets.map((budget, index) => {
              const status = budgetStatus(budget);
              return (
                <li key={budget.id} className="animate-enter" style={enterStyle(index)}>
                  <Card className="p-5 transition-[border-color,box-shadow] duration-150 hover:border-line-strong">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate font-semibold text-ink">{budget.category_name}</p>
                      <Badge tone={status.tone}>{statusLabel(status.tone)}</Badge>
                    </div>
                    <p className="tabular mt-4 whitespace-nowrap text-2xl font-semibold tracking-tight text-ink">{cad(budget.spent_cents)}</p>
                    <p className="tabular whitespace-nowrap text-sm text-ink-subtle">spent of {cad(budget.limit_cents)}</p>
                    <Progress className="mt-4" value={budget.usage_basis_points / 100} indicatorClassName={status.bar} aria-label={`${budget.category_name}: ${Math.floor(budget.usage_basis_points / 100)}% used`} />
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <p className={cn("text-sm font-medium", status.tone === "danger" ? "text-danger" : status.tone === "gold" ? "text-gold-strong" : "text-ink-muted")}>{status.label}</p>
                      <Button variant="outline" size="sm" onClick={() => onEditBudget(budget)} aria-label={`Edit ${budget.category_name} budget`}><Pencil className="size-3.5" aria-hidden="true" />Edit</Button>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
