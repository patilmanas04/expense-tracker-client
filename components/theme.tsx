"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";

export type Theme = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "folio-theme";
const THEME_COLORS: Record<ResolvedTheme, string> = { light: "#f4f4f5", dark: "#0c0c0f" };

/** Inlined in the root layout so the right theme is on <html> before anything paints. */
export const THEME_BOOTSTRAP =
  `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");` +
  `var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);` +
  `document.documentElement.dataset.theme=d?"dark":"light"}catch(e){}})()`;

/* A tiny external store: the saved choice plus the OS preference. */
const listeners = new Set<() => void>();
let override: Theme | null = null; // in case storage is unavailable (private mode)

function subscribe(listener: () => void) {
  listeners.add(listener);
  const media = matchMedia("(prefers-color-scheme: dark)");
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) listener(); // changed in another tab
  };
  media.addEventListener("change", listener);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", listener);
    window.removeEventListener("storage", onStorage);
  };
}

function readTheme(): Theme {
  if (override) return override;
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

const readSystem = (): ResolvedTheme => (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

interface ThemeContextValue {
  theme: Theme;
  resolved: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "system" as Theme);
  const system = useSyncExternalStore(subscribe, readSystem, () => "light" as ResolvedTheme);
  // false during server render and hydration, true once the real snapshots are in use
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const resolved: ResolvedTheme = theme === "system" ? system : theme;

  useEffect(() => {
    if (!hydrated) return; // the bootstrap script already set it; don't flash the server default
    document.documentElement.dataset.theme = resolved;
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
      meta.content = THEME_COLORS[resolved];
    });
  }, [hydrated, resolved]);

  const setTheme = useCallback((next: Theme) => {
    override = next;
    try {
      if (next === "system") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
      override = null;
    } catch {
      // storage blocked: the choice still applies until the page is closed
    }
    listeners.forEach((listener) => listener());
  }, []);

  const value = useMemo(() => ({ theme, resolved, setTheme }), [theme, resolved, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside <ThemeProvider>");
  return value;
}
