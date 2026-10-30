import type { Transaction } from "./api";
import { centsToInput } from "./money";

export type KindFilter = "all" | "income" | "spending";
/** "all", "uncategorized", or a category id. */
export type CategoryFilter = string;
export type TransactionFilters = { query: string; kind: KindFilter; category: CategoryFilter };

export const EMPTY_FILTERS: TransactionFilters = { query: "", kind: "all", category: "all" };

/** Client-side filtering over the already-loaded dashboard; it never changes amounts. */
export function filterTransactions(transactions: readonly Transaction[], filters: TransactionFilters): Transaction[] {
  const query = filters.query.trim().toLocaleLowerCase("en-CA");
  return transactions.filter((item) => {
    if (filters.kind !== "all" && item.kind !== filters.kind) return false;
    if (filters.category === "uncategorized" && item.category_id !== null) return false;
    if (filters.category !== "all" && filters.category !== "uncategorized" && item.category_id !== filters.category) return false;
    return !query || item.description.toLocaleLowerCase("en-CA").includes(query);
  });
}

export function hasActiveFilters(filters: TransactionFilters): boolean {
  return filters.query.trim() !== "" || filters.kind !== "all" || filters.category !== "all";
}

export type TransactionSort = "newest" | "oldest" | "largest" | "smallest";

export function sortTransactions(transactions: readonly Transaction[], sort: TransactionSort): Transaction[] {
  const items = [...transactions];
  const byDate = (a: Transaction, b: Transaction) => a.occurred_on.localeCompare(b.occurred_on) || a.id.localeCompare(b.id);
  if (sort === "newest") return items.sort((a, b) => byDate(b, a));
  if (sort === "oldest") return items.sort(byDate);
  if (sort === "largest") return items.sort((a, b) => b.amount_cents - a.amount_cents || byDate(b, a));
  return items.sort((a, b) => a.amount_cents - b.amount_cents || byDate(b, a));
}

function csvCell(value: string): string {
  // Quote every cell, double embedded quotes, and neutralise spreadsheet formulas.
  const isNumber = /^-?\d+(\.\d+)?$/.test(value);
  const safe = !isNumber && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** CSV of transactions with signed CAD amounts written from integer cents (no floating point). */
export function transactionsToCsv(transactions: readonly Transaction[], accountNames: ReadonlyMap<string, string>): string {
  const header = ["Date", "Description", "Category", "Account", "Type", "Amount (CAD)"];
  const rows = transactions.map((item) => [
    item.occurred_on,
    item.description,
    item.category,
    accountNames.get(item.account_id) ?? item.account_id,
    item.kind === "income" ? "Money in" : "Money out",
    `${item.kind === "income" ? "" : "-"}${centsToInput(String(item.amount_cents))}`,
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}
