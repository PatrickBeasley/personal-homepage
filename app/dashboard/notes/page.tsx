import type { Metadata } from "next";

import NotesView from "@/components/dashboard/notes/notes-view";
import { CATEGORY_COLUMNS, NOTE_COLUMNS } from "@/lib/dashboard/api";
import type { Category, NoteItem } from "@/lib/dashboard/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Notes",
};

export default async function NotesPage() {
  // The dashboard layout has already established that the caller is the admin,
  // and RLS restricts these tables to that same identity.
  const supabase = await createServerSupabaseClient();

  // Both workspaces come back in one pass: a single admin with a handful of
  // rows, so switching workspaces in the client is a filter, not a refetch.
  // Notes sort by `updated_at` — the design's "Recent" for this section is most
  // recently edited, not most recently created.
  const [notesResult, categoriesResult] = await Promise.all([
    supabase
      .from("dashboard_notes")
      .select(NOTE_COLUMNS)
      .order("updated_at", { ascending: false }),
    supabase
      .from("dashboard_categories")
      .select(CATEGORY_COLUMNS)
      .order("sort_order", { ascending: true }),
  ]);

  if (notesResult.error || categoriesResult.error) {
    console.error("Notes page load error:", notesResult.error ?? categoriesResult.error);

    return (
      <section className="rounded-2xl border border-border bg-surface p-5 shadow">
        <h2 className="font-heading text-[17px] font-semibold">Notes</h2>
        <p className="mt-2 text-sm text-text-2">
          Notes could not be loaded. Reload the page — if it keeps failing, the dashboard
          tables are unavailable.
        </p>
      </section>
    );
  }

  const notes: NoteItem[] = notesResult.data ?? [];
  const categories: Category[] = categoriesResult.data ?? [];

  return <NotesView initialNotes={notes} categories={categories} />;
}
