"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, LayoutGrid, LayoutList, LogOut, Monitor, Moon, Plus, Rows3, ShieldCheck, SlidersHorizontal, Square, Sun, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Dashboard } from "@/lib/api";
import { addMonths, formatMonth, greeting } from "@/lib/format";
import { getSupabaseUserEmail, signOutOfSupabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { DENSITY_OPTIONS, type Density, THEME_OPTIONS, type ThemeSetting, usePreferences } from "./preferences";
import { NAVIGATION, type View } from "./shared";

const MONTH_VIEWS: View[] = ["home", "budget"];
const DENSITY_ICONS: Record<Density, typeof Square> = { simple: Square, compact: Rows3, detailed: LayoutGrid };
const THEME_ICONS: Record<ThemeSetting, typeof Sun> = { light: Sun, dark: Moon, system: Monitor };

export const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: "N", action: "Add a transaction" },
  { keys: "[  ]", action: "Previous / next month" },
  { keys: "1 – 6", action: "Home, Budget, Insights, Council, Learn, Credit" },
  { keys: "D", action: "Switch light / dark" },
  { keys: "?", action: "Open display settings" },
];

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl bg-hero text-white", className)} aria-hidden="true">
      <svg viewBox="0 0 64 64" className="size-6"><path d="M22 48V16h12a10 10 0 0 1 0 20h-6" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" /><circle cx="44" cy="46" r="4" fill="var(--color-gold)" /></svg>
    </span>
  );
}

