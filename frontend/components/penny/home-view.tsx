"use client";

import { useState } from "react";
import { ArrowRight, Bot, CalendarClock, Check, ChevronDown, CircleDollarSign, CreditCard, Landmark, Pencil, PiggyBank, Plus, Scale, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import type { Budget, Dashboard, Mission, SavingsGoal, Transaction, UpcomingBill } from "@/lib/api";
import { addMonths, formatLongDate, formatMonth } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CashFlowChart } from "./charts";
import type { Density } from "./preferences";
import { cad, enterStyle, type View } from "./shared";
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
  onMarkBillPaid: (item: UpcomingBill) => void;
};

type Props = HomeActions & { dashboard: Dashboard; density: Density; historyVersion: number };

export function HomeView({ actions, ...view }: { actions: HomeActions; dashboard: Dashboard; density: Density; historyVersion: number }) {
  const props: Props = { ...view, ...actions };
  const { dashboard } = props;
  const [healthOpen, setHealthOpen] = useState(false);
  const [cashRange, setCashRange] = useState<3 | 6>(6);
  const history = useHistory(addMonths(dashboard.active_month, -(cashRange - 1)), dashboard.active_month, props.historyVersion);
  const keeping = dashboard.totals.cash_flow_cents >= 0;

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-ink-subtle">Financial summary</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{keeping ? <>You’re on track to keep {cad(dashboard.totals.cash_flow_cents)} this month.</> : <>Spending is {cad(-dashboard.totals.cash_flow_cents)} ahead of income.</>}</h2>
          <p className="mt-2 text-sm text-ink-subtle">Based only on recorded fictional activity for {formatMonth(dashboard.active_month)}.</p>
        </div>
        <button type="button" onClick={() => setHealthOpen(true)} className="flex min-h-12 items-center justify-between gap-5 rounded-2xl border border-accent/25 bg-accent-soft px-4 py-3 text-left shadow-[var(--shadow-card)] transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-sage motion-reduce:transform-none">
          <span><span className="block text-xs font-medium uppercase tracking-wider text-accent-strong">Financial health</span><span className="mt-0.5 block text-xl font-semibold text-ink">{dashboard.financial_health.score}<span className="text-sm font-normal text-ink-subtle">/100</span></span></span><ArrowRight className="size-4 text-accent-strong" aria-hidden="true" />
        </button>
      </section>

      <section aria-label="Primary financial overview" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile tone="teal" title="Total cash" value={cad(dashboard.totals.available_balance_cents)} note="No prior balance snapshot" icon={Wallet}><details className="mt-4 border-t border-line pt-3"><summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-ink-muted">Account breakdown<ChevronDown className="size-4" /></summary><dl className="mt-2 space-y-2">{dashboard.accounts.filter((item) => item.account_type !== "credit").map((item) => <div key={item.id} className="flex justify-between gap-3 text-sm"><dt className="text-ink-subtle">{item.name}</dt><dd className="font-semibold text-ink">{cad(item.balance_cents)}</dd></div>)}</dl></details></MetricTile>
        <MetricTile tone="violet" title="Investments" value="Unavailable" note="No brokerage connection" icon={Landmark}><p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-ink-subtle">{dashboard.investment_data.explanation}</p></MetricTile>
        <MetricTile tone="blue" title="Credit score" value="Unavailable" note="No verified bureau source" icon={CreditCard}><p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-ink-subtle">{dashboard.credit_score_data.explanation}</p></MetricTile>
        <MetricTile tone="amber" title="Monthly savings" value={cad(dashboard.totals.cash_flow_cents)} note={`${(dashboard.totals.savings_rate_basis_points / 100).toFixed(1)}% of income`} icon={PiggyBank} valueClass={keeping ? "text-ink" : "text-danger"}><p className="mt-4 border-t border-line pt-3 text-xs text-ink-subtle">{dashboard.previous_month_cash_flow_cents === null ? "No prior month comparison is available." : `Previous month: ${cad(dashboard.previous_month_cash_flow_cents)}`}</p></MetricTile>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.45fr_0.85fr]">
        <Card><CardHeader className="flex-row items-start justify-between gap-4"><div><CardTitle>Cash flow</CardTitle><CardDescription>Income and spending, without extra chart noise.</CardDescription></div><div className="flex rounded-lg bg-sage-soft p-1" role="radiogroup" aria-label="Cash flow range">{([3, 6] as const).map((value) => <button key={value} type="button" role="radio" aria-checked={cashRange === value} onClick={() => setCashRange(value)} className={cn("min-h-9 rounded-md px-3 text-xs font-semibold", cashRange === value ? "bg-surface text-ink shadow-sm" : "text-ink-subtle")}>{value}M</button>)}</div></CardHeader><CardContent>{history.data ? <CashFlowChart months={history.data.months} selectedMonth={dashboard.active_month} onSelectMonth={props.onSelectMonth} height={220} /> : <div className="h-[220px] animate-pulse rounded-xl bg-sage-soft" />}</CardContent></Card>
        <Card className="p-5 sm:p-6"><h3 className="text-sm font-semibold uppercase tracking-wider text-ink-subtle">This month</h3><dl className="mt-4 divide-y divide-line"><MiniTotal label="Income" value={cad(dashboard.totals.income_cents)} /><MiniTotal label="Amount spent" value={cad(dashboard.totals.spending_cents)} /><MiniTotal label="Remaining money" value={cad(dashboard.totals.budget_remaining_cents)} danger={dashboard.totals.budget_remaining_cents < 0} /></dl><Button variant="outline" className="mt-5 w-full" onClick={() => props.onNavigate("transactions")}>Review transactions<ArrowRight className="size-4" /></Button></Card>
      </section>

      <GuidanceCards dashboard={dashboard} onAsk={() => props.onNavigate("ai")} />

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden p-5 sm:p-6"><div className="-mx-6 -mt-6 mb-5 h-1 bg-gradient-to-r from-info via-accent to-gold" /><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-info">Smart insights</p><h3 className="mt-1 text-lg font-semibold text-ink">What deserves attention</h3></div><Button variant="ghost" size="sm" onClick={() => props.onNavigate("insights")}>View all</Button></div><ul className="mt-4 divide-y divide-line">{dashboard.insights.slice(0, 3).map((insight, index) => <li key={insight.id} className="flex gap-3 py-4 first:pt-0"><span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", index === 0 ? "bg-accent" : index === 1 ? "bg-info" : "bg-gold")} /><div><p className="font-semibold text-ink">{insight.headline}</p><p className="mt-1 text-sm leading-relaxed text-ink-subtle">{insight.explanation}</p>{insight.action_label && <button type="button" onClick={() => props.onNavigate(destination(insight.destination))} className="mt-2 min-h-9 text-sm font-semibold text-accent-strong underline underline-offset-4">{insight.action_label}</button>}</div></li>)}</ul></Card>
        <UpcomingBills bills={dashboard.upcoming_bills} onMarkPaid={props.onMarkBillPaid} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2"><GoalSummary goals={dashboard.savings_goals} onOpen={() => props.onNavigate("goals")} /><NetWorth dashboard={dashboard} /></section>
      <TransactionsPanel dashboard={dashboard} title="Recent transactions" description="Compact view of the latest recorded activity." limit={5} onViewAll={() => props.onNavigate("transactions")} onAdd={props.onAddTransaction} onEdit={props.onEditTransaction} onDelete={props.onDeleteTransaction} />
      <HealthDialog open={healthOpen} onOpenChange={setHealthOpen} dashboard={dashboard} />
    </div>
  );
}

