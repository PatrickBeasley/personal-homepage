import type { Metadata } from "next";

import DocumentsView from "@/components/dashboard/documents/documents-view";
import { FILE_COLUMNS } from "@/lib/dashboard/files";
import type { DocumentItem } from "@/lib/dashboard/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Documents",
};

export default async function DocumentsPage() {
  // The dashboard layout has already established that the caller is the admin,
  // and RLS restricts `files_metadata` to that same identity.
  const supabase = await createServerSupabaseClient();

  // One flat list. `files_metadata` has no `ctx` column — documents are not
  // workspace-scoped, so unlike Links there is nothing to split by workspace.
  const { data, error } = await supabase
    .from("files_metadata")
    .select(FILE_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Documents page load error:", error);

    return (
      <section className="rounded-2xl border border-border bg-surface p-5 shadow">
        <h2 className="font-heading text-[17px] font-semibold">Documents</h2>
        <p className="mt-2 text-sm text-text-2">
          Documents could not be loaded. Reload the page — if it keeps failing, the file
          metadata table is unavailable.
        </p>
      </section>
    );
  }

  const documents: DocumentItem[] = data ?? [];

  return <DocumentsView initialDocuments={documents} />;
}
