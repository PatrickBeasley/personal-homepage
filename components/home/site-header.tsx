"use client";

import { useSyncExternalStore } from "react";

const SUN_PATH =
  "M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4";
const MOON_PATH = "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z";

type Theme = "dark" | "light";

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

const NAV_LINKS = [
  { href: "#about", label: "About" },
  { href: "#projects", label: "Projects" },
  { href: "#contact", label: "Contact" },
];

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

export default function SiteHeader() {
  const theme = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getServerThemeSnapshot
  );

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      window.localStorage.setItem("theme", next);
    } catch {
      // localStorage may be unavailable (private mode, disabled storage) — theme still applies for this load.
    }
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }

  // The icon shows the theme you would switch *to*, so the accessible name
  // names that action. Deliberately no aria-pressed: ARIA requires a toggle
  // button's name to stay stable across presses, which rules out pairing it
  // with an action-based name like this one.
  const toggleLabel = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";

  return (
    <header
      className="pb-pad sticky top-0 z-40 flex items-center justify-between gap-5 border-b border-border px-[44px] py-4"
      style={{
        paddingTop: "calc(16px + env(safe-area-inset-top))",
        background: "color-mix(in srgb, var(--bg) 82%, transparent)",
        backdropFilter: "blur(16px)",
      }}
    >
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-[10px] bg-accent font-mono text-[15px] font-semibold text-white shadow">
          PB
        </div>
        <span className="font-heading text-[16px] font-semibold tracking-[-0.01em]">
          Patrick Beasley
        </span>
      </div>

      <nav
        id="pb-homelinks"
        className="flex items-center gap-[30px] text-sm font-medium text-text-2"
      >
        {NAV_LINKS.map((link) => (
          <a key={link.href} href={link.href} className="text-text-2 hover:text-accent">
            {link.label}
          </a>
        ))}
      </nav>

      <div className="flex items-center gap-[10px]">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={toggleLabel}
          title={toggleLabel}
          className="grid h-[38px] w-[38px] cursor-pointer place-items-center rounded-[10px] border border-border bg-surface text-text"
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
        <a
          href="/login?next=%2Fdashboard"
          className="flex h-[38px] cursor-pointer items-center rounded-[10px] bg-accent px-[18px] text-sm font-semibold text-white shadow hover:text-white"
        >
          Login →
        </a>
      </div>
    </header>
  );
}
