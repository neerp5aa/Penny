"use client";

import { FormEvent, useState } from "react";
import { BookOpen, Calculator, CircleAlert, CircleCheck, CreditCard, Info, LoaderCircle, PiggyBank } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { calculationsApi, type CreditUtilization, type Dashboard } from "@/lib/api";
import { centsToInput, parseCadToCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { cad, describeError, enterStyle, Field } from "./shared";

const LESSONS = [
  { icon: BookOpen, title: "Budget basics", body: "Understand income, spending, and how a simple monthly plan works.", question: "What should an effective budget do?", options: ["Give each dollar a purpose", "Guarantee a higher income", "Remove every optional expense"], correct: 0 },
  { icon: CreditCard, title: "Credit clarity", body: "Learn what utilization means — and what it can’t promise.", question: "What does credit utilization compare?", options: ["Balance with credit limit", "Income with rent", "Score with age"], correct: 0 },
  { icon: PiggyBank, title: "Savings habits", body: "Build a cushion one realistic contribution at a time.", question: "Which savings approach is usually easiest to sustain?", options: ["A realistic recurring amount", "Saving only when nothing unexpected happens", "Borrowing to meet a savings target"], correct: 0 },
];

export function LearnView() {
  const [lesson, setLesson] = useState<number | null>(null);
  const [answer, setAnswer] = useState<number | null>(null);
  const [completed, setCompleted] = useState<number[]>([]);
  const current = lesson === null ? null : LESSONS[lesson];
  function finish() {
    if (lesson === null || answer !== current?.correct) return;
    setCompleted((items) => items.includes(lesson) ? items : [...items, lesson]);
  }
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="animate-enter rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8">
        <Badge tone="neutral">Weekly learning goal</Badge>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Small lessons. Better money instincts.</h2>
        <p className="mt-2 max-w-2xl text-ink-muted">Complete two short lessons this week. Progress is session-only in this MVP and is never tied to spending.</p>
        <div className="mt-5 max-w-md"><div className="flex justify-between text-sm"><span className="font-semibold text-ink">{Math.min(completed.length, 2)} of 2 lessons</span><span className="text-ink-subtle">Current session</span></div><Progress className="mt-2" value={Math.min(100, completed.length * 50)} indicatorClassName="bg-primary" /></div>
      </div>
      <ul className="grid gap-4 sm:grid-cols-3">
        {LESSONS.map(({ icon: Icon, title, body }, index) => (
          <li key={title} className="animate-enter" style={enterStyle(index + 1)}>
            <Card className="h-full p-5">
              <span className={cn("grid size-10 place-items-center rounded-xl", index === 0 ? "bg-info-soft text-info" : index === 1 ? "bg-[#f2ecff] text-[#7047b7] dark:bg-[#302847] dark:text-[#c1a5ee]" : "bg-accent-soft text-accent-strong")} aria-hidden="true"><Icon className="size-5" /></span>
              <h3 className="mt-4 font-semibold text-ink">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{body}</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => { setLesson(index); setAnswer(null); }}>{completed.includes(index) ? <><CircleCheck className="size-4" />Review</> : "Start lesson"}</Button>
            </Card>
          </li>
        ))}
      </ul>
      {current && lesson !== null && <Card className="p-5 sm:p-6"><p className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">Quick check · {current.title}</p><h3 className="mt-2 text-lg font-semibold text-ink">{current.question}</h3><div className="mt-4 grid gap-2">{current.options.map((option, index) => <label key={option} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-line p-3 hover:bg-sage-soft"><input type="radio" name="lesson-answer" checked={answer === index} onChange={() => setAnswer(index)} className="size-4 accent-black dark:accent-white" /><span className="text-sm text-ink">{option}</span></label>)}</div>{answer !== null && <p className={answer === current.correct ? "mt-4 text-sm font-medium text-ink" : "mt-4 text-sm font-medium text-danger"}>{answer === current.correct ? "Correct. This keeps the plan practical and adaptable." : "Not quite. Review the lesson summary and try again."}</p>}<div className="mt-4 flex gap-2"><Button onClick={finish} disabled={answer !== current.correct}>Complete lesson</Button><Button variant="ghost" onClick={() => setLesson(null)}>Close</Button></div></Card>}
      <Card className="p-5 sm:p-6"><h3 className="font-semibold text-ink">This week’s practical tip</h3><p className="mt-2 text-sm leading-relaxed text-ink-muted">A small recurring contribution can build a useful habit. Investment returns are never guaranteed; any future-value example would need to state its assumed return, contribution timing, fees, and time horizon.</p></Card>
    </div>
  );
}

export function CreditView({ dashboard }: { dashboard: Dashboard }) {
  const { credit } = dashboard;
  const percent = credit.utilization_basis_points / 100;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card className="animate-enter p-5 sm:p-6">
        <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sage text-ink-muted"><Info className="size-5" /></span><div><h2 className="font-semibold text-ink">Credit score data is unavailable</h2><p className="mt-1 text-sm leading-relaxed text-ink-muted">{dashboard.credit_score_data.explanation} Penny will not invent a score, movement, approval odds, or guaranteed improvement.</p></div></div>
      </Card>
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
