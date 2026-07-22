import { NextResponse, type NextRequest } from "next/server";

import { requireAdminAuth } from "@/lib/auth/admin-guard";
import {
  LINK_COLUMNS,
  apiError,
  findMatchingCategory,
  isUuid,
  normalizeUrl,
  readJsonObject,
} from "@/lib/dashboard/api";
import { isCtx, type Ctx, type LinkItem } from "@/lib/dashboard/types";

/** Only the columns PATCH is allowed to write; every key is optional. */
interface LinkUpdate {
  ctx?: Ctx;
  title?: string;
  url?: string;
  description?: string | null;
  category_id?: string;
  pinned?: boolean;
}

/**
 * PATCH /api/links/[id]
 * Partial update. Any field that is present is validated by the same rules as
 * POST; absent fields are left untouched.
 *
 * `ctx` and `category_id` are validated together against their *effective*
 * values, so moving a link between workspaces without also moving its category
 * (or vice versa) is rejected rather than silently storing a mismatched pair.
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
    return apiError("NOT_FOUND", "No link with that id.", 404);
  }

  const body = await readJsonObject(request);

  if (!body) {
    return apiError("INVALID_BODY", "Request body must be a JSON object.", 400);
  }

  const { data: existing, error: readError } = await supabase
    .from("dashboard_links")
    .select(LINK_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (readError) {
    console.error("Link read error:", readError);
    return apiError("SERVER_ERROR", "Could not load the link.", 500);
  }

  if (!existing) {
    return apiError("NOT_FOUND", "No link with that id.", 404);
  }

  const current: LinkItem = existing;
  const updates: LinkUpdate = {};

  if ("ctx" in body) {
    if (!isCtx(body.ctx)) {
      return apiError("INVALID_CTX", "ctx must be either \"work\" or \"home\".", 400);
    }

    updates.ctx = body.ctx;
  }

  if ("title" in body) {
    if (typeof body.title !== "string" || !body.title.trim()) {
      return apiError("INVALID_BODY", "title must be a non-empty string.", 400);
    }

    updates.title = body.title.trim();
  }

  if ("url" in body) {
    if (typeof body.url !== "string") {
      return apiError("INVALID_BODY", "url must be a string.", 400);
    }

    const normalizedUrl = normalizeUrl(body.url);

    if (!normalizedUrl) {
      return apiError("INVALID_URL", "url must be a valid http or https address.", 400);
    }

    updates.url = normalizedUrl;
  }

  if ("description" in body) {
    if (body.description !== null && typeof body.description !== "string") {
      return apiError("INVALID_BODY", "description must be a string or null.", 400);
    }

    updates.description =
      typeof body.description === "string" ? body.description.trim() || null : null;
  }

  if ("category_id" in body) {
    if (typeof body.category_id !== "string" || !body.category_id) {
      return apiError("INVALID_BODY", "category_id must be a string.", 400);
    }

    updates.category_id = body.category_id;
  }

  if ("pinned" in body) {
    if (typeof body.pinned !== "boolean") {
      return apiError("INVALID_BODY", "pinned must be a boolean.", 400);
    }

    updates.pinned = body.pinned;
  }

  if (Object.keys(updates).length === 0) {
    return apiError("INVALID_BODY", "No updatable fields were provided.", 400);
  }

  // Re-check the pairing whenever either half of it moves.
  if (updates.ctx !== undefined || updates.category_id !== undefined) {
    const effectiveCtx = updates.ctx ?? current.ctx;
    const effectiveCategoryId = updates.category_id ?? current.category_id;
    const category = await findMatchingCategory(supabase, effectiveCategoryId, effectiveCtx, "link");

    if (!category) {
      return apiError(
        "INVALID_CATEGORY",
        "category_id must be a link category in the same workspace.",
        400
      );
    }
  }

  const { data, error } = await supabase
    .from("dashboard_links")
    .update(updates)
    .eq("id", id)
    .select(LINK_COLUMNS)
    .maybeSingle();

  if (error) {
    console.error("Link update error:", error);
    return apiError("SERVER_ERROR", "Could not update the link.", 500);
  }

  if (!data) {
    return apiError("NOT_FOUND", "No link with that id.", 404);
  }

  const link: LinkItem = data;

  return NextResponse.json(link, { status: 200 });
}

/**
 * DELETE /api/links/[id]
 * Returns 404 when nothing was deleted, so an optimistic client can tell a
 * genuine failure from a row that was already gone.
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
    return apiError("NOT_FOUND", "No link with that id.", 404);
  }

  const { data, error } = await supabase
    .from("dashboard_links")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Link delete error:", error);
    return apiError("SERVER_ERROR", "Could not delete the link.", 500);
  }

  if (!data) {
    return apiError("NOT_FOUND", "No link with that id.", 404);
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
