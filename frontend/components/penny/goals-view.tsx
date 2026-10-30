"use client";

import { CalendarDays, Check, Pencil, PiggyBank, Plus, Sparkles, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { Dashboard, SavingsGoal } from "@/lib/api";
import { formatLongDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { cad, EmptyState } from "./shared";

type Props = {
  dashboard: Dashboard;
  onAdd: () => void;
  onEdit: (goal: SavingsGoal) => void;
  onAddMoney: (goal: SavingsGoal) => void;
  onComplete: (goal: SavingsGoal) => void;
  onAsk: (question: string) => void;
};

export function GoalsView({ dashboard, onAdd, onEdit, onAddMoney, onComplete, onAsk }: Props) {
  const goals = dashboard.savings_goals;
  const saved = goals.reduce((total, goal) => total + goal.current_cents, 0);
  const monthly = goals.reduce((total, goal) => total + (goal.monthly_needed_cents ?? 0), 0);
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <section className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <p className="text-sm text-ink-subtle">Saved across {goals.length} goal{goals.length === 1 ? "" : "s"}</p>
          <p className="tabular mt-1 text-3xl font-semibold tracking-tight text-ink">{cad(saved)}</p>
          {monthly > 0 && <p className="mt-1 text-sm text-ink-muted">Staying on schedule takes <span className="font-semibold text-ink">{cad(monthly)}</span> a month in total.</p>}
        </div>
        <Button onClick={onAdd}><Plus className="size-4" aria-hidden="true" />New goal</Button>
      </section>

      {goals.length === 0 ? (
        <Card className="p-5"><EmptyState icon={Target} title="No goals yet" description="Pick something you’re saving for and Penny will show what it takes each month." action={<Button size="sm" onClick={onAdd}>Create a goal</Button>} /></Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {goals.map((goal) => <GoalCard key={goal.id} goal={goal} onEdit={onEdit} onAddMoney={onAddMoney} onComplete={onComplete} onAsk={onAsk} />)}
        </ul>
      )}
    </div>
  );
}

function GoalCard({ goal, onEdit, onAddMoney, onComplete, onAsk }: { goal: SavingsGoal } & Omit<Props, "dashboard" | "onAdd">) {
  const percent = Math.floor(goal.progress_basis_points / 100);
  const done = goal.status === "completed";
  return (
    <li>
      <Card className={cn("h-full p-5 sm:p-6", done && "border-accent/40")}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-ink">{goal.name}</h2>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-subtle"><CalendarDays className="size-3.5" aria-hidden="true" />{goal.target_date ? `By ${formatLongDate(goal.target_date)}` : "No target date"}</p>
          </div>
          <Badge tone={done ? "accent" : goal.status === "paused" ? "neutral" : "info"}>{done ? "Reached" : goal.status === "paused" ? "Paused" : `${percent}%`}</Badge>
        </div>
        <Progress className="mt-5 h-3" value={percent} indicatorClassName="bg-accent" aria-label={`${goal.name}: ${percent}% saved`} />
        <div className="mt-2 flex justify-between text-sm"><span className="tabular font-semibold text-ink">{cad(goal.current_cents)}</span><span className="tabular text-ink-subtle">of {cad(goal.target_cents)}</span></div>
        {goal.monthly_needed_cents !== null && !done && (
          <p className="mt-4 rounded-xl bg-accent-soft p-3 text-sm text-ink-muted">Save <span className="tabular font-semibold text-ink">{cad(goal.monthly_needed_cents)}</span> a month to reach it on time.</p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => onAddMoney(goal)} disabled={done}><PiggyBank className="size-4" aria-hidden="true" />Add money</Button>
          <Button size="sm" variant="outline" onClick={() => onEdit(goal)}><Pencil className="size-4" aria-hidden="true" />Edit</Button>
          {!done && <Button size="sm" variant="ghost" onClick={() => onAsk(`How can I reach my ${goal.name} goal sooner?`)}><Sparkles className="size-4" aria-hidden="true" />Ask Penny</Button>}
          {!done && goal.current_cents >= goal.target_cents && <Button size="sm" variant="ghost" onClick={() => onComplete(goal)}><Check className="size-4" aria-hidden="true" />Mark reached</Button>}
        </div>
      </Card>
    </li>
  );
}
