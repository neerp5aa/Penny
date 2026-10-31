"use client";

import { ArrowDownLeft, ArrowUpRight, Banknote, CreditCard, Landmark, LineChart, PiggyBank, Settings, Sparkles, TriangleAlert, Wallet, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { AccountBalance, AccountType, Dashboard } from "@/lib/api";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ACCOUNT_TYPE_LABELS } from "./dialogs";
import { cad, EmptyState, type View } from "./shared";

type Props = { dashboard: Dashboard; onNavigate: (view: View) => void; onAsk: (question: string) => void };

const TYPE_STYLE: Record<AccountType, { icon: LucideIcon; tone: string }> = {
  chequing: { icon: Wallet, tone: "bg-zone-green-soft text-[#0d7a4d] dark:text-zone-green" },
  cash: { icon: Banknote, tone: "bg-zone-green-soft text-[#0d7a4d] dark:text-zone-green" },
  savings: { icon: PiggyBank, tone: "bg-gold-soft text-gold-strong" },
  investment: { icon: LineChart, tone: "bg-info-soft text-info" },
  credit: { icon: CreditCard, tone: "bg-danger-soft text-danger" },
  other: { icon: Landmark, tone: "bg-sage text-ink-muted" },
};

// Credit cards last, so the list reads like the sum: what you have, then what you owe.
const ORDER: AccountType[] = ["chequing", "cash", "savings", "investment", "other", "credit"];

