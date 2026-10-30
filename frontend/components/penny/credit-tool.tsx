"use client";

import { FormEvent, useState } from "react";
import { Calculator, CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { calculationsApi, type CreditUtilization } from "@/lib/api";
import { centsToInput, parseCadToCents } from "@/lib/money";
import { cad, describeError, enterStyle, Field } from "./shared";

/** Educational utilization what-if, calculated on the server in integer basis points. */
export function CreditCalculator({ defaultBalance, defaultLimit }: { defaultBalance: number; defaultLimit: number }) {
  const [balance, setBalance] = useState(centsToInput(String(defaultBalance)));
  const [limit, setLimit] = useState(centsToInput(String(defaultLimit)));
  const [errors, setErrors] = useState<{ balance?: string; limit?: string; form?: string }>({});
  const [result, setResult] = useState<CreditUtilization | null>(null);
  const [busy, setBusy] = useState(false);

  async function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: typeof errors = {};
    let balanceCents = 0;
    let limitCents = 0;
    try { balanceCents = parseCadToCents(balance); } catch (reason) { next.balance = reason instanceof Error ? reason.message : "Enter a valid amount"; }
    try { limitCents = parseCadToCents(limit); if (limitCents <= 0) next.limit = "The credit limit must be more than $0.00"; } catch (reason) { next.limit = reason instanceof Error ? reason.message : "Enter a valid amount"; }
    setErrors(next);
    if (next.balance || next.limit) return;
    setBusy(true);
    try {
      setResult(await calculationsApi.creditUtilization(balanceCents, limitCents));
    } catch (reason) {
      setErrors({ form: describeError(reason, "Couldn’t calculate").detail });
    } finally {
      setBusy(false);
    }
  }

  const percent = result ? result.utilization_basis_points / 100 : 0;
  return (
    <Card className="animate-enter p-5 sm:p-6" style={enterStyle(1)}>
      <h3 className="flex items-center gap-2 font-semibold text-ink"><Calculator className="size-4 text-accent" aria-hidden="true" />Try a what-if</h3>
      <p className="mt-1 text-sm text-ink-subtle">Change the fictional balance or limit to see how utilization moves. Nothing is saved.</p>
      <form onSubmit={calculate} className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
        <Field label="Card balance (CAD)" error={errors.balance}>{(props) => <Input {...props} value={balance} onChange={(event) => setBalance(event.target.value)} inputMode="decimal" autoComplete="off" />}</Field>
        <Field label="Credit limit (CAD)" error={errors.limit}>{(props) => <Input {...props} value={limit} onChange={(event) => setLimit(event.target.value)} inputMode="decimal" autoComplete="off" />}</Field>
        <Button type="submit" disabled={busy} className="sm:mt-[1.625rem]">{busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Calculator className="size-4" aria-hidden="true" />}Calculate</Button>
      </form>
      {errors.form && <p role="alert" className="mt-3 rounded-xl bg-danger-soft p-3 text-sm text-danger">{errors.form}</p>}
      {result && (
        <div className="mt-5 animate-enter rounded-2xl border border-line p-4" role="status">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm text-ink-muted">{cad(result.balance_cents)} of {cad(result.credit_limit_cents)}</p>
            <p className="text-2xl font-semibold tracking-tight text-ink">{percent.toFixed(1)}%</p>
          </div>
          <Progress className="mt-3" value={percent} indicatorClassName={result.within_common_guideline ? "bg-accent" : "bg-gold"} aria-label={`Utilization ${percent.toFixed(1)} percent`} />
          <p className="mt-3 flex items-start gap-2 text-sm text-ink-muted">
            {result.within_common_guideline ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-gold-strong" aria-hidden="true" />}
            {result.within_common_guideline ? "That’s at or under 30%, a level many Canadian credit-education guides mention." : "That’s above 30%, the level many Canadian credit-education guides suggest staying under."} It’s a general guideline, not a score prediction.
          </p>
        </div>
      )}
    </Card>
  );
}
