"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Table2 } from "lucide-react";
import type { Category, CategorySpending, DailySpending, HistoryMonth } from "@/lib/api";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { cad } from "./shared";

/*
 * Hand-built SVG charts. Every plotted value is integer cents from the API; the code here
 * only maps values to pixels. Specs follow the dataviz guide: <=24px columns with 4px
 * rounded data-ends, 2px lines, >=8px ringed markers, hairline solid grid, one y-axis,
 * a legend for 2+ series, hover + keyboard tooltips, and a table view for every chart.
 */

// ------------------------------------------------------------------ shared helpers

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Clean axis ticks over [min, max] cents: steps of 1, 2, 2.5 or 5 × 10^n dollars. */
export function niceTicks(minCents: number, maxCents: number, count = 4): number[] {
  const span = Math.max(maxCents - minCents, 100);
  const rough = span / count;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * power).find((candidate) => candidate >= rough) ?? 10 * power;
  const start = Math.floor(minCents / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= maxCents + step * 0.001; value += step) ticks.push(Math.round(value));
  if (ticks[ticks.length - 1] < maxCents) ticks.push(ticks[ticks.length - 1] + Math.round(step));
  return ticks;
}

/** Axis label: $0, $500, $1.5K, $12K. Display only. */
export function compactCad(cents: number): string {
  const dollars = cents / 100;
  const sign = dollars < 0 ? "−" : "";
  const absolute = Math.abs(dollars);
  if (absolute >= 1000) return `${sign}$${(absolute / 1000).toFixed(absolute % 1000 === 0 ? 0 : 1)}K`;
  return `${sign}$${absolute.toFixed(0)}`;
}

/** Column with a 4px rounded data-end and a square baseline (works up or down). */
function columnPath(x: number, width: number, yValue: number, yBase: number): string {
  const height = Math.abs(yBase - yValue);
  if (height < 0.5) return "";
  const r = Math.min(4, width / 2, height);
  if (yValue <= yBase) {
    return `M${x},${yBase}V${yValue + r}Q${x},${yValue} ${x + r},${yValue}H${x + width - r}Q${x + width},${yValue} ${x + width},${yValue + r}V${yBase}Z`;
  }
  return `M${x},${yBase}V${yValue - r}Q${x},${yValue} ${x + r},${yValue}H${x + width - r}Q${x + width},${yValue} ${x + width},${yValue - r}V${yBase}Z`;
}

function monthLabel(month: string, withYear = false) {
  const short = new Intl.DateTimeFormat("en-CA", { month: "short", timeZone: "UTC" }).format(new Date(`${month}T00:00:00Z`)).replace(".", "");
  return withYear ? `${short} ’${month.slice(2, 4)}` : short;
}

function LegendItem({ kind, colour, label }: { kind: "bar" | "line" | "reference"; colour: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
      {kind === "bar" ? <span className="size-2.5 rounded-[3px]" style={{ background: colour }} aria-hidden="true" /> : <span className={cn("h-0.5 w-4 rounded-full", kind === "reference" && "opacity-80")} style={{ background: colour }} aria-hidden="true" />}
      {label}
    </span>
  );
}

function TableToggle({ showTable, onToggle, controls }: { showTable: boolean; onToggle: () => void; controls: string }) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={showTable} aria-controls={controls} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-ink-muted transition-colors hover:bg-sage-soft hover:text-ink">
      <Table2 className="size-3.5" aria-hidden="true" />{showTable ? "Show chart" : "Show table"}
    </button>
  );
}

function Tooltip({ x, width, children }: { x: number; width: number; children: React.ReactNode }) {
  const flip = x > width - 170;
  return (
    <div role="status" className="pointer-events-none absolute top-1 z-10 min-w-40 rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-[var(--shadow-raised)]" style={flip ? { right: Math.max(4, width - x + 10) } : { left: Math.max(4, x + 10) }}>
      {children}
    </div>
  );
}

function TooltipRow({ colour, kind = "line", label, value }: { colour: string; kind?: "line" | "bar"; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <span className="flex items-center gap-1.5 text-ink-subtle"><span className={kind === "bar" ? "size-2 rounded-[2px]" : "h-0.5 w-3 rounded-full"} style={{ background: colour }} aria-hidden="true" />{label}</span>
      <span className="tabular font-semibold text-ink">{value}</span>
    </div>
  );
}

