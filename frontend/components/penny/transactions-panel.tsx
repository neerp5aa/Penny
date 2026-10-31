"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpDown, ArrowUpRight, CalendarDays, ChevronRight, Download, Pencil, Plus, ReceiptText, Repeat, Search, Trash2, X } from "lucide-react";
import { Calendar, shortDateLabel } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import type { Dashboard, Transaction } from "@/lib/api";
import { formatShortDate } from "@/lib/format";
import { EMPTY_FILTERS, filterTransactions, hasActiveFilters, type KindFilter, sortTransactions, type TransactionFilters, type TransactionSort, transactionsToCsv } from "@/lib/transactions";
import { cn } from "@/lib/utils";
import { categoryOptions } from "./dialogs";
import { cad, EmptyState } from "./shared";

type Props = {
  dashboard: Dashboard;
  onAdd: () => void;
  onEdit: (item: Transaction) => void;
  onDelete: (item: Transaction) => void;
};

const KIND_OPTIONS: { value: KindFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "income", label: "In" },
  { value: "spending", label: "Out" },
];
const SORT_OPTIONS: { value: TransactionSort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "largest", label: "Largest" },
  { value: "smallest", label: "Smallest" },
];
/** Filter controls share one compact size so the bar reads as a single row of tools. */
const CONTROL = "min-h-10 rounded-lg text-sm";

