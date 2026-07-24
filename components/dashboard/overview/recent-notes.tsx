"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import OverviewCard from "@/components/dashboard/overview/overview-card";
import { useWorkspace } from "@/components/dashboard/workspace-context";
import { noteSnippet, relativeTime } from "@/lib/dashboard/overview";
import type { NoteItem } from "@/lib/dashboard/types";

/**
 * Workspace-scoped (unlike the tasks card): both workspaces arrive as props,
 * so the Work/Home toggle is a re-filter, not a refetch — the Notes page's
 * own pattern.
 */
export default function RecentNotes({
  workNotes,
  homeNotes,
}: {
  workNotes: NoteItem[];
  homeNotes: NoteItem[];
}) {
  const { workspace } = useWorkspace();
  const notes = workspace === "work" ? workNotes : homeNotes;

  // Relative times read the clock, which the server render cannot share —
  // same sanctioned clock-read-in-effect as tasks-view. Pills appear one
  // frame after hydration; the rows themselves render immediately.
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    // Same hydration-safe clock read as tasks-brief-view.tsx / tasks-view.tsx;
    // only caught here because the component is small enough for the compiler
    // to fully analyze.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNowMs(Date.now());
  }, []);

  return (
    <OverviewCard title="Recent notes" meta={`${workspace} · by last edit`} href="/dashboard/notes">
      {notes.length === 0 ? (
        <p className="px-5 py-[18px] text-sm text-text-2">No notes in this workspace yet.</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {notes.map((note) => (
            <li key={note.id} className="border-b border-border last:border-b-0">
              <Link
                href="/dashboard/notes"
                className="flex items-center gap-3 px-5 py-[13px] hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-text">
                    {note.title || "Untitled"}
                  </span>
                  <span className="block truncate text-xs text-text-2">
                    {noteSnippet(note.content_html)}
                  </span>
                </span>
                {nowMs === null ? null : (
                  <span className="flex-none rounded-full bg-surface-2 px-[10px] py-[3px] font-mono text-[11px] text-muted">
                    {relativeTime(note.updated_at, nowMs)}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </OverviewCard>
  );
}
