"use client";

import { useSyncExternalStore } from "react";

const SUN_PATH =
  "M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4";
const MOON_PATH = "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z";

export type Theme = "dark" | "light";

function SunIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d={SUN_PATH} />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={MOON_PATH} />
    </svg>
  );
}

// <html data-theme> is the source of truth: the pre-hydration script in
// app/layout.tsx sets it before React runs. Reading it through an external
// store keeps the hydration render on the server default ("dark") and lets
// React re-sync afterwards without a setState-in-effect cascade.
const THEME_CHANGE_EVENT = "pb:themechange";

function subscribeToTheme(onStoreChange: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange);
}

function getThemeSnapshot(): Theme {
  return document.documentElement.getAttribute("data-theme") === "light"
    ? "light"
    : "dark";
}

function getServerThemeSnapshot(): Theme {
  return "dark";
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getServerThemeSnapshot
  );
}

export function setTheme(next: Theme) {
  document.documentElement.setAttribute("data-theme", next);
  try {
    window.localStorage.setItem("theme", next);
  } catch {
    // localStorage may be unavailable (private mode, disabled storage) — theme still applies for this load.
  }
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

/**
 * The public header and the dashboard header render this button at different
 * sizes; `className` carries the size/radius, the shared logic stays here so
 * both surfaces toggle the theme exactly the same way.
 */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useTheme();

  // The icon shows the theme you would switch *to*, so the accessible name
  // names that action. Deliberately no aria-pressed: ARIA requires a toggle
  // button's name to stay stable across presses, which rules out pairing it
  // with an action-based name like this one.
  const toggleLabel = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";

  return (
    <button
      type="button"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label={toggleLabel}
      title={toggleLabel}
      className={`grid cursor-pointer place-items-center border border-border bg-surface text-text ${className}`}
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
