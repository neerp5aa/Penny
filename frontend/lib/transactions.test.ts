import { describe, expect, it } from "vitest";

import type { Transaction } from "./api";
import { addMonths, defaultTransactionDate, greeting, lastDayToShow } from "./format";
import { EMPTY_FILTERS, filterTransactions, hasActiveFilters, sortTransactions, transactionsToCsv } from "./transactions";

const base = { account_id: "acct-chequing", occurred_on: "2026-10-01" };
const transactions: Transaction[] = [
  { ...base, id: "a", description: "Harbour Books pay", category: "Income", category_id: "cat-income", amount_cents: 126_400, kind: "income" },
  { ...base, id: "b", description: "Atlantic Market", category: "Food", category_id: "cat-food", amount_cents: 18_942, kind: "spending" },
  { ...base, id: "c", description: "Campus café", category: "Food", category_id: "cat-food", amount_cents: 6_875, kind: "spending" },
  { ...base, id: "d", description: "Mystery charge", category: "Uncategorized", category_id: null, amount_cents: 100, kind: "spending" },
];
const ids = (items: Transaction[]) => items.map((item) => item.id);

describe("transaction filters", () => {
  it("returns everything with empty filters", () => {
    expect(ids(filterTransactions(transactions, EMPTY_FILTERS))).toEqual(["a", "b", "c", "d"]);
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
  });

  it("searches descriptions case-insensitively, including accents", () => {
    expect(ids(filterTransactions(transactions, { ...EMPTY_FILTERS, query: "  CAFÉ " }))).toEqual(["c"]);
  });

  it("filters by kind and category together", () => {
    expect(ids(filterTransactions(transactions, { query: "", kind: "spending", category: "cat-food" }))).toEqual(["b", "c"]);
    expect(ids(filterTransactions(transactions, { query: "", kind: "income", category: "cat-food" }))).toEqual([]);
  });

  it("supports the uncategorized bucket", () => {
    expect(ids(filterTransactions(transactions, { ...EMPTY_FILTERS, category: "uncategorized" }))).toEqual(["d"]);
  });

  it("never changes amounts", () => {
    const filtered = filterTransactions(transactions, { ...EMPTY_FILTERS, query: "market" });
    expect(filtered[0]).toBe(transactions[1]);
  });
});

describe("date helpers", () => {
  it("defaults new transactions into the active month", () => {
    expect(defaultTransactionDate("2026-10-01", new Date(2026, 9, 29))).toBe("2026-10-29");
    expect(defaultTransactionDate("2026-10-01", new Date(2026, 10, 3))).toBe("2026-10-01");
  });

  it("greets by local time of day", () => {
    expect(greeting(new Date(2026, 9, 29, 9))).toBe("Good morning");
    expect(greeting(new Date(2026, 9, 29, 14))).toBe("Good afternoon");
    expect(greeting(new Date(2026, 9, 29, 20))).toBe("Good evening");
  });
});

describe("month helpers", () => {
  it("shifts months across year boundaries", () => {
    expect(addMonths("2026-10-01", -1)).toBe("2026-09-01");
    expect(addMonths("2026-01-01", -1)).toBe("2025-12-01");
    expect(addMonths("2025-12-01", 1)).toBe("2026-01-01");
    expect(addMonths("2026-10-01", -13)).toBe("2025-09-01");
  });

  it("plots through today in the current month and the full month otherwise", () => {
    expect(lastDayToShow("2026-10-01", new Date(2026, 9, 29))).toBe(29);
    expect(lastDayToShow("2026-09-01", new Date(2026, 9, 29))).toBe(30);
    expect(lastDayToShow("2024-02-01", new Date(2026, 9, 29))).toBe(29);
  });
});

describe("sorting and export", () => {
  const dated: Transaction[] = transactions.map((item, index) => ({ ...item, occurred_on: `2026-10-0${index + 1}` }));

  it("sorts by date and by amount", () => {
    expect(ids(sortTransactions(dated, "newest"))).toEqual(["d", "c", "b", "a"]);
    expect(ids(sortTransactions(dated, "oldest"))).toEqual(["a", "b", "c", "d"]);
    expect(ids(sortTransactions(dated, "largest"))).toEqual(["a", "b", "c", "d"]);
    expect(ids(sortTransactions(dated, "smallest"))).toEqual(["d", "c", "b", "a"]);
  });

  it("exports exact signed amounts and escapes cells", () => {
    const csv = transactionsToCsv(
      [{ ...dated[1], description: 'Market "weekly"' }, { ...dated[0] }, { ...dated[3], description: "=HYPERLINK(1)" }],
      new Map([["acct-chequing", "Everyday Chequing"]]),
    ).split("\r\n");
    expect(csv[0]).toBe('"Date","Description","Category","Account","Type","Amount (CAD)"');
    expect(csv[1]).toBe('"2026-10-02","Market ""weekly""","Food","Everyday Chequing","Money out","-189.42"');
    expect(csv[2]).toBe('"2026-10-01","Harbour Books pay","Income","Everyday Chequing","Money in","1264.00"');
    expect(csv[3]).toContain('"\'=HYPERLINK(1)"');
  });
});
