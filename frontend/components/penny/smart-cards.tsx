"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, MessageCircle, RefreshCw, Sparkles, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { type AssistSource, type AssistText, assistApi, type BudgetSuggestion, type BudgetSuggestions, type Dashboard } from "@/lib/api";
import { formatMonth } from "@/lib/format";
import { cn } from "@/lib/utils";
import { cad, describeError } from "./shared";

/** Says who wrote a piece of text: the model, or Penny's built-in wording when it's unavailable. */
export function SourceBadge({ source }: { source: AssistSource }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", source === "ai" ? "bg-accent-soft text-accent-strong" : "bg-sage-soft text-ink-subtle")}>
      {source === "ai" ? <><Sparkles className="size-3" aria-hidden="true" />Penny AI</> : "Built-in"}
    </span>
  );
}

type Load<T> = { data: T | null; error: string; loading: boolean };

/** Fetches once per key; `retry` bumps the key to fetch again. */
function useAssist<T>(key: string, fetcher: () => Promise<T>): Load<T> & { retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Load<T> & { for: string }>({ data: null, error: "", loading: true, for: "" });
  const id = `${key}#${attempt}`;
  useEffect(() => {
    let live = true;
    fetcher()
      .then((data) => { if (live) setState({ data, error: "", loading: false, for: id }); })
      .catch((reason: unknown) => { if (live) setState({ data: null, error: describeError(reason, "Couldn’t load this").detail, loading: false, for: id }); });
    return () => { live = false; };
    // The key captures everything the fetcher depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const current = state.for === id;
  return { data: current ? state.data : null, error: current ? state.error : "", loading: !current, retry: () => setAttempt((value) => value + 1) };
}

/** Three short, grounded observations about the period on screen. */
export function SpendingTake({ dashboard, version, onAsk }: { dashboard: Dashboard; version: number; onAsk: (question: string) => void }) {
  const { start, end, phrase } = dashboard.period;
  const take = useAssist<AssistText>(`${start}:${end}:${version}`, () => assistApi.spendingTake(start, end));
  return (
    <Card className="p-5 sm:p-6" aria-labelledby="penny-take-title" aria-busy={take.loading}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="penny-take-title" className="flex items-center gap-2 text-lg font-semibold tracking-tight text-ink"><WandSparkles className="size-5 text-accent-strong" aria-hidden="true" />Penny’s take</h2>
        {take.data && <SourceBadge source={take.data.source} />}
      </div>
      {take.loading ? (
        <div className="mt-4 space-y-2" aria-label="Loading Penny’s take">{[90, 75, 82].map((width) => <div key={width} className="h-4 animate-pulse rounded bg-sage-soft" style={{ width: `${width}%` }} />)}</div>
      ) : take.error ? (
        <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
          <span>Penny’s take didn’t load. {take.error}</span>
          <Button size="sm" variant="ghost" onClick={take.retry}><RefreshCw className="size-4" aria-hidden="true" />Try again</Button>
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {take.data?.items.map((item) => (
            <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-ink-muted"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />{item}</li>
          ))}
        </ul>
      )}
      <Button size="sm" variant="ghost" className="mt-3 -ml-2" onClick={() => onAsk(`How did my spending look ${phrase}, and what should I change?`)}>
        <MessageCircle className="size-4" aria-hidden="true" />Talk it through with Penny AI
      </Button>
    </Card>
  );
}

/**
 * Budget limits suggested from the last three months. Nothing changes until the user ticks the
 * ones they want and presses Apply, which runs the normal budget create/update calls.
 */
export function BudgetSuggestionsDialog({ open, onClose, onApply }: { open: boolean; onClose: () => void; onApply: (month: string, picked: BudgetSuggestion[]) => Promise<string | null> }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Suggested budgets</DialogTitle>
          <DialogDescription>Based on what you actually spent over the last three months. Tick the ones you want.</DialogDescription>
        </DialogHeader>
        {open && <SuggestionsBody onApply={onApply} />}
      </DialogContent>
    </Dialog>
  );
}

function SuggestionsBody({ onApply }: { onApply: (month: string, picked: BudgetSuggestion[]) => Promise<string | null> }) {
  const result = useAssist<BudgetSuggestions>("suggestions", () => assistApi.budgetSuggestions());
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (result.loading) return <div className="grid place-items-center py-10 text-ink-subtle"><LoaderCircle className="size-6 animate-spin" aria-label="Loading suggestions" /></div>;
  if (result.error || !result.data) {
    return (
      <div role="alert" className="space-y-3 rounded-xl bg-danger-soft p-3 text-sm text-danger">
        <p>Suggestions didn’t load. {result.error}</p>
        <Button size="sm" variant="outline" onClick={result.retry}><RefreshCw className="size-4" aria-hidden="true" />Try again</Button>
      </div>
    );
  }
  const { month, suggestions, summary } = result.data;
  const picked = suggestions.filter((item) => !skipped.has(item.category_id));

  function toggle(id: string) {
    setSkipped((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  async function apply() {
    setBusy(true);
    setError("");
    const failure = await onApply(month, picked);
    setBusy(false);
    if (failure) setError(failure);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-accent-soft/60 p-3 text-sm text-ink">
        <div className="mb-1"><SourceBadge source={summary.source} /></div>
        {summary.items[0]}
      </div>
      {suggestions.length === 0 ? null : (
        <ul className="divide-y divide-line rounded-xl border border-line" aria-label={`Suggestions for ${formatMonth(month)}`}>
          {suggestions.map((item) => {
            const on = !skipped.has(item.category_id);
            return (
              <li key={item.category_id}>
                <label className={cn("flex min-h-14 cursor-pointer items-start gap-3 p-3 transition-opacity", !on && "opacity-55")}>
                  <input type="checkbox" checked={on} onChange={() => toggle(item.category_id)} className="mt-0.5 size-5 shrink-0 accent-[var(--color-accent)]" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-semibold text-ink">{item.category_name}</span>
                      <span className="tabular shrink-0 text-sm">
                        {item.current_limit_cents !== null && <span className="text-ink-subtle line-through">{cad(item.current_limit_cents)}</span>}{" "}
                        <span className="font-semibold text-ink">{cad(item.suggested_cents)}</span>
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-subtle">{item.reason}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      {suggestions.length > 0 && (
        <Button className="w-full" disabled={busy || picked.length === 0} onClick={() => void apply()}>
          {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
          {picked.length === 0 ? "Tick at least one" : `Apply ${picked.length} budget${picked.length === 1 ? "" : "s"} for ${formatMonth(month)}`}
        </Button>
      )}
    </div>
  );
}

/** "How this applies to you": a lesson tied back to the user's own numbers. */
export function LessonExample({ lessonId }: { lessonId: string }) {
  const example = useAssist<AssistText>(lessonId, () => assistApi.lessonExample(lessonId));
  if (example.error) return null;
  return (
    <section aria-label="How this applies to you" aria-busy={example.loading} className="rounded-2xl border border-accent/30 bg-accent-soft/50 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink"><Sparkles className="size-4 text-accent-strong" aria-hidden="true" />How this applies to you</h3>
        {example.data && <SourceBadge source={example.data.source} />}
      </div>
      {example.loading
        ? <div className="mt-2 space-y-2">{[92, 70].map((width) => <div key={width} className="h-4 animate-pulse rounded bg-surface/70" style={{ width: `${width}%` }} />)}</div>
        : <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{example.data?.items[0]}</p>}
      <p className="mt-2 text-[11px] text-ink-subtle">Uses your numbers in Penny. Educational, not advice.</p>
    </section>
  );
}
