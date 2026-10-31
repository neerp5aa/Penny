"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { LogOut, Menu, Monitor, Moon, PanelLeftClose, PanelLeftOpen, Plus, Settings, SlidersHorizontal, Sun } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Dashboard } from "@/lib/api";
import { formatMonth, greeting } from "@/lib/format";
import { getSupabaseUserEmail, signOutOfSupabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { THEME_OPTIONS, type ThemeSetting, usePreferences } from "./preferences";
import { type PeriodRange, PeriodPicker } from "./period-picker";
import { cad, NAVIGATION, type View } from "./shared";

const MONTH_VIEWS: View[] = ["today", "spending"];
export const THEME_ICONS: Record<ThemeSetting, typeof Sun> = { light: Sun, dark: Moon, system: Monitor };

export const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: "N", action: "Add a transaction" },
  { keys: "[  ]", action: "Previous / next month" },
  { keys: "1 – 9", action: "Jump between sections" },
  { keys: "D", action: "Switch light / dark" },
  { keys: "?", action: "Open display settings" },
];

/** The Penny coin. Decorative: the name next to it carries the meaning. */
export function BrandMark({ className }: { className?: string }) {
  return <Image src="/penny-logo.png" alt="" width={256} height={256} priority className={cn("size-10 shrink-0 drop-shadow-sm", className)} />;
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

export function Sidebar({ active, dashboard, collapsed, onToggle, onNavigate }: { active: View; dashboard: Dashboard; collapsed: boolean; onToggle: () => void; onNavigate: (view: View) => void }) {
  return (
    <aside data-collapsed={collapsed} className={cn("fixed inset-y-0 left-0 z-30 hidden flex-col overflow-y-auto border-r border-line bg-canvas py-5 transition-[width] duration-200 lg:flex", collapsed ? "w-20 px-3" : "w-64 px-4")}>
      <div className={cn("flex items-center gap-3 px-2", collapsed && "justify-center px-0")}>
        <BrandMark />
        {!collapsed && <div><p className="text-lg font-semibold tracking-tight text-ink">Penny</p><p className="text-xs text-ink-subtle">Make money make sense</p></div>}
      </div>
      <nav aria-label="Primary" className="mt-8">
        <ul className="space-y-1">
          {/* Settings opens from the header's gear menu (All settings), not the sidebar. */}
          {NAVIGATION.filter((item) => item.id !== "settings").map(({ id, label, icon: Icon }) => (
            <li key={id}>
              <button type="button" title={collapsed ? label : undefined} onClick={() => onNavigate(id)} aria-current={active === id ? "page" : undefined} className={cn("relative flex min-h-11 w-full items-center rounded-xl text-sm font-medium transition-colors duration-150", collapsed ? "justify-center px-0" : "gap-3 px-3", active === id ? "bg-sage text-primary before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-full before:bg-accent" : "text-ink-muted hover:bg-sage-soft hover:text-ink")}>
                <Icon className="size-5 shrink-0" aria-hidden="true" />{!collapsed && label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="mt-auto space-y-3 pt-6">
        <button type="button" onClick={onToggle} title={collapsed ? "Expand sidebar" : "Collapse sidebar"} className={cn("flex min-h-11 w-full items-center rounded-xl text-sm font-medium text-ink-muted hover:bg-sage-soft hover:text-ink", collapsed ? "justify-center" : "gap-3 px-3")}>
          {collapsed ? <PanelLeftOpen className="size-5" /> : <><PanelLeftClose className="size-5" />Collapse sidebar</>}
        </button>
        {!collapsed && <AccountSummary dashboard={dashboard} />}
      </div>
    </aside>
  );
}

export function MobileNavigation({ active, onNavigate }: { active: View; onNavigate: (view: View) => void }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const primary = NAVIGATION.filter((item) => item.primary);
  const secondary = NAVIGATION.filter((item) => !item.primary);
  const moreActive = secondary.some((item) => item.id === active);
  const tab = (selected: boolean) => cn("flex min-h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors", selected ? "text-primary" : "text-ink-subtle hover:text-ink");
  const pill = (selected: boolean) => cn("grid h-7 w-11 place-items-center rounded-full transition-colors duration-150", selected && "bg-sage");
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
      <ul className="mx-auto flex max-w-3xl">
        {primary.map(({ id, label, icon: Icon }) => (
          <li key={id} className="flex-1">
            <button type="button" onClick={() => onNavigate(id)} aria-current={active === id ? "page" : undefined} className={tab(active === id)}>
              <span className={pill(active === id)}><Icon className="size-5" aria-hidden="true" /></span>{label}
            </button>
          </li>
        ))}
        <li className="flex-1">
          <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog" className={tab(moreActive)}>
            <span className={pill(moreActive)}><Menu className="size-5" aria-hidden="true" /></span>More
          </button>
        </li>
      </ul>
      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>More</DialogTitle><DialogDescription>Everything else in Penny.</DialogDescription></DialogHeader>
          <ul className="grid gap-2">
            {secondary.map(({ id, label, description, icon: Icon }) => (
              <li key={id}>
                <button type="button" onClick={() => { setMoreOpen(false); onNavigate(id); }} aria-current={active === id ? "page" : undefined} className={cn("flex min-h-14 w-full items-center gap-3 rounded-xl border p-3 text-left", active === id ? "border-accent bg-accent-soft" : "border-line hover:bg-sage-soft")}>
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sage text-ink-muted"><Icon className="size-5" aria-hidden="true" /></span>
                  <span><span className="block text-sm font-semibold text-ink">{label}</span><span className="block text-xs text-ink-subtle">{description}</span></span>
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </nav>
  );
}

// ------------------------------------------------------------------ month switcher

// ------------------------------------------------------------------ display controls

/** The header's gear: theme, display settings, and a shortcut to all settings. */
export function SettingsMenu({ onOpenDisplay, onNavigate }: { onOpenDisplay: () => void; onNavigate: (view: View) => void }) {
  const { theme, setTheme } = usePreferences();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const item = "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-ink hover:bg-sage-soft";
  return (
    <div ref={root} className="relative" onKeyDown={(event) => { if (event.key === "Escape" && open) { event.preventDefault(); setOpen(false); } }}>
      <button type="button" onClick={() => setOpen((value) => !value)} aria-haspopup="true" aria-expanded={open} aria-controls={open ? menuId : undefined} aria-label="Settings" title="Settings" className={cn("grid size-10 place-items-center rounded-xl border border-line bg-surface text-ink-muted shadow-[var(--shadow-card)] transition-colors hover:text-ink", open && "text-ink")}>
        <Settings className={cn("size-[1.1rem] transition-transform duration-300 motion-reduce:transition-none", open && "rotate-45")} aria-hidden="true" />
      </button>
      {open && (
        <div id={menuId} role="group" aria-label="Settings" className="absolute right-0 top-full z-40 mt-2 w-64 animate-enter rounded-2xl border border-line bg-surface p-2 shadow-[var(--shadow-raised)]">
          <p className="px-2 pb-1.5 pt-1 text-xs font-semibold uppercase tracking-wider text-ink-subtle">Appearance</p>
          <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-1 rounded-xl bg-sage-soft p-1">
            {THEME_OPTIONS.map((option) => {
              const Icon = THEME_ICONS[option.value];
              const selected = theme === option.value;
              return (
                <button key={option.value} type="button" role="radio" aria-checked={selected} onClick={() => setTheme(option.value)} className={cn("flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg text-xs font-semibold transition-colors", selected ? "bg-surface text-ink shadow-sm" : "text-ink-subtle hover:text-ink")}>
                  <Icon className="size-4" aria-hidden="true" />{option.label}
                </button>
              );
            })}
          </div>
          <div className="mt-2 border-t border-line pt-2">
            <button type="button" className={item} onClick={() => { setOpen(false); onOpenDisplay(); }}><SlidersHorizontal className="size-4 text-ink-subtle" aria-hidden="true" />Display settings</button>
            <button type="button" className={item} onClick={() => { setOpen(false); onNavigate("settings"); }}><Settings className="size-4 text-ink-subtle" aria-hidden="true" />All settings</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function DisplaySettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { theme, setTheme } = usePreferences();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Display settings</DialogTitle>
          <DialogDescription>Choose how Penny looks. Your choice is saved on this device.</DialogDescription>
        </DialogHeader>
        <fieldset>
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

export function PageHeader({ view, dashboard, monthLoading, onChangePeriod, onAddTransaction, onOpenDisplay, onNavigate }: { view: View; dashboard: Dashboard; monthLoading: boolean; onChangePeriod: (range: PeriodRange) => void; onAddTransaction: () => void; onOpenDisplay: () => void; onNavigate: (view: View) => void }) {
  const item = NAVIGATION.find((entry) => entry.id === view) ?? NAVIGATION[0];
  const firstName = dashboard.profile.display_name.split(" ")[0];
  const { period } = dashboard;
  // A period that reaches into this month is "now"; anything earlier is a look back.
  const includesNow = period.end >= dashboard.current_month;
  const pastHome = view === "today" && !includesNow;
  const title = view === "today" ? (includesNow ? `${greeting()}, ${firstName}.` : `${period.label} in review`) : item.title;
  const kept = dashboard.totals.cash_flow_cents;
  const saved = period.phrase === "this month"
    ? (kept >= 0 ? `you’re on track to save ${cad(kept)}` : `you’re ${cad(-kept)} over`)
    : (kept >= 0 ? `you kept ${cad(kept)}` : `you spent ${cad(-kept)} more than you earned`);
  const summary = `You have ${cad(dashboard.home.available_cents)} available and ${saved} ${period.phrase}.`;
  const description = pastHome ? `Looking back at ${period.label}. Balances and goals show today’s values.` : view === "today" ? summary : item.description;
  const showMonth = MONTH_VIEWS.includes(view);
  const showAdd = view === "today" || view === "spending";
  return (
    <header className="sticky top-0 z-20 border-b border-line/70 bg-canvas/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-10 lg:py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark className="size-9 lg:hidden" />
            <div className="min-w-0">
              <h1 id="page-title" tabIndex={-1} className="truncate text-lg font-semibold tracking-tight text-ink focus:outline-none sm:text-2xl">{title}</h1>
              <p className="hidden text-sm text-ink-subtle sm:line-clamp-2">{description}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {showAdd && (
              <Button onClick={onAddTransaction} className="shrink-0">
                <Plus className="size-4" aria-hidden="true" /><span className="sm:hidden">Add</span><span className="hidden sm:inline">Add transaction</span>
              </Button>
            )}
            <SettingsMenu onOpenDisplay={onOpenDisplay} onNavigate={onNavigate} />
          </div>
        </div>
        {showMonth ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <PeriodPicker dashboard={dashboard} loading={monthLoading} onChange={onChangePeriod} />
            {dashboard.profile.is_fictional && <Badge tone="gold">Fictional data</Badge>}
          </div>
        ) : (
          <p className="mt-1 text-xs text-ink-subtle sm:hidden">{formatMonth(dashboard.current_month)}{dashboard.profile.is_fictional ? " · Fictional data" : ""}</p>
        )}
        {pastHome && <p className="mt-2 text-xs text-ink-subtle sm:hidden">Looking back at a past month. Balances and goals show today’s values.</p>}
      </div>
    </header>
  );
}

/** Account summary for small screens, where the sidebar is hidden. */
export function MobileAccount({ dashboard }: { dashboard: Dashboard }) {
  return (
    <div className="space-y-3 lg:hidden">
      <AccountSummary dashboard={dashboard} />
    </div>
  );
}