function useSignedInEmail() {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    getSupabaseUserEmail().then((value) => { if (active) setEmail(value); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  return email;
}

function AccountSummary({ dashboard }: { dashboard: Dashboard }) {
  const router = useRouter();
  const email = useSignedInEmail();
  const [signingOut, setSigningOut] = useState(false);
  const initials = dashboard.profile.display_name.split(" ").map((part) => part[0]).join("");
  async function signOut() {
    setSigningOut(true);
    await signOutOfSupabase().catch(() => undefined);
    router.replace("/login");
  }
  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary" aria-hidden="true">{initials}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{dashboard.profile.display_name}</p>
          <p className="truncate text-xs text-ink-subtle">{email ? `Signed in as ${email}` : "Demo mode"}{dashboard.xp_total > 0 ? ` · ${dashboard.xp_total} XP` : ""}</p>
        </div>
      </div>
      {email && (
        <Button variant="ghost" size="sm" className="mt-2 w-full justify-start" onClick={() => void signOut()} disabled={signingOut}>
          <LogOut className="size-4" aria-hidden="true" />{signingOut ? "Signing out…" : "Sign out"}
        </Button>
      )}
    </div>
  );
}

export function Sidebar({ active, dashboard, onNavigate, onOpenDisplay }: { active: View; dashboard: Dashboard; onNavigate: (view: View) => void; onOpenDisplay: () => void }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col overflow-y-auto border-r border-line bg-canvas px-4 py-5 lg:flex">
      <div className="flex items-center gap-3 px-2">
        <BrandMark />
        <div><p className="text-lg font-semibold tracking-tight text-ink">Penny</p><p className="text-xs text-ink-subtle">Make money make sense</p></div>
      </div>
      <nav aria-label="Primary" className="mt-8">
        <ul className="space-y-1">
          {NAVIGATION.map(({ id, label, icon: Icon }) => (
            <li key={id}>
              <button type="button" onClick={() => onNavigate(id)} aria-current={active === id ? "page" : undefined} className={cn("relative flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors duration-150", active === id ? "bg-sage text-primary before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-full before:bg-accent" : "text-ink-muted hover:bg-sage-soft hover:text-ink")}>
                <Icon className="size-5" aria-hidden="true" />{label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="mt-auto space-y-3 pt-6">
        <button type="button" onClick={onOpenDisplay} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-ink-muted transition-colors hover:bg-sage-soft hover:text-ink">
          <SlidersHorizontal className="size-5" aria-hidden="true" />Display settings
        </button>
        <p className="flex items-start gap-2 rounded-xl bg-sage-soft p-3 text-xs leading-relaxed text-ink-muted"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />All accounts and amounts are fictional. No bank is connected.</p>
        <AccountSummary dashboard={dashboard} />
      </div>
    </aside>
  );
}

export function MobileNavigation({ active, onNavigate }: { active: View; onNavigate: (view: View) => void }) {
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
      <ul className="mx-auto grid max-w-2xl grid-cols-6">
        {NAVIGATION.map(({ id, label, icon: Icon }) => (
          <li key={id}>
            <button type="button" onClick={() => onNavigate(id)} aria-current={active === id ? "page" : undefined} className={cn("flex min-h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors", active === id ? "text-primary" : "text-ink-subtle hover:text-ink")}>
              <span className={cn("grid h-7 w-11 place-items-center rounded-full transition-colors duration-150", active === id && "bg-sage")}><Icon className="size-5" aria-hidden="true" /></span>
              {label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// ------------------------------------------------------------------ month switcher

export function MonthSwitcher({ dashboard, loading, onChangeMonth }: { dashboard: Dashboard; loading: boolean; onChangeMonth: (month: string) => void }) {
  const month = dashboard.active_month;
  const earliest = dashboard.data_months[0] ?? month;
  const isCurrent = month === dashboard.current_month;
  const months = [...dashboard.data_months].reverse();
  return (
    <div className="flex items-center gap-1.5" aria-busy={loading}>
      <div className="flex items-center rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
        <button type="button" onClick={() => onChangeMonth(addMonths(month, -1))} disabled={month <= earliest} aria-label="Previous month" className="grid size-10 place-items-center rounded-l-xl text-ink-muted transition-colors hover:bg-sage-soft hover:text-ink disabled:opacity-35"><ChevronLeft className="size-4" /></button>
        <label>
          <span className="sr-only">Choose a month</span>
          <select value={month} onChange={(event) => onChangeMonth(event.target.value)} className="h-10 cursor-pointer appearance-none border-x border-line bg-transparent px-3 text-sm font-semibold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            {months.map((value) => <option key={value} value={value}>{formatMonth(value)}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => onChangeMonth(addMonths(month, 1))} disabled={isCurrent} aria-label="Next month" className="grid size-10 place-items-center rounded-r-xl text-ink-muted transition-colors hover:bg-sage-soft hover:text-ink disabled:opacity-35"><ChevronRight className="size-4" /></button>
      </div>
      {!isCurrent && (
        <button type="button" onClick={() => onChangeMonth(dashboard.current_month)} className="inline-flex h-10 animate-fade items-center gap-1 rounded-xl px-2.5 text-xs font-semibold text-accent-strong hover:bg-accent-soft">
          <Undo2 className="size-3.5" aria-hidden="true" />Back to this month
        </button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ display controls

export function DensitySwitch({ className }: { className?: string }) {
  const { density, setDensity } = usePreferences();
  return (
    <div role="radiogroup" aria-label="Layout" className={cn("flex items-center gap-0.5 rounded-xl border border-line bg-surface p-0.5 shadow-[var(--shadow-card)]", className)}>
      {DENSITY_OPTIONS.map((option) => {
        const Icon = DENSITY_ICONS[option.value];
        return (
          <button key={option.value} type="button" role="radio" aria-checked={density === option.value} title={option.description} onClick={() => setDensity(option.value)} className={cn("inline-flex h-9 items-center gap-1.5 rounded-[0.6rem] px-2.5 text-xs font-semibold transition-colors", density === option.value ? "bg-sage text-ink" : "text-ink-subtle hover:text-ink")}>
            <Icon className="size-3.5" aria-hidden="true" />{option.label}
          </button>
        );
      })}
    </div>
  );
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = usePreferences();
  const dark = resolvedTheme === "dark";
  return (
    <button type="button" onClick={() => setTheme(dark ? "light" : "dark")} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Light mode" : "Dark mode"} className="grid size-10 place-items-center rounded-xl border border-line bg-surface text-ink-muted shadow-[var(--shadow-card)] transition-colors hover:text-ink">
      {dark ? <Sun className="size-[1.1rem]" /> : <Moon className="size-[1.1rem]" />}
    </button>
  );
}

export function DisplaySettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { theme, setTheme, density, setDensity } = usePreferences();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Display settings</DialogTitle>
          <DialogDescription>Choose how Penny looks. Your choice is saved on this device.</DialogDescription>
        </DialogHeader>
        <fieldset>
          <legend className="text-sm font-semibold text-ink">Layout</legend>
          <div className="mt-2 grid gap-2">
            {DENSITY_OPTIONS.map((option) => {
              const Icon = DENSITY_ICONS[option.value];
              return (
                <label key={option.value} className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent", density === option.value ? "border-accent bg-accent-soft" : "border-line hover:bg-sage-soft")}>
                  <input type="radio" name="density" value={option.value} checked={density === option.value} onChange={() => setDensity(option.value)} className="sr-only" />
                  <Icon className="mt-0.5 size-5 shrink-0 text-accent-strong" aria-hidden="true" />
                  <span><span className="block text-sm font-semibold text-ink">{option.label}</span><span className="block text-sm text-ink-subtle">{option.description}</span></span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <fieldset className="mt-5">
          <legend className="text-sm font-semibold text-ink">Theme</legend>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {THEME_OPTIONS.map((option) => {
              const Icon = THEME_ICONS[option.value];
              return (
                <label key={option.value} className={cn("flex min-h-16 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border p-2 text-center text-sm font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent", theme === option.value ? "border-accent bg-accent-soft text-ink" : "border-line text-ink-muted hover:bg-sage-soft")}>
                  <input type="radio" name="theme" value={option.value} checked={theme === option.value} onChange={() => setTheme(option.value)} className="sr-only" />
                  <Icon className="size-5" aria-hidden="true" />{option.label}
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="mt-5 hidden sm:block">
          <h3 className="text-sm font-semibold text-ink">Keyboard shortcuts</h3>
          <dl className="mt-2 divide-y divide-line rounded-xl border border-line text-sm">
            {SHORTCUTS.map((shortcut) => (
              <div key={shortcut.keys} className="flex items-center justify-between gap-3 px-3 py-2">
                <dt className="text-ink-muted">{shortcut.action}</dt>
                <dd><kbd className="rounded-md border border-line-strong bg-sage-soft px-1.5 py-0.5 font-mono text-xs text-ink">{shortcut.keys}</kbd></dd>
              </div>
            ))}
          </dl>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ header

export function PageHeader({ view, dashboard, monthLoading, onChangeMonth, onAddTransaction, onOpenDisplay }: { view: View; dashboard: Dashboard; monthLoading: boolean; onChangeMonth: (month: string) => void; onAddTransaction: () => void; onOpenDisplay: () => void }) {
  const item = NAVIGATION.find((entry) => entry.id === view) ?? NAVIGATION[0];
  const firstName = dashboard.profile.display_name.split(" ")[0];
  const isCurrent = dashboard.active_month === dashboard.current_month;
  const pastHome = view === "home" && !isCurrent;
  const title = view === "home" ? (isCurrent ? `${greeting()}, ${firstName}` : `${formatMonth(dashboard.active_month)} in review`) : item.title;
  const description = pastHome ? "You’re looking back at a past month. Balances and goals show today’s values." : view === "home" ? "Here’s where your money stands this month." : item.description;
  const showMonth = MONTH_VIEWS.includes(view);
  const showAdd = view === "home" || view === "budget";
  return (
    <header className="sticky top-0 z-20 border-b border-line/70 bg-canvas/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-10 lg:py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark className="size-9 lg:hidden" />
            <div className="min-w-0">
              <h1 id="page-title" tabIndex={-1} className="truncate text-lg font-semibold tracking-tight text-ink focus:outline-none sm:text-2xl">{title}</h1>
              <p className="hidden truncate text-sm text-ink-subtle sm:block">{description}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <DensitySwitch className="hidden xl:flex" />
            <div className="hidden sm:block"><ThemeToggle /></div>
            <button type="button" onClick={onOpenDisplay} aria-label="Display settings" className="grid size-10 place-items-center rounded-xl border border-line bg-surface text-ink-muted shadow-[var(--shadow-card)] hover:text-ink xl:hidden"><LayoutList className="size-[1.1rem]" /></button>
            {showAdd && (
              <Button onClick={onAddTransaction} className="shrink-0">
                <Plus className="size-4" aria-hidden="true" /><span className="sm:hidden">Add</span><span className="hidden sm:inline">Add transaction</span>
              </Button>
            )}
          </div>
        </div>
        {showMonth ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <MonthSwitcher dashboard={dashboard} loading={monthLoading} onChangeMonth={onChangeMonth} />
            <Badge tone="gold">Fictional data</Badge>
          </div>
        ) : (
          <p className="mt-1 text-xs text-ink-subtle sm:hidden">{formatMonth(dashboard.current_month)} · Fictional data</p>
        )}
        {pastHome && <p className="mt-2 text-xs text-ink-subtle sm:hidden">Looking back at a past month. Balances and goals show today’s values.</p>}
      </div>
    </header>
  );
}

/** Account summary for small screens, where the sidebar is hidden. */
export function MobileAccount({ dashboard, onOpenDisplay }: { dashboard: Dashboard; onOpenDisplay: () => void }) {
  return (
    <div className="space-y-3 lg:hidden">
      <AccountSummary dashboard={dashboard} />
      <Button variant="outline" className="w-full" onClick={onOpenDisplay}><SlidersHorizontal className="size-4" aria-hidden="true" />Display settings</Button>
    </div>
  );
}
