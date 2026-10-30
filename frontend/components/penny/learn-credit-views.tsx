"use client";

import { FormEvent, useState } from "react";
import { BookOpen, Calculator, CircleAlert, CircleCheck, CreditCard, Info, LoaderCircle, PiggyBank, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { calculationsApi, type CreditUtilization, type Dashboard } from "@/lib/api";
import { centsToInput, parseCadToCents } from "@/lib/money";
import { cad, describeError, enterStyle, Field } from "./shared";

const LESSONS = [
  { icon: BookOpen, title: "Budget basics", body: "Understand income, spending, and how a simple monthly plan works." },
  { icon: CreditCard, title: "Credit clarity", body: "Learn what utilization means — and what it can’t promise." },
  { icon: PiggyBank, title: "Savings habits", body: "Build a cushion one realistic contribution at a time." },
];

export function LearnView() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="animate-enter rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8">
        <Badge tone="gold"><Sparkles className="size-3.5" aria-hidden="true" />Coming soon</Badge>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Small lessons. Better money instincts.</h2>
        <p className="mt-2 max-w-2xl text-ink-muted">Short, plain-language lessons with a quick quiz and XP are on the way. Until then, these are the topics we’re building — nothing here is interactive yet.</p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-3">
        {LESSONS.map(({ icon: Icon, title, body }, index) => (
          <li key={title} className="animate-enter" style={enterStyle(index + 1)}>
            <Card className="h-full p-5">
              <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent-strong" aria-hidden="true"><Icon className="size-5" /></span>
              <h3 className="mt-4 font-semibold text-ink">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{body}</p>
              <p className="mt-4 text-xs font-medium text-ink-subtle">Not available yet</p>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CreditView({ dashboard }: { dashboard: Dashboard }) {
  const { credit } = dashboard;
  const percent = credit.utilization_basis_points / 100;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section aria-labelledby="utilization" className="animate-enter overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]">
        <div className="bg-hero p-6 text-white sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-white/75">{credit.account_name}</p>
              <h2 id="utilization" className="mt-1 text-sm font-medium text-white/90">Credit utilization</h2>
              <p className="tabular whitespace-nowrap mt-1 text-4xl font-semibold tracking-tight">{percent.toFixed(1)}%</p>
            </div>
            <span className="grid size-12 place-items-center rounded-2xl bg-white/10" aria-hidden="true"><CreditCard className="size-6" /></span>
          </div>
          <Progress className="mt-6 bg-white/15" indicatorClassName="bg-gold" value={percent} aria-label={`Credit utilization ${percent.toFixed(1)} percent`} />
        </div>
        <dl className="grid grid-cols-2 divide-x divide-line">
          <div className="p-5 sm:p-6"><dt className="text-sm text-ink-subtle">Card balance</dt><dd className="tabular whitespace-nowrap mt-1 text-2xl font-semibold text-ink">{cad(credit.balance_cents)}</dd></div>
          <div className="p-5 sm:p-6"><dt className="text-sm text-ink-subtle">Credit limit</dt><dd className="tabular whitespace-nowrap mt-1 text-2xl font-semibold text-ink">{cad(credit.credit_limit_cents)}</dd></div>
        </dl>
      </section>
      <CreditCalculator defaultBalance={credit.balance_cents} defaultLimit={credit.credit_limit_cents} />
      <Card className="animate-enter p-5 sm:p-6" style={enterStyle(2)}>
        <h3 className="font-semibold text-ink">What does this mean?</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">Utilization is your card balance divided by your credit limit. It shows how much of your available credit you’re using right now. Penny calculates it on the server with whole-number maths, so it’s always exact.</p>
        <p className="mt-4 flex gap-2 rounded-xl bg-info-soft p-3 text-sm text-info"><Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />This is education using fictional numbers. It doesn’t predict a credit score or recommend borrowing.</p>
      </Card>
    </div>
  );
}

function CreditCalculator({ defaultBalance, defaultLimit }: { defaultBalance: number; defaultLimit: number }) {
  const [balance, setBalance] = useState(centsToInput(String(defaultBalance)));
  const [limit, setLimit] = useState(centsToInput(String(defaultLimit)));
  const [errors, setErrors] = useState<{ balance?: string; limit?: string; form?: string }>({});
  const [result, setResult] = useState<CreditUtilization | null>(null);
  const [busy, setBusy] = useState(false);

  async function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: typeof errors = {};
    let balanceCents = 0;
    let limitCents = 0;
    try { balanceCents = parseCadToCents(balance); } catch (reason) { next.balance = reason instanceof Error ? reason.message : "Enter a valid amount"; }
    try { limitCents = parseCadToCents(limit); if (limitCents <= 0) next.limit = "The credit limit must be more than $0.00"; } catch (reason) { next.limit = reason instanceof Error ? reason.message : "Enter a valid amount"; }
    setErrors(next);
    if (next.balance || next.limit) return;
    setBusy(true);
    try {
      setResult(await calculationsApi.creditUtilization(balanceCents, limitCents));
    } catch (reason) {
      setErrors({ form: describeError(reason, "Couldn’t calculate").detail });
    } finally {
      setBusy(false);
    }
  }

  const percent = result ? result.utilization_basis_points / 100 : 0;
  return (
    <Card className="animate-enter p-5 sm:p-6" style={enterStyle(1)}>
      <h3 className="flex items-center gap-2 font-semibold text-ink"><Calculator className="size-4 text-accent" aria-hidden="true" />Try a what-if</h3>
      <p className="mt-1 text-sm text-ink-subtle">Change the fictional balance or limit to see how utilization moves. Nothing is saved.</p>
      <form onSubmit={calculate} className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
        <Field label="Card balance (CAD)" error={errors.balance}>{(props) => <Input {...props} value={balance} onChange={(event) => setBalance(event.target.value)} inputMode="decimal" autoComplete="off" />}</Field>
        <Field label="Credit limit (CAD)" error={errors.limit}>{(props) => <Input {...props} value={limit} onChange={(event) => setLimit(event.target.value)} inputMode="decimal" autoComplete="off" />}</Field>
        <Button type="submit" disabled={busy} className="sm:mt-[1.625rem]">{busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Calculator className="size-4" aria-hidden="true" />}Calculate</Button>
      </form>
      {errors.form && <p role="alert" className="mt-3 rounded-xl bg-danger-soft p-3 text-sm text-danger">{errors.form}</p>}
      {result && (
        <div className="mt-5 animate-enter rounded-2xl border border-line p-4" role="status">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm text-ink-muted">{cad(result.balance_cents)} of {cad(result.credit_limit_cents)}</p>
            <p className="text-2xl font-semibold tracking-tight text-ink">{percent.toFixed(1)}%</p>
          </div>
          <Progress className="mt-3" value={percent} indicatorClassName={result.within_common_guideline ? "bg-accent" : "bg-gold"} aria-label={`Utilization ${percent.toFixed(1)} percent`} />
          <p className="mt-3 flex items-start gap-2 text-sm text-ink-muted">
            {result.within_common_guideline ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-gold-strong" aria-hidden="true" />}
            {result.within_common_guideline ? "That’s at or under 30%, a level many Canadian credit-education guides mention." : "That’s above 30%, the level many Canadian credit-education guides suggest staying under."} It’s a general guideline, not a score prediction.
          </p>
        </div>
      )}
    </Card>
  );
}
