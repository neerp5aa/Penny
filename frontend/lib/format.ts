const utc = (value: string) => new Date(`${value}T00:00:00Z`);

export function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", timeZone: "UTC" }).format(utc(value));
}

export function formatLongDate(value: string): string {
  return new Intl.DateTimeFormat("en-CA", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(utc(value));
}

export function formatMonth(value: string): string {
  return new Intl.DateTimeFormat("en-CA", { month: "long", year: "numeric", timeZone: "UTC" }).format(utc(value));
}

/** Today's local date (YYYY-MM-DD) if it falls in the active month, otherwise the month's first day. */
export function defaultTransactionDate(activeMonth: string, now = new Date()): string {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return today.slice(0, 7) === activeMonth.slice(0, 7) ? today : activeMonth;
}

export function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** Shifts a YYYY-MM-01 month string by whole months. */
export function addMonths(month: string, count: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const index = year * 12 + (monthNumber - 1) + count;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}-01`;
}

export function shortMonth(month: string): string {
  return new Intl.DateTimeFormat("en-CA", { month: "short", year: "numeric", timeZone: "UTC" }).format(utc(month));
}

/** Last day to plot for a month: today if it's the current calendar month, otherwise the month's end. */
export function lastDayToShow(month: string, now = new Date()): number {
  const [year, monthNumber] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return now.getFullYear() === year && now.getMonth() + 1 === monthNumber ? Math.min(days, now.getDate()) : days;
}