/** Every account's balance as of today, and the one number they add up to. All figures come from the API. */
export function AccountsView({ dashboard, onNavigate, onAsk }: Props) {
  const overview = dashboard.accounts_overview;
  const accounts = [...overview.accounts].sort((a, b) => ORDER.indexOf(a.account_type) - ORDER.indexOf(b.account_type));
  if (accounts.length === 0) {
    return (
      <Card className="mx-auto max-w-xl p-5">
        <EmptyState icon={Landmark} title="No accounts yet" description="Add a chequing, savings, or card account to see your balances here." action={<Button size="sm" onClick={() => onNavigate("settings")}>Add an account</Button>} />
      </Card>
    );
  }
  const negative = overview.net_worth_cents < 0;
  const goalHomes = accounts.filter((account) => account.goal_cents > 0).map((account) => `${cad(account.goal_cents)} in ${account.name}`).join(" · ");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section aria-labelledby="total-title" className="grid gap-5 rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6 lg:grid-cols-[1fr_1.15fr]">
        <div>
          <h2 id="total-title" className="text-sm text-ink-subtle">Your total balance (net worth)</h2>
          <p className={cn("tabular mt-1 text-4xl font-semibold tracking-tight", negative ? "text-danger" : "text-ink")}>{cad(overview.net_worth_cents)}</p>
          <p className="mt-1 text-sm text-ink-muted">Everything in your accounts, minus what you owe on cards. As of today.</p>
          <div className="mt-5 grid grid-cols-3 gap-2 text-center">
            <Sum label="You have" value={cad(overview.assets_cents)} tone="text-ink" />
            <Sum label="You owe" value={`−${cad(overview.owed_cents)}`} tone={overview.owed_cents ? "text-danger" : "text-ink"} />
            <Sum label="Total" value={cad(overview.net_worth_cents)} tone={negative ? "text-danger" : "text-[#0d7a4d] dark:text-zone-green"} strong />
          </div>
          <Button size="sm" variant="ghost" className="mt-4 -ml-2" onClick={() => onAsk("Looking at all my accounts, how am I doing overall?")}><Sparkles className="size-4" aria-hidden="true" />Ask Penny about your balances</Button>
        </div>

        <div className="rounded-2xl bg-sage-soft/70 p-4">
          <h3 className="text-sm font-semibold text-ink">How it adds up</h3>
          <ul className="mt-2 divide-y divide-line text-sm">
            {accounts.map((account) => (
              <li key={account.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate text-ink-muted">{account.name}</span>
                <span className={cn("tabular shrink-0 font-semibold", account.net_cents < 0 ? "text-danger" : "text-ink")}>{account.net_cents < 0 ? `−${cad(-account.net_cents)}` : `+${cad(account.net_cents)}`}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 flex items-center justify-between gap-3 border-t-2 border-ink/70 pt-2 text-sm font-semibold text-ink">
            <span>Total balance</span><span className="tabular">{cad(overview.net_worth_cents)}</span>
          </p>
        </div>
      </section>

      <section aria-label="Where your money is" className="grid gap-3 sm:grid-cols-3">
        <Tile icon={Wallet} tone={TYPE_STYLE.chequing.tone} title="Spending money" value={cad(overview.spending_cents)} detail="Chequing and cash. This is what Home calls available." />
        <Tile icon={PiggyBank} tone={TYPE_STYLE.savings.tone} title="Set aside for goals" value={cad(overview.goal_cents)} detail={goalHomes || "No goal money yet. Add some from Goals."} onOpen={() => onNavigate("goals")} />
        <Tile icon={CreditCard} tone={TYPE_STYLE.credit.tone} title="Owed on cards" value={cad(overview.owed_cents)} detail={overview.owed_cents ? "Paying it in full by the due date avoids interest." : "Nothing owed. Nice."} />
      </section>

      {overview.goal_shortfall_cents > 0 && (
        <p role="status" className="flex items-start gap-2 rounded-2xl bg-gold-soft px-4 py-3 text-sm text-ink">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-gold-strong" aria-hidden="true" />
          Your goals record {cad(overview.goal_shortfall_cents)} more than their accounts actually hold. Check which account each goal is kept in on Goals.
        </p>
      )}

      <section aria-labelledby="accounts-list-title">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="accounts-list-title" className="text-lg font-semibold tracking-tight text-ink">Accounts</h2>
            <p className="text-sm text-ink-subtle">Balances today, with money in and out so far this month.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => onNavigate("settings")}><Settings className="size-4" aria-hidden="true" />Add or rename</Button>
        </div>
        <ul className="grid gap-4 md:grid-cols-2">
          {accounts.map((account) => <AccountCard key={account.id} account={account} />)}
        </ul>
      </section>
      <p className="px-1 text-xs text-ink-subtle">{dashboard.profile.is_fictional ? "All accounts and balances are fictional. " : ""}No bank is connected; balances change only when you record money in or out.</p>
    </div>
  );
}

function Sum({ label, value, tone, strong }: { label: string; value: string; tone: string; strong?: boolean }) {
  return (
    <div className={cn("rounded-xl px-2 py-2.5", strong ? "bg-accent-soft" : "bg-sage-soft")}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">{label}</p>
      <p className={cn("tabular mt-0.5 text-sm font-semibold sm:text-base", tone)}>{value}</p>
    </div>
  );
}

function Tile({ icon: Icon, tone, title, value, detail, onOpen }: { icon: LucideIcon; tone: string; title: string; value: string; detail: string; onOpen?: () => void }) {
  const body = (
    <>
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", tone)} aria-hidden="true"><Icon className="size-5" /></span>
      <span className="min-w-0">
        <span className="block text-sm text-ink-subtle">{title}</span>
        <span className="tabular block text-xl font-semibold tracking-tight text-ink">{value}</span>
        <span className="mt-0.5 block text-xs text-ink-subtle">{detail}</span>
      </span>
    </>
  );
  const className = "flex h-full w-full items-start gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 text-left shadow-[var(--shadow-card)]";
  return onOpen ? <button type="button" onClick={onOpen} className={cn(className, "transition-colors hover:border-accent")}>{body}</button> : <div className={className}>{body}</div>;
}

function AccountCard({ account }: { account: AccountBalance }) {
  const style = TYPE_STYLE[account.account_type];
  const Icon = style.icon;
  const credit = account.account_type === "credit";
  const used = account.utilization_basis_points;
  return (
    <li>
      <Card className="flex h-full flex-col p-5">
        <div className="flex items-start gap-3">
          <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", style.tone)} aria-hidden="true"><Icon className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold text-ink">{account.name}</h3>
            <Badge tone="neutral" className="mt-0.5">{ACCOUNT_TYPE_LABELS[account.account_type]}</Badge>
          </div>
          <div className="shrink-0 text-right">
            <p className={cn("tabular text-xl font-semibold tracking-tight", credit && account.balance_cents > 0 ? "text-danger" : "text-ink")}>{credit && account.balance_cents > 0 ? `−${cad(account.balance_cents)}` : cad(account.balance_cents)}</p>
            <p className="text-xs text-ink-subtle">{credit ? "owed" : "balance"}</p>
          </div>
        </div>

        {credit ? (
          account.credit_limit_cents !== null && used !== null && (
            <div className="mt-4">
              <Progress className="h-2.5" value={Math.min(100, used / 100)} indicatorClassName={used > 3000 ? "bg-danger" : "bg-accent"} aria-label={`${(used / 100).toFixed(0)}% of the limit used`} />
              <p className="mt-1.5 flex justify-between gap-2 text-xs text-ink-subtle">
                <span>{(used / 100).toFixed(1)}% of {cad(account.credit_limit_cents)} used</span>
                <span className="tabular">{cad(account.available_credit_cents ?? 0)} available</span>
              </p>
            </div>
          )
        ) : account.goals.length > 0 ? (
          <div className="mt-4 rounded-xl bg-sage-soft/70 p-3 text-sm">
            <p className="flex justify-between gap-2"><span className="text-ink-muted">Kept here for goals</span><span className="tabular font-semibold text-ink">{cad(account.goal_cents)}</span></p>
            <ul className="mt-1 space-y-0.5 text-xs text-ink-subtle">{account.goals.map((goal) => <li key={goal.id} className="flex justify-between gap-2"><span className="truncate">· {goal.name}</span><span className="tabular">{cad(goal.current_cents)}</span></li>)}</ul>
            <p className="mt-2 flex justify-between gap-2 border-t border-line pt-2"><span className="text-ink-muted">Free to use</span><span className="tabular font-semibold text-ink">{cad(account.free_cents ?? 0)}</span></p>
          </div>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-4 text-xs text-ink-subtle">
          <span className="inline-flex items-center gap-1"><ArrowDownLeft className="size-3.5 text-[#0d7a4d] dark:text-zone-green" aria-hidden="true" />In this month <span className="tabular font-semibold text-ink">{cad(account.money_in_cents)}</span></span>
          <span className="inline-flex items-center gap-1"><ArrowUpRight className="size-3.5 text-danger" aria-hidden="true" />Out <span className="tabular font-semibold text-ink">{cad(account.money_out_cents)}</span></span>
          <span className="ml-auto">{account.last_activity_on ? `Last activity ${formatShortDate(account.last_activity_on)}` : "No transactions yet"}</span>
        </div>
      </Card>
    </li>
  );
}