function destination(value: Dashboard["insights"][number]["destination"]): View { return value === "budget" ? "transactions" : value === "goals" ? "goals" : value === "ai" ? "ai" : value; }

function MetricTile({ title, value, note, icon: Icon, children, valueClass, tone }: { title: string; value: string; note: string; icon: typeof Wallet; children?: React.ReactNode; valueClass?: string; tone: "teal" | "violet" | "blue" | "amber" }) {
  const tones = { teal: "border-t-accent bg-accent-soft text-accent-strong", violet: "border-t-[#9c6ade] bg-[#f2ecff] text-[#7047b7] dark:bg-[#302847] dark:text-[#c1a5ee]", blue: "border-t-info bg-info-soft text-info", amber: "border-t-gold bg-gold-soft text-gold-strong" };
  return <Card className={cn("animate-enter border-t-4 p-5 transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-[var(--shadow-raised)] motion-reduce:transform-none", tones[tone].split(" ")[0])} style={enterStyle(1)}><div className="flex items-center justify-between"><p className="text-sm font-medium text-ink-subtle">{title}</p><span className={cn("grid size-9 place-items-center rounded-xl", tones[tone].split(" ").slice(1).join(" "))}><Icon className="size-4" /></span></div><p className={cn("mt-5 whitespace-nowrap text-2xl font-semibold tracking-tight text-ink", valueClass)}>{value}</p><p className="mt-1 text-xs text-ink-subtle">{note}</p>{children}</Card>;
}
function MiniTotal({ label, value, danger }: { label: string; value: string; danger?: boolean }) { return <div className="flex items-baseline justify-between gap-4 py-4 first:pt-0"><dt className="text-sm text-ink-subtle">{label}</dt><dd className={cn("text-xl font-semibold text-ink", danger && "text-danger")}>{value}</dd></div>; }

