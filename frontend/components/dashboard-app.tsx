"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { Bot, CloudOff, LogIn, RefreshCw } from "lucide-react";
import { DisplaySettingsDialog, MobileAccount, MobileNavigation, PageHeader, Sidebar } from "@/components/penny/app-shell";
import { SettingsView } from "@/components/penny/settings-view";
import { CoachView, useCoachChat } from "@/components/penny/coach-view";
import { AddMoneyDialog, BudgetDialog, ConfirmDialog, type ConfirmRequest, GoalDialog, type InlineCreate, TransactionDialog } from "@/components/penny/dialogs";
import { GoalsView } from "@/components/penny/goals-view";
import { InvestView } from "@/components/penny/invest-view";
import { LearnView } from "@/components/penny/learn-view";
import { type BillInput, RecurringView } from "@/components/penny/recurring-view";
import { SpendingView } from "@/components/penny/spending-view";
import { TodayView } from "@/components/penny/today-view";
import { usePreferences } from "@/components/penny/preferences";
import { cad, describeError, NAVIGATION, type View } from "@/components/penny/shared";
import { Button, buttonVariants } from "@/components/ui/button";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { type Bill, type Budget, type Dashboard, dashboardApi, type Lesson, type Mission, type SavingsGoal, type Transaction } from "@/lib/api";
import { addMonths, formatMonth } from "@/lib/format";
import { cn } from "@/lib/utils";

export function DashboardApp() {
  return <ToastProvider><PennyApp /></ToastProvider>;
}

const isView = (value: string): value is View => NAVIGATION.some((item) => item.id === value);
/** True when keys should go to a form field. A field inside a dialog that is closing doesn't count. */
const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  !target.closest("[role=dialog][data-state=closed]") &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/** Runs a UI update inside a view transition where supported (and motion is allowed). */
function withViewTransition(update: () => void) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !("startViewTransition" in document)) { update(); return; }
  document.startViewTransition(() => flushSync(update));
}

