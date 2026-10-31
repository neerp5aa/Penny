"use client";

import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Dates are YYYY-MM-DD strings in local time; nothing here converts through UTC. */
const pad = (value: number) => String(value).padStart(2, "0");
const toIso = (year: number, month: number, day: number) => `${year}-${pad(month + 1)}-${pad(day)}`;
const parts = (iso: string) => iso.split("-").map(Number) as [number, number, number];
const todayIso = () => { const now = new Date(); return toIso(now.getFullYear(), now.getMonth(), now.getDate()); };
const shift = (iso: string, days: number) => { const [y, m, d] = parts(iso); const next = new Date(y, m - 1, d + days); return toIso(next.getFullYear(), next.getMonth(), next.getDate()); };
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function label(iso: string): string {
  const [y, m, d] = parts(iso);
  const formatted = new Intl.DateTimeFormat("en-CA", { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(new Date(y, m - 1, d));
  if (iso === todayIso()) return `Today · ${formatted}`;
  if (iso === shift(todayIso(), -1)) return `Yesterday · ${formatted}`;
  return formatted;
}

export const isoToday = todayIso;

/** Short, friendly label for a YYYY-MM-DD date ("Oct 22"). */
export function shortDateLabel(iso: string): string {
  const [y, m, d] = parts(iso);
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric" }).format(new Date(y, m - 1, d));
}

/**
 * A month grid for picking one day. Arrow keys move by day/week, PageUp/PageDown by month,
 * Enter picks. `range` shades the days between two dates; `marked` adds a dot under days.
 */
export function Calendar({ value, onPick, min, max, initialMonth, range, marked, label: gridLabel = "Choose a date", autoFocus = false }: { value: string; onPick: (value: string) => void; min?: string; max?: string; initialMonth?: string; range?: { from: string; to: string }; marked?: ReadonlySet<string>; label?: string; autoFocus?: boolean }) {
  const [focus, setFocus] = useState(value || initialMonth || todayIso());
  const [moved, setMoved] = useState(autoFocus);
  const grid = useRef<HTMLDivElement>(null);
  const [year, month] = parts(focus);
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const allowed = (iso: string) => (!min || iso >= min) && (!max || iso <= max);

  useEffect(() => {
    if (moved) grid.current?.querySelector<HTMLButtonElement>(`[data-day="${focus}"]`)?.focus();
  }, [moved, focus]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (event.key in moves) { event.preventDefault(); setMoved(true); setFocus(shift(focus, moves[event.key])); }
    else if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      const [y, m, d] = parts(focus);
      const target = new Date(y, m - 1 + (event.key === "PageUp" ? -1 : 1), 1);
      setMoved(true);
      setFocus(toIso(target.getFullYear(), target.getMonth(), Math.min(d, new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate())));
    }
  }

  const moveMonth = (delta: number) => { const target = new Date(year, month - 1 + delta, 1); setFocus(toIso(target.getFullYear(), target.getMonth(), 1)); };
  const firstAllowed = !min || toIso(year, month - 1, 1) > min;
  const lastAllowed = !max || toIso(year, month - 1, daysInMonth) < max;

  return (
    <div onKeyDown={onKeyDown}>
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => moveMonth(-1)} disabled={!firstAllowed} className="grid size-10 place-items-center rounded-lg text-ink-muted hover:bg-sage-soft disabled:opacity-30" aria-label="Previous month"><ChevronLeft className="size-4" aria-hidden="true" /></button>
        <p className="text-sm font-semibold text-ink" aria-live="polite">{new Intl.DateTimeFormat("en-CA", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1))}</p>
        <button type="button" onClick={() => moveMonth(1)} disabled={!lastAllowed} className="grid size-10 place-items-center rounded-lg text-ink-muted hover:bg-sage-soft disabled:opacity-30" aria-label="Next month"><ChevronRight className="size-4" aria-hidden="true" /></button>
      </div>
      <div className="mt-1 grid grid-cols-7 text-center text-[11px] font-semibold uppercase text-ink-subtle" aria-hidden="true">{WEEKDAYS.map((day) => <span key={day} className="py-1">{day}</span>)}</div>
      <div ref={grid} role="grid" aria-label={gridLabel} className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: firstWeekday }).map((_, index) => <span key={`pad-${index}`} />)}
        {Array.from({ length: daysInMonth }, (_, index) => {
          const iso = toIso(year, month - 1, index + 1);
          const selected = iso === value;
          const inRange = range && range.from && range.to && iso > range.from && iso < range.to;
          const isToday = iso === todayIso();
          return (
            <button
              key={iso}
              type="button"
              data-day={iso}
              tabIndex={iso === focus ? 0 : -1}
              disabled={!allowed(iso)}
              aria-pressed={selected}
              aria-label={`${label(iso)}${marked?.has(iso) ? ", has transactions" : ""}`}
              onClick={() => onPick(iso)}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onPick(iso); } }}
              className={cn("relative grid h-10 place-items-center rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-30", selected ? "bg-primary font-semibold text-on-primary" : inRange ? "bg-primary-soft text-ink" : isToday ? "font-semibold text-accent-strong ring-1 ring-accent/50 hover:bg-sage-soft" : "text-ink hover:bg-sage-soft")}
            >
              {index + 1}
              {marked?.has(iso) && <span className={cn("absolute bottom-1 size-1 rounded-full", selected ? "bg-on-primary" : "bg-accent")} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * A button that opens a calendar for picking one day. A hidden input carries the value.
 * `optional` allows an empty value, shown as "No date" with a button to clear it.
 */
export function DatePicker({ id, name, value, onChange, min, max, optional = false, "aria-describedby": describedBy }: { id?: string; name?: string; value: string; onChange: (value: string) => void; min?: string; max?: string; optional?: boolean; "aria-describedby"?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const dialogId = useId();
  const allowed = (iso: string) => (!min || iso >= min) && (!max || iso <= max);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function pick(iso: string) {
    if (iso && !allowed(iso)) return;
    onChange(iso);
    setOpen(false);
  }

  const quick = [{ text: "Today", iso: todayIso() }, { text: "Yesterday", iso: shift(todayIso(), -1) }].filter((item) => allowed(item.iso));
  if (optional) quick.push({ text: "No date", iso: "" });

  return (
    <div ref={root} className="relative">
      {name && <input type="hidden" name={name} value={value} />}
      <button
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        aria-describedby={describedBy}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-line-strong bg-surface px-3 text-left text-base text-ink shadow-sm transition-[border-color,box-shadow] focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15"
      >
        <CalendarDays className="size-4 shrink-0 text-ink-subtle" aria-hidden="true" />
        <span className={cn("truncate", !value && "text-ink-subtle")}>{value ? label(value) : optional ? "No date" : "Choose a date"}</span>
      </button>
      {open && (
        <div id={dialogId} role="dialog" aria-label="Choose a date" className="mt-2 w-full max-w-sm animate-enter rounded-2xl border border-line bg-surface p-3 shadow-[var(--shadow-card)]" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setOpen(false); } }}>
          <Calendar value={value} onPick={pick} min={min} max={max} initialMonth={min && min > todayIso() ? min : undefined} autoFocus />
          {quick.length > 0 && (
            <div className="mt-2 flex gap-2 border-t border-line pt-2">
              {quick.map((item) => <button key={item.text} type="button" onClick={() => pick(item.iso)} className="min-h-10 flex-1 rounded-lg bg-sage-soft text-sm font-semibold text-ink hover:bg-sage">{item.text}</button>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
