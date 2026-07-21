import type { Metadata } from "next";

import SettingsView from "@/components/dashboard/settings/settings-view";
import { CATEGORY_COLUMNS } from "@/lib/dashboard/api";
import type { Category } from "@/lib/dashboard/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  // The dashboard layout has already established that the caller is the admin,
  // and RLS restricts this table to that same identity.
  const supabase = await createServerSupabaseClient();

  // Unlike Links and Notes, this page never filters by workspace: the design
  // renders a Work card and a Home card side by side, so the whole table is the
  // payload rather than a per-workspace slice.
  const { data, error } = await supabase
    .from("dashboard_categories")
    .select(CATEGORY_COLUMNS)
    .order("ctx", { ascending: true })
    .order("kind", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Settings page load error:", error);

    return (
      <section className="rounded-2xl border border-border bg-surface p-5 shadow">
        <h2 className="font-heading text-[17px] font-semibold">Categories &amp; Types</h2>
        <p className="mt-2 text-sm text-text-2">
          Categories could not be loaded. Reload the page — if it keeps failing, the dashboard
          tables are unavailable.
        </p>
      </section>
    );
  }

  const categories: Category[] = data ?? [];

  return <SettingsView initialCategories={categories} />;
}
