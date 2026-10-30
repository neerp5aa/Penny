"use client";

import { useState } from "react";
import { AlertTriangle, ArrowDownLeft, ArrowRight, ArrowUpRight, Check, CircleCheck, Landmark, Pencil, PiggyBank, Plus, Sparkles, Target, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { Budget, Dashboard, History, Mission, SavingsGoal, Transaction } from "@/lib/api";
import { addMonths, formatLongDate, formatMonth, lastDayToShow } from "@/lib/format";
import { percentageBasisPoints } from "@/lib/money";
import { cn } from "@/lib/utils";
import { CashFlowChart, CategoryBars, CategoryShareBar, categoryColours, SpendingPaceChart, Sparkline } from "./charts";
import type { Density } from "./preferences";
import { cad, EmptyState, enterStyle, type View } from "./shared";
import { TransactionsPanel } from "./transactions-panel";
import { useHistory } from "./use-history";

export type HomeActions = {
  onNavigate: (view: View) => void;
  onSelectMonth: (month: string) => void;
  onAddTransaction: () => void;
  onEditTransaction: (item: Transaction) => void;
  onDeleteTransaction: (item: Transaction) => void;
  onAddGoal: () => void;
  onEditGoal: (item: SavingsGoal) => void;
  onAddToGoal: (item: SavingsGoal) => void;
  onEditBudget: (item: Budget) => void;
  onCompleteMission: (item: Mission) => void;
};

type Props = HomeActions & { dashboard: Dashboard; density: Density; historyVersion: number };

export function HomeView({ actions, ...view }: { actions: HomeActions; dashboard: Dashboard; density: Density; historyVersion: number }) {
  const props: Props = { ...view, ...actions };
  const { dashboard, density, historyVersion } = props;
  const history = useHistory(addMonths(dashboard.active_month, -5), dashboard.active_month, historyVersion);
  if (density === "simple") return <SimpleHome {...props} />;
  const compact = density === "compact";
  const gap = compact ? "gap-3 sm:gap-4" : "gap-4 sm:gap-6";
  return (
    <div className={compact ? "space-y-3 sm:space-y-4" : "space-y-4 sm:space-y-6"}>
      <SummaryCards dashboard={dashboard} history={history.data} compact={compact} />
      <div className={cn("grid lg:grid-cols-2 xl:grid-cols-12", gap)}>
        <CashFlowCard dashboard={dashboard} history={history} compact={compact} onSelectMonth={props.onSelectMonth} className={compact ? "xl:col-span-7" : "lg:col-span-2 xl:col-span-7"} />
        {compact ? (
          <SpendingPlanCard dashboard={dashboard} compact onManage={() => props.onNavigate("budget")} onEditBudget={props.onEditBudget} className="xl:col-span-5" />
        ) : (
          <SpendingPaceCard dashboard={dashboard} className="lg:col-span-2 xl:col-span-5" />
        )}
      </div>
      {!compact && (
        <div className={cn("grid lg:grid-cols-2 xl:grid-cols-12", gap)}>
          <WhereMoneyWentCard dashboard={dashboard} className="xl:col-span-4" />
          <SpendingPlanCard dashboard={dashboard} onManage={() => props.onNavigate("budget")} onEditBudget={props.onEditBudget} className="xl:col-span-4" />
          <GoalsCard goals={dashboard.savings_goals} onAdd={props.onAddGoal} onEdit={props.onEditGoal} onAddMoney={props.onAddToGoal} className="lg:col-span-2 xl:col-span-4" />
        </div>
      )}
      <div className={cn("grid lg:grid-cols-12", gap)}>
        <div className="min-w-0 animate-enter lg:col-span-7 xl:col-span-8" style={enterStyle(5)}>
          <TransactionsPanel dashboard={dashboard} title={dashboard.active_month === dashboard.current_month ? "Recent transactions" : `${formatMonth(dashboard.active_month)} transactions`} limit={compact ? 8 : 5} onViewAll={() => props.onNavigate("budget")} onAdd={props.onAddTransaction} onEdit={props.onEditTransaction} onDelete={props.onDeleteTransaction} />
        </div>
        <div className={cn("flex min-w-0 flex-col lg:col-span-5 xl:col-span-4", gap)}>
          {compact && <GoalsCard goals={dashboard.savings_goals} compact onAdd={props.onAddGoal} onEdit={props.onEditGoal} onAddMoney={props.onAddToGoal} />}
          <NextStepsCard dashboard={dashboard} compact={compact} onNavigate={props.onNavigate} onSelectMonth={props.onSelectMonth} onCompleteMission={props.onCompleteMission} />
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ simple layout

function SimpleHome(props: Props) {
  const { dashboard } = props;
  const { totals } = dashboard;
  const over = totals.budget_remaining_cents < 0;
  const usedPercent = percentageBasisPoints(String(totals.spending_cents), String(totals.total_budget_cents));
  const watch = dashboard.budgets.filter((budget) => budget.remaining_cents < 0 || budget.usage_basis_points >= 9_000);
  const isCurrent = dashboard.active_month === dashboard.current_month;
  return (
    <div className="mx-auto max-w-3xl space-y-4 sm:space-y-6">
      <section aria-label="Your month" className="animate-enter overflow-hidden rounded-[1.5rem] bg-hero p-6 text-white shadow-[var(--shadow-raised)] sm:p-8">
        <p className="text-base font-medium text-white/80">{over ? (isCurrent ? "You’re over your budget by" : "You went over your budget by") : isCurrent ? "You can still spend" : "Left in your budget"}</p>
        <p className={cn("mt-1 text-5xl font-semibold tracking-tight sm:text-6xl", over && "text-[#ffb4a8]")}>{cad(over ? -totals.budget_remaining_cents : totals.budget_remaining_cents)}</p>
        <p className="mt-2 text-white/80">{isCurrent ? "this month, if you stick to your plan." : `in ${formatMonth(dashboard.active_month)}.`}</p>
        <div className="mt-6">
          <div className="h-3 overflow-hidden rounded-full bg-white/15"><div className={cn("h-full rounded-full transition-[width] duration-500", over ? "bg-[#ffb4a8]" : "bg-gold")} style={{ width: `${usedPercent}%` }} /></div>
          <p className="mt-2 text-sm text-white/80">Spent <span className="font-semibold text-white">{cad(totals.spending_cents)}</span> of your {cad(totals.total_budget_cents)} plan</p>
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-white/15 pt-5">
          <div><dt className="text-sm text-white/70">{isCurrent ? "Money you have" : "Balance today"}</dt><dd className="mt-0.5 text-xl font-semibold">{cad(totals.available_balance_cents)}</dd></div>
          <div><dt className="text-sm text-white/70">Money in</dt><dd className="mt-0.5 text-xl font-semibold">{cad(totals.income_cents)}</dd></div>
        </dl>
      </section>

      <Card className="animate-enter p-5 sm:p-6" style={enterStyle(1)}>
        <h2 className="text-lg font-semibold text-ink">{watch.length ? "Keep an eye on" : "Your budget"}</h2>
        {watch.length === 0 ? (
          <p className="mt-2 flex items-center gap-2 text-ink-muted"><CircleCheck className="size-5 text-accent" aria-hidden="true" />Every category is on track.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {watch.map((budget) => {
              const status = budgetStatus(budget);
              return (
                <li key={budget.id}>
                  <button type="button" onClick={() => props.onEditBudget(budget)} className="w-full rounded-xl p-2 text-left transition-colors hover:bg-sage-soft" aria-label={`${budget.category_name}: ${status.label}. Edit budget`}>
                    <div className="flex items-baseline justify-between gap-3"><span className="text-base font-semibold text-ink">{budget.category_name}</span><span className={cn("text-base font-semibold", status.tone === "danger" ? "text-danger" : "text-gold-strong")}>{status.label}</span></div>
                    <Progress className="mt-2 h-2.5" value={budget.usage_basis_points / 100} indicatorClassName={status.bar} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <Button variant="ghost" size="sm" className="mt-3" onClick={() => props.onNavigate("budget")}>See full budget<ArrowRight className="size-4" aria-hidden="true" /></Button>
      </Card>

      <div className="animate-enter" style={enterStyle(2)}>
        <TransactionsPanel dashboard={dashboard} title="Latest transactions" limit={3} onViewAll={() => props.onNavigate("budget")} onAdd={props.onAddTransaction} onEdit={props.onEditTransaction} onDelete={props.onDeleteTransaction} />
      </div>
      <GoalsCard goals={dashboard.savings_goals} simple onAdd={props.onAddGoal} onEdit={props.onEditGoal} onAddMoney={props.onAddToGoal} />
      <NextStep tone="primary" icon={Sparkles} title="Thinking about a bigger purchase?" body="Ask the Council. It compares buying now with saving first, using your numbers." action="Ask the Council" onAction={() => props.onNavigate("council")} />
    </div>
  );
}

// ------------------------------------------------------------------ summary tiles

function SummaryCards({ dashboard, history, compact }: { dashboard: Dashboard; history: History | null; compact: boolean }) {
  const { totals } = dashboard;
  const over = totals.budget_remaining_cents < 0;
  const isCurrent = dashboard.active_month === dashboard.current_month;
  const cashAccounts = dashboard.accounts.filter((account) => account.account_type !== "credit");
  const trend = history?.months ?? [];
  return (
    <section aria-label="This month at a glance" className={cn("grid grid-cols-2 xl:grid-cols-4", compact ? "gap-3" : "gap-3 sm:gap-4")}>
      <div className={cn("relative col-span-2 min-w-0 animate-enter overflow-hidden rounded-[var(--radius-card)] bg-hero text-white shadow-[var(--shadow-raised)] sm:col-span-1", compact ? "p-4" : "p-5 sm:p-6")}>
        <div className="flex items-center gap-2 text-sm font-medium text-white/80"><Wallet className="size-4" aria-hidden="true" />{isCurrent ? "Money you have" : "Balance today"}</div>
        <p className={cn("mt-2 font-semibold tracking-tight", compact ? "text-2xl" : "text-3xl")}>{cad(totals.available_balance_cents)}</p>
        <dl className={cn("grid gap-1.5 border-t border-white/15 text-sm", compact ? "mt-3 pt-2" : "mt-4 pt-3")}>
          {cashAccounts.map((account) => (
            <div key={account.id} className="flex items-center justify-between gap-3">
              <dt className="flex min-w-0 items-center gap-2 truncate text-white/75"><span className={cn("size-1.5 shrink-0 rounded-full", account.account_type === "savings" ? "bg-gold" : "bg-[#8fd1bd]")} aria-hidden="true" />{account.name}</dt>
              <dd className="tabular font-medium">{cad(account.balance_cents)}</dd>
            </div>
          ))}
        </dl>
      </div>
      <StatCard compact={compact} index={1} icon={ArrowDownLeft} label="Money in" value={cad(totals.income_cents)} note={`Income in ${formatMonth(dashboard.active_month)}`} iconClass="bg-accent-soft text-accent-strong"
        trend={!compact && trend.length > 1 ? <Sparkline values={trend.map((row) => row.income_cents)} label={`Money in over the last ${trend.length} months`} accent="var(--chart-in)" /> : null} />
      <StatCard compact={compact} index={2} icon={ArrowUpRight} label="Money out" value={cad(totals.spending_cents)} note={`Spent of ${cad(totals.total_budget_cents)} planned`} iconClass="bg-sage text-ink-muted"
        trend={!compact && trend.length > 1 ? <Sparkline values={trend.map((row) => row.spending_cents)} label={`Money out over the last ${trend.length} months`} accent="var(--chart-out)" /> : null} />
      <StatCard
        compact={compact}
        className="col-span-2 sm:col-span-1"
        index={3}
        icon={over ? AlertTriangle : CircleCheck}
        label={over ? "Over your budget by" : "Left to spend"}
        value={cad(over ? -totals.budget_remaining_cents : totals.budget_remaining_cents)}
        valueClass={over ? "text-danger" : "text-accent-strong"}
        note="Your monthly budget minus what you’ve spent"
        iconClass={over ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent-strong"}
        badge={over ? <Badge tone="danger">Over budget</Badge> : <Badge>On track</Badge>}
      />
    </section>
  );
}

function StatCard({ className, compact, index, icon: Icon, label, value, note, iconClass, valueClass, badge, trend }: { className?: string; compact: boolean; index: number; icon: typeof Wallet; label: string; value: string; note: string; iconClass: string; valueClass?: string; badge?: React.ReactNode; trend?: React.ReactNode }) {
  return (
    <Card className={cn("flex animate-enter flex-col", compact ? "p-4" : "p-4 sm:p-6", className)} style={enterStyle(index)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-ink-muted">
          <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", iconClass)} aria-hidden="true"><Icon className="size-4" /></span>
          <span className="truncate">{label}</span>
        </div>
        {badge}
      </div>
      <p className={cn("mt-3 whitespace-nowrap font-semibold leading-tight tracking-tight text-ink", compact ? "text-xl sm:text-2xl" : "text-xl min-[400px]:text-2xl sm:text-[1.75rem]", valueClass)}>{value}</p>
      <p className="mt-1.5 text-xs text-ink-subtle sm:text-sm">{note}</p>
      {trend && <div className="mt-auto pt-3">{trend}</div>}
    </Card>
  );
}

// ------------------------------------------------------------------ charts

function CashFlowCard({ dashboard, history, compact, onSelectMonth, className }: { dashboard: Dashboard; history: ReturnType<typeof useHistory>; compact: boolean; onSelectMonth: (month: string) => void; className?: string }) {
  return (
    <Card className={cn("animate-enter", className)} style={enterStyle(4)}>
      <CardHeader className={compact ? "p-4 pb-2 sm:p-5 sm:pb-2" : undefined}>
        <CardTitle>Cash flow</CardTitle>
        <CardDescription>Money in and out over the last six months. Select a month to open it.</CardDescription>
      </CardHeader>
      <CardContent className={compact ? "px-4 pb-4 sm:px-5 sm:pb-5" : undefined}>
        {history.error && !history.data ? (
          <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger">{history.error}</p>
        ) : !history.data ? (
          <div className="animate-pulse rounded-xl bg-sage-soft" style={{ height: compact ? 222 : 272 }} />
        ) : (
          <div className={cn("transition-opacity duration-200", history.loading && "opacity-60")}>
            <CashFlowChart months={history.data.months} selectedMonth={dashboard.active_month} onSelectMonth={onSelectMonth} height={compact ? 190 : 240} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SpendingPaceCard({ dashboard, className }: { dashboard: Dashboard; className?: string }) {
  const { totals } = dashboard;
  const over = totals.budget_remaining_cents < 0;
  return (
    <Card className={cn("animate-enter", className)} style={enterStyle(5)}>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>Spending pace</CardTitle>
          <CardDescription>How your spending added up through {formatMonth(dashboard.active_month)}.</CardDescription>
        </div>
        {totals.total_budget_cents > 0 && <Badge tone={over ? "danger" : "accent"}>{over ? "Over budget" : "Within budget"}</Badge>}
      </CardHeader>
      <CardContent>
        {dashboard.daily_spending.length === 0 ? (
          <EmptyState icon={Target} title="No spending yet" description="Your spending line appears once you add a purchase." />
        ) : (
          <SpendingPaceChart daily={dashboard.daily_spending} month={dashboard.active_month} budgetCents={totals.total_budget_cents} throughDay={lastDayToShow(dashboard.active_month)} />
        )}
      </CardContent>
    </Card>
  );
}

function WhereMoneyWentCard({ dashboard, className }: { dashboard: Dashboard; className?: string }) {
  const { totals, category_spending: categories } = dashboard;
  const colourFor = categoryColours(dashboard.categories);
  const kept = totals.cash_flow_cents >= 0;
  return (
    <Card className={cn("animate-enter", className)} style={enterStyle(5)}>
      <CardHeader>
        <CardTitle>Where your money went</CardTitle>
        <CardDescription>Spending by category in {formatMonth(dashboard.active_month)}.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className={cn("rounded-xl px-3 py-2.5 text-sm font-medium", kept ? "bg-accent-soft text-accent-strong" : "bg-danger-soft text-danger")}>
          {kept ? <>You kept <span className="tabular font-semibold">{cad(totals.cash_flow_cents)}</span> this month.</> : <>You spent <span className="tabular font-semibold">{cad(-totals.cash_flow_cents)}</span> more than came in.</>}
        </p>
        {categories.length === 0 ? (
          <p className="text-sm text-ink-subtle">No spending recorded for this month.</p>
        ) : (
          <>
            <CategoryShareBar items={categories} categories={dashboard.categories} colourFor={colourFor} />
            <CategoryBars items={categories} colourFor={colourFor} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ budget plan

export function budgetStatus(budget: Budget): { label: string; tone: "danger" | "gold" | "accent"; bar: string } {
  if (budget.remaining_cents < 0) return { label: `Over by ${cad(-budget.remaining_cents)}`, tone: "danger", bar: "bg-danger" };
  if (budget.usage_basis_points >= 9_000) return { label: `${cad(budget.remaining_cents)} left`, tone: "gold", bar: "bg-gold" };
  return { label: `${cad(budget.remaining_cents)} left`, tone: "accent", bar: "bg-accent" };
}

function SpendingPlanCard({ dashboard, compact, onManage, onEditBudget, className }: { dashboard: Dashboard; compact?: boolean; onManage: () => void; onEditBudget: (budget: Budget) => void; className?: string }) {
  const { totals, budgets } = dashboard;
  const usedPercent = percentageBasisPoints(String(totals.spending_cents), String(totals.total_budget_cents));
  const over = totals.budget_remaining_cents < 0;
  return (
    <Card className={cn("flex animate-enter flex-col", className)} style={enterStyle(5)}>
      <CardHeader className={cn("flex-row items-start justify-between gap-3", compact && "p-4 pb-2 sm:p-5 sm:pb-2")}>
        <div className="min-w-0">
          <CardTitle>Spending plan</CardTitle>
          {!compact && <CardDescription>Tap a category to change its limit.</CardDescription>}
        </div>
        <Badge tone={over ? "danger" : usedPercent >= 90 ? "gold" : "accent"}>{Math.floor(usedPercent)}% used</Badge>
      </CardHeader>
      <CardContent className={cn("flex flex-1 flex-col", compact && "px-4 pb-4 sm:px-5 sm:pb-5")}>
        {budgets.length === 0 ? (
          <EmptyState icon={Target} title="No budgets this month" description="Set spending limits, or copy last month’s." action={<Button size="sm" onClick={onManage}>Set up a budget</Button>} />
        ) : (
          <ul className={compact ? "space-y-1" : "space-y-2"}>
            {budgets.map((budget) => {
              const status = budgetStatus(budget);
              return (
                <li key={budget.id}>
                  <button type="button" onClick={() => onEditBudget(budget)} className={cn("group w-full rounded-xl text-left transition-colors hover:bg-sage-soft", compact ? "px-2 py-1.5" : "p-2")} aria-label={`${budget.category_name}: ${cad(budget.spent_cents)} of ${cad(budget.limit_cents)}. ${status.label}. Edit limit`}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-1.5 font-medium text-ink"><span className="truncate">{budget.category_name}</span><Pencil className="size-3 shrink-0 text-ink-subtle opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" /></span>
                      <span className="tabular whitespace-nowrap text-ink-subtle">{cad(budget.spent_cents)} <span className="text-ink-subtle/80">/ {cad(budget.limit_cents)}</span></span>
                    </div>
                    <Progress className={compact ? "mt-1 h-1.5" : "mt-1.5"} value={budget.usage_basis_points / 100} indicatorClassName={status.bar} />
                    {!compact && <p className={cn("mt-1 text-right text-xs font-medium", status.tone === "danger" ? "text-danger" : status.tone === "gold" ? "text-gold-strong" : "text-ink-subtle")}>{status.label}</p>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-3 text-sm">
          <span className="tabular font-semibold text-ink">{cad(totals.spending_cents)} <span className="font-normal text-ink-subtle">of {cad(totals.total_budget_cents)}</span></span>
          <Button variant="ghost" size="sm" onClick={onManage}>Manage<ArrowRight className="size-4" aria-hidden="true" /></Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ goals

function GoalsCard({ goals, compact, simple, onAdd, onEdit, onAddMoney, className }: { goals: SavingsGoal[]; compact?: boolean; simple?: boolean; onAdd: () => void; onEdit: (item: SavingsGoal) => void; onAddMoney: (item: SavingsGoal) => void; className?: string }) {
  return (
    <Card className={cn("animate-enter", className)} style={enterStyle(6)}>
      <CardHeader className={cn("flex-row items-start justify-between gap-3", compact && "p-4 pb-2 sm:p-5 sm:pb-2")}>
        <div className="min-w-0">
          <CardTitle>Savings goals</CardTitle>
          {!compact && <CardDescription>Small steps, clear progress.</CardDescription>}
        </div>
        <Button size="sm" variant="outline" onClick={onAdd}><Plus className="size-4" aria-hidden="true" />New<span className="sr-only"> savings goal</span></Button>
      </CardHeader>
      <CardContent className={compact ? "px-4 pb-4 sm:px-5 sm:pb-5" : undefined}>
        {goals.length === 0 ? (
          <EmptyState icon={PiggyBank} title="No savings goals yet" description="Give your next dollar a destination." action={<Button size="sm" onClick={onAdd}>Create a goal</Button>} />
        ) : (
          <ul className={cn("grid", compact ? "gap-2" : "gap-3", !simple && !compact && "sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-1")}>
            {goals.map((goal) => {
              const percent = goal.progress_basis_points / 100;
              const done = goal.status === "completed";
              return (
                <li key={goal.id} className={cn("rounded-2xl border border-line", compact ? "p-3" : "p-4")}>
                  <div className="flex items-start justify-between gap-3">
                    <button type="button" onClick={() => onEdit(goal)} className="min-w-0 rounded-lg text-left hover:underline" aria-label={`Edit ${goal.name}`}>
                      <span className={cn("block truncate font-semibold text-ink", simple && "text-base")}>{goal.name}</span>
                      {!compact && <span className="mt-0.5 block text-xs text-ink-subtle">{goal.target_date ? `By ${formatLongDate(goal.target_date)}` : "No target date"}</span>}
                    </button>
                    {done ? <Badge><Check className="size-3.5" aria-hidden="true" />Reached</Badge> : goal.status === "paused" ? <Badge tone="neutral">Paused</Badge> : <span className="tabular text-sm font-semibold text-gold-strong">{Math.floor(percent)}%</span>}
                  </div>
                  <Progress className={compact ? "mt-2 h-1.5" : "mt-3"} value={percent} indicatorClassName={done ? "bg-accent" : "bg-gold"} aria-label={`${goal.name} progress`} />
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                    <p className="tabular whitespace-nowrap text-sm text-ink-muted"><span className="font-semibold text-ink">{cad(goal.current_cents)}</span> of {cad(goal.target_cents)}</p>
                    {!done && <Button size="sm" variant="secondary" onClick={() => onAddMoney(goal)} aria-label={`Add money to ${goal.name}`}><Plus className="size-3.5" aria-hidden="true" />Add money</Button>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ next steps & missions

function NextStepsCard({ dashboard, compact, onNavigate, onSelectMonth, onCompleteMission, className }: { dashboard: Dashboard; compact: boolean; onNavigate: (view: View) => void; onSelectMonth: (month: string) => void; onCompleteMission: (mission: Mission) => void; className?: string }) {
  const [showAllMissions, setShowAllMissions] = useState(false);
  const isCurrent = dashboard.active_month === dashboard.current_month;
  const over = dashboard.budgets.filter((budget) => budget.remaining_cents < 0);
  const near = dashboard.budgets.filter((budget) => budget.remaining_cents >= 0 && budget.usage_basis_points >= 9_000);
  const open = dashboard.missions.filter((mission) => !mission.completed);
  const done = dashboard.missions.filter((mission) => mission.completed);
  return (
    <Card className={cn("animate-enter", className)} style={enterStyle(6)}>
      <CardHeader className={cn(compact && "p-4 pb-2 sm:p-5 sm:pb-2")}>
        <CardTitle>{isCurrent ? "What to do next" : "Looking back"}</CardTitle>
        {!compact && <CardDescription>{isCurrent ? "Suggestions based on this month’s numbers." : `What stood out in ${formatMonth(dashboard.active_month)}.`}</CardDescription>}
      </CardHeader>
      <CardContent className={cn("space-y-3", compact && "space-y-2 px-4 pb-4 sm:px-5 sm:pb-5")}>
        {over.map((budget) => (
          <NextStep key={budget.id} compact={compact} tone="danger" icon={AlertTriangle} title={`${budget.category_name} ${isCurrent ? "is" : "was"} over budget`} body={`${cad(-budget.remaining_cents)} more than planned.`} action={isCurrent ? "Review budget" : undefined} onAction={() => onNavigate("budget")} />
        ))}
        {near.map((budget) => (
          <NextStep key={budget.id} compact={compact} tone="gold" icon={Landmark} title={`${budget.category_name} ${isCurrent ? "is almost at" : "ended close to"} its limit`} body={`${cad(budget.remaining_cents)} ${isCurrent ? "left for the rest of the month" : "to spare"}.`} action={isCurrent ? "See budget" : undefined} onAction={() => onNavigate("budget")} />
        ))}
        {over.length === 0 && near.length === 0 && dashboard.budgets.length > 0 && (
          <NextStep compact={compact} tone="accent" icon={CircleCheck} title={isCurrent ? "Every category is on track" : "Every category stayed on track"} body={isCurrent ? "Nice work. Keep checking in once a week." : "A good month to learn from."} />
        )}
        {isCurrent ? (
          <NextStep compact={compact} tone="primary" icon={Sparkles} title="Planning a bigger purchase?" body="Compare buying now with saving first, using your real numbers." action="Ask the Council" onAction={() => onNavigate("council")} />
        ) : (
          <NextStep compact={compact} tone="primary" icon={ArrowRight} title="Back to today" body="Return to the current month to plan what’s next." action="Go to this month" onAction={() => onSelectMonth(dashboard.current_month)} />
        )}

        {dashboard.missions.length > 0 && (
          <div className="border-t border-line pt-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-ink">Missions</h3>
              <Badge tone="gold">{dashboard.xp_total} XP earned</Badge>
            </div>
            <ul className="mt-2 space-y-2">
              {[...open, ...done].slice(0, showAllMissions ? undefined : 3).map((mission) => (
                <li key={mission.id} className={cn("flex items-start gap-3 rounded-xl bg-sage-soft", compact ? "p-2.5" : "p-3")}>
                  <span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full", mission.completed ? "bg-accent text-white" : "border-2 border-line-strong bg-surface")} aria-hidden="true">{mission.completed && <Check className="size-3.5" />}</span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm font-semibold", mission.completed ? "text-ink-subtle line-through decoration-ink-subtle/50" : "text-ink")}>{mission.title}<span className="sr-only">{mission.completed ? " (completed)" : ""}</span></p>
                    {!compact && <p className="mt-0.5 text-xs text-ink-subtle">{mission.description}</p>}
                    {!mission.completed && <button type="button" onClick={() => onCompleteMission(mission)} className="mt-1 inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-accent-strong hover:underline"><Check className="size-3.5" aria-hidden="true" />Mark done · +{mission.xp_reward} XP</button>}
                  </div>
                  {mission.completed && <Badge tone="neutral" className="shrink-0">+{mission.xp_reward} XP</Badge>}
                </li>
              ))}
            </ul>
            {dashboard.missions.length > 3 && (
              <button type="button" onClick={() => setShowAllMissions(!showAllMissions)} aria-expanded={showAllMissions} className="mt-2 inline-flex min-h-9 items-center text-sm font-semibold text-accent-strong hover:underline">
                {showAllMissions ? "Show fewer" : `Show all ${dashboard.missions.length} missions`}
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NextStep({ tone, icon: Icon, title, body, action, onAction, compact }: { tone: "danger" | "gold" | "accent" | "primary"; icon: typeof Wallet; title: string; body: string; action?: string; onAction?: () => void; compact?: boolean }) {
  const tones = {
    danger: "bg-danger-soft text-danger",
    gold: "bg-gold-soft text-gold-strong",
    accent: "bg-accent-soft text-accent-strong",
    primary: "bg-primary text-on-primary",
  };
  return (
    <div className={cn("flex animate-enter gap-3 rounded-2xl border border-line bg-surface", compact ? "p-2.5" : "p-3.5")}>
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", tones[tone])} aria-hidden="true"><Icon className="size-4" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-sm text-ink-subtle">{body}</p>
        {action && onAction && <button type="button" onClick={onAction} className="mt-1.5 inline-flex min-h-9 items-center gap-1 rounded-lg text-sm font-semibold text-accent-strong hover:underline">{action}<ArrowRight className="size-3.5" aria-hidden="true" /></button>}
      </div>
    </div>
  );
}
