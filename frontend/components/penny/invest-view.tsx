"use client";

import { useEffect, useState } from "react";
import { CircleCheck, CircleDashed, CircleX, GraduationCap, Home, Info, Landmark, LoaderCircle, PiggyBank, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { calculationsApi, type Dashboard, type FoundationCheck, type Growth } from "@/lib/api";
import { parseCadToCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { compactCad } from "./charts";
import { cad, describeError, Field, SectionHeading, type View } from "./shared";

// 2026 limits published by the CRA. Educational summary only; personal room is on CRA My Account.
const ACCOUNTS = [
  {
    id: "tfsa", icon: PiggyBank, name: "TFSA", full: "Tax-Free Savings Account", limit: "$7,000 a year in 2026",
    points: ["Growth and withdrawals are tax-free.", "Room builds every year from age 18, and unused room carries forward.", "Money you take out is added back to your room the next January."],
    watch: "Going over your room costs 1% of the excess each month.",
  },
  {
    id: "rrsp", icon: Landmark, name: "RRSP", full: "Registered Retirement Savings Plan", limit: "18% of last year’s earned income, up to $33,810 in 2026",
    points: ["Contributions lower your taxable income now.", "You pay tax when you withdraw, usually in retirement.", "Students can contribute now and save the deduction for a higher-income year."],
    watch: "Early withdrawals are taxed, and that room is gone for good.",
  },
  {
    id: "fhsa", icon: Home, name: "FHSA", full: "First Home Savings Account", limit: "$8,000 a year, $40,000 lifetime",
    points: ["Contributions are deductible, like an RRSP.", "Withdrawals for a first home are tax-free, like a TFSA.", "For first-time buyers aged 18+; it can stay open up to 15 years."],
    watch: "Room only starts carrying forward once you open the account.",
  },
] as const;

const CONCEPTS = [
  { title: "Risk and return", body: "Investments that can grow more also swing more. Money you need within a few years usually stays in savings, where a market drop can’t touch it." },
  { title: "Diversification", body: "Owning a little of many companies and countries means one bad company can’t sink you. Index funds and ETFs do this in a single purchase." },
  { title: "Time beats timing", body: "Regular contributions over many years let compounding do the heavy lifting. Guessing the right moment to buy rarely works, even for professionals." },
  { title: "Fees compound too", body: "A 2% yearly fee sounds small, but it’s taken every year from a growing balance. Try it in the explorer above." },
  { title: "Spotting hype", body: "Guaranteed high returns, pressure to act fast, or “secret” strategies are red flags. You can check whether a firm or advisor is registered at aretheyregistered.ca." },
] as const;

const RETURNS = [200, 400, 600, 800];
const FEES = [25, 100, 200];

export function InvestView({ dashboard, onNavigate }: { dashboard: Dashboard; onNavigate: (view: View) => void }) {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <section className="overflow-hidden rounded-[var(--radius-card)] bg-hero p-5 text-white shadow-[var(--shadow-raised)] sm:p-7">
        <Badge tone="inverse">Education, not advice</Badge>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Investing, without the hype.</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/80">Learn how investing works in Canada: the accounts, the trade-offs, and what fees and time do to your money. Penny never recommends specific investments, and every number here is an illustration.</p>
      </section>

      <Foundations checks={dashboard.investing_foundations} />

      <section aria-labelledby="accounts-title">
        <SectionHeading id="accounts-title" title="Canada’s registered accounts" description="Each one gives you a tax advantage in exchange for a few rules." />
        <ul className="grid gap-4 md:grid-cols-3">
          {ACCOUNTS.map(({ id, icon: Icon, name, full, limit, points, watch }) => (
            <li key={id}>
              <Card className="flex h-full flex-col p-5">
                <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent-strong" aria-hidden="true"><Icon className="size-5" /></span><div><h3 className="font-semibold text-ink">{name}</h3><p className="text-xs text-ink-subtle">{full}</p></div></div>
                <p className="mt-4 rounded-lg bg-sage-soft px-3 py-2 text-sm font-semibold text-ink">{limit}</p>
                <ul className="mt-3 flex-1 space-y-2 text-sm text-ink-muted">{points.map((point) => <li key={point} className="flex gap-2"><CircleCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />{point}</li>)}</ul>
                <p className="mt-3 flex gap-2 text-xs text-ink-subtle"><ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-gold-strong" aria-hidden="true" />{watch}</p>
              </Card>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-subtle">Limits are the CRA’s 2026 figures. Your personal contribution room is on CRA My Account or your Notice of Assessment.</p>
      </section>

      <GrowthExplorer />

      <section aria-labelledby="concepts-title">
        <SectionHeading id="concepts-title" title="Core ideas" description="Five things worth knowing before you invest a dollar." action={<Button variant="outline" onClick={() => onNavigate("learn")}><GraduationCap className="size-4" aria-hidden="true" />Take the investing lessons</Button>} />
        <div className="space-y-2">
          {CONCEPTS.map((concept) => (
            <details key={concept.title} className="group rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 font-semibold text-ink [&::-webkit-details-marker]:hidden">{concept.title}<span className="text-xl text-ink-subtle transition-transform group-open:rotate-45" aria-hidden="true">+</span></summary>
              <p className="px-5 pb-5 text-sm leading-relaxed text-ink-muted">{concept.body}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

const CHECK_ICON = { met: CircleCheck, in_progress: CircleDashed, not_met: CircleX } as const;
const CHECK_TONE = { met: "text-accent", in_progress: "text-gold-strong", not_met: "text-danger" } as const;

function Foundations({ checks }: { checks: FoundationCheck[] }) {
  const met = checks.filter((check) => check.status === "met").length;
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-ink">Your foundations</h2>
          <p className="mt-1 text-sm text-ink-subtle">Many Canadian money guides suggest these come before investing. A checklist, not a verdict.</p>
        </div>
        <Badge tone={met === checks.length ? "accent" : "gold"}>{met} of {checks.length} in place</Badge>
      </div>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {checks.map((check) => {
          const Icon = CHECK_ICON[check.status];
          return (
            <li key={check.id} className="flex gap-3 rounded-2xl border border-line p-4">
              <Icon className={cn("mt-0.5 size-5 shrink-0", CHECK_TONE[check.status])} aria-hidden="true" />
              <div><p className="text-sm font-semibold text-ink">{check.title}<span className="sr-only"> ({check.status.replace("_", " ")})</span></p><p className="mt-0.5 text-sm text-ink-muted">{check.detail}</p></div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function ChipGroup({ label, options, value, onChange, format }: { label: string; options: number[]; value: number; onChange: (value: number) => void; format: (value: number) => string }) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-ink">{label}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => <button key={option} type="button" aria-pressed={value === option} onClick={() => onChange(option)} className={cn("min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors", value === option ? "border-primary bg-primary text-on-primary" : "border-line bg-surface text-ink-muted hover:border-line-strong")}>{format(option)}</button>)}
      </div>
    </fieldset>
  );
}

const percent = (basisPoints: number) => `${basisPoints / 100}%`;

function GrowthExplorer() {
  const [monthly, setMonthly] = useState("100");
  const [years, setYears] = useState(10);
  const [rate, setRate] = useState(600);
  const [fee, setFee] = useState(25);
  const [result, setResult] = useState<Growth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  let monthlyCents: number | null = null;
  let inputError = "";
  try { monthlyCents = parseCadToCents(monthly || "0"); } catch (reason) { inputError = reason instanceof Error ? reason.message : "Enter a valid amount"; }

  useEffect(() => {
    if (monthlyCents === null) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      calculationsApi.growth({ initial_cents: 0, monthly_cents: monthlyCents, years, annual_return_basis_points: rate, annual_fee_basis_points: fee })
        .then((data) => { if (active) { setResult(data); setError(null); } })
        .catch((reason: unknown) => { if (active) setError(describeError(reason, "Couldn’t calculate").detail); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [monthlyCents, years, rate, fee]);

  return (
    <section aria-labelledby="growth-title">
      <SectionHeading id="growth-title" title="Compounding and fees explorer" description="See how steady contributions grow at an assumed yearly return, and what fees take." />
      <Card className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_1.3fr] [&>*]:min-w-0">
        <div className="space-y-5">
          <Field label="Monthly contribution (CAD)" error={inputError}>{(props) => <Input {...props} inputMode="decimal" value={monthly} onChange={(event) => setMonthly(event.target.value)} />}</Field>
          <div>
            <label htmlFor="growth-years" className="flex justify-between text-sm font-semibold text-ink"><span>Years</span><span className="tabular">{years}</span></label>
            <input id="growth-years" type="range" min={1} max={40} value={years} onChange={(event) => setYears(Number(event.target.value))} className="mt-3 h-11 w-full accent-[var(--color-accent)]" />
          </div>
          <ChipGroup label="Assumed yearly return" options={RETURNS} value={rate} onChange={setRate} format={percent} />
          <ChipGroup label="Yearly fee" options={FEES} value={fee} onChange={setFee} format={percent} />
        </div>
        <div aria-live="polite" aria-busy={loading}>
          {error && <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger">{error}</p>}
          {result ? (
            <>
              <dl className="grid gap-2 sm:grid-cols-3">
                <Result label="You put in" value={cad(result.contributed_cents)} />
                <Result label="Could grow to" value={cad(result.balance_cents)} tone="text-accent-strong" />
                <Result label="Fees cost" value={cad(result.fees_cost_cents)} tone="text-danger" />
              </dl>
              <GrowthBars growth={result} />
            </>
          ) : <div className="grid h-64 place-items-center rounded-xl bg-sage-soft"><LoaderCircle className="size-6 animate-spin text-accent" aria-hidden="true" /></div>}
          <p className="mt-3 flex gap-2 text-xs text-ink-subtle"><Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />An illustration with a steady assumed return. Real returns go up and down, are never guaranteed, and taxes depend on the account.</p>
        </div>
      </Card>
    </section>
  );
}

function Result({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div className="flex items-baseline justify-between gap-3 rounded-xl bg-sage-soft p-3 sm:block"><dt className="text-xs text-ink-subtle">{label}</dt><dd className={cn("tabular font-semibold text-ink sm:mt-0.5 sm:text-lg", tone)}>{value}</dd></div>;
}

function GrowthBars({ growth }: { growth: Growth }) {
  const points = growth.points.slice(1);
  const max = Math.max(...points.map((point) => point.balance_cents), 1);
  return (
    <figure className="mt-4">
      <div className="flex h-48 items-end gap-[2px]" role="img" aria-label={`After ${points.length} years: ${cad(growth.contributed_cents)} contributed, ${cad(growth.balance_cents)} balance`}>
        {points.map((point) => {
          const total = (point.balance_cents / max) * 100;
          const share = point.balance_cents ? (Math.min(point.contributed_cents, point.balance_cents) / point.balance_cents) * 100 : 0;
          return (
            <div key={point.year} className="flex h-full flex-1 flex-col justify-end" title={`Year ${point.year}: ${cad(point.balance_cents)}`}>
              <div className="flex flex-col overflow-hidden rounded-t-sm" style={{ height: `${total}%` }}>
                <span className="bg-accent" style={{ height: `${100 - share}%` }} />
                <span className="flex-1 bg-info/40" />
              </div>
            </div>
          );
        })}
      </div>
      <figcaption className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-ink-subtle">
        <span className="flex gap-3"><span><span className="mr-1 inline-block size-2 rounded-sm bg-info/40" aria-hidden="true" />Contributions</span><span><span className="mr-1 inline-block size-2 rounded-sm bg-accent" aria-hidden="true" />Growth</span></span>
        <span className="tabular">Year {points.length}: {compactCad(growth.balance_cents)}</span>
      </figcaption>
    </figure>
  );
}