/** Single-key shortcuts, ignored while typing in a field or while a dialog is open. */
function useKeyboardShortcuts(shortcuts: Record<string, () => void>) {
  const latest = useRef(shortcuts);
  useEffect(() => { latest.current = shortcuts; });
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      if (document.querySelector("[role=dialog][data-state=open]")) return;
      const run = latest.current[event.key.toLowerCase()];
      if (!run) return;
      event.preventDefault();
      run();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

type ToastMessage = { title: string; description?: string; action?: { label: string; onClick: () => void } };
type Undo = { label: string; run: () => Promise<Dashboard>; done: string };
/** Runs an API mutation, shows a success toast, and resolves to an error message (or null). */
type Mutate = (action: () => Promise<Dashboard>, success: string | ((data: Dashboard) => ToastMessage), undo?: Undo) => Promise<string | null>;

/** A confirmed delete whose toast offers Undo by re-creating the record. */
function deleteConfirmation(mutate: Mutate, options: { title: string; description: string; confirmLabel: string; remove: () => Promise<Dashboard>; restore: () => Promise<Dashboard>; noun: string }): ConfirmRequest {
  return {
    title: options.title,
    description: `${options.description} You can undo this right after.`,
    confirmLabel: options.confirmLabel,
    onConfirm: () => mutate(options.remove, `${options.noun} deleted`, { label: "Undo", run: options.restore, done: `${options.noun} restored` }),
  };
}

function PennyApp() {
  const toast = useToast();
  const coachChat = useCoachChat();
  const { resolvedTheme, setTheme } = usePreferences();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [view, setView] = useState<View>("today");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [monthLoading, setMonthLoading] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [loadError, setLoadError] = useState<ReturnType<typeof describeError> | null>(null);
  const [transactionTarget, setTransactionTarget] = useState<Transaction | "new" | null>(null);
  const [budgetTarget, setBudgetTarget] = useState<Budget | "new" | null>(null);
  const [goalTarget, setGoalTarget] = useState<SavingsGoal | "new" | null>(null);
  const [addMoneyTarget, setAddMoneyTarget] = useState<SavingsGoal | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [displayOpen, setDisplayOpen] = useState(false);
  // Month snapshots already fetched this session, so going back and forth feels instant.
  const cache = useRef(new Map<string, Dashboard>());
  const latestMonthRequest = useRef<string | null>(null);

  const remember = useCallback((data: Dashboard) => { cache.current.set(data.active_month, data); return data; }, []);

  const prefetch = useCallback((month: string, earliest: string) => {
    if (month < earliest || cache.current.has(month)) return;
    dashboardApi.load(month).then(remember).catch(() => undefined);
  }, [remember]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = remember(await dashboardApi.load());
      setDashboard(data);
    } catch (reason) {
      setLoadError(describeError(reason, "Penny couldn’t load"));
    } finally {
      setLoading(false);
    }
  }, [remember]);

  useEffect(() => {
    const fromHash = () => { const hash = window.location.hash.slice(1); if (isView(hash)) setView(hash); };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    let active = true;
    dashboardApi.load()
      .then((data) => { if (active) { setDashboard(remember(data)); prefetch(addMonths(data.active_month, -1), data.data_months[0] ?? data.active_month); } })
      .catch((reason: unknown) => { if (active) setLoadError(describeError(reason, "Penny couldn’t load")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; window.removeEventListener("hashchange", fromHash); };
  }, [prefetch, remember]);

  const navigate = useCallback((next: View) => {
    withViewTransition(() => setView(next));
    if (window.location.hash !== `#${next}`) window.history.pushState(null, "", `#${next}`);
    window.scrollTo({ top: 0 });
    window.requestAnimationFrame(() => document.getElementById("page-title")?.focus({ preventScroll: true }));
  }, []);

  /** Shows a month immediately from cache (if seen before), then refreshes it from the API. */
  const goToMonth = useCallback((month: string) => {
    if (!dashboard || (month === dashboard.active_month && !monthLoading)) return;
    const earliest = dashboard.data_months[0] ?? month;
    if (month < earliest || month > dashboard.current_month) return;
    latestMonthRequest.current = month;
    const cached = cache.current.get(month);
    if (cached) withViewTransition(() => setDashboard(cached));
    setMonthLoading(true);
    dashboardApi.load(month)
      .then((data) => {
        remember(data);
        if (latestMonthRequest.current !== month) return;
        setDashboard(data);
        prefetch(addMonths(month, -1), earliest);
      })
      .catch((reason: unknown) => {
        if (latestMonthRequest.current !== month) return;
        const error = describeError(reason, "That month couldn’t load");
        toast({ title: error.title, description: error.detail, tone: "error" });
      })
      .finally(() => { if (latestMonthRequest.current === month) setMonthLoading(false); });
  }, [dashboard, monthLoading, prefetch, remember, toast]);

  const openMonth = useCallback((month: string) => {
    if (view !== "today") navigate("today");
    goToMonth(month);
  }, [goToMonth, navigate, view]);

  /** Applies a fresh snapshot after an edit: other months' cached copies and charts are refreshed. */
  const applyChange = useCallback((data: Dashboard) => {
    cache.current.clear();
    remember(data);
    setDashboard(data);
    setHistoryVersion((value) => value + 1);
  }, [remember]);

  /** Creates something from inside a form (a category, an account) and returns the new snapshot. */
  const createInline = useCallback<InlineCreate>(async (action) => {
    try {
      const data = await action();
      applyChange(data);
      return data;
    } catch (reason) {
      return describeError(reason, "That couldn’t be created").detail;
    }
  }, [applyChange]);

  /** Runs an API mutation; shows a toast on success and returns an error message on failure. */
  const mutate = useCallback<Mutate>(async (action, success, undo) => {
    try {
      const data = await action();
      applyChange(data);
      const message = typeof success === "string" ? { title: success } : success(data);
      toast({
        ...message,
        action: message.action ?? (undo && {
          label: undo.label,
          onClick: () => {
            undo.run().then((next) => { applyChange(next); toast({ title: undo.done }); })
              .catch((reason: unknown) => { const error = describeError(reason, "Couldn’t undo"); toast({ title: error.title, description: error.detail, tone: "error" }); });
          },
        }),
      });
      return null;
    } catch (reason) {
      return describeError(reason, "That change couldn’t be saved").detail;
    }
  }, [applyChange, toast]);

  useKeyboardShortcuts(dashboard ? {
    n: () => setTransactionTarget("new"),
    "[": () => goToMonth(addMonths(dashboard.active_month, -1)),
    "]": () => goToMonth(addMonths(dashboard.active_month, 1)),
    d: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
    "?": () => setDisplayOpen(true),
    ...Object.fromEntries(NAVIGATION.map((item, index) => [String(index + 1), () => navigate(item.id)])),
  } : {});

  if (loading && !dashboard) return <DashboardSkeleton />;
  if (!dashboard) return <LoadError error={loadError ?? { title: "Penny couldn’t load", detail: "", needsSignIn: false }} onRetry={() => void load()} />;

  const month = dashboard.active_month;

  const confirmDeleteTransaction = (item: Transaction) => {
    setTransactionTarget(null);
    setConfirm(deleteConfirmation(mutate, {
      title: "Delete this transaction?",
      description: `“${item.description}” will be removed and your totals will update.`,
      confirmLabel: "Delete transaction",
      noun: "Transaction",
      remove: () => dashboardApi.deleteTransaction(item.id, month),
      restore: () => dashboardApi.createTransaction({ description: item.description, account_id: item.account_id, category_id: item.category_id, amount_cents: item.amount_cents, kind: item.kind, occurred_on: item.occurred_on }, month),
    }));
  };
  const confirmDeleteBudget = (item: Budget) => {
    setBudgetTarget(null);
    setConfirm(deleteConfirmation(mutate, {
      title: `Delete the ${item.category_name} budget?`,
      description: "Your transactions stay; only the monthly limit is removed.",
      confirmLabel: "Delete budget",
      noun: "Budget",
      remove: () => dashboardApi.deleteBudget(item.id, month),
      restore: () => dashboardApi.createBudget({ category_id: item.category_id, month_start: item.month_start, limit_cents: item.limit_cents }, month),
    }));
  };
  const confirmDeleteGoal = (item: SavingsGoal) => {
    setGoalTarget(null);
    setConfirm(deleteConfirmation(mutate, {
      title: `Delete “${item.name}”?`,
      description: "This removes the goal and its progress.",
      confirmLabel: "Delete goal",
      noun: "Goal",
      remove: () => dashboardApi.deleteGoal(item.id, month),
      restore: () => dashboardApi.createGoal({ name: item.name, target_cents: item.target_cents, current_cents: item.current_cents, target_date: item.target_date }, month),
    }));
  };
  const copyBudgets = (fromMonth: string) => {
    void mutate(() => dashboardApi.copyBudgets(fromMonth, month), (data) => ({ title: "Budgets copied", description: `${formatMonth(month)} now has ${data.budgets.length} category limits.` }))
      .then((error) => { if (error) toast({ title: "Nothing to copy", description: error, tone: "error" }); });
  };
  const completeMission = (mission: Mission) => {
    void mutate(() => dashboardApi.completeMission(mission.id, month), `Mission complete · +${mission.xp_reward} XP`)
      .then((error) => { if (error) toast({ title: "Couldn’t complete the mission", description: error, tone: "error" }); });
  };
  const markBillPaid = (bill: Bill) => {
    void mutate(() => dashboardApi.markBillPaid(bill.id, month), `${bill.name} paid`)
      .then((error) => { if (error) toast({ title: "Couldn’t update the bill", description: error, tone: "error" }); });
  };
  const saveBill = (id: string | null, body: BillInput) =>
    mutate(() => (id ? dashboardApi.updateBill(id, body, month) : dashboardApi.createBill(body, month)), id ? "Bill updated" : `${body.name} added`);
  const confirmDeleteBill = (bill: Bill) => {
    setConfirm(deleteConfirmation(mutate, {
      title: `Delete ${bill.name}?`,
      description: "It will stop appearing on your forecast. Past payments stay.",
      confirmLabel: "Delete bill",
      noun: "Bill",
      remove: () => dashboardApi.deleteBill(bill.id, month),
      restore: () => dashboardApi.createBill({ name: bill.name, amount_cents: bill.amount_cents, category_id: bill.category_id, account_id: bill.account_id, frequency: bill.frequency, next_due: bill.next_due, auto_record: bill.auto_record }, month),
    }));
  };

  /** Opens Penny AI and asks a question on the user's behalf (from a button elsewhere). */
  const askPenny = (question: string) => {
    navigate("ai");
    void coachChat.send(question);
  };
  const completeLesson = async (lesson: Lesson) => {
    const error = await mutate(() => dashboardApi.completeLesson(lesson.id), `Lesson complete · +${lesson.xp_reward} XP`);
    if (error) toast({ title: "Couldn’t save your progress", description: error, tone: "error" });
    return error === null;
  };

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-xl focus:bg-surface focus:px-4 focus:py-3 focus:font-semibold focus:shadow-[var(--shadow-raised)]">Skip to content</a>
      <Sidebar active={view} dashboard={dashboard} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((value) => !value)} onNavigate={navigate} onOpenDisplay={() => setDisplayOpen(true)} />
      <div className={cn("transition-[padding] duration-200", sidebarCollapsed ? "lg:pl-20" : "lg:pl-64")}>
        <PageHeader view={view} dashboard={dashboard} monthLoading={monthLoading} onChangeMonth={goToMonth} onAddTransaction={() => setTransactionTarget("new")} onOpenDisplay={() => setDisplayOpen(true)} onAsk={askPenny} />
        <main id="main" tabIndex={-1} className="mx-auto max-w-7xl px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-5 focus:outline-none sm:px-6 lg:px-10 lg:pb-12 lg:pt-8">
          <div key={view} className={monthLoading ? "animate-fade opacity-70 transition-opacity duration-200" : "animate-fade transition-opacity duration-200"} aria-busy={monthLoading}>
            {view === "today" && <TodayView dashboard={dashboard} historyVersion={historyVersion} onNavigate={navigate} onAsk={askPenny} />}
            {view === "spending" && <SpendingView dashboard={dashboard} historyVersion={historyVersion} onAsk={askPenny} onSelectMonth={goToMonth} onAddTransaction={() => setTransactionTarget("new")} onEditTransaction={setTransactionTarget} onDeleteTransaction={confirmDeleteTransaction} onAddBudget={() => setBudgetTarget("new")} onEditBudget={setBudgetTarget} onCopyBudgets={copyBudgets} />}
            {view === "recurring" && <RecurringView dashboard={dashboard} onAsk={askPenny} onMarkPaid={markBillPaid} onSave={saveBill} onDelete={confirmDeleteBill} />}
            {view === "goals" && <GoalsView dashboard={dashboard} onAsk={askPenny} onAdd={() => setGoalTarget("new")} onEdit={setGoalTarget} onAddMoney={setAddMoneyTarget} onComplete={(goal) => void mutate(() => dashboardApi.updateGoal(goal.id, { status: "completed" }, month), `${goal.name} reached`)} />}
            {view === "invest" && <InvestView dashboard={dashboard} onNavigate={navigate} />}
            {view === "learn" && <LearnView dashboard={dashboard} onCompleteLesson={completeLesson} onCompleteMission={completeMission} />}
            {view === "ai" && <CoachView chat={coachChat} dashboard={dashboard} onDashboardChange={applyChange} onApproved={(message) => toast({ title: "Change applied", description: message })} />}
            {view === "settings" && <SettingsView dashboard={dashboard} save={mutate} />}
          </div>
          <div className="mt-8"><MobileAccount dashboard={dashboard} /></div>
        </main>
      </div>
      <MobileNavigation active={view} onNavigate={navigate} />
      {view !== "ai" && view !== "today" && <button type="button" onClick={() => navigate("ai")} className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-4 z-20 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-on-primary shadow-[var(--shadow-raised)] transition-transform hover:-translate-y-0.5 motion-reduce:transform-none lg:bottom-6 lg:right-6"><Bot className="size-4" />Ask Penny</button>}

      <EditDialogs
        dashboard={dashboard}
        mutate={mutate}
        onCreate={createInline}
        onOpenMonth={openMonth}
        transaction={[transactionTarget, setTransactionTarget, confirmDeleteTransaction]}
        budget={[budgetTarget, setBudgetTarget, confirmDeleteBudget]}
        goal={[goalTarget, setGoalTarget, confirmDeleteGoal]}
        addMoney={[addMoneyTarget, setAddMoneyTarget]}
      />
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
      <DisplaySettingsDialog open={displayOpen} onOpenChange={setDisplayOpen} />
    </div>
  );
}