function GuidanceCards({ dashboard, onAsk }: { dashboard: Dashboard; onAsk: () => void }) {
  const [flipped, setFlipped] = useState<string | null>(null);
  const cards = [
    { id: "spend", title: "Your spending power", front: `You can spend ${cad(dashboard.spending_power_cents)} this month.`, back: "The lower of your remaining monthly budget and available cash after unpaid fictional bills. It is not based on account balance alone.", icon: CircleDollarSign, tone: "border-accent/35 bg-accent-soft text-accent-strong" },
    { id: "invest", title: "Your investment potential", front: "Not calculated", back: "Penny cannot recommend an investment amount. Near-term bills, emergency savings, goals, and risk tolerance would all need to be considered first.", icon: Scale, tone: "border-[#9c6ade]/35 bg-[#f2ecff] text-[#7047b7] dark:bg-[#302847] dark:text-[#c1a5ee]" },
    { id: "ask", title: "Ask Penny", front: "Thinking about buying something?", back: "Open the purchase analyzer to compare the item with your budget, goals, available cash, and upcoming fictional bills.", icon: Bot, tone: "border-info/35 bg-info-soft text-info" },
  ];
  return <section aria-label="Financial guidance" className="grid gap-3 md:grid-cols-3">{cards.map(({ id, title, front, back, icon: Icon, tone }) => { const active = flipped === id; return <button key={id} type="button" aria-pressed={active} onClick={() => id === "ask" && active ? onAsk() : setFlipped(active ? null : id)} className="group min-h-48 rounded-[var(--radius-card)] border border-line bg-surface p-5 text-left shadow-[var(--shadow-card)] transition-[transform,background-color,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-[var(--shadow-raised)] motion-reduce:transform-none"><span className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">{title}</span><span className={cn("grid size-9 place-items-center rounded-xl border", tone)}><Icon className="size-4" /></span></span><span className="mt-8 block text-xl font-semibold leading-snug text-ink">{active ? back : front}</span><span className="mt-5 inline-flex items-center gap-1 text-xs font-semibold text-accent-strong">{id === "ask" && active ? "Open Penny AI" : active ? "Show summary" : "How this works"}<ArrowRight className="size-3.5" /></span></button>; })}</section>;
}

function UpcomingBills({ bills, onMarkPaid }: { bills: UpcomingBill[]; onMarkPaid: (bill: UpcomingBill) => void }) { return <Card className="overflow-hidden p-5 sm:p-6"><div className="-mx-6 -mt-6 mb-5 h-1 bg-gold" /><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-gold-soft text-gold-strong"><CalendarClock className="size-4" /></span><h3 className="text-lg font-semibold text-ink">Upcoming bills</h3></div><p className="mt-2 text-sm text-ink-subtle">User-managed reminders, not verified bank payments.</p><ul className="mt-4 divide-y divide-line">{bills.map((bill) => <li key={bill.id} className="flex items-center gap-3 py-3 first:pt-0"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{bill.name}</p><p className="text-xs text-ink-subtle">Due {formatLongDate(bill.due_on)}</p></div><p className="whitespace-nowrap text-sm font-semibold text-ink">{cad(bill.amount_cents)}</p>{bill.status === "paid" ? <Badge><Check className="size-3" />Marked paid</Badge> : <Button variant="outline" size="sm" onClick={() => onMarkPaid(bill)}>Mark paid</Button>}</li>)}</ul></Card>; }

function GoalSummary({ goals, onOpen }: { goals: SavingsGoal[]; onOpen: () => void }) { return <Card className="border-accent/15 bg-gradient-to-br from-surface to-accent-soft/40 p-5 sm:p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-accent-strong">Goals</p><h3 className="mt-1 text-lg font-semibold text-ink">Progress with a purpose</h3></div><Button variant="ghost" size="sm" onClick={onOpen}>View goals</Button></div><ul className="mt-4 space-y-4">{goals.slice(0, 3).map((goal) => <li key={goal.id}><div className="flex items-baseline justify-between gap-3"><p className="text-sm font-semibold text-ink">{goal.name}</p><p className="text-sm font-semibold text-accent-strong">{Math.floor(goal.progress_basis_points / 100)}%</p></div><Progress className="mt-2" value={goal.progress_basis_points / 100} indicatorClassName="bg-accent" /><p className="mt-1.5 text-xs text-ink-subtle">{cad(goal.current_cents)} of {cad(goal.target_cents)}</p></li>)}</ul></Card>; }
function NetWorth({ dashboard }: { dashboard: Dashboard }) { const worth = dashboard.net_worth; return <Card className="p-5 sm:p-6"><p className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">Assets vs. liabilities</p><h3 className="mt-1 text-lg font-semibold text-ink">Net worth</h3><p className="mt-5 text-3xl font-semibold tracking-tight text-ink">{cad(worth.net_worth_cents)}</p><dl className="mt-5 divide-y divide-line"><MiniTotal label="Chequing" value={cad(worth.cash_cents)} /><MiniTotal label="Savings" value={cad(worth.savings_cents)} /><MiniTotal label="Credit card liability" value={`−${cad(worth.liabilities_cents)}`} /></dl><p className="mt-3 text-xs text-ink-subtle">Investments are excluded because no verified brokerage data exists.</p></Card>; }

function HealthDialog({ open, onOpenChange, dashboard }: { open: boolean; onOpenChange: (open: boolean) => void; dashboard: Dashboard }) { const health = dashboard.financial_health; return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Financial health · {health.score}/100</DialogTitle><DialogDescription>{health.methodology}</DialogDescription></DialogHeader><div className="space-y-4">{health.factors.map((factor) => <div key={factor.id}><div className="flex items-baseline justify-between gap-3"><p className="text-sm font-semibold text-ink">{factor.label}</p><p className="text-sm text-ink-subtle">{factor.score}/{factor.max_score}</p></div><Progress className="mt-2" value={factor.score * 100 / factor.max_score} indicatorClassName="bg-primary" /><p className="mt-1.5 text-xs leading-relaxed text-ink-subtle">{factor.explanation}</p></div>)}</div><div className="mt-5 rounded-xl bg-sage-soft p-4"><p className="text-sm font-semibold text-ink">Current limitations</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-subtle">{health.limitations.map((item) => <li key={item}>{item}</li>)}</ul></div></DialogContent></Dialog>; }

export function GoalsView({ dashboard, onAdd, onEdit, onAddMoney, onComplete }: { dashboard: Dashboard; onAdd: () => void; onEdit: (goal: SavingsGoal) => void; onAddMoney: (goal: SavingsGoal) => void; onComplete: (goal: SavingsGoal) => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return <div className="space-y-5"><div className="flex items-end justify-between gap-4"><div><h2 className="text-2xl font-semibold tracking-tight text-ink">Savings goals</h2><p className="mt-1 text-sm text-ink-subtle">Fictional targets with deterministic progress.</p></div><Button onClick={onAdd}><Plus className="size-4" />New goal</Button></div><ul className="grid gap-4 lg:grid-cols-2">{dashboard.savings_goals.map((goal, index) => { const open = expanded === goal.id; const colour = index % 2 === 0 ? "border-t-accent" : "border-t-info"; return <li key={goal.id}><Card className={cn("overflow-hidden border-t-4", colour)}><button type="button" onClick={() => setExpanded(open ? null : goal.id)} aria-expanded={open} className="w-full p-5 text-left sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-lg font-semibold text-ink">{goal.name}</p><p className="mt-1 text-sm text-ink-subtle">{goal.target_date ? `Target ${formatLongDate(goal.target_date)}` : "No target date"}</p></div><Badge>{Math.floor(goal.progress_basis_points / 100)}%</Badge></div><Progress className="mt-5" value={goal.progress_basis_points / 100} indicatorClassName={index % 2 === 0 ? "bg-accent" : "bg-info"} /><div className="mt-2 flex justify-between text-sm"><span className="font-semibold text-ink">{cad(goal.current_cents)}</span><span className="text-ink-subtle">of {cad(goal.target_cents)}</span></div></button>{open && <div className="border-t border-line bg-sage-soft p-5"><p className="text-sm text-ink-muted">Contribution history and recommended contribution projections are not shown because the current API does not store reliable contribution events.</p><div className="mt-4 flex flex-wrap gap-2"><Button size="sm" onClick={() => onAddMoney(goal)} disabled={goal.status === "completed"}><PiggyBank className="size-4" />Add contribution</Button><Button size="sm" variant="outline" onClick={() => onEdit(goal)}><Pencil className="size-4" />Edit goal</Button>{goal.status !== "completed" && <Button size="sm" variant="ghost" onClick={() => onComplete(goal)}><Check className="size-4" />Mark complete</Button>}</div></div>}</Card></li>; })}</ul></div>;
}

export function budgetStatus(budget: Budget): { label: string; tone: "danger" | "gold" | "accent"; bar: string } {
  if (budget.remaining_cents < 0) return { label: `Over by ${cad(-budget.remaining_cents)}`, tone: "danger", bar: "bg-danger" };
  if (budget.usage_basis_points >= 9_000) return { label: `${cad(budget.remaining_cents)} left`, tone: "gold", bar: "bg-gold" };
  return { label: `${cad(budget.remaining_cents)} left`, tone: "accent", bar: "bg-primary" };
}
