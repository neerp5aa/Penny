"use client";

import { useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, Bus, ChevronRight, Coffee, CreditCard, Dumbbell, Flame, Gamepad2, GraduationCap, HeartPulse, Home, Info, PiggyBank, ShieldCheck, ShoppingCart, Smartphone, Sparkles, Sprout, TrendingDown, TrendingUp, UtensilsCrossed, Wallet, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import type { Category, Dashboard, MonthPoint, Transaction } from "@/lib/api";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { categoryColours } from "./charts";
import { ZONE_STYLE } from "./money-score";
import { cad, type View } from "./shared";

type Props = {
  dashboard: Dashboard;
  onNavigate: (view: View) => void;
  onAsk: (question: string) => void;
};

const AI_PROMPTS = [
  { icon: ShoppingCart, text: "Can I afford this purchase?" },
  { icon: BarChart3, text: "Where am I overspending?" },
  { icon: CreditCard, text: "How can I improve my credit?" },
  { icon: TrendingUp, text: "Should I invest or save?" },
];

export function TodayView({ dashboard, onNavigate, onAsk }: Props) {
  const [scoreInfo, setScoreInfo] = useState(false);
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem] [&>*]:min-w-0">
        <div className="space-y-5">
          <MetricCards dashboard={dashboard} onNavigate={onNavigate} />
          <SpendingOverview dashboard={dashboard} onNavigate={onNavigate} />
          <div className="grid gap-5 md:grid-cols-[1fr_1.35fr] [&>*]:min-w-0">
            <HealthCard dashboard={dashboard} onExplain={() => setScoreInfo(true)} />
            <PennyCard onAsk={onAsk} onOpen={() => onNavigate("ai")} />
          </div>
        </div>
        <div className="space-y-5">
          <RecentTransactions dashboard={dashboard} onOpen={() => onNavigate("spending")} />
          <UpcomingBills dashboard={dashboard} onOpen={() => onNavigate("recurring")} />
          <LearningStreak dashboard={dashboard} onOpen={() => onNavigate("learn")} />
        </div>
      </div>
      <ScoreDialog open={scoreInfo} onOpenChange={setScoreInfo} dashboard={dashboard} />
    </div>
  );
}

// ------------------------------------------------------------------ metric cards

const percent = (basisPoints: number) => `${Math.abs(basisPoints / 100).toFixed(1).replace(/\.0$/, "")}%`;

function MetricCards({ dashboard, onNavigate }: { dashboard: Dashboard; onNavigate: (view: View) => void }) {
  const { home, credit } = dashboard;
  const savedShare = home.monthly_goal_cents > 0 ? Math.min(100, Math.max(0, Math.round((home.monthly_saved_cents * 100) / home.monthly_goal_cents))) : null;
  const used = dashboard.totals.total_budget_cents ? Math.min(100, (dashboard.totals.spending_cents * 100) / dashboard.totals.total_budget_cents) : 0;
  return (
    <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Metric icon={Wallet} tone="bg-zone-green-soft text-[#0d7a4d] dark:text-zone-green" title="Total cash" value={cad(home.cash_cents)} onOpen={() => onNavigate("spending")}
        note={home.cash_change_basis_points !== null && <Change basisPoints={home.cash_change_basis_points} suffix="from last month" />}>
        <Sparkline points={home.cash_history} colour="var(--color-zone-green)" label="Cash over the last six months" />
      </Metric>
      <Metric icon={ShieldCheck} tone="bg-info-soft text-info" title="Safe to spend" value={cad(dashboard.spending_power_cents)} onOpen={() => onNavigate("spending")}
        note={<span className="text-ink-subtle">after bills due before payday</span>}>
        <Bar value={used} className="bg-info" label={`${Math.round(used)}% of the budget used ${dashboard.period.phrase}`} caption={`${Math.round(used)}% of budget used`} />
      </Metric>
      <Metric icon={CreditCard} tone="bg-[#f2ecff] text-[#7047b7] dark:bg-[#302847] dark:text-[#c1a5ee]" title="Credit used" value={credit ? percent(credit.utilization_basis_points) : "No card"} onOpen={() => onNavigate("learn")}
        note={<span className="text-ink-subtle">{credit ? `${cad(credit.balance_cents)} of ${cad(credit.credit_limit_cents)}` : "Add a card in Settings"}</span>}>
        {credit && <Bar value={credit.utilization_basis_points / 100} className={credit.utilization_basis_points > 3000 ? "bg-gold" : "bg-[#9c6ade]"} label="Credit utilization" caption={credit.utilization_basis_points > 3000 ? "Above the 30% guideline" : "Under the 30% guideline"} />}
      </Metric>
      <Metric icon={PiggyBank} tone="bg-gold-soft text-gold-strong" title={dashboard.period.single_month ? "Monthly savings" : "Saved"} value={cad(home.monthly_saved_cents)} onOpen={() => onNavigate("goals")}
        note={<span className="text-ink-subtle">kept after spending {dashboard.period.phrase}</span>}>
        {savedShare !== null && <Bar value={savedShare} className="bg-gold" label={`${savedShare}% of what your goals need`} caption={`${savedShare}% of goal`} />}
      </Metric>
    </section>
  );
}