type DialogSlot<T> = [target: T | null, setTarget: (target: T | null) => void, requestDelete: (item: Exclude<T, "new">) => void];

/** The create/edit dialogs. Each submit resolves to an error message shown inside its dialog. */
function EditDialogs({ dashboard, mutate, onCreate, onOpenMonth, transaction, budget, goal, addMoney }: {
  dashboard: Dashboard;
  mutate: Mutate;
  onCreate: InlineCreate;
  onOpenMonth: (month: string) => void;
  transaction: DialogSlot<Transaction | "new">;
  budget: DialogSlot<Budget | "new">;
  goal: DialogSlot<SavingsGoal | "new">;
  addMoney: [target: SavingsGoal | null, setTarget: (target: SavingsGoal | null) => void];
}) {
  const month = dashboard.active_month;
  const [transactionTarget, setTransactionTarget, deleteTransaction] = transaction;
  const [budgetTarget, setBudgetTarget, deleteBudget] = budget;
  const [goalTarget, setGoalTarget, deleteGoal] = goal;
  const [addMoneyTarget, setAddMoneyTarget] = addMoney;

  /** Saves, then closes the dialog only if the API accepted the change. */
  async function saveAndClose(save: Promise<string | null>, close: () => void) {
    const error = await save;
    if (!error) close();
    return error;
  }

  function transactionSaved(id: string | null, occurredOn: string): ToastMessage {
    const otherMonth = occurredOn.slice(0, 7) === month.slice(0, 7) ? null : `${occurredOn.slice(0, 7)}-01`;
    const title = id ? "Transaction updated" : "Transaction added";
    if (!otherMonth || otherMonth > dashboard.current_month) return { title };
    return { title, description: `It’s dated in ${formatMonth(otherMonth)}.`, action: { label: `View ${formatMonth(otherMonth).split(" ")[0]}`, onClick: () => onOpenMonth(otherMonth) } };
  }

  function contributionSaved(goalItem: SavingsGoal, data: Dashboard): ToastMessage {
    const updated = data.savings_goals.find((item) => item.id === goalItem.id);
    if (!updated) return { title: `Added to ${goalItem.name}` };
    return { title: updated.status === "completed" ? `${goalItem.name} reached!` : `Added to ${goalItem.name}`, description: `Now saved: ${cad(updated.current_cents)} of ${cad(updated.target_cents)}.` };
  }

  return (
    <>
      <TransactionDialog
        target={transactionTarget}
        dashboard={dashboard}
        onCreate={onCreate}
        onClose={() => setTransactionTarget(null)}
        onRequestDelete={deleteTransaction}
        onSubmit={(id, body) => saveAndClose(mutate(() => (id ? dashboardApi.updateTransaction(id, body, month) : dashboardApi.createTransaction(body, month)), () => transactionSaved(id, body.occurred_on)), () => setTransactionTarget(null))}
      />
      <BudgetDialog
        target={budgetTarget}
        dashboard={dashboard}
        onClose={() => setBudgetTarget(null)}
        onRequestDelete={deleteBudget}
        onSubmit={(id, body) => saveAndClose(mutate(() => (id ? dashboardApi.updateBudget(id, body.limit_cents, month) : dashboardApi.createBudget({ ...body, month_start: month }, month)), id ? "Budget updated" : "Budget added"), () => setBudgetTarget(null))}
      />
      <GoalDialog
        target={goalTarget}
        onClose={() => setGoalTarget(null)}
        onRequestDelete={deleteGoal}
        onSubmit={(id, body) => saveAndClose(mutate(() => (id ? dashboardApi.updateGoal(id, body, month) : dashboardApi.createGoal(body, month)), id ? "Goal updated" : "Goal created"), () => setGoalTarget(null))}
      />
      <AddMoneyDialog
        goal={addMoneyTarget}
        onClose={() => setAddMoneyTarget(null)}
        onSubmit={(goalItem, amount) => saveAndClose(mutate(() => dashboardApi.contributeToGoal(goalItem.id, amount, month), (data) => contributionSaved(goalItem, data)), () => setAddMoneyTarget(null))}
      />
    </>
  );
}

