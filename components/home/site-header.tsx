"use client";

import ThemeToggle from "@/components/theme-toggle";

const NAV_LINKS = [
  { href: "#about", label: "About" },
  { href: "#projects", label: "Projects" },
  { href: "#contact", label: "Contact" },
];

export default function SiteHeader() {
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
        <ThemeToggle className="h-[38px] w-[38px] rounded-[10px]" />
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