// ------------------------------------------------------------------ cash flow by month

export function CashFlowChart({ months, selectedMonth, onSelectMonth, height = 240, labelSelected = true }: { months: HistoryMonth[]; selectedMonth?: string; onSelectMonth?: (month: string) => void; height?: number; labelSelected?: boolean }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();
  const margin = { top: 18, right: 8, bottom: 26, left: 46 };
  const plotW = Math.max(0, width - margin.left - margin.right);
  const plotH = height - margin.top - margin.bottom;

  const scale = useMemo(() => {
    const max = Math.max(0, ...months.flatMap((row) => [row.income_cents, row.spending_cents, row.cash_flow_cents]));
    const min = Math.min(0, ...months.map((row) => row.cash_flow_cents));
    const ticks = niceTicks(min, max);
    return { ticks, low: ticks[0], high: ticks[ticks.length - 1] };
  }, [months]);
  const y = (cents: number) => margin.top + (plotH * (scale.high - cents)) / (scale.high - scale.low || 1);
  const band = months.length ? plotW / months.length : 0;
  const barW = Math.max(3, Math.min(24, (band * 0.62 - 2) / 2));
  const centre = (index: number) => margin.left + band * index + band / 2;
  const showEvery = band < 34 ? 2 : 1;
  const selectedIndex = months.findIndex((row) => row.month === selectedMonth);
  const labelIndex = labelSelected ? (selectedIndex >= 0 ? selectedIndex : months.length - 1) : -1;
  const linePoints = months.map((row, index) => `${centre(index)},${y(row.cash_flow_cents)}`).join(" ");
  const summary = months.length ? `Money in and out for ${months.length} months, ${monthLabel(months[0].month, true)} to ${monthLabel(months[months.length - 1].month, true)}.` : "No months to show.";

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <LegendItem kind="bar" colour="var(--chart-in)" label="Money in" />
          <LegendItem kind="bar" colour="var(--chart-out)" label="Money out" />
          <LegendItem kind="line" colour="var(--chart-net)" label="Kept (in minus out)" />
        </div>
        <TableToggle showTable={showTable} onToggle={() => setShowTable(!showTable)} controls={tableId} />
      </div>
      {showTable ? (
        <div id={tableId} className="relative overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{summary}</caption>
            <thead><tr className="text-left text-xs text-ink-subtle"><th scope="col" className="py-2 font-semibold">Month</th><th scope="col" className="py-2 text-right font-semibold">Money in</th><th scope="col" className="py-2 text-right font-semibold">Money out</th><th scope="col" className="py-2 text-right font-semibold">Kept</th></tr></thead>
            <tbody>{months.map((row) => <tr key={row.month} className="border-t border-line"><th scope="row" className="py-2 text-left font-medium text-ink">{monthLabel(row.month, true)}</th><td className="tabular py-2 text-right">{cad(row.income_cents)}</td><td className="tabular py-2 text-right">{cad(row.spending_cents)}</td><td className={cn("tabular py-2 text-right font-semibold", row.cash_flow_cents < 0 && "text-danger")}>{cad(row.cash_flow_cents)}</td></tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div ref={ref} id={tableId} className="relative" style={{ height }} onPointerLeave={() => setActive(null)}>
          {width > 0 && (
            <svg width={width} height={height} role="img" aria-label={summary} className="block overflow-visible">
              {scale.ticks.map((tick) => (
                <g key={tick}>
                  <line x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} stroke={tick === 0 ? "var(--chart-axis)" : "var(--chart-grid)"} strokeWidth={1} shapeRendering="crispEdges" />
                  <text x={margin.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="tabular fill-ink-subtle text-[11px]">{compactCad(tick)}</text>
                </g>
              ))}
              {months.map((row, index) => {
                const highlighted = index === active || index === selectedIndex;
                const x = centre(index);
                return (
                  <g key={row.month}>
                    {highlighted && <rect x={x - band / 2 + 2} y={margin.top - 10} width={band - 4} height={plotH + 10} rx={8} className={index === active ? "fill-sage" : "fill-sage-soft"} />}
                    <path d={columnPath(x - barW - 1, barW, y(row.income_cents), y(0))} fill="var(--chart-in)" />
                    <path d={columnPath(x + 1, barW, y(row.spending_cents), y(0))} fill="var(--chart-out)" />
                    {index === labelIndex && barW >= 14 && (
                      <>
                        <text x={x - barW / 2 - 1} y={y(row.income_cents) - 5} textAnchor="middle" className="tabular fill-ink-muted text-[10px] font-semibold">{compactCad(row.income_cents)}</text>
                        <text x={x + barW / 2 + 1} y={y(row.spending_cents) - 5} textAnchor="middle" className="tabular fill-ink-muted text-[10px] font-semibold">{compactCad(row.spending_cents)}</text>
                      </>
                    )}
                    {index % showEvery === 0 && <text x={x} y={height - 6} textAnchor="middle" className={cn("text-[11px]", index === selectedIndex ? "fill-ink font-semibold" : "fill-ink-subtle")}>{monthLabel(row.month, index === 0 || row.month.endsWith("-01-01"))}</text>}
                  </g>
                );
              })}
              <polyline points={linePoints} fill="none" stroke="var(--chart-net)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {months.map((row, index) => <circle key={row.month} cx={centre(index)} cy={y(row.cash_flow_cents)} r={4} fill="var(--chart-net)" stroke="var(--color-surface)" strokeWidth={2} />)}
              {months.map((row, index) => (
                <rect
                  key={`hit-${row.month}`}
                  x={centre(index) - band / 2}
                  y={margin.top - 10}
                  width={band}
                  height={plotH + margin.bottom + 10}
                  fill="transparent"
                  tabIndex={0}
                  role={onSelectMonth ? "button" : undefined}
                  aria-label={`${monthLabel(row.month, true)}: money in ${cad(row.income_cents)}, money out ${cad(row.spending_cents)}, kept ${cad(row.cash_flow_cents)}${onSelectMonth ? ". Open this month" : ""}`}
                  className={cn("outline-none", onSelectMonth && "cursor-pointer")}
                  onPointerEnter={() => setActive(index)}
                  onFocus={() => setActive(index)}
                  onBlur={() => setActive(null)}
                  onClick={() => onSelectMonth?.(row.month)}
                  onKeyDown={(event) => { if (onSelectMonth && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onSelectMonth(row.month); } }}
                />
              ))}
            </svg>
          )}
          {active !== null && months[active] && (
            <Tooltip x={centre(active)} width={width}>
              <p className="mb-1 font-semibold text-ink">{monthLabel(months[active].month, true)}</p>
              <TooltipRow kind="bar" colour="var(--chart-in)" label="Money in" value={cad(months[active].income_cents)} />
              <TooltipRow kind="bar" colour="var(--chart-out)" label="Money out" value={cad(months[active].spending_cents)} />
              <TooltipRow colour="var(--chart-net)" label="Kept" value={cad(months[active].cash_flow_cents)} />
              {onSelectMonth && <p className="mt-1 text-[11px] text-ink-subtle">Click to open this month</p>}
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ spending pace within a month

export function SpendingPaceChart({ daily, month, budgetCents, throughDay, height = 200 }: { daily: DailySpending[]; month: string; budgetCents: number; throughDay: number; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();
  const margin = { top: 14, right: 12, bottom: 24, left: 46 };
  const plotW = Math.max(0, width - margin.left - margin.right);
  const plotH = height - margin.top - margin.bottom;
  const [year, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();

  // Carry the API's running total forward to each calendar day (no new sums are made).
  const series = useMemo(() => {
    const byDay = new Map(daily.map((item) => [Number(item.day.slice(8, 10)), item]));
    const points: { day: number; cumulative: number; spent: number }[] = [{ day: 0, cumulative: 0, spent: 0 }];
    let last = 0;
    for (let day = 1; day <= throughDay; day++) {
      const entry = byDay.get(day);
      if (entry) last = entry.cumulative_cents;
      points.push({ day, cumulative: last, spent: entry?.spent_cents ?? 0 });
    }
    return points;
  }, [daily, throughDay]);

  const ticks = niceTicks(0, Math.max(budgetCents, series[series.length - 1]?.cumulative ?? 0, 100));
  const high = ticks[ticks.length - 1];
  const x = (day: number) => margin.left + (plotW * day) / daysInMonth;
  const y = (cents: number) => margin.top + plotH * (1 - cents / (high || 1));
  const path = series.map((point, index) => `${index ? "L" : "M"}${x(point.day)},${y(point.cumulative)}`).join("");
  const area = `${path}L${x(series[series.length - 1].day)},${y(0)}L${x(0)},${y(0)}Z`;
  const last = series[series.length - 1];
  const dayLabel = (day: number) => formatShortDate(`${month.slice(0, 8)}${String(day).padStart(2, "0")}`);
  const summary = `Spending so far this month reached ${cad(last.cumulative)} by ${dayLabel(Math.max(1, last.day))}, against a monthly budget of ${cad(budgetCents)}.`;

  function pointerToDay(clientX: number, rect: DOMRect) {
    const day = Math.round(((clientX - rect.left - margin.left) / (plotW || 1)) * daysInMonth);
    setActive(Math.min(throughDay, Math.max(1, day)));
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <LegendItem kind="line" colour="var(--chart-out)" label="Spent so far" />
          {budgetCents > 0 && <LegendItem kind="reference" colour="var(--chart-reference)" label="Even pace to budget" />}
        </div>
        <TableToggle showTable={showTable} onToggle={() => setShowTable(!showTable)} controls={tableId} />
      </div>
      {showTable ? (
        <div id={tableId} className="relative max-h-64 overflow-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{summary}</caption>
            <thead><tr className="text-left text-xs text-ink-subtle"><th scope="col" className="py-2 font-semibold">Day</th><th scope="col" className="py-2 text-right font-semibold">Spent that day</th><th scope="col" className="py-2 text-right font-semibold">Spent so far</th></tr></thead>
            <tbody>{daily.map((item) => <tr key={item.day} className="border-t border-line"><th scope="row" className="py-2 text-left font-medium">{formatShortDate(item.day)}</th><td className="tabular py-2 text-right">{cad(item.spent_cents)}</td><td className="tabular py-2 text-right font-semibold">{cad(item.cumulative_cents)}</td></tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div
          ref={ref}
          id={tableId}
          className="relative touch-pan-y outline-none"
          style={{ height }}
          tabIndex={0}
          aria-label={`${summary} Use the arrow keys to read each day.`}
          onPointerMove={(event) => pointerToDay(event.clientX, event.currentTarget.getBoundingClientRect())}
          onPointerLeave={() => setActive(null)}
          onBlur={() => setActive(null)}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") { event.preventDefault(); setActive((day) => Math.min(throughDay, (day ?? 0) + 1)); }
            if (event.key === "ArrowLeft") { event.preventDefault(); setActive((day) => Math.max(1, (day ?? throughDay + 1) - 1)); }
          }}
        >
          {width > 0 && (
            <svg width={width} height={height} role="img" aria-label={summary} className="block overflow-visible">
              {ticks.map((tick) => (
                <g key={tick}>
                  <line x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} stroke={tick === 0 ? "var(--chart-axis)" : "var(--chart-grid)"} strokeWidth={1} shapeRendering="crispEdges" />
                  <text x={margin.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="tabular fill-ink-subtle text-[11px]">{compactCad(tick)}</text>
                </g>
              ))}
              {[1, 8, 15, 22, daysInMonth].map((day) => <text key={day} x={x(day)} y={height - 6} textAnchor="middle" className="fill-ink-subtle text-[11px]">{dayLabel(day)}</text>)}
              {budgetCents > 0 && <line x1={x(0)} y1={y(0)} x2={x(daysInMonth)} y2={y(budgetCents)} stroke="var(--chart-reference)" strokeWidth={1.5} />}
              <path d={area} fill="var(--chart-out)" opacity={0.1} />
              <path d={path} fill="none" stroke="var(--chart-out)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={x(last.day)} cy={y(last.cumulative)} r={4} fill="var(--chart-out)" stroke="var(--color-surface)" strokeWidth={2} />
              {active !== null && <line x1={x(active)} x2={x(active)} y1={margin.top} y2={y(0)} stroke="var(--chart-axis)" strokeWidth={1} />}
              {active !== null && series[active] && <circle cx={x(active)} cy={y(series[active].cumulative)} r={4} fill="var(--chart-out)" stroke="var(--color-surface)" strokeWidth={2} />}
            </svg>
          )}
          {active !== null && series[active] && (
            <Tooltip x={x(active)} width={width}>
              <p className="mb-1 font-semibold text-ink">{dayLabel(active)}</p>
              <TooltipRow colour="var(--chart-out)" label="Spent so far" value={cad(series[active].cumulative)} />
              <TooltipRow colour="var(--chart-reference)" label="Spent that day" value={cad(series[active].spent)} />
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ categories

/** Fixed colour slot per spending category, in the API's category order (never by rank). */
export function categoryColours(categories: Category[]): (categoryId: string | null) => string {
  const slots = new Map(categories.filter((category) => category.name !== "Income").map((category, index) => [category.id, index < 7 ? `var(--chart-cat-${index + 1})` : "var(--chart-other)"]));
  return (categoryId) => (categoryId && slots.get(categoryId)) || "var(--chart-other)";
}

/** Part-to-whole bar in fixed category order with 2px surface gaps between segments. */
export function CategoryShareBar({ items, categories, colourFor }: { items: CategorySpending[]; categories: Category[]; colourFor: (id: string | null) => string }) {
  const order = new Map(categories.map((category, index) => [category.id, index]));
  const ordered = [...items].sort((a, b) => (order.get(a.category_id ?? "") ?? 99) - (order.get(b.category_id ?? "") ?? 99));
  return (
    <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={ordered.map((item) => `${item.category_name} ${(item.share_basis_points / 100).toFixed(1)}%`).join(", ")}>
      {ordered.map((item) => <div key={item.category_id ?? "none"} className="h-full min-w-[3px] first:rounded-l-full last:rounded-r-full" style={{ flexGrow: item.share_basis_points, background: colourFor(item.category_id) }} title={`${item.category_name}: ${cad(item.spent_cents)}`} />)}
    </div>
  );
}

/** Ranked category spending: one bar colour (magnitude), identity from the swatch beside the label. */
export function CategoryBars({ items, colourFor, limit }: { items: CategorySpending[]; colourFor: (id: string | null) => string; limit?: number }) {
  const shown = limit ? items.slice(0, limit) : items;
  const largest = shown[0]?.spent_cents ?? 0;
  return (
    <ul className="space-y-3">
      {shown.map((item) => (
        <li key={item.category_id ?? "none"}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2 text-ink"><span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: colourFor(item.category_id) }} aria-hidden="true" /><span className="truncate">{item.category_name}</span></span>
            <span className="tabular whitespace-nowrap font-semibold text-ink">{cad(item.spent_cents)} <span className="font-normal text-ink-subtle">· {(item.share_basis_points / 100).toFixed(1)}%</span></span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-sage-soft" aria-hidden="true">
            <div className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out" style={{ width: `${largest ? Math.max(2, (item.spent_cents / largest) * 100) : 0}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ sparkline

export function Sparkline({ values, label, colour = "var(--chart-reference)", accent = "var(--chart-net)", className }: { values: number[]; label: string; colour?: string; accent?: string; className?: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const height = 28;
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(0, ...values);
  const x = (index: number) => 3 + ((width - 6) * index) / (values.length - 1);
  const y = (value: number) => 3 + (height - 6) * (1 - (value - min) / (max - min || 1));
  return (
    <div ref={ref} className={cn("h-7 w-full", className)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label} className="block overflow-visible">
          <polyline points={values.map((value, index) => `${x(index)},${y(value)}`).join(" ")} fill="none" stroke={colour} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={3.5} fill={accent} stroke="var(--color-surface)" strokeWidth={2} />
        </svg>
      )}
    </div>
  );
}
