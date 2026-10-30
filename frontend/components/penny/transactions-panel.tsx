"use client";

import { useId, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, ChevronRight, Download, Pencil, Plus, ReceiptText, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import type { Dashboard, Transaction } from "@/lib/api";
import { formatShortDate } from "@/lib/format";
import { EMPTY_FILTERS, filterTransactions, hasActiveFilters, type KindFilter, sortTransactions, type TransactionFilters, type TransactionSort, transactionsToCsv } from "@/lib/transactions";
import { cn } from "@/lib/utils";
import { cad, EmptyState } from "./shared";

type Props = {
  dashboard: Dashboard;
  title: string;
  description?: string;
  /** Recent mode shows the newest rows without filters and links to the full list. */
  limit?: number;
  onViewAll?: () => void;
  onAdd: () => void;
  onEdit: (item: Transaction) => void;
  onDelete: (item: Transaction) => void;
};

const KIND_OPTIONS: { value: KindFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "income", label: "Money in" },
  { value: "spending", label: "Money out" },
];

export function TransactionsPanel({ dashboard, title, description, limit, onViewAll, onAdd, onEdit, onDelete }: Props) {
  const [filters, setFilters] = useState<TransactionFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<TransactionSort>("newest");
  const [expanded, setExpanded] = useState<string | null>(null);
  const sortId = useId();
  const headingId = useId();
  const searchId = useId();
  const categoryId = useId();
  const recentMode = limit !== undefined;
  const accounts = useMemo(() => new Map(dashboard.accounts.map((account) => [account.id, account.name])), [dashboard.accounts]);
  const filtered = useMemo(() => sortTransactions(filterTransactions(dashboard.transactions, filters), sort), [dashboard.transactions, filters, sort]);
  const rows = recentMode ? dashboard.transactions.slice(0, limit) : filtered;
  const total = dashboard.transactions.length;
  const filtering = hasActiveFilters(filters);

  function exportCsv() {
    const blob = new Blob([`\ufeff${transactionsToCsv(filtered, accounts)}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `penny-transactions-${dashboard.active_month.slice(0, 7)}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <Card className="flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5 pb-4 sm:p-6 sm:pb-4">
        <div className="min-w-0">
          <h2 id={headingId} className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
          <p className="mt-1 text-sm text-ink-subtle">
            {description ?? (recentMode ? "Your latest money in and out." : filtering ? `Showing ${filtered.length} of ${total}` : `${total} transaction${total === 1 ? "" : "s"}`)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onViewAll && total > 0 && <Button variant="ghost" size="sm" onClick={onViewAll}>View all<ChevronRight className="size-4" aria-hidden="true" /></Button>}
          {!recentMode && filtered.length > 0 && <Button variant="outline" size="sm" onClick={exportCsv}><Download className="size-4" aria-hidden="true" />Export<span className="sr-only"> {filtering ? "filtered " : ""}transactions as CSV</span></Button>}
          <Button size="sm" onClick={onAdd}><Plus className="size-4" aria-hidden="true" />Add<span className="sr-only"> transaction</span></Button>
        </div>
      </div>

      {!recentMode && total > 0 && (
        <div className="grid gap-2 border-b border-line px-5 pb-4 sm:grid-cols-2 sm:px-6 xl:grid-cols-6" role="search" aria-label="Filter transactions">
          <div className="relative sm:col-span-2 xl:col-span-1">
            <label htmlFor={searchId} className="sr-only">Search by description</label>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
            <Input id={searchId} type="search" placeholder="Search transactions" value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} className="pl-9" />
          </div>
          <div role="radiogroup" aria-label="Transaction type" className="grid grid-cols-3 gap-1 rounded-xl bg-sage-soft p-1 xl:col-span-2">
            {KIND_OPTIONS.map((option) => (
              <button key={option.value} type="button" role="radio" aria-checked={filters.kind === option.value} onClick={() => setFilters({ ...filters, kind: option.value })} className={cn("min-h-9 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition-colors", filters.kind === option.value ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink")}>
                {option.label}
              </button>
            ))}
          </div>
          <div>
            <label htmlFor={categoryId} className="sr-only">Category</label>
            <Select id={categoryId} value={filters.category} onChange={(event) => setFilters({ ...filters, category: event.target.value })}>
              <option value="all">All categories</option>
              {dashboard.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              <option value="uncategorized">Uncategorized</option>
            </Select>
          </div>
          <div className="sm:col-span-2 xl:col-span-1">
            <label htmlFor={sortId} className="sr-only">Sort by</label>
            <Select id={sortId} value={sort} onChange={(event) => setSort(event.target.value as TransactionSort)}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="largest">Largest amount</option>
              <option value="smallest">Smallest amount</option>
            </Select>
          </div>
          <div><label className="sr-only" htmlFor={`${searchId}-from`}>From date</label><Input id={`${searchId}-from`} type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></div>
          <div><label className="sr-only" htmlFor={`${searchId}-to`}>To date</label><Input id={`${searchId}-to`} type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></div>
        </div>
      )}

      {total === 0 ? (
        <div className="p-5 pt-0 sm:p-6 sm:pt-0">
          <EmptyState icon={ReceiptText} title="No transactions yet" description="Add your first transaction to start seeing where your money goes." action={<Button size="sm" onClick={onAdd}><Plus className="size-4" aria-hidden="true" />Add transaction</Button>} />
        </div>
      ) : rows.length === 0 ? (
        <div className="p-5 sm:p-6">
          <EmptyState icon={Search} title="No matching transactions" description="Try a different search, or clear the filters to see everything." action={<Button size="sm" variant="outline" onClick={() => setFilters(EMPTY_FILTERS)}><X className="size-4" aria-hidden="true" />Clear filters</Button>} />
        </div>
      ) : (
        <div
          tabIndex={recentMode ? undefined : 0}
          role={recentMode ? undefined : "region"}
          aria-labelledby={recentMode ? undefined : headingId}
          className={cn("scroll-area relative rounded-b-[var(--radius-card)]", !recentMode && "max-h-[min(34rem,65dvh)] overflow-y-auto focus-visible:outline-offset-[-3px]")}
        >
          <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
            <caption className="sr-only">{title}</caption>
            <thead className="sticky top-0 z-10 hidden bg-sage-soft md:table-header-group">
              <tr className="text-left text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                <th scope="col" className="border-b border-line py-2.5 pl-6 pr-3 font-semibold">Transaction</th>
                <th scope="col" className="hidden w-44 border-b border-line px-3 py-2.5 font-semibold lg:table-cell">Account</th>
                <th scope="col" className="w-32 border-b border-line px-3 py-2.5 text-right font-semibold">Amount</th>
                <th scope="col" className="w-28 border-b border-line py-2.5 pl-3 pr-6 text-right font-semibold"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => {
                const income = item.kind === "income";
                return (
                  <tr key={item.id} className="group transition-colors hover:bg-sage-soft/60">
                    <td className="border-b border-line/70 p-0 group-last:border-b-0 md:py-3 md:pl-6 md:pr-3 compact:md:py-1.5">
                      <button type="button" onClick={() => setExpanded(expanded === item.id ? null : item.id)} className="flex w-full min-w-0 items-center gap-3 px-5 py-3 text-left compact:py-2 md:hidden" aria-expanded={expanded === item.id} aria-label={`${item.description}, ${income ? "money in" : "money out"} ${cad(item.amount_cents)}, ${item.category}, ${formatShortDate(item.occurred_on)}. Show details`}>
                        <TransactionIdentity item={item} />
                        <span className={cn("tabular whitespace-nowrap shrink-0 font-semibold", income ? "text-accent-strong" : "text-ink")}>{income ? cad(item.amount_cents, true) : cad(-item.amount_cents)}</span>
                        <ChevronRight className="size-4 shrink-0 text-ink-subtle" aria-hidden="true" />
                      </button>
                      <button type="button" onClick={() => setExpanded(expanded === item.id ? null : item.id)} aria-expanded={expanded === item.id} className="hidden min-w-0 items-center gap-3 text-left md:flex"><TransactionIdentity item={item} /></button>
                      {expanded === item.id && <div className="mx-5 mb-3 rounded-xl bg-sage-soft p-3 text-xs text-ink-muted md:mx-0 md:mb-0 md:mt-2"><p>{income ? "Income" : "Expense"} · {accounts.get(item.account_id) ?? "Unknown account"}</p><div className="mt-2 flex gap-2 md:hidden"><Button size="sm" variant="outline" onClick={() => onEdit(item)}>Edit</Button><Button size="sm" variant="destructive-soft" onClick={() => onDelete(item)}>Delete</Button></div></div>}
                    </td>
                    <td className="hidden truncate border-b border-line/70 px-3 py-3 text-ink-muted group-last:border-b-0 lg:table-cell">{accounts.get(item.account_id) ?? "—"}</td>
                    <td className={cn("tabular whitespace-nowrap hidden whitespace-nowrap border-b border-line/70 px-3 py-3 text-right font-semibold group-last:border-b-0 md:table-cell", income ? "text-accent-strong" : "text-ink")}>
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
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", income ? "bg-accent-soft text-accent-strong" : "bg-sage text-ink-muted")} aria-hidden="true">
        {income ? <ArrowDownLeft className="size-[1.1rem]" /> : <ArrowUpRight className="size-[1.1rem]" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-ink">{item.description}</span>
        <span className="block truncate text-xs text-ink-subtle">{item.category} · {formatShortDate(item.occurred_on)}</span>
      </span>
    </>
  );
}
