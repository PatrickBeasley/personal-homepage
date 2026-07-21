import { NextResponse, type NextRequest } from "next/server";

import { requireAdminAuth } from "@/lib/auth/admin-guard";
import {
  CATEGORY_COLUMNS,
  CATEGORY_NAME_MAX_LENGTH,
  FOREIGN_KEY_VIOLATION,
  UNIQUE_VIOLATION,
  apiError,
  isUuid,
  listCategorySiblings,
  normalizeCategoryName,
  postgresErrorCode,
  readJsonObject,
  type DashboardSupabaseClient,
} from "@/lib/dashboard/api";
import type { Category } from "@/lib/dashboard/types";

/** How many links and notes point at a category. Null when a count query failed. */
async function countReferences(
  supabase: DashboardSupabaseClient,
  categoryId: string
): Promise<{ links: number; notes: number } | null> {
  const [linksResult, notesResult] = await Promise.all([
    supabase
      .from("dashboard_links")
      .select("id", { count: "exact", head: true })
      .eq("category_id", categoryId),
    supabase
      .from("dashboard_notes")
      .select("id", { count: "exact", head: true })
      .eq("category_id", categoryId),
  ]);

  if (linksResult.error || notesResult.error) {
    console.error("Category reference count error:", linksResult.error ?? notesResult.error);
    return null;
  }

  return { links: linksResult.count ?? 0, notes: notesResult.count ?? 0 };
}

/** "3 links and 1 note" — the reason a delete was refused, in words. */
function describeReferences(links: number, notes: number): string {
  const parts: string[] = [];

  if (links > 0) {
    parts.push(`${links} ${links === 1 ? "link" : "links"}`);
  }

  if (notes > 0) {
    parts.push(`${notes} ${notes === 1 ? "note" : "notes"}`);
  }

  return parts.join(" and ");
}

/**
 * PATCH /api/categories/[id]
 * Renames a category. `name` is the only writable field: `ctx` and `kind` decide
 * which list a category belongs to and which items may reference it, so changing
 * either would silently orphan every link or note pointing at it.
 *
 * This endpoint is a deliberate addition to the design, which has no rename.
 * Deleting an in-use category is refused, so without rename a typo in a category
 * that already has items would be unfixable from the UI.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdminAuth(request);
  if (authResult.error) {
    return authResult.error;
  }

  const { supabase } = authResult;
  const { id } = await params;

  if (!isUuid(id)) {
    return apiError("NOT_FOUND", "No category with that id.", 404);
  }

  const body = await readJsonObject(request);

  if (!body) {
    return apiError("INVALID_BODY", "Request body must be a JSON object.", 400);
  }

  const trimmedName = normalizeCategoryName(body.name);

  if (!trimmedName) {
    return apiError(
      "INVALID_BODY",
      `name must be a non-empty string of at most ${CATEGORY_NAME_MAX_LENGTH} characters.`,
      400
    );
  }

  const { data: existing, error: readError } = await supabase
    .from("dashboard_categories")
    .select(CATEGORY_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (readError) {
    console.error("Category read error:", readError);
    return apiError("SERVER_ERROR", "Could not load the category.", 500);
  }

  if (!existing) {
    return apiError("NOT_FOUND", "No category with that id.", 404);
  }

  const current: Category = existing;

  // Saving an unchanged name is a no-op, not a conflict with itself.
  if (current.name === trimmedName) {
    return NextResponse.json(current, { status: 200 });
  }

  const siblings = await listCategorySiblings(supabase, current.ctx, current.kind);

  if (!siblings) {
    return apiError("SERVER_ERROR", "Could not rename the category.", 500);
  }

  // Self is excluded by id, not by name: changing only the letter case of a
  // category's own name is a legitimate rename.
  const duplicate = siblings.some(
    (sibling) =>
      sibling.id !== current.id && sibling.name.toLowerCase() === trimmedName.toLowerCase()
  );

  if (duplicate) {
    return apiError("CONFLICT", `“${trimmedName}” already exists in this list.`, 409);
  }

  const { data, error } = await supabase
    .from("dashboard_categories")
    .update({ name: trimmedName })
    .eq("id", id)
    .select(CATEGORY_COLUMNS)
    .maybeSingle();

  if (error) {
    if (postgresErrorCode(error) === UNIQUE_VIOLATION) {
      return apiError("CONFLICT", `“${trimmedName}” already exists in this list.`, 409);
    }

    console.error("Category update error:", error);
    return apiError("SERVER_ERROR", "Could not rename the category.", 500);
  }

  if (!data) {
    return apiError("NOT_FOUND", "No category with that id.", 404);
  }

  const category: Category = data;

  return NextResponse.json(category, { status: 200 });
}

/**
 * DELETE /api/categories/[id]
 * Refused with a 409 in two cases, both of which the user can act on and so are
 * given their own codes and a message naming the reason:
 *
 * - `LAST_CATEGORY` — it is the only category left in its workspace/kind list.
 *   Links and Notes need somewhere to put a new item, and the design says the
 *   same ("Keep at least one", line 610).
 * - `CATEGORY_IN_USE` — links or notes still reference it. The foreign key is
 *   `on delete restrict`, so this is checked up front to produce a useful count,
 *   and the resulting `23503` is caught as well for the concurrent case.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdminAuth(request);
  if (authResult.error) {
    return authResult.error;
  }

  const { supabase } = authResult;
  const { id } = await params;

  if (!isUuid(id)) {
    return apiError("NOT_FOUND", "No category with that id.", 404);
  }

  const { data: existing, error: readError } = await supabase
    .from("dashboard_categories")
    .select(CATEGORY_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (readError) {
    console.error("Category read error:", readError);
    return apiError("SERVER_ERROR", "Could not load the category.", 500);
  }

  if (!existing) {
    return apiError("NOT_FOUND", "No category with that id.", 404);
  }

  const current: Category = existing;

  const siblings = await listCategorySiblings(supabase, current.ctx, current.kind);

  if (!siblings) {
    return apiError("SERVER_ERROR", "Could not delete the category.", 500);
  }

  if (siblings.length <= 1) {
    return apiError(
      "LAST_CATEGORY",
      `“${current.name}” is the only ${current.kind} category left for ${current.ctx}. Add another one first.`,
      409
    );
  }

  const references = await countReferences(supabase, id);

  if (!references) {
    return apiError("SERVER_ERROR", "Could not delete the category.", 500);
  }

  if (references.links > 0 || references.notes > 0) {
    return apiError(
      "CATEGORY_IN_USE",
      `“${current.name}” is still used by ${describeReferences(references.links, references.notes)}. Move or delete them first.`,
      409
    );
  }

  const { data, error } = await supabase
    .from("dashboard_categories")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    // Something was filed under this category between the count and the delete.
    if (postgresErrorCode(error) === FOREIGN_KEY_VIOLATION) {
      return apiError(
        "CATEGORY_IN_USE",
        `“${current.name}” is still in use. Move or delete the items filed under it first.`,
        409
      );
    }

    console.error("Category delete error:", error);
    return apiError("SERVER_ERROR", "Could not delete the category.", 500);
  }

  if (!data) {
    return apiError("NOT_FOUND", "No category with that id.", 404);
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
