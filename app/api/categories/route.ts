import { NextResponse, type NextRequest } from "next/server";

import { requireAdminAuth } from "@/lib/auth/admin-guard";
import {
  CATEGORY_COLUMNS,
  CATEGORY_NAME_MAX_LENGTH,
  UNIQUE_VIOLATION,
  apiError,
  listCategorySiblings,
  normalizeCategoryName,
  postgresErrorCode,
  readJsonObject,
} from "@/lib/dashboard/api";
import { isCategoryKind, isCtx, type Category } from "@/lib/dashboard/types";

/**
 * GET /api/categories
 * Returns every category for both workspaces and both kinds. The row count is
 * tiny and the dashboard needs the whole set to render its filters, so the
 * client slices by ctx and kind rather than asking the server per view.
 *
 * The Settings section is the one consumer that slices by neither: it shows
 * both workspaces side by side.
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

/**
 * POST /api/categories
 * Creates a category in one workspace/kind list. `sort_order` is appended to the
 * end of that list — the lists are hand-curated and short, so "newest last" is
 * the only ordering rule there is.
 *
 * Duplicates are rejected case-insensitively, matching the design's `addCat`
 * (design/patrick-beasley.dc.html line 608). The database's
 * `unique (ctx, kind, name)` is case-sensitive, so it is a backstop for the
 * concurrent case, not the primary check.
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAdminAuth(request);
  if (authResult.error) {
    return authResult.error;
  }

  const { supabase } = authResult;
  const body = await readJsonObject(request);

  if (!body) {
    return apiError("INVALID_BODY", "Request body must be a JSON object.", 400);
  }

  const { ctx, kind, name } = body;

  if (!isCtx(ctx)) {
    return apiError("INVALID_CTX", "ctx must be either \"work\" or \"home\".", 400);
  }

  if (!isCategoryKind(kind)) {
    return apiError("INVALID_BODY", "kind must be either \"link\" or \"note\".", 400);
  }

  const trimmedName = normalizeCategoryName(name);

  if (!trimmedName) {
    return apiError(
      "INVALID_BODY",
      `name must be a non-empty string of at most ${CATEGORY_NAME_MAX_LENGTH} characters.`,
      400
    );
  }

  const siblings = await listCategorySiblings(supabase, ctx, kind);

  if (!siblings) {
    return apiError("SERVER_ERROR", "Could not save the category.", 500);
  }

  if (siblings.some((sibling) => sibling.name.toLowerCase() === trimmedName.toLowerCase())) {
    return apiError("CONFLICT", `“${trimmedName}” already exists in this list.`, 409);
  }

  // Max, not length: a future delete would otherwise make the next insert
  // collide with an existing position.
  const nextSortOrder =
    siblings.reduce((highest, sibling) => Math.max(highest, sibling.sort_order), -1) + 1;

  const { data, error } = await supabase
    .from("dashboard_categories")
    .insert({ ctx, kind, name: trimmedName, sort_order: nextSortOrder })
    .select(CATEGORY_COLUMNS)
    .single();

  if (error || !data) {
    if (postgresErrorCode(error) === UNIQUE_VIOLATION) {
      return apiError("CONFLICT", `“${trimmedName}” already exists in this list.`, 409);
    }

    console.error("Category create error:", error);
    return apiError("SERVER_ERROR", "Could not save the category.", 500);
  }

  const category: Category = data;

  return NextResponse.json(category, { status: 201 });
}
