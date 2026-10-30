"use client";

import { useState } from "react";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, ChartColumn, PiggyBank, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Dashboard } from "@/lib/api";
import { addMonths, formatMonth } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CashFlowChart, CategoryBars, categoryColours } from "./charts";
import type { Density } from "./preferences";
import { cad, EmptyState, enterStyle } from "./shared";
import { useHistory } from "./use-history";

type Range = { id: string; label: string; start: string; end: string };

function ranges(dashboard: Dashboard): Range[] {
  const current = dashboard.current_month;
  const earliest = dashboard.data_months[0] ?? current;
  const clamp = (month: string) => (month < earliest ? earliest : month);
  const years = [...new Set(dashboard.data_months.map((month) => month.slice(0, 4)))].sort().reverse();
  return [
    { id: "6m", label: "Last 6 months", start: clamp(addMonths(current, -5)), end: current },
    { id: "12m", label: "Last 12 months", start: clamp(addMonths(current, -11)), end: current },
    ...years.map((year) => ({ id: year, label: year, start: clamp(`${year}-01-01`), end: `${year}-12-01` < current ? `${year}-12-01` : current })),
  ];
}

export function InsightsView({ dashboard, density, historyVersion, onOpenMonth }: { dashboard: Dashboard; density: Density; historyVersion: number; onOpenMonth: (month: string) => void }) {
  const options = ranges(dashboard);
  const [rangeId, setRangeId] = useState("6m");
  const range = options.find((option) => option.id === rangeId) ?? options[0];
  const history = useHistory(range.start, range.end, historyVersion);
  const data = history.data;
  const colourFor = categoryColours(dashboard.categories);
  const compact = density === "compact";
  const simple = density === "simple";

  return (
    <div className={compact ? "space-y-4" : "space-y-6"}>
      <div role="radiogroup" aria-label="Time range" className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button key={option.id} type="button" role="radio" aria-checked={option.id === range.id} onClick={() => setRangeId(option.id)} className={cn("min-h-10 rounded-full border px-4 text-sm font-semibold transition-colors", option.id === range.id ? "border-primary bg-primary text-on-primary" : "border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink")}>
            {option.label}
          </button>
        ))}
      </div>

      {history.error && !data && <p role="alert" className="rounded-xl bg-danger-soft p-4 text-sm text-danger">{history.error}</p>}
      {!data ? (
        <div className="grid animate-pulse gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-28 rounded-[var(--radius-card)] bg-sage-soft" />)}</div>
      ) : (
        <div className={cn("transition-opacity duration-200", compact ? "space-y-4" : "space-y-6", history.loading && "opacity-60")} aria-busy={history.loading}>
          <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
            <Card className="p-5 sm:p-6">
              <CardTitle>Needs vs. wants</CardTitle>
              <CardDescription className="mt-1">A transparent category classification for this month.</CardDescription>
              <div className="mt-5 flex items-center gap-5">
                <div role="img" aria-label={`Needs ${dashboard.spending_classification.needs_basis_points / 100} percent, wants ${dashboard.spending_classification.wants_basis_points / 100} percent`} className="size-28 shrink-0 rounded-full shadow-inner" style={{ background: `radial-gradient(circle, var(--color-surface) 0 49%, transparent 51%), conic-gradient(var(--color-accent) 0 ${dashboard.spending_classification.needs_basis_points / 100}%, var(--chart-out) 0)` }} />
                <dl className="min-w-0 flex-1 space-y-3"><div><dt className="text-xs text-ink-subtle">Needs</dt><dd className="text-lg font-semibold text-ink">{cad(dashboard.spending_classification.needs_cents)} <span className="text-sm font-normal text-ink-subtle">· {Math.floor(dashboard.spending_classification.needs_basis_points / 100)}%</span></dd></div><div><dt className="text-xs text-ink-subtle">Wants</dt><dd className="text-lg font-semibold text-ink">{cad(dashboard.spending_classification.wants_cents)} <span className="text-sm font-normal text-ink-subtle">· {Math.floor(dashboard.spending_classification.wants_basis_points / 100)}%</span></dd></div></dl>
              </div>
              <p className="mt-4 text-xs leading-relaxed text-ink-subtle">Needs: housing, food, transport, phone, school, and health. Wants: other recorded spending. You can inspect the transactions below.</p>
            </Card>
            <Card className="p-5 sm:p-6">
              <CardTitle>Data-backed observations</CardTitle><CardDescription className="mt-1">No age-group or peer comparisons are shown because Penny has no reliable benchmark dataset.</CardDescription>
              <ul className="mt-4 divide-y divide-line">{dashboard.insights.map((insight) => <li key={insight.id} className="py-3 first:pt-0"><p className="text-sm font-semibold text-ink">{insight.headline}</p><p className="mt-1 text-sm text-ink-subtle">{insight.explanation}</p><p className="mt-1 text-xs text-ink-subtle">Source: {insight.source}</p></li>)}</ul>
            </Card>
          </section>
          <section aria-label={`Totals for ${range.label}`} className={cn("grid grid-cols-2 gap-3 sm:gap-4", simple ? "lg:grid-cols-3" : "xl:grid-cols-4")}>
            <Kpi index={0} icon={ArrowDownLeft} label="Money in" value={cad(data.totals.income_cents)} compact={compact} />
            <Kpi index={1} icon={ArrowUpRight} label="Money out" value={cad(data.totals.spending_cents)} compact={compact} />
            <Kpi index={2} icon={PiggyBank} label={data.totals.cash_flow_cents >= 0 ? "You kept" : "Spent more than earned"} value={cad(Math.abs(data.totals.cash_flow_cents))} valueClass={data.totals.cash_flow_cents >= 0 ? "text-accent-strong" : "text-danger"} compact={compact} className={simple ? "col-span-2 lg:col-span-1" : undefined} />
            {!simple && <Kpi index={3} icon={Receipt} label="Average monthly spending" value={cad(data.totals.average_spending_cents)} note={`Across ${data.totals.months_with_activity} month${data.totals.months_with_activity === 1 ? "" : "s"} with activity`} compact={compact} />}
          </section>

          <Card className="animate-enter" style={enterStyle(2)}>
            <CardHeader className={compact ? "p-4 pb-2 sm:p-5 sm:pb-2" : undefined}>
              <CardTitle>Month by month</CardTitle>
              <CardDescription>Select a month to open it on Home.</CardDescription>
            </CardHeader>
            <CardContent className={compact ? "px-4 pb-4 sm:px-5 sm:pb-5" : undefined}>
              {data.totals.months_with_activity === 0 ? (
                <EmptyState icon={ChartColumn} title="No activity in this range" description="Try a different range to see your history." />
              ) : (
                <CashFlowChart months={data.months} onSelectMonth={onOpenMonth} height={compact ? 220 : simple ? 260 : 280} labelSelected={false} />
              )}
            </CardContent>
          </Card>

          {!simple && (
            <div className={cn("grid lg:grid-cols-5", compact ? "gap-4" : "gap-6")}>
              <Card className="animate-enter lg:col-span-2" style={enterStyle(3)}>
                <CardHeader className={compact ? "p-4 pb-2 sm:p-5 sm:pb-2" : undefined}>
                  <CardTitle>Top categories</CardTitle>
                  <CardDescription>Where spending went in {range.label.toLowerCase().startsWith("last") ? `the ${range.label.toLowerCase()}` : range.label}.</CardDescription>
                </CardHeader>
                <CardContent className={compact ? "px-4 pb-4 sm:px-5 sm:pb-5" : undefined}>
                  {data.categories.length === 0 ? <p className="text-sm text-ink-subtle">No spending in this range.</p> : <CategoryBars items={data.categories} colourFor={colourFor} limit={compact ? 5 : 8} />}
                </CardContent>
              </Card>
              <Card className="animate-enter overflow-hidden lg:col-span-3" style={enterStyle(4)}>
                <CardHeader className={compact ? "p-4 pb-2 sm:p-5 sm:pb-2" : undefined}>
                  <CardTitle>Monthly summary</CardTitle>
                  <CardDescription>How each month compared with its budget.</CardDescription>
                </CardHeader>
                <div className="scroll-area relative max-h-[28rem] overflow-auto">
                  <table className="w-full min-w-[34rem] text-sm">
                    <caption className="sr-only">Monthly totals for {range.label}</caption>
                    <thead className="sticky top-0 bg-sage-soft text-left text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                      <tr><th scope="col" className="py-2.5 pl-6 pr-3">Month</th><th scope="col" className="px-3 py-2.5 text-right">In</th><th scope="col" className="px-3 py-2.5 text-right">Out</th><th scope="col" className="px-3 py-2.5 text-right">Kept</th><th scope="col" className="px-3 py-2.5">Budget</th><th scope="col" className="py-2.5 pl-3 pr-6"><span className="sr-only">Open</span></th></tr>
                    </thead>
                    <tbody>
                      {[...data.months].reverse().map((row) => {
                        const overBudget = row.budget_cents > 0 && row.spending_cents > row.budget_cents;
                        return (
                          <tr key={row.month} className="border-t border-line">
                            <th scope="row" className={cn("pl-6 pr-3 text-left font-medium text-ink", compact ? "py-2" : "py-3")}>{formatMonth(row.month)}</th>
                            <td className="tabular whitespace-nowrap px-3 text-right">{row.transaction_count ? cad(row.income_cents) : "—"}</td>
                            <td className="tabular whitespace-nowrap px-3 text-right">{row.transaction_count ? cad(row.spending_cents) : "—"}</td>
                            <td className={cn("tabular whitespace-nowrap px-3 text-right font-semibold", row.cash_flow_cents < 0 ? "text-danger" : "text-ink")}>{row.transaction_count ? cad(row.cash_flow_cents) : "—"}</td>
                            <td className="px-3">{row.budget_cents === 0 ? <span className="text-ink-subtle">No budget</span> : <Badge tone={overBudget ? "danger" : "accent"}>{overBudget ? "Over" : "Within"}</Badge>}</td>
                            <td className="py-1.5 pl-3 pr-4 text-right">
                              {row.transaction_count > 0 && <Button variant="ghost" size="sm" onClick={() => onOpenMonth(row.month)} aria-label={`Open ${formatMonth(row.month)}`}>Open<ArrowRight className="size-3.5" aria-hidden="true" /></Button>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Kpi({ index, icon: Icon, label, value, note, valueClass, compact, className }: { index: number; icon: typeof PiggyBank; label: string; value: string; note?: string; valueClass?: string; compact: boolean; className?: string }) {
  const tones = ["bg-accent-soft text-accent-strong", "bg-[#fff0e8] text-[#b95332] dark:bg-[#4a2b25] dark:text-[#f0a184]", "bg-info-soft text-info", "bg-gold-soft text-gold-strong"];
  return (
    <Card className={cn("animate-enter", compact ? "p-4" : "p-5", className)} style={enterStyle(index)}>
      <p className="flex items-center gap-2 text-sm font-medium text-ink-muted"><span className={cn("grid size-8 place-items-center rounded-lg", tones[index % tones.length])}><Icon className="size-4" aria-hidden="true" /></span>{label}</p>
      <p className={cn("mt-2 whitespace-nowrap text-xl font-semibold tracking-tight text-ink sm:text-2xl", valueClass)}>{value}</p>
      {note && <p className="mt-1 text-xs text-ink-subtle">{note}</p>}
    </Card>
  );
}
