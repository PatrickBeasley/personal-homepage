import type { Metadata } from "next";

import LinksView from "@/components/dashboard/links/links-view";
import { CATEGORY_COLUMNS, LINK_COLUMNS } from "@/lib/dashboard/api";
import type { Category, LinkItem } from "@/lib/dashboard/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Links",
};

export default async function LinksPage() {
  // The dashboard layout has already established that the caller is the admin,
  // and RLS restricts these tables to that same identity.
  const supabase = await createServerSupabaseClient();

  // Both workspaces come back in one pass: a single admin with a handful of
  // rows, so switching workspaces in the client is a filter, not a refetch.
  const [linksResult, categoriesResult] = await Promise.all([
    supabase
      .from("dashboard_links")
      .select(LINK_COLUMNS)
      .order("sort_order", { ascending: true }),
    supabase
      .from("dashboard_categories")
      .select(CATEGORY_COLUMNS)
      .order("sort_order", { ascending: true }),
  ]);

  if (linksResult.error || categoriesResult.error) {
    console.error("Links page load error:", linksResult.error ?? categoriesResult.error);

    return (
      <section className="rounded-2xl border border-border bg-surface p-5 shadow">
        <h2 className="font-heading text-[17px] font-semibold">Links</h2>
        <p className="mt-2 text-sm text-text-2">
          Links could not be loaded. Reload the page — if it keeps failing, the dashboard
          tables are unavailable.
        </p>
      </section>
    );
  }

  const links: LinkItem[] = linksResult.data ?? [];
  const categories: Category[] = categoriesResult.data ?? [];

  return <LinksView initialLinks={links} categories={categories} />;
}