export function TransactionsPanel({ dashboard, onAdd, onEdit, onDelete }: Props) {
  const [filters, setFilters] = useState<TransactionFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<TransactionSort>("newest");
  const [expanded, setExpanded] = useState<string | null>(null);
  const headingId = useId();
  const searchId = useId();
  const accounts = useMemo(() => new Map(dashboard.accounts.map((account) => [account.id, account.name])), [dashboard.accounts]);
  const rows = useMemo(() => {
    const parents = new Map(dashboard.categories.map((category) => [category.id, category.parent_id]));
    return sortTransactions(filterTransactions(dashboard.transactions, filters, (id) => parents.get(id) ?? null), sort);
  }, [dashboard.transactions, dashboard.categories, filters, sort]);
  const total = dashboard.transactions.length;
  const filtering = hasActiveFilters(filters);
  const { period } = dashboard;

  function exportCsv() {
    const blob = new Blob([`\ufeff${transactionsToCsv(rows, accounts)}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `penny-transactions-${period.start}-to-${period.end}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <Card className="flex flex-col">
      <div className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
        <div className="min-w-0">
          <h2 id={headingId} className="text-lg font-semibold tracking-tight text-ink">Transactions</h2>
          <p className="text-sm text-ink-subtle" aria-live="polite">{filtering ? `${rows.length} of ${total} shown` : `${total} ${period.phrase}`}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {rows.length > 0 && <Button variant="outline" size="sm" onClick={exportCsv} aria-label={`Export ${filtering ? "filtered " : ""}transactions as CSV`}><Download className="size-4" aria-hidden="true" /><span className="hidden sm:inline">Export</span></Button>}
          <Button size="sm" onClick={onAdd}><Plus className="size-4" aria-hidden="true" />Add<span className="sr-only"> transaction</span></Button>
        </div>
      </div>

      {total > 0 && (
        <div role="search" aria-label="Filter transactions" className="relative border-b border-line px-4 pb-3 pt-3 sm:px-5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-full flex-1 sm:min-w-56">
              <label htmlFor={searchId} className="sr-only">Search transactions</label>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
              <Input id={searchId} type="search" placeholder="Search by merchant or description" value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} className={cn(CONTROL, "pl-9")} />
            </div>
            {/* On phones the controls share one row that scrolls sideways. */}
            <div className="scroll-area -mx-4 flex min-w-0 items-center gap-2 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&>*]:shrink-0">
            <div role="radiogroup" aria-label="Money in or out" className="inline-flex rounded-lg bg-sage-soft p-0.5">
              {KIND_OPTIONS.map((option) => (
                <button key={option.value} type="button" role="radio" aria-checked={filters.kind === option.value} onClick={() => setFilters({ ...filters, kind: option.value })} className={cn("min-h-9 rounded-md px-3 text-sm font-semibold transition-colors", filters.kind === option.value ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink")}>
                  {option.label}
                </button>
              ))}
            </div>
            <label className="sr-only" htmlFor={`${searchId}-category`}>Category</label>
            <Select id={`${searchId}-category`} value={filters.category} onChange={(event) => setFilters({ ...filters, category: event.target.value })} className={cn(CONTROL, "w-auto max-w-[12rem]", filters.category !== "all" && "border-accent")}>
              <option value="all">All categories</option>
              <optgroup label="Money out">{categoryOptions(dashboard.categories, "spending").map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</optgroup>
              <optgroup label="Money in">{categoryOptions(dashboard.categories, "income").map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</optgroup>
              <option value="uncategorized">Uncategorized</option>
            </Select>
            <DateFilter start={period.start} end={period.end} transactions={dashboard.transactions} from={filters.from} to={filters.to} onChange={(from, to) => setFilters({ ...filters, from, to })} />
            <label className="sr-only" htmlFor={`${searchId}-sort`}>Sort</label>
            <span className="relative">
              <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
              <Select id={`${searchId}-sort`} value={sort} onChange={(event) => setSort(event.target.value as TransactionSort)} className={cn(CONTROL, "w-auto pl-9")}>
                {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
            </span>
            {filtering && <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}><X className="size-4" aria-hidden="true" />Clear</Button>}
            </div>
          </div>
        </div>
      )}

      {total === 0 ? (
        <div className="p-5 pt-3">
          <EmptyState icon={ReceiptText} title={`No transactions ${period.phrase}`} description="Add one, or pick a different period at the top of the page." action={<Button size="sm" onClick={onAdd}><Plus className="size-4" aria-hidden="true" />Add transaction</Button>} />
        </div>
      ) : rows.length === 0 ? (
        <div className="p-5">
          <EmptyState icon={Search} title="No matching transactions" description="Try a different search, or clear the filters to see everything." action={<Button size="sm" variant="outline" onClick={() => setFilters(EMPTY_FILTERS)}><X className="size-4" aria-hidden="true" />Clear filters</Button>} />
        </div>
      ) : (
        <div tabIndex={0} role="region" aria-labelledby={headingId} className="scroll-area relative max-h-[min(34rem,65dvh)] overflow-y-auto rounded-b-[var(--radius-card)] focus-visible:outline-offset-[-3px]">
          <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
            <caption className="sr-only">Transactions {period.phrase}</caption>
            <thead className="sticky top-0 z-10 hidden bg-sage-soft md:table-header-group">
              <tr className="text-left text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                <th scope="col" className="border-b border-line py-2.5 pl-5 pr-3 font-semibold">Transaction</th>
                <th scope="col" className="hidden w-44 border-b border-line px-3 py-2.5 font-semibold lg:table-cell">Account</th>
                <th scope="col" className="w-32 border-b border-line px-3 py-2.5 text-right font-semibold">Amount</th>
                <th scope="col" className="w-28 border-b border-line py-2.5 pl-3 pr-5 text-right font-semibold"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => {
                const income = item.kind === "income";
                return (
                  <tr key={item.id} className="group transition-colors hover:bg-sage-soft/60">
                    <td className="border-b border-line/70 p-0 group-last:border-b-0 md:py-3 md:pl-5 md:pr-3">
                      <button type="button" onClick={() => setExpanded(expanded === item.id ? null : item.id)} className="flex w-full min-w-0 items-center gap-3 px-4 py-3 text-left md:hidden" aria-expanded={expanded === item.id} aria-label={`${item.description}, ${income ? "money in" : "money out"} ${cad(item.amount_cents)}, ${item.category}, ${formatShortDate(item.occurred_on)}. Show details`}>
                        <TransactionIdentity item={item} />
                        <span className={cn("tabular whitespace-nowrap shrink-0 font-semibold", income ? "text-accent-strong" : "text-ink")}>{income ? cad(item.amount_cents, true) : cad(-item.amount_cents)}</span>
                        <ChevronRight className="size-4 shrink-0 text-ink-subtle" aria-hidden="true" />
                      </button>
                      <button type="button" onClick={() => setExpanded(expanded === item.id ? null : item.id)} aria-expanded={expanded === item.id} className="hidden min-w-0 items-center gap-3 text-left md:flex"><TransactionIdentity item={item} /></button>
                      {expanded === item.id && <div className="mx-4 mb-3 rounded-xl bg-sage-soft p-3 text-xs text-ink-muted md:mx-0 md:mb-0 md:mt-2"><p>{income ? "Income" : "Expense"} · {accounts.get(item.account_id) ?? "Unknown account"}{item.bill_id ? ` · ${item.paid_automatically === true ? "paid automatically" : item.paid_automatically === false ? "you marked it paid" : "recurring payment"}` : ""}</p><div className="mt-2 flex gap-2 md:hidden"><Button size="sm" variant="outline" onClick={() => onEdit(item)}>Edit</Button><Button size="sm" variant="destructive-soft" onClick={() => onDelete(item)}>Delete</Button></div></div>}
                    </td>
                    <td className="hidden truncate border-b border-line/70 px-3 py-3 text-ink-muted group-last:border-b-0 lg:table-cell">{accounts.get(item.account_id) ?? "—"}</td>
                    <td className={cn("tabular hidden whitespace-nowrap border-b border-line/70 px-3 py-3 text-right font-semibold group-last:border-b-0 md:table-cell", income ? "text-accent-strong" : "text-ink")}>
                      {income ? cad(item.amount_cents, true) : cad(-item.amount_cents)}
                    </td>
                    <td className="hidden border-b border-line/70 py-2 pl-3 pr-4 text-right group-last:border-b-0 md:table-cell">
                      <div className="flex justify-end gap-1">
                        <button type="button" onClick={() => onEdit(item)} className="grid size-10 place-items-center rounded-lg text-ink-subtle transition-colors hover:bg-sage hover:text-ink" aria-label={`Edit ${item.description}`}><Pencil className="size-4" /></button>
                        <button type="button" onClick={() => onDelete(item)} className="grid size-10 place-items-center rounded-lg text-ink-subtle transition-colors hover:bg-danger-soft hover:text-danger" aria-label={`Delete ${item.description}`}><Trash2 className="size-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function TransactionIdentity({ item }: { item: Transaction }) {
  const income = item.kind === "income";
  return (
    <>
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", income ? "bg-accent-soft text-accent-strong" : "bg-danger-soft text-danger")} aria-hidden="true">
        {income ? <ArrowDownLeft className="size-[1.1rem]" /> : <ArrowUpRight className="size-[1.1rem]" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-ink">{item.description}</span>
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-ink-subtle">
          <span className="truncate">{item.category} · {formatShortDate(item.occurred_on)}</span>
          {item.bill_id && <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[#f2ecff] px-1.5 py-px text-[11px] font-semibold text-[#7047b7] dark:bg-[#302847] dark:text-[#c1a5ee]"><Repeat className="size-2.5" aria-hidden="true" />Recurring</span>}
          {item.necessity && <span className={cn("shrink-0 rounded-full px-1.5 py-px text-[11px] font-semibold", item.necessity === "need" ? "bg-info-soft text-info" : "bg-gold-soft text-gold-strong")}>{item.necessity === "need" ? "Need" : "Want"}</span>}
          {item.unusual && <span className="shrink-0 rounded-full bg-danger-soft px-1.5 py-px text-[11px] font-semibold text-danger" title="At least 3 times what you usually spend on one purchase in this category">Unusual</span>}
          {item.auto_categorized && <span className="shrink-0 rounded-full bg-accent-soft px-1.5 py-px text-[11px] font-semibold text-accent-strong" title="Category picked automatically from the merchant name">Auto</span>}
        </span>
      </span>
    </>
  );
}

/**
 * One date control: pick a single day to see that day's transactions, or switch to a range
 * and pick From and To on two calendars. Days with transactions are dotted.
 */
function DateFilter({ start, end, transactions, from, to, onChange }: { start: string; end: string; transactions: readonly Transaction[]; from: string; to: string; onChange: (from: string, to: string) => void }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"day" | "range">(from && to && from !== to ? "range" : "day");
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();
  // The calendars cover the period on screen and open on its latest month.
  const first = start;
  const last = end;
  const opening = `${end.slice(0, 8)}01` < start ? start : `${end.slice(0, 8)}01`;
  const marked = useMemo(() => new Set(transactions.map((item) => item.occurred_on)), [transactions]);
  const active = Boolean(from || to);
  const label = !active ? "Any date" : from && from === to ? shortDateLabel(from) : `${from ? shortDateLabel(from) : "Start"} – ${to ? shortDateLabel(to) : "End"}`;

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function pickFrom(day: string) { onChange(day, to && to < day ? "" : to); }
  function pickTo(day: string) { onChange(from && from > day ? day : from, day); }

  return (
    <div ref={root} onKeyDown={(event) => { if (event.key === "Escape" && open) { event.preventDefault(); setOpen(false); } }}>
      <div className={cn("flex min-h-10 items-center rounded-lg border bg-surface shadow-sm", active ? "border-accent" : "border-line-strong")}>
        <button type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => setOpen((value) => !value)} className="flex min-h-10 min-w-0 flex-1 items-center gap-2 whitespace-nowrap px-3 text-left text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <CalendarDays className="size-4 shrink-0 text-ink-subtle" aria-hidden="true" />
          <span className="sr-only">Date: </span><span className="truncate">{label}</span>
        </button>
        {active && <button type="button" onClick={() => onChange("", "")} className="grid size-10 shrink-0 place-items-center rounded-r-lg text-ink-subtle hover:text-ink" aria-label="Clear date filter"><X className="size-4" aria-hidden="true" /></button>}
      </div>
      {open && (
        <div id={panelId} role="dialog" aria-label="Filter by date" className="absolute inset-x-4 top-full z-30 mt-1 animate-enter sm:left-auto sm:right-5 sm:w-[min(40rem,calc(100vw-2.5rem))] rounded-2xl border border-line bg-surface p-3 shadow-[var(--shadow-raised)] sm:p-4">
          <div role="radiogroup" aria-label="Date filter type" className="grid grid-cols-2 gap-1 rounded-xl bg-sage-soft p-1">
            {([["day", "One day"], ["range", "Date range"]] as const).map(([value, text]) => (
              <button key={value} type="button" role="radio" aria-checked={mode === value} onClick={() => { setMode(value); if (value === "day" && from !== to) onChange("", ""); }} className={cn("min-h-10 rounded-lg text-sm font-semibold", mode === value ? "bg-surface text-ink shadow-sm" : "text-ink-subtle")}>{text}</button>
            ))}
          </div>
          {mode === "day" ? (
            <div className="mx-auto mt-3 max-w-sm">
              <p className="mb-2 text-xs text-ink-subtle">Pick a day to see its transactions. Dotted days have activity.</p>
              <Calendar value={from === to ? from : ""} onPick={(day) => { onChange(day, day); setOpen(false); }} min={first} max={last} initialMonth={opening} marked={marked} label="Pick a day" />
            </div>
          ) : (
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-semibold text-ink">From <span className="font-normal text-ink-subtle">{from ? shortDateLabel(from) : "start of month"}</span></p>
                <Calendar value={from} onPick={pickFrom} min={first} max={last} initialMonth={opening} range={{ from, to }} marked={marked} label="From date" />
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold text-ink">To <span className="font-normal text-ink-subtle">{to ? shortDateLabel(to) : "end of month"}</span></p>
                <Calendar value={to} onPick={pickTo} min={from || first} max={last} initialMonth={opening} range={{ from, to }} marked={marked} label="To date" />
              </div>
            </div>
          )}
          <div className="mt-3 flex justify-between gap-2 border-t border-line pt-3">
            <Button size="sm" variant="ghost" onClick={() => onChange("", "")} disabled={!active}>Clear</Button>
            <Button size="sm" onClick={() => setOpen(false)}>Done</Button>
          </div>
        </div>
      )}
    </div>
  );
}