function Metric({ icon: Icon, tone, title, value, note, children, onOpen }: { icon: LucideIcon; tone: string; title: string; value: string; note: React.ReactNode; children?: React.ReactNode; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="group flex min-w-0 flex-col rounded-[var(--radius-card)] border border-line bg-surface p-3.5 text-left shadow-[var(--shadow-card)] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[var(--shadow-raised)] motion-reduce:transform-none sm:p-5">
      <span className="flex items-center justify-between">
        <span className={cn("grid size-11 place-items-center rounded-xl", tone)} aria-hidden="true"><Icon className="size-5" /></span>
        <span className="grid size-8 place-items-center rounded-full bg-sage-soft text-ink-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true"><ChevronRight className="size-4" /></span>
      </span>
      <span className="mt-4 text-sm font-semibold text-ink">{title}</span>
      <span className="tabular mt-0.5 truncate text-xl font-semibold tracking-tight text-ink sm:text-2xl xl:text-[1.35rem] 2xl:text-[1.7rem]">{value}</span>
      <span className="mt-1 text-xs">{note}</span>
      <span className="mt-auto pt-3">{children}</span>
    </button>
  );
}

function Change({ basisPoints, suffix }: { basisPoints: number; suffix: string }) {
  const up = basisPoints >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return <span className="inline-flex items-center gap-1"><Icon className={cn("size-3.5", up ? "text-[#0d7a4d] dark:text-zone-green" : "text-danger")} aria-hidden="true" /><span className={cn("font-semibold", up ? "text-[#0d7a4d] dark:text-zone-green" : "text-danger")}>{percent(basisPoints)}</span><span className="text-ink-subtle">{suffix}</span></span>;
}

function Bar({ value, className, label, caption }: { value: number; className: string; label: string; caption: string }) {
  return (
    <span className="block">
      <Progress value={value} className="h-2" indicatorClassName={className} aria-label={label} />
      <span className="mt-1.5 block text-[11px] text-ink-subtle">{caption}</span>
    </span>
  );
}