function DashboardSkeleton() {
  const tiles = ["tile-in", "tile-out", "tile-left"];
  const panels = ["panel-1", "panel-2", "panel-3"];
  return (
    <div className="min-h-dvh lg:pl-64" aria-busy="true">
      <div className="fixed inset-y-0 left-0 hidden w-64 border-r border-line lg:block" />
      <div className="mx-auto max-w-7xl animate-pulse px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <div className="h-4 w-32 rounded-full bg-sage" />
        <div className="mt-3 h-8 w-64 max-w-full rounded-xl bg-sage" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="h-40 rounded-[var(--radius-card)] bg-hero/20" />
          {tiles.map((key) => <div key={key} className="h-40 rounded-[var(--radius-card)] border border-line bg-surface" />)}
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-3">{panels.map((key) => <div key={key} className="h-80 rounded-[var(--radius-card)] border border-line bg-surface" />)}</div>
        <output className="sr-only">Loading your Penny dashboard</output>
      </div>
    </div>
  );
}

function LoadError({ error, onRetry }: { error: ReturnType<typeof describeError>; onRetry: () => void }) {
  const Icon = error.needsSignIn ? LogIn : CloudOff;
  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <div className="w-full max-w-md animate-enter rounded-[1.5rem] border border-line bg-surface p-6 text-center shadow-[var(--shadow-raised)] sm:p-8">
        <span className={error.needsSignIn ? "mx-auto grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent-strong" : "mx-auto grid size-12 place-items-center rounded-2xl bg-danger-soft text-danger"} aria-hidden="true"><Icon className="size-6" /></span>
        <h1 className="mt-5 text-xl font-semibold tracking-tight text-ink">{error.title}</h1>
        <p className="mt-2 text-sm text-ink-muted" role="alert">{error.detail}</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          {error.needsSignIn ? <Link href="/login" className={buttonVariants()}><LogIn className="size-4" aria-hidden="true" />Sign in</Link> : null}
          <Button variant={error.needsSignIn ? "outline" : "default"} onClick={onRetry}><RefreshCw className="size-4" aria-hidden="true" />Try again</Button>
        </div>
      </div>
    </main>
  );
}
