import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Resolves the Project-GSD API key from the gsd_config row, through the
 * caller's session-scoped client — every GSD call site is already behind
 * requireAdminAuth or the dashboard layout guard, so RLS admits exactly the
 * sessions that may use the key.
 *
 * Returns null when unconfigured. A query error also resolves to null (and
 * is logged) so callers surface the same not-configured state instead of a
 * fake server fault; the Settings card is the remedy either way.
 *
 * Isolated in its own module so lib/gsd/client.test.ts can stub this one
 * seam (vi.mock) without importing Supabase mocks. Nothing here may log the
 * key value.
 */
export async function resolveGsdKey(): Promise<string | null> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("gsd_config")
    .select("api_key")
    .maybeSingle();

  if (error) {
    // The Supabase error object; never the key.
    console.error("GSD key lookup error:", error);
    return null;
  }

  return data?.api_key ?? null;
}
