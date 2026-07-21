import { NextResponse, type NextRequest } from "next/server";

import { requireAdminAuth } from "@/lib/auth/admin-guard";
import { CATEGORY_COLUMNS, apiError } from "@/lib/dashboard/api";
import type { Category } from "@/lib/dashboard/types";

/**
 * GET /api/categories
 * Returns every category for both workspaces and both kinds. The row count is
 * tiny and the dashboard needs the whole set to render its filters, so the
 * client slices by ctx and kind rather than asking the server per view.
 *
 * Writes (POST/PATCH/DELETE) arrive with the Settings section in a later phase.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAdminAuth(request);
  if (authResult.error) {
    return authResult.error;
  }

  const { supabase } = authResult;

  const { data, error } = await supabase
    .from("dashboard_categories")
    .select(CATEGORY_COLUMNS)
    .order("ctx", { ascending: true })
    .order("kind", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Categories list error:", error);
    return apiError("SERVER_ERROR", "Could not load categories.", 500);
  }

  const categories: Category[] = data ?? [];

  return NextResponse.json({ categories }, { status: 200 });
}