/** Smooth line with a soft fill; decorative trend only, the number above is the fact. */
function Sparkline({ points, colour, label }: { points: MonthPoint[]; colour: string; label: string }) {
  if (points.length < 2) return null;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const coords = values.map((value, index) => [(index / (values.length - 1)) * 100, 28 - ((value - min) / span) * 24]);
  const line = coords.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const id = `spark-${label.replace(/\W+/g, "")}`;
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-10 w-full" role="img" aria-label={label}>
      <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={colour} stopOpacity="0.28" /><stop offset="100%" stopColor={colour} stopOpacity="0" /></linearGradient></defs>
      <path d={`${line} L100,32 L0,32 Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={colour} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ------------------------------------------------------------------ spending overview

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "cat-housing": Home, "cat-food": UtensilsCrossed, "cat-groceries": ShoppingCart, "cat-eating-out": Coffee,
  "cat-transport": Bus, "cat-phone": Smartphone, "cat-school": GraduationCap, "cat-fun": Gamepad2, "cat-health": HeartPulse,
};

export function categoryIcon(category: Category | undefined, kind: Transaction["kind"] = "spending"): LucideIcon {
  if (kind === "income") return Wallet;
  return (category && (CATEGORY_ICONS[category.id] ?? (category.parent_id ? CATEGORY_ICONS[category.parent_id] : undefined))) ?? Dumbbell;
}

function SpendingOverview({ dashboard, onNavigate }: { dashboard: Dashboard; onNavigate: (view: View) => void }) {
  const { period } = dashboard;
  const items = dashboard.category_spending;
  const total = items.reduce((sum, item) => sum + item.spent_cents, 0);
  const colourFor = categoryColours(dashboard.categories);
  const byId = new Map(dashboard.categories.map((category) => [category.id, category]));
  const change = dashboard.home.spending_change_basis_points;

  return (
    <Card className="p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-ink">Spending overview</h2>
          <p className="mt-0.5 text-sm text-ink-muted">You’ve spent <span className="tabular font-semibold text-ink">{cad(total)}</span> {period.phrase}.</p>
        </div>
      </div>

      {total === 0 ? <p className="mt-5 rounded-xl bg-sage-soft p-4 text-sm text-ink-subtle">No spending recorded yet.</p> : (
        <>
          <div className="mt-5 flex h-4 overflow-hidden rounded-full" role="img" aria-label={items.map((item) => `${item.category_name} ${Math.round(item.share_basis_points / 100)}%`).join(", ")}>
            {items.map((item) => <span key={item.category_id ?? "none"} style={{ width: `${item.share_basis_points / 100}%`, background: colourFor(item.category_id) }} className="border-r-2 border-surface last:border-r-0" />)}
          </div>
          <ul className="mt-4 grid gap-x-8 sm:grid-cols-2">
            {items.slice(0, 8).map((item) => {
              const Icon = categoryIcon(item.category_id ? byId.get(item.category_id) : undefined);
              return (
                <li key={item.category_id ?? "none"} className="flex items-center gap-3 border-b border-line py-2.5 last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl" style={{ background: `color-mix(in srgb, ${colourFor(item.category_id)} 18%, transparent)`, color: colourFor(item.category_id) }} aria-hidden="true"><Icon className="size-4" /></span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{item.category_name}</span>
                  <span className="tabular text-sm font-semibold text-ink">{cad(item.spent_cents)}</span>
                  <span className="tabular w-10 text-right text-xs text-ink-subtle">{Math.round(item.share_basis_points / 100)}%</span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {change !== null && (
        <button type="button" onClick={() => onNavigate("spending")} className={cn("mt-4 flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-colors sm:p-4", change <= 0 ? "bg-zone-green-soft hover:brightness-95" : "bg-gold-soft hover:brightness-95")}>
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface/70" aria-hidden="true">{change <= 0 ? <TrendingDown className="size-5 text-[#0d7a4d] dark:text-zone-green" /> : <TrendingUp className="size-5 text-gold-strong" />}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">{period.phrase === "this month" ? `You’re spending ${percent(change)} ${change <= 0 ? "less" : "more"} than last month so far.` : `You spent ${percent(change)} ${change <= 0 ? "less" : "more"} than the period before.`}</span>
            <span className="block text-xs text-ink-muted">Keep flexible spending under <span className="tabular font-semibold">{cad(dashboard.home.weekly_flexible_cents)}</span> this week to stay on track.</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-ink-muted" aria-hidden="true" />
        </button>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ right column

function SideCard({ title, action, onOpen, children }: { title: React.ReactNode; action: string; onOpen: () => void; children: React.ReactNode }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-ink">{title}</h2>
        <button type="button" onClick={onOpen} className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-info hover:bg-info-soft">{action}<ArrowRight className="size-4" aria-hidden="true" /></button>
      </div>
      {children}
    </Card>
  );
}

function RecentTransactions({ dashboard, onOpen }: { dashboard: Dashboard; onOpen: () => void }) {
  const byId = new Map(dashboard.categories.map((category) => [category.id, category]));
  const rows = dashboard.transactions.slice(0, 5);
  return (
    <SideCard title="Recent transactions" action="View all" onOpen={onOpen}>
      {rows.length === 0 ? <p className="mt-3 text-sm text-ink-subtle">No transactions {dashboard.period.phrase} yet.</p> : (
        <table className="mt-2 w-full table-fixed text-sm">
          <caption className="sr-only">Five most recent transactions</caption>
          <thead><tr className="text-left text-xs text-ink-subtle"><th scope="col" className="w-14 py-2 font-medium">Date</th><th scope="col" className="py-2 font-medium">Merchant</th><th scope="col" className="hidden w-28 py-2 font-medium sm:table-cell xl:hidden">Category</th><th scope="col" className="w-24 py-2 text-right font-medium">Amount</th></tr></thead>
          <tbody>
            {rows.map((item) => {
              const category = item.category_id ? byId.get(item.category_id) : undefined;
              const Icon = categoryIcon(category, item.kind);
              const income = item.kind === "income";
              return (
                <tr key={item.id} className="border-t border-line">
                  <td className="whitespace-nowrap py-2.5 pr-2 text-ink-subtle">{formatShortDate(item.occurred_on)}</td>
                  <td className="max-w-0 py-2.5 pr-2">
                    <span className="flex items-center gap-2"><span className={cn("grid size-8 shrink-0 place-items-center rounded-full", income ? "bg-zone-green-soft text-[#0d7a4d] dark:text-zone-green" : "bg-sage text-ink-muted")} aria-hidden="true"><Icon className="size-4" /></span><span className="truncate font-medium text-ink">{item.description}</span></span>
                  </td>
                  <td className="hidden truncate py-2.5 pr-2 text-ink-muted sm:table-cell xl:hidden">{item.category}</td>
                  <td className={cn("tabular whitespace-nowrap py-2.5 text-right font-semibold", income ? "text-[#0d7a4d] dark:text-zone-green" : "text-danger")}>{income ? cad(item.amount_cents, true) : cad(-item.amount_cents)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </SideCard>
  );
}

function UpcomingBills({ dashboard, onOpen }: { dashboard: Dashboard; onOpen: () => void }) {
  const byId = new Map(dashboard.categories.map((category) => [category.id, category]));
  const bills = new Map(dashboard.bills.map((bill) => [bill.id, bill]));
  const items = dashboard.recurring.items.slice(0, 4);
  return (
    <SideCard title="Upcoming bills" action="View all" onOpen={onOpen}>
      {items.length === 0 ? <p className="mt-3 text-sm text-ink-subtle">No bills set up yet.</p> : (
        <ul className="mt-2 space-y-1">
          {items.map((item) => {
            const bill = bills.get(item.id);
            const Icon = categoryIcon(bill?.category_id ? byId.get(bill.category_id) : undefined);
            const days = item.days_until_due;
            const pill = days <= 3 ? "bg-danger-soft text-danger" : days <= 7 ? "bg-gold-soft text-gold-strong" : "bg-info-soft text-info";
            return (
              <li key={item.id}>
                <button type="button" onClick={onOpen} className="flex min-h-14 w-full items-center gap-3 rounded-xl px-1 text-left hover:bg-sage-soft">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sage text-ink" aria-hidden="true"><Icon className="size-5" /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{item.name}</span><span className="text-xs text-ink-subtle">Due {formatShortDate(item.next_due)}</span></span>
                  <span className="tabular text-sm font-semibold text-ink">{cad(item.amount_cents)}</span>
                  <span className={cn("w-[5.5rem] shrink-0 rounded-lg py-1.5 text-center text-xs font-semibold", pill)}>{days <= 0 ? "Due today" : `${days} day${days === 1 ? "" : "s"} left`}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </SideCard>
  );
}

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function LearningStreak({ dashboard, onOpen }: { dashboard: Dashboard; onOpen: () => void }) {
  const learning = dashboard.learning;
  const todayIndex = dashboard.money_calendar.today ? (new Date(`${dashboard.money_calendar.today}T00:00:00Z`).getUTCDay() + 6) % 7 : -1;
  return (
    <Card className="p-4 sm:p-5">
      <button type="button" onClick={onOpen} className="flex w-full items-center justify-between text-left">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-ink"><Flame className="size-5 text-[#e4572e]" aria-hidden="true" />Learning streak</h2>
        <ChevronRight className="size-5 text-ink-muted" aria-hidden="true" />
      </button>
      <div className="mt-3 grid gap-3 sm:grid-cols-[auto_1fr] xl:grid-cols-1 2xl:grid-cols-[auto_1fr]">
        <div>
          <p className="tabular text-3xl font-semibold tracking-tight text-ink">{learning.streak_days} day{learning.streak_days === 1 ? "" : "s"}</p>
          <ol className="mt-2 flex gap-1.5" aria-label="Lessons completed this week">
            {learning.week_activity.map((done, index) => (
              <li key={index} className="flex flex-col items-center gap-1">
                <span className={cn("size-5 rounded-full", done ? "bg-info" : index === todayIndex ? "border-2 border-info bg-info-soft" : "bg-sage")} aria-label={`${WEEKDAYS[index]}: ${done ? "lesson done" : "no lesson"}`} />
                <span className="text-[10px] text-ink-subtle" aria-hidden="true">{WEEKDAYS[index]}</span>
              </li>
            ))}
          </ol>
        </div>
        {learning.next_lesson && (
          <button type="button" onClick={onOpen} className="flex items-center gap-3 rounded-2xl bg-sage-soft p-3 text-left hover:bg-sage">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-zone-green-soft text-[#0d7a4d] dark:text-zone-green" aria-hidden="true"><Sprout className="size-5" /></span>
            <span className="min-w-0 flex-1"><span className="block text-[11px] text-ink-subtle">Next lesson</span><span className="block text-sm font-semibold text-ink">{learning.next_lesson.title}</span><span className="text-[11px] text-ink-subtle">2 min · +{learning.next_lesson.xp_reward} XP</span></span>
            <ChevronRight className="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
          </button>
        )}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ bottom row

function HealthCard({ dashboard, onExplain }: { dashboard: Dashboard; onExplain: () => void }) {
  const health = dashboard.financial_health;
  const bars = [...health.history.map((point) => point.value), health.score];
  const previous = health.history.at(-1)?.value;
  const change = previous === undefined ? null : health.score - previous;
  const calendar = dashboard.money_calendar;
  return (
    <Card className="flex flex-col p-4 sm:p-5">
      <button type="button" onClick={onExplain} className="flex items-center justify-between text-left">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-ink"><BarChart3 className="size-5 text-ink-muted" aria-hidden="true" />Financial health</h2>
        <Info className="size-4 text-ink-subtle" aria-label="How it’s scored" />
      </button>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="tabular text-4xl font-semibold tracking-tight text-ink">{health.score}<span className="text-xl font-normal text-ink-subtle"> / 100</span></p>
          {change !== null && <p className={cn("mt-1 text-sm font-semibold", change >= 0 ? "text-[#0d7a4d] dark:text-zone-green" : "text-danger")}>{change >= 0 ? "↑" : "↓"} {Math.abs(change)} pt{Math.abs(change) === 1 ? "" : "s"} <span className="whitespace-nowrap font-normal text-ink-subtle">vs last month</span></p>}
        </div>
        <div className="flex h-16 shrink-0 items-end gap-1" role="img" aria-label={`Health score by month: ${bars.join(", ")}`}>
          {bars.map((value, index) => <span key={index} className={cn("w-2.5 rounded-sm", index === bars.length - 1 ? "bg-zone-green" : "bg-sage")} style={{ height: `${Math.max(10, value)}%` }} />)}
        </div>
      </div>
      {calendar.today_score !== null && calendar.today_zone && (
        <dl className="mt-auto grid grid-cols-2 gap-2 border-t border-line pt-3 text-xs">
          <div><dt className="text-ink-subtle">Money Score today</dt><dd className="mt-0.5 flex items-center gap-1.5 font-semibold text-ink"><span className={cn("size-2.5 rounded-full", ZONE_STYLE[calendar.today_zone].fill)} aria-hidden="true" /><span className="tabular">{calendar.today_score}</span> {ZONE_STYLE[calendar.today_zone].label.toLowerCase()}</dd></div>
          <div><dt className="text-ink-subtle">Green streak</dt><dd className="mt-0.5 flex items-center gap-1 font-semibold text-ink"><Flame className="size-3.5 text-[#e4572e]" aria-hidden="true" /><span className="tabular">{calendar.streaks.current_green}</span> days</dd></div>
        </dl>
      )}
    </Card>
  );
}

function PennyCard({ onAsk, onOpen }: { onAsk: (question: string) => void; onOpen: () => void }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-ink"><Sparkles className="size-5 text-info" aria-hidden="true" />Penny AI</h2>
          <p className="mt-1 text-sm text-ink-subtle">Have a question? Personal answers from your own numbers.</p>
        </div>
        <button type="button" onClick={onOpen} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-ink px-4 text-sm font-semibold text-canvas hover:opacity-90">Ask Penny<ArrowRight className="size-4" aria-hidden="true" /></button>
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2" aria-label="Suggested questions">
        {AI_PROMPTS.map(({ icon: Icon, text }) => (
          <li key={text}><button type="button" onClick={() => onAsk(text)} className="flex min-h-11 w-full items-center gap-2.5 rounded-xl border border-line bg-sage-soft px-3 text-left text-sm text-ink-muted hover:border-accent hover:text-ink"><Icon className="size-4 shrink-0" aria-hidden="true" />{text}</button></li>
        ))}
      </ul>
    </Card>
  );
}

function ScoreDialog({ open, onOpenChange, dashboard }: { open: boolean; onOpenChange: (open: boolean) => void; dashboard: Dashboard }) {
  const health = dashboard.financial_health;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Financial health · {health.score}/100</DialogTitle>
          <DialogDescription>{health.methodology}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {health.factors.map((factor) => (
            <div key={factor.id}>
              <div className="flex justify-between text-sm"><span className="text-ink">{factor.label}</span><span className="tabular text-ink-subtle">{factor.score}/{factor.max_score}</span></div>
              <Progress className="mt-1" value={(factor.score * 100) / factor.max_score} indicatorClassName="bg-primary" />
              <p className="mt-1 text-xs text-ink-subtle">{factor.explanation}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 rounded-xl bg-sage-soft p-4">
          <h3 className="text-sm font-semibold text-ink">Daily Money Score</h3>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">{dashboard.money_calendar.methodology}</p>
        </div>
        <p className="mt-4 text-xs text-ink-subtle">Educational indicators from fictional data. Neither is a credit score.</p>
      </DialogContent>
    </Dialog>
  );
}
