"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar, shortDateLabel } from "@/components/ui/date-picker";
import type { Dashboard } from "@/lib/api";
import { addMonths } from "@/lib/format";
import { cn } from "@/lib/utils";

export type PeriodRange = { start: string; end: string };

/** Last day of the month containing a YYYY-MM-DD date. */
export function monthEnd(day: string): string {
  const [year, month] = day.split("-").map(Number);
  return `${day.slice(0, 8)}${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
}

const monthRange = (month: string): PeriodRange => ({ start: month, end: monthEnd(month) });
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function presets(dashboard: Dashboard): { id: string; label: string; range: PeriodRange }[] {
  const current = dashboard.current_month;
  const end = monthEnd(current);
  const year = Number(current.slice(0, 4));
  const earliest = dashboard.data_months[0] ?? current;
  const lastN = (count: number) => ({ start: addMonths(current, -(count - 1)), end });
  const allTimeStart = [earliest, addMonths(current, -35)].sort().at(-1) ?? earliest;
  return [
    { id: "this-month", label: "This month", range: monthRange(current) },
    { id: "last-month", label: "Last month", range: monthRange(addMonths(current, -1)) },
    { id: "last-3", label: "Last 3 months", range: lastN(3) },
    { id: "last-6", label: "Last 6 months", range: lastN(6) },
    { id: "last-12", label: "Last 12 months", range: lastN(12) },
    { id: "this-year", label: "This year", range: { start: `${year}-01-01`, end } },
    { id: "last-year", label: "Last year", range: { start: `${year - 1}-01-01`, end: `${year - 1}-12-31` } },
    { id: "all", label: "All time", range: { start: allTimeStart, end } },
  ];
}

/**
 * Chooses the period the dashboard covers: quick presets, a month from any year, or a custom
 * From/To range on two calendars. The arrows step a month or a year at a time.
 */
export function PeriodPicker({ dashboard, loading, onChange }: { dashboard: Dashboard; loading: boolean; onChange: (range: PeriodRange) => void }) {
  const [open, setOpen] = useState(false);
  const { period } = dashboard;
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const current = dashboard.current_month;
  const latest = monthEnd(current);
  const earliest = dashboard.data_months[0] ?? current;
  const isThisMonth = period.single_month && period.start === current;
  const fullYear = period.start.endsWith("-01-01") && (period.end.endsWith("-12-31") || period.end === latest) && period.start.slice(0, 4) === period.end.slice(0, 4);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function step(direction: -1 | 1) {
    if (period.single_month) {
      onChange(monthRange(addMonths(period.start, direction)));
    } else if (fullYear) {
      const year = Number(period.start.slice(0, 4)) + direction;
      onChange({ start: `${year}-01-01`, end: [`${year}-12-31`, latest].sort()[0] });
    }
  }
  const canStep = period.single_month || fullYear;
  const canGoBack = canStep && period.start > earliest;
  const canGoForward = canStep && period.end < latest;

  function choose(range: PeriodRange) {
    onChange(range);
    setOpen(false);
  }

  return (
    <div ref={root} className="relative flex items-center gap-1.5" aria-busy={loading} onKeyDown={(event) => { if (event.key === "Escape" && open) { event.preventDefault(); setOpen(false); } }}>
      <div className="flex items-center rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
        {canStep && <button type="button" onClick={() => step(-1)} disabled={!canGoBack} aria-label={period.single_month ? "Previous month" : "Previous year"} className="grid size-10 place-items-center rounded-l-xl text-ink-muted transition-colors hover:bg-sage-soft hover:text-ink disabled:opacity-30"><ChevronLeft className="size-4" aria-hidden="true" /></button>}
        <button type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => setOpen((value) => !value)} className={cn("flex h-10 items-center gap-2 px-3 text-sm font-semibold text-ink hover:bg-sage-soft", canStep ? "border-x border-line" : "rounded-xl")}>
          <CalendarDays className="size-4 text-ink-subtle" aria-hidden="true" />
          <span className="sr-only">Period: </span>{period.label}
          <ChevronDown className={cn("size-4 text-ink-subtle transition-transform", open && "rotate-180")} aria-hidden="true" />
        </button>
        {canStep && <button type="button" onClick={() => step(1)} disabled={!canGoForward} aria-label={period.single_month ? "Next month" : "Next year"} className="grid size-10 place-items-center rounded-r-xl text-ink-muted transition-colors hover:bg-sage-soft hover:text-ink disabled:opacity-30"><ChevronRight className="size-4" aria-hidden="true" /></button>}
      </div>
      {!isThisMonth && (
        <button type="button" onClick={() => onChange(monthRange(current))} className="inline-flex h-10 animate-fade items-center gap-1 rounded-xl px-2.5 text-xs font-semibold text-accent-strong hover:bg-accent-soft">
          <Undo2 className="size-3.5" aria-hidden="true" />This month
        </button>
      )}
      {open && <PeriodPanel id={panelId} dashboard={dashboard} earliest={earliest} latest={latest} onChoose={choose} onClose={() => setOpen(false)} />}
    </div>
  );
}

function PeriodPanel({ id, dashboard, earliest, latest, onChoose, onClose }: { id: string; dashboard: Dashboard; earliest: string; latest: string; onChoose: (range: PeriodRange) => void; onClose: () => void }) {
  const { period } = dashboard;
  const [tab, setTab] = useState<"months" | "custom">(period.single_month || !presets(dashboard).some((item) => item.range.start === period.start && item.range.end === period.end) ? (period.single_month ? "months" : "custom") : "months");
  const [year, setYear] = useState(Number(period.end.slice(0, 4)));
  const [from, setFrom] = useState(period.single_month ? "" : period.start);
  const [to, setTo] = useState(period.single_month ? "" : period.end);
  const firstYear = Number(earliest.slice(0, 4));
  const lastYear = Number(latest.slice(0, 4));

  return (
    <div id={id} role="dialog" aria-label="Choose a period" className="absolute left-0 top-full z-40 mt-2 w-[min(46rem,calc(100vw-2rem))] animate-enter rounded-2xl border border-line bg-surface p-3 shadow-[var(--shadow-raised)] sm:p-4">
      <div className="grid gap-4 sm:grid-cols-[11rem_1fr]">
        <ul className="grid grid-cols-2 gap-1 sm:grid-cols-1" aria-label="Quick periods">
          {presets(dashboard).map((preset) => {
            const selected = preset.range.start === period.start && preset.range.end === period.end;
            return (
              <li key={preset.id}>
                <button type="button" aria-pressed={selected} onClick={() => onChoose(preset.range)} className={cn("flex min-h-10 w-full items-center justify-between rounded-lg px-3 text-left text-sm font-medium transition-colors", selected ? "bg-primary text-on-primary" : "text-ink hover:bg-sage-soft")}>
                  {preset.label}{selected && <Check className="size-4" aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="min-w-0 sm:border-l sm:border-line sm:pl-4">
          <div role="tablist" aria-label="Pick by" className="grid grid-cols-2 gap-1 rounded-xl bg-sage-soft p-1">
            {([["months", "Pick a month"], ["custom", "Custom range"]] as const).map(([value, text]) => (
              <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={cn("min-h-10 rounded-lg text-sm font-semibold", tab === value ? "bg-surface text-ink shadow-sm" : "text-ink-subtle")}>{text}</button>
            ))}
          </div>
          {tab === "months" ? (
            <div className="mt-3" role="tabpanel">
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => setYear(year - 1)} disabled={year <= firstYear} className="grid size-10 place-items-center rounded-lg text-ink-muted hover:bg-sage-soft disabled:opacity-30" aria-label="Previous year"><ChevronLeft className="size-4" aria-hidden="true" /></button>
                <p className="text-sm font-semibold text-ink" aria-live="polite">{year}</p>
                <button type="button" onClick={() => setYear(year + 1)} disabled={year >= lastYear} className="grid size-10 place-items-center rounded-lg text-ink-muted hover:bg-sage-soft disabled:opacity-30" aria-label="Next year"><ChevronRight className="size-4" aria-hidden="true" /></button>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                {MONTH_NAMES.map((name, index) => {
                  const month = `${year}-${String(index + 1).padStart(2, "0")}-01`;
                  const selected = period.single_month && period.start === month;
                  const hasData = dashboard.data_months.includes(month);
                  const disabled = month > dashboard.current_month || monthEnd(month) < earliest;
                  return (
                    <button key={month} type="button" disabled={disabled} aria-pressed={selected} onClick={() => onChoose(monthRange(month))} className={cn("relative grid h-12 place-items-center rounded-lg text-sm font-medium transition-colors disabled:opacity-30", selected ? "bg-primary font-semibold text-on-primary" : month === dashboard.current_month ? "font-semibold text-accent-strong ring-1 ring-accent/50 hover:bg-sage-soft" : "text-ink hover:bg-sage-soft")}>
                      {name}
                      {hasData && !disabled && <span className={cn("absolute bottom-1.5 size-1 rounded-full", selected ? "bg-on-primary" : "bg-accent")} aria-hidden="true" />}
                      <span className="sr-only">{` ${year}${hasData ? ", has activity" : ""}`}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="mt-3" role="tabpanel">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="mb-2 text-sm font-semibold text-ink">From <span className="font-normal text-ink-subtle">{from ? shortDateLabel(from) : "pick a start"}</span></p>
                  <Calendar value={from} onPick={(day) => { setFrom(day); if (to && to < day) setTo(""); }} min={earliest} max={latest} initialMonth={from || period.start} range={{ from, to }} label="From date" />
                </div>
                <div>
                  <p className="mb-2 text-sm font-semibold text-ink">To <span className="font-normal text-ink-subtle">{to ? shortDateLabel(to) : "pick an end"}</span></p>
                  <Calendar value={to} onPick={setTo} min={from || earliest} max={latest} initialMonth={to || period.end} range={{ from, to }} label="To date" />
                </div>
              </div>
              <div className="mt-3 flex justify-end gap-2 border-t border-line pt-3">
                <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
                <Button size="sm" disabled={!from || !to} onClick={() => onChoose({ start: from, end: to })}>Show this period</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
