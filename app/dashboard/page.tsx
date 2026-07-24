import type { Metadata } from "next";
import { Suspense } from "react";

import FrequentLinks from "@/components/dashboard/overview/frequent-links";
import OverviewCard from "@/components/dashboard/overview/overview-card";
import RecentNotes from "@/components/dashboard/overview/recent-notes";
import TasksBrief from "@/components/dashboard/overview/tasks-brief";
import TasksBriefSkeleton from "@/components/dashboard/overview/tasks-brief-skeleton";
import { LINK_COLUMNS, NOTE_COLUMNS } from "@/lib/dashboard/api";
import type { LinkItem, NoteItem } from "@/lib/dashboard/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Overview",
};

// Cookie reads and the no-store GSD fetch force this anyway; declared to
// match the Tasks page's explicitness.
export const dynamic = "force-dynamic";

/**
 * Post-login briefing: due & overdue tasks (streamed — GSD is an external
 * call and must not block the page), then recent notes. The notes queries
 * are fast Supabase reads, awaited before first byte; per-workspace limits
 * keep one workspace from starving the other in the client-side re-filter.
 */
export default async function OverviewPage() {
  // The dashboard layout has already established that the caller is the admin.
  const supabase = await createServerSupabaseClient();

  const [workResult, homeResult, workLinksResult, homeLinksResult] = await Promise.all([
    supabase
      .from("dashboard_notes")
      .select(NOTE_COLUMNS)
      .eq("ctx", "work")
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase
      .from("dashboard_notes")
      .select(NOTE_COLUMNS)
      .eq("ctx", "home")
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase
      .from("dashboard_links")
      .select(LINK_COLUMNS)
      .eq("ctx", "work")
      .order("click_count", { ascending: false })
      .limit(5),
    supabase
      .from("dashboard_links")
      .select(LINK_COLUMNS)
      .eq("ctx", "home")
      .order("click_count", { ascending: false })
      .limit(5),
  ]);

  const notesError = workResult.error ?? homeResult.error;

  if (notesError) {
    console.error("Overview notes load error:", notesError);
  }

  const workNotes: NoteItem[] = workResult.data ?? [];
  const homeNotes: NoteItem[] = homeResult.data ?? [];

  if (workLinksResult.error || homeLinksResult.error) {
    console.error(
      "Overview links load error:",
      workLinksResult.error ?? homeLinksResult.error
    );
  }

  const workLinks: LinkItem[] = workLinksResult.data ?? [];
  const homeLinks: LinkItem[] = homeLinksResult.data ?? [];

  return (
    <>
      <OverviewCard title="Needs attention" meta="project-gsd" href="/dashboard/tasks">
        <Suspense fallback={<TasksBriefSkeleton />}>
          <TasksBrief />
        </Suspense>
      </OverviewCard>

      {notesError ? (
        <section className="rounded-2xl border border-border bg-surface p-5 shadow">
          <h2 className="font-heading text-[17px] font-semibold">Recent notes</h2>
          <p className="mt-2 text-sm text-text-2">
            Notes could not be loaded. Reload the page — if it keeps failing, the dashboard
            tables are unavailable.
          </p>
        </section>
      ) : (
        <RecentNotes workNotes={workNotes} homeNotes={homeNotes} />
      )}

      <FrequentLinks workLinks={workLinks} homeLinks={homeLinks} />
    </>
  );
}
