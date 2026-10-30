"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, CircleHelp, HeartHandshake, LoaderCircle, PiggyBank, RefreshCw, ShieldCheck, Sparkles, TrendingUp, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { councilApi, type CouncilResponse, type CouncilViewpoint, type Dashboard } from "@/lib/api";
import { parseCadToCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { cad, describeError, enterStyle, Field } from "./shared";

type Advisor = CouncilViewpoint["agent"];
const ADVISORS: Record<Advisor, { focus: string; blurb: string; icon: LucideIcon; avatar: string; ring: string; text: string }> = {
  Savvy: { focus: "Security", blurb: "Keeps you safe and steady.", icon: ShieldCheck, avatar: "bg-info-soft text-info", ring: "before:bg-info", text: "text-info" },
  Max: { focus: "Growth", blurb: "Plans ahead and weighs trade-offs.", icon: TrendingUp, avatar: "bg-accent-soft text-accent-strong", ring: "before:bg-accent", text: "text-accent-strong" },
  Joy: { focus: "Balance", blurb: "Keeps the plan realistic and livable.", icon: HeartHandshake, avatar: "bg-gold-soft text-gold-strong", ring: "before:bg-gold", text: "text-gold-strong" },
};
const DECISIONS: Record<CouncilResponse["decision"], { label: string; scenario: string | null }> = {
  buy_now: { label: "You can buy it now", scenario: "Buy now" },
  save_then_buy: { label: "Save first, then buy", scenario: "Save first" },
  wait: { label: "Wait for now", scenario: "Keep current plan" },
  needs_information: { label: "Council needs a few details", scenario: null },
};
const STANCES: Record<CouncilViewpoint["stance"], string> = { cautious: "Cautious", conditional: "It depends", supportive: "Supportive" };
const SOURCES: Record<string, string> = {
  get_budget_summary: "Budget summary",
  calculate_affordability: "Affordability check",
  simulate_budget_change: "Budget simulation",
  calculate_savings_plan: "Savings plan",
  verify_financial_plan: "Verification",
};
const PRIORITIES = { now: "Do now", next: "Next", optional: "Optional" } as const;

type Ask = { question: string; purchase_name: string; purchase_cents: number; time_horizon_months: number; savings_goal_id?: string };
type Draft = { item: string; price: string; months: string; goalId: string; question: string };

export function CouncilView({ dashboard, onDashboardChange, onApproved }: { dashboard: Dashboard; onDashboardChange: (dashboard: Dashboard) => void; onApproved: (message: string) => void }) {
  const defaultGoalId = dashboard.savings_goals.find((goal) => goal.id === "goal-laptop")?.id ?? "";
  const examples = useMemo(() => [
    { label: "School laptop", draft: { item: "Laptop", price: "1200.00", months: "3", goalId: defaultGoalId, question: "" } },
    { label: "Winter coat", draft: { item: "Winter coat", price: "180.00", months: "1", goalId: "", question: "" } },
    { label: "Concert tickets", draft: { item: "Concert tickets", price: "250.00", months: "2", goalId: "", question: "" } },
  ], [defaultGoalId]);
  const [draft, setDraft] = useState<Draft>(examples[0].draft);
  const [priceError, setPriceError] = useState("");
  const [ask, setAsk] = useState<Ask>(() => toAsk(examples[0].draft, 120_000));
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<CouncilResponse | null>(null);
  const [outcome, setOutcome] = useState<{ key: string; error: { title: string; detail: string } | null } | null>(null);
  const [approvalError, setApprovalError] = useState<{ title: string; detail: string } | null>(null);
  const [approval, setApproval] = useState<{ state: "idle" | "approving" } | { state: "done"; goalName: string; contribution: number; newCents: number | null }>({ state: "idle" });
  const linkedGoal = dashboard.savings_goals.find((goal) => goal.id === ask.savings_goal_id);
  // Re-run the last question whenever the numbers it depends on change (e.g. after an approval).
  const contextKey = `${dashboard.totals.income_cents}:${dashboard.totals.spending_cents}:${dashboard.totals.available_balance_cents}:${linkedGoal?.current_cents ?? ""}`;

  const requestKey = `${JSON.stringify(ask)}|${contextKey}|${attempt}`;
  const loading = outcome?.key !== requestKey;
  const error = approvalError ?? (outcome?.key === requestKey ? outcome.error : null);

  useEffect(() => {
    let active = true;
    councilApi.analyze(ask)
      .then((response) => { if (active) { setResult(response); setOutcome({ key: requestKey, error: null }); } })
      .catch((reason: unknown) => { if (active) setOutcome({ key: requestKey, error: describeError(reason, "Council couldn’t answer") }); });
    return () => { active = false; };
  }, [ask, requestKey]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let cents: number;
    try { cents = parseCadToCents(draft.price); } catch (reason) { setPriceError(reason instanceof Error ? reason.message : "Enter a valid price"); return; }
    if (cents <= 0) { setPriceError("Enter a price greater than $0.00"); return; }
    setPriceError("");
    setApproval({ state: "idle" });
    setApprovalError(null);
    setAsk(toAsk(draft, cents));
  }

  async function approve() {
    const proposal = result?.goal_change_proposal;
    if (!proposal) return;
    setApproval({ state: "approving" });
    setApprovalError(null);
    try {
      const response = await councilApi.approveGoalChange(proposal.proposal_id, proposal.proposal_version);
      const goal = response.dashboard.savings_goals.find((item) => item.id === proposal.goal_id);
      setApproval({ state: "done", goalName: proposal.goal_name, contribution: proposal.contribution_cents, newCents: goal?.current_cents ?? null });
      onDashboardChange(response.dashboard);
      onApproved(`Added ${cad(proposal.contribution_cents)} to ${proposal.goal_name}`);
    } catch (reason) {
      setApproval({ state: "idle" });
      setApprovalError(describeError(reason, "The contribution couldn’t be approved"));
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section aria-labelledby="council-intro" className="animate-enter">
        <h2 id="council-intro" className="sr-only">Meet the Council</h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {(Object.keys(ADVISORS) as Advisor[]).map((name) => <AdvisorChip key={name} name={name} />)}
        </ul>
        <p className="mt-3 flex items-start gap-2 text-sm text-ink-subtle"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />Three ways of looking at one set of numbers. Penny’s tools calculate and check every amount — the advisors only explain what the numbers mean.</p>
      </section>

      <Card className="animate-enter" style={enterStyle(1)}>
        <form onSubmit={submit} className="p-5 sm:p-6" aria-labelledby="council-form-title">
          <h2 id="council-form-title" className="text-lg font-semibold tracking-tight text-ink">What are you thinking about buying?</h2>
          <div className="mt-2 flex flex-wrap gap-2" aria-label="Examples">
            {examples.map((example) => (
              <button key={example.label} type="button" onClick={() => { setDraft(example.draft); setPriceError(""); }} className="min-h-9 rounded-full border border-line bg-sage-soft px-3 text-sm font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink">
                {example.label}
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-[1.3fr_0.9fr_0.9fr_1.2fr]">
            <Field label="Item">{(props) => <Input {...props} value={draft.item} onChange={(event) => setDraft({ ...draft, item: event.target.value })} required maxLength={80} placeholder="e.g. Laptop" />}</Field>
            <Field label="Price (CAD)" error={priceError}>{(props) => <Input {...props} value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} inputMode="decimal" autoComplete="off" required placeholder="0.00" />}</Field>
            <Field label="Buy within">
              {(props) => (
                <Select {...props} value={draft.months} onChange={(event) => setDraft({ ...draft, months: event.target.value })}>
                  {[1, 2, 3, 6, 12].map((months) => <option key={months} value={months}>{months} month{months === 1 ? "" : "s"}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Save toward">
              {(props) => (
                <Select {...props} value={draft.goalId} onChange={(event) => setDraft({ ...draft, goalId: event.target.value })}>
                  <option value="">No savings goal</option>
                  {dashboard.savings_goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.name}</option>)}
                </Select>
              )}
            </Field>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field label="Your question (optional)" className="flex-1">
              {(props) => <Input {...props} value={draft.question} onChange={(event) => setDraft({ ...draft, question: event.target.value })} maxLength={500} placeholder="Can I afford this purchase?" />}
            </Field>
            <Button type="submit" disabled={loading} className="sm:w-auto">
              {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}Ask the Council
            </Button>
          </div>
        </form>
      </Card>

      <div aria-live="polite" aria-busy={loading} className="space-y-6">
        <div className="flex justify-end">
          <div className="max-w-[85%] animate-enter rounded-2xl rounded-br-md bg-hero px-4 py-3 text-white shadow-[var(--shadow-card)]">
            <p className="text-sm font-medium">{ask.question}</p>
            <p className="tabular mt-1 text-xs text-white/75">{ask.purchase_name} · {cad(ask.purchase_cents)} · within {ask.time_horizon_months} month{ask.time_horizon_months === 1 ? "" : "s"}{linkedGoal ? ` · saving toward ${linkedGoal.name}` : ""}</p>
          </div>
        </div>

        {error && (
          <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-danger/25 bg-danger-soft p-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-semibold text-danger">{error.title}</p><p className="mt-0.5 text-sm text-ink-muted">{error.detail}</p></div>
            <Button variant="outline" onClick={() => { setApprovalError(null); setAttempt((value) => value + 1); }}><RefreshCw className="size-4" aria-hidden="true" />Try again</Button>
          </div>
        )}

        {approval.state === "done" && (
          <div role="status" className="flex animate-enter items-start gap-3 rounded-2xl border border-accent/30 bg-accent-soft p-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-white" aria-hidden="true"><Check className="size-5" /></span>
            <div>
              <p className="font-semibold text-ink">Contribution approved</p>
              <p className="tabular mt-0.5 text-sm text-ink-muted">{cad(approval.contribution)} was added to {approval.goalName}{approval.newCents !== null ? `, which now has ${cad(approval.newCents)}` : ""}. The Council refreshed its advice with your new numbers.</p>
            </div>
          </div>
        )}

        {loading && !result ? <CouncilThinking /> : result && (
          <div className={cn("transition-opacity duration-200", loading && "opacity-60")}>
            {loading && <p className="mb-3 flex items-center gap-2 text-sm text-ink-subtle"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />Updating with your latest numbers…</p>}
            <CouncilAnswer key={JSON.stringify(ask)} result={result} purchaseName={ask.purchase_name} approving={approval.state === "approving"} approved={approval.state === "done"} onApprove={() => void approve()} />
          </div>
        )}
      </div>
    </div>
  );
}

function toAsk(draft: Draft, cents: number): Ask {
  const item = draft.item.trim();
  return {
    question: draft.question.trim() || "Can I afford this purchase?",
    purchase_name: item,
    purchase_cents: cents,
    time_horizon_months: Number(draft.months),
    savings_goal_id: draft.goalId || undefined,
  };
}

function AdvisorAvatar({ name, className }: { name: Advisor; className?: string }) {
  const { icon: Icon, avatar } = ADVISORS[name];
  return <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", avatar, className)} aria-hidden="true"><Icon className="size-5" /></span>;
}

function AdvisorChip({ name }: { name: Advisor }) {
  const advisor = ADVISORS[name];
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-[var(--shadow-card)]">
      <AdvisorAvatar name={name} />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{name} <span className={cn("font-medium", advisor.text)}>· {advisor.focus}</span></p>
        <p className="truncate text-xs text-ink-subtle">{advisor.blurb}</p>
      </div>
    </li>
  );
}

function CouncilThinking() {
  return (
    <div className="space-y-3" role="status">
      <p className="flex items-center gap-2 text-sm text-ink-subtle"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />Penny is checking your numbers…</p>
      <div className="grid animate-pulse gap-3 md:grid-cols-3">
        {(Object.keys(ADVISORS) as Advisor[]).map((name) => (
          <div key={name} className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
            <div className="flex items-center gap-3"><AdvisorAvatar name={name} /><div className="h-3 w-24 rounded bg-sage" /></div>
            <div className="mt-4 space-y-2"><div className="h-3 rounded bg-sage" /><div className="h-3 w-5/6 rounded bg-sage" /><div className="h-3 w-2/3 rounded bg-sage" /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CouncilAnswer({ result, purchaseName, approving, approved, onApprove }: { result: CouncilResponse; purchaseName: string; approving: boolean; approved: boolean; onApprove: () => void }) {
  const claims = useMemo(() => new Map(result.quantitative_claims.map((claim) => [claim.id, { ...claim, label: claim.id === "purchase" ? `${purchaseName} price` : claim.label }])), [result.quantitative_claims, purchaseName]);

  if (result.status === "needs_information") {
    return (
      <Card className="animate-enter p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gold-soft text-gold-strong" aria-hidden="true"><CircleHelp className="size-5" /></span>
          <div>
            <h3 className="font-semibold text-ink">A few details are missing</h3>
            <p className="mt-1 text-sm text-ink-subtle">Penny won’t guess prices or timelines. Add these above and ask again:</p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-muted">{result.missing_information.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        </div>
      </Card>
    );
  }

  const decision = DECISIONS[result.decision];
  const proposal = result.goal_change_proposal;
  return (
    <div className="space-y-6">
      <section aria-label="Council recommendation" className="animate-enter overflow-hidden rounded-[var(--radius-card)] bg-hero text-white shadow-[var(--shadow-raised)]">
        <div className="p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="inverse"><Sparkles className="size-3.5" aria-hidden="true" />Council recommendation</Badge>
            {result.verification.verified && <Badge className="bg-[#8fd1bd] text-primary"><ShieldCheck className="size-3.5" aria-hidden="true" />Numbers verified</Badge>}
          </div>
          <h3 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">{decision.label}</h3>
          <p className="mt-2 max-w-2xl text-white/80">{result.summary}</p>
        </div>
        <dl className="grid grid-cols-2 border-t border-white/15 sm:grid-cols-3">
          {["purchase", "monthly_saving", "buy_now_flow"].map((id) => claims.get(id)).filter((claim) => claim !== undefined).map((claim) => (
            <div key={claim.id} className="border-white/15 p-4 not-last:border-r sm:px-7">
              <dt className="text-xs text-white/70">{claim.label}</dt>
              <dd className={cn("tabular whitespace-nowrap mt-1 text-lg font-semibold", claim.value_cents < 0 && "text-[#ffb4a8]")}>{cad(claim.value_cents)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="perspectives">
        <h3 id="perspectives" className="mb-3 text-lg font-semibold tracking-tight text-ink">Three perspectives</h3>
        <ul className="grid gap-4 md:grid-cols-3">
          {result.viewpoints.map((viewpoint, index) => {
            const advisor = ADVISORS[viewpoint.agent];
            return (
              <li key={viewpoint.agent} className={cn("relative animate-enter overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-[var(--shadow-card)] before:absolute before:inset-x-0 before:top-0 before:h-1", advisor.ring)} style={enterStyle(index + 1)}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <AdvisorAvatar name={viewpoint.agent} />
                    <div className="min-w-0"><p className="font-semibold text-ink">{viewpoint.agent}</p><p className={cn("text-xs font-medium", advisor.text)}>{advisor.focus}</p></div>
                  </div>
                  <Badge tone="neutral">{STANCES[viewpoint.stance]}</Badge>
                </div>
                <h4 className="mt-4 font-semibold text-ink">{viewpoint.headline}</h4>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{viewpoint.reasoning}</p>
                {viewpoint.claim_ids.length > 0 && (
                  <dl className="mt-4 space-y-1.5 rounded-xl bg-sage-soft p-3 text-sm">
                    {viewpoint.claim_ids.map((id) => claims.get(id)).filter((claim) => claim !== undefined).map((claim) => (
                      <div key={claim.id} className="flex justify-between gap-3"><dt className="text-ink-subtle">{claim.label}</dt><dd className={cn("tabular whitespace-nowrap font-semibold", claim.value_cents < 0 ? "text-danger" : "text-ink")}>{cad(claim.value_cents)}</dd></div>
                    ))}
                  </dl>
                )}
                <h5 className="mt-4 text-xs font-semibold uppercase tracking-wider text-ink-subtle">Weighing up</h5>
                <ul className="mt-2 space-y-1.5">{viewpoint.tradeoffs.map((item) => <li key={item} className="flex gap-2 text-sm text-ink-muted"><ArrowRight className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden="true" />{item}</li>)}</ul>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="options" className="animate-enter" style={enterStyle(4)}>
        <h3 id="options" className="mb-3 text-lg font-semibold tracking-tight text-ink">Your options compared</h3>
        <ul className="grid gap-3 md:grid-cols-3">
          {result.scenarios.map((scenario) => {
            const recommended = scenario.name === decision.scenario;
            return (
              <li key={scenario.name} className={cn("rounded-[var(--radius-card)] border bg-surface p-5", recommended ? "border-accent shadow-[0_0_0_1px_var(--color-accent)]" : "border-line")}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-ink">{scenario.name}</p>
                  {recommended ? <Badge><Check className="size-3.5" aria-hidden="true" />Recommended</Badge> : scenario.months ? <Badge tone="neutral">{scenario.months} months</Badge> : null}
                </div>
                <p className="mt-1 text-sm text-ink-subtle">{scenario.description}</p>
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between gap-3"><dt className="text-ink-subtle">Monthly cash flow after</dt><dd className={cn("tabular whitespace-nowrap font-semibold", scenario.cash_flow_after_cents < 0 ? "text-danger" : "text-accent-strong")}>{cad(scenario.cash_flow_after_cents)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-ink-subtle">Budget left after</dt><dd className={cn("tabular whitespace-nowrap font-semibold", scenario.budget_remaining_after_cents < 0 ? "text-danger" : "text-ink")}>{cad(scenario.budget_remaining_after_cents)}</dd></div>
                </dl>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid animate-enter gap-4 md:grid-cols-2" style={enterStyle(5)}>
        <Card className="p-5 sm:p-6">
          <h3 className="font-semibold text-ink">Where the perspectives differ</h3>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">{result.disagreements[0]}</p>
        </Card>
        <Card className="p-5 sm:p-6">
          <h3 className="font-semibold text-ink">What this assumes</h3>
          <ul className="mt-2 space-y-1.5">{result.assumptions.map((item) => <li key={item} className="flex gap-2 text-sm text-ink-muted"><Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />{item}</li>)}</ul>
        </Card>
      </div>

      {proposal && !approved && (
        <section aria-labelledby="proposal-title" className="animate-enter rounded-[var(--radius-card)] border-2 border-accent/40 bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6" style={enterStyle(6)}>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gold-soft text-gold-strong" aria-hidden="true"><PiggyBank className="size-5" /></span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gold-strong">Needs your approval</p>
                <h3 id="proposal-title" className="mt-1 font-semibold text-ink">Add {cad(proposal.contribution_cents)} to {proposal.goal_name}</h3>
                <p className="tabular mt-1 text-sm text-ink-muted">{proposal.goal_name} would go from {cad(proposal.current_cents)} to {cad(proposal.proposed_current_cents)}. Nothing changes until you approve, and you can edit the goal afterwards.</p>
              </div>
            </div>
            <Button onClick={onApprove} disabled={approving} className="shrink-0">
              {approving ? <><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />Approving…</> : <><Check className="size-4" aria-hidden="true" />Approve contribution</>}
            </Button>
          </div>
        </section>
      )}

      <Card className="animate-enter p-5 sm:p-6" style={enterStyle(6)}>
        <h3 className="font-semibold text-ink">Suggested next steps</h3>
        <ol className="mt-3 grid gap-3 md:grid-cols-3">
          {result.recommended_actions.map((action) => (
            <li key={action.title} className="rounded-xl bg-sage-soft p-4">
              <Badge tone={action.priority === "now" ? "accent" : "neutral"}>{PRIORITIES[action.priority]}</Badge>
              <p className="mt-2 text-sm font-semibold text-ink">{action.title}</p>
              <p className="mt-1 text-sm text-ink-muted">{action.rationale}</p>
            </li>
          ))}
        </ol>
      </Card>

      <details className="group rounded-[var(--radius-card)] border border-line bg-surface px-5 py-4 sm:px-6">
        <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-3 font-semibold text-ink [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2"><ShieldCheck className="size-4 text-accent" aria-hidden="true" />How Penny checked these numbers</span>
          <ArrowRight className="size-4 text-ink-subtle transition-transform duration-200 group-open:rotate-90" aria-hidden="true" />
        </summary>
        <div className="mt-4 grid gap-6 text-sm md:grid-cols-2">
          <div>
            <h4 className="font-semibold text-ink">Every amount and where it came from</h4>
            <dl className="mt-2 divide-y divide-line">
              {[...claims.values()].map((claim) => (
                <div key={claim.id} className="flex justify-between gap-3 py-2">
                  <dt className="min-w-0"><span className="text-ink-muted">{claim.label}</span><span className="block text-xs text-ink-subtle">{SOURCES[claim.source_tool] ?? claim.source_tool}</span></dt>
                  <dd className={cn("tabular whitespace-nowrap font-semibold", claim.value_cents < 0 ? "text-danger" : "text-ink")}>{cad(claim.value_cents)}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div>
            <h4 className="font-semibold text-ink">Checks</h4>
            <ul className="mt-2 space-y-1.5">{result.verification.checks.map((check) => <li key={check} className="flex gap-2 text-ink-muted"><Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" /><span className="first-letter:uppercase">{check}</span></li>)}</ul>
            {result.verification.issues.length > 0 && <ul className="mt-2 space-y-1 text-danger">{result.verification.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
            <p className="mt-4 text-ink-subtle">{result.llm_status === "used" ? "The advisors' explanations were written with AI and checked to make sure they contain no numbers." : "The advisors' explanations use Penny’s built-in wording."} All amounts come from Penny’s calculation tools ({result.limits.tool_calls_used} of {result.limits.tool_calls_max} steps used).</p>
          </div>
        </div>
      </details>
    </div>
  );
}
