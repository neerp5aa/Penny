"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";

export type ThemeSetting = "light" | "dark" | "system";
export type Density = "simple" | "compact" | "detailed";

const THEME_KEY = "penny-theme";
const DENSITY_KEY = "penny-density";

export const DENSITY_OPTIONS: { value: Density; label: string; description: string }[] = [
  { value: "simple", label: "Simple", description: "Just the essentials, in big, clear numbers." },
  { value: "compact", label: "Compact", description: "Everything, packed tighter so you scroll less." },
  { value: "detailed", label: "Detailed", description: "Every chart and breakdown, with room to breathe." },
];
export const THEME_OPTIONS: { value: ThemeSetting; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Match device" },
];

/**
 * Runs inline in <head> before React hydrates, so the saved theme and layout apply on
 * the very first paint (no flash). Keep it dependency-free and tolerant of blocked storage.
 */
export const PREFERENCES_BOOT_SCRIPT = `(() => {
  const root = document.documentElement;
  let theme = "system", density = "detailed";
  try { theme = localStorage.getItem("${THEME_KEY}") || theme; density = localStorage.getItem("${DENSITY_KEY}") || density; } catch {}
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  root.dataset.theme = dark ? "dark" : "light";
  root.dataset.density = ["simple", "compact", "detailed"].includes(density) ? density : "detailed";
})();`;

type Preferences = {
  theme: ThemeSetting;
  resolvedTheme: "light" | "dark";
  density: Density;
  setTheme: (theme: ThemeSetting) => void;
  setDensity: (density: Density) => void;
};

const PreferencesContext = createContext<Preferences | null>(null);

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string) {
  try { window.localStorage.setItem(key, value); } catch { /* storage blocked: keep the in-memory choice */ }
}

/** Briefly enables colour transitions so a manual theme switch cross-fades instead of snapping. */
function withThemeTransition(apply: () => void) {
  const root = document.documentElement;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { apply(); return; }
  root.classList.add("theme-transition");
  apply();
  window.setTimeout(() => root.classList.remove("theme-transition"), 250);
}

const DARK_QUERY = "(prefers-color-scheme: dark)";
const subscribeToSystemTheme = (onChange: () => void) => {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  // The boot script has already applied these; reading them lazily keeps React in agreement.
  const [theme, setThemeState] = useState<ThemeSetting>(() => (typeof window === "undefined" ? "system" : read(THEME_KEY, ["light", "dark", "system"] as const, "system")));
  const [density, setDensityState] = useState<Density>(() => (typeof window === "undefined" ? "detailed" : read(DENSITY_KEY, ["simple", "compact", "detailed"] as const, "detailed")));
  const systemDark = useSyncExternalStore(subscribeToSystemTheme, () => window.matchMedia(DARK_QUERY).matches, () => false);

  const resolvedTheme = theme === "system" ? (systemDark ? "dark" : "light") : theme;

  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.theme !== resolvedTheme) withThemeTransition(() => { root.dataset.theme = resolvedTheme; });
  }, [resolvedTheme]);

  useEffect(() => {
    document.documentElement.dataset.density = density;
  }, [density]);

  const setTheme = useCallback((value: ThemeSetting) => { write(THEME_KEY, value); setThemeState(value); }, []);
  const setDensity = useCallback((value: Density) => { write(DENSITY_KEY, value); setDensityState(value); }, []);

  const value = useMemo(() => ({ theme, resolvedTheme, density, setTheme, setDensity }), [theme, resolvedTheme, density, setTheme, setDensity]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): Preferences {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error("usePreferences must be used inside PreferencesProvider");
  return value;
}
