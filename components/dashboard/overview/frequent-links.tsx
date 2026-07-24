"use client";

import OverviewCard from "@/components/dashboard/overview/overview-card";
import { useWorkspace } from "@/components/dashboard/workspace-context";
import { selectFrequentLinks } from "@/lib/dashboard/link-order";
import { recordLinkClick } from "@/lib/dashboard/record-click";
import type { LinkItem } from "@/lib/dashboard/types";

const LIMIT = 5;

/** Host label for the sub-line, mirroring the Links section's presentation. */
function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Workspace-scoped top-5 most-clicked links. Both workspaces arrive as props;
 * the Work/Home toggle is a re-filter, not a refetch — the Overview pattern.
 */
export default function FrequentLinks({
  workLinks,
  homeLinks,
}: {
  workLinks: LinkItem[];
  homeLinks: LinkItem[];
}) {
  const { workspace } = useWorkspace();
  const links = selectFrequentLinks(workspace === "work" ? workLinks : homeLinks, LIMIT);

  return (
    <OverviewCard title="Frequent links" meta={`${workspace} · most used`} href="/dashboard/links">
      {links.length === 0 ? (
        <p className="px-5 py-[18px] text-sm text-text-2">
          Your most-used links will show here once you start clicking.
        </p>
      ) : (
        <ul className="m-0 list-none p-0">
          {links.map((link) => (
            <li key={link.id} className="border-b border-border last:border-b-0">
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => recordLinkClick(link.id)}
                className="flex items-center gap-3 px-5 py-[13px] hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-text">
                    {link.title}
                  </span>
                  <span className="block truncate font-mono text-[11px] text-muted">
                    {hostLabel(link.url)}
                  </span>
                </span>
                <span
                  aria-label={`${link.click_count} clicks`}
                  className="flex flex-none items-center gap-[5px] rounded-[20px] border border-transparent bg-accent-soft px-[9px] py-[3px] font-mono text-[11px] tabular-nums text-accent"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    width="11"
                    height="11"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 4l7 16 2-7 7-2z" />
                  </svg>
                  {link.click_count}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </OverviewCard>
  );
}
