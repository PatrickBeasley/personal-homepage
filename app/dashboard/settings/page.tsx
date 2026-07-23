import type { Metadata } from "next";

import GsdKeyCard from "@/components/dashboard/settings/gsd-key-card";
import SettingsView from "@/components/dashboard/settings/settings-view";
import { CATEGORY_COLUMNS } from "@/lib/dashboard/api";
import type { Category, GsdKeyStatus } from "@/lib/dashboard/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  // The dashboard layout has already established that the caller is the admin,
  // and RLS restricts these tables to that same identity.
  const supabase = await createServerSupabaseClient();

  // Unlike Links and Notes, this page never filters by workspace: the design
  // renders a Work card and a Home card side by side, so the whole table is the
  // payload rather than a per-workspace slice.
  const [categoriesResult, keyResult] = await Promise.all([
    supabase
      .from("dashboard_categories")
      .select(CATEGORY_COLUMNS)
      .order("ctx", { ascending: true })
      .order("kind", { ascending: true })
      .order("sort_order", { ascending: true }),
    // Status only — key_last4/updated_at. The api_key column is never read
    // for display anywhere in the app.
    supabase.from("gsd_config").select("key_last4, updated_at").maybeSingle(),
  ]);

  if (categoriesResult.error) {
    console.error("Settings page load error:", categoriesResult.error);

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

  // A failed status read is non-fatal: the card starts as "not connected" and
  // the routes report real errors on any action.
  if (keyResult.error) {
    console.error("Settings GSD key status error:", keyResult.error);
  }

  const categories: Category[] = categoriesResult.data ?? [];
  const keyStatus: GsdKeyStatus = {
    configured: !keyResult.error && keyResult.data !== null,
    last4: keyResult.data?.key_last4 ?? null,
    updated_at: keyResult.data?.updated_at ?? null,
  };

  return (
    <>
      <SettingsView initialCategories={categories} />
      <GsdKeyCard initialStatus={keyStatus} />
    </>
  );
}
