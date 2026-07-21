"use client";

import { FeedIcon } from "@/components/dashboard/icons";
import { useToast } from "@/components/dashboard/toast";

// The design's placeholder feed cards, verbatim. Nothing here connects to
// anything yet — the buttons exist to show the shape of the extension point.
const FEED_CARDS = [
  { glyph: "📡", name: "RSS / Blog", desc: "Pull posts from any feed URL.", action: "Connect" },
  { glyph: "🗓️", name: "Calendar", desc: "Today’s events at a glance.", action: "Connect" },
  { glyph: "🌦️", name: "Weather", desc: "Local forecast widget.", action: "Add" },
  { glyph: "🐙", name: "GitHub", desc: "Recent commits & PRs.", action: "Connect" },
];

export default function FeedsPanel() {
  const showToast = useToast();

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow">
      <div className="flex items-center gap-[10px] border-b border-border px-5 py-[18px]">
        <span className="flex text-accent">
          <FeedIcon />
        </span>
        <h2 className="font-heading text-[17px] font-semibold">Feeds</h2>
        <span className="font-mono text-xs text-muted">extensible</span>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-[14px] p-5">
        {FEED_CARDS.map((card) => (
          <div
            key={card.name}
            className="flex flex-col gap-[10px] rounded-[13px] border border-dashed border-border-2 bg-surface-2 p-[18px] hover:border-solid hover:border-accent"
          >
            <div
              aria-hidden="true"
              className="grid h-10 w-10 place-items-center rounded-[10px] border border-border bg-surface text-xl"
            >
              {card.glyph}
            </div>
            <div>
              <div className="text-sm font-semibold">{card.name}</div>
              <div className="mt-[3px] text-xs leading-[1.5] text-muted">{card.desc}</div>
            </div>
            <button
              type="button"
              onClick={() => showToast(`${card.name} — coming soon`)}
              className="mt-auto h-8 cursor-pointer rounded-lg border border-border bg-surface text-xs font-semibold text-accent"
            >
              {card.action}
              <span className="sr-only"> {card.name}</span>
            </button>
          </div>
        ))}
      </div>

      <div className="px-5 pb-5 text-xs leading-[1.6] text-muted">
        The dashboard reads its widgets from a config list, so adding a new feed type is a
        matter of registering it here — the layout, filtering, and Work/Home separation come
        for free.
      </div>
    </section>
  );
}
