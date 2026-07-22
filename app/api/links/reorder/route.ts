import { NextResponse, type NextRequest } from "next/server";

import { requireAdminAuth } from "@/lib/auth/admin-guard";
import { LINK_COLUMNS, apiError, isUuid, readJsonObject } from "@/lib/dashboard/api";
import type { LinkItem } from "@/lib/dashboard/types";

/**
 * A drop rewrites every position in the affected list, so the cap is a sanity
 * bound on a hand-curated list, not a real limit anyone should reach.
 */
const MAX_REORDER_ROWS = 500;

/**
 * PATCH /api/links/reorder
 *
 * Applies a manual ordering as one batch: a drag writes every row's position in
 * a single request rather than one request per moved row.
 *
 * Responds with `{ links }` — the full list for the affected workspace, freshly
 * read — so the client replaces its optimistic state with what was actually
 * stored rather than assuming its own guess was right.
 */
export async function PATCH(request: NextRequest) {
  const authResult = await requireAdminAuth(request);
  if (authResult.error) {
    return authResult.error;
  }

  const { supabase } = authResult;
  const body = await readJsonObject(request);

  if (!body) {
    return apiError("INVALID_BODY", "Request body must be a JSON object.", 400);
  }

  const { order } = body;

  if (!Array.isArray(order) || order.length === 0) {
    return apiError("INVALID_BODY", "order must be a non-empty array.", 400);
  }

  if (order.length > MAX_REORDER_ROWS) {
    return apiError("INVALID_BODY", `order must hold at most ${MAX_REORDER_ROWS} rows.`, 400);
  }

  const positions = new Map<string, number>();

  for (const entry of order) {
    if (typeof entry !== "object" || entry === null) {
      return apiError("INVALID_BODY", "Each order entry must be an object.", 400);
    }

    const { id, sort_order: sortOrder } = entry as {
      id?: unknown;
      sort_order?: unknown;
    };

    // Guarding here keeps a malformed id from reaching Postgres as a 22P02 and
    // surfacing as a 500.
    if (typeof id !== "string" || !isUuid(id)) {
      return apiError("INVALID_BODY", "Each order entry needs a valid id.", 400);
    }

    if (typeof sortOrder !== "number" || !Number.isInteger(sortOrder)) {
      return apiError("INVALID_BODY", "Each order entry needs an integer sort_order.", 400);
    }

    if (positions.has(id)) {
      return apiError("INVALID_BODY", "order must not repeat an id.", 400);
    }

    positions.set(id, sortOrder);
  }

  const ids = [...positions.keys()];

  // Read first, for two reasons: it confirms every id is a row this caller can
  // see (RLS already restricts the read), and it gives us the ctx to scope the
  // response to without trusting a client-supplied workspace.
  const { data: existing, error: readError } = await supabase
    .from("dashboard_links")
    .select(LINK_COLUMNS)
    .in("id", ids);

  if (readError) {
    console.error("Link reorder read error:", readError);
    return apiError("SERVER_ERROR", "Could not load the links.", 500);
  }

  const rows: LinkItem[] = existing ?? [];

  if (rows.length !== ids.length) {
    return apiError("NOT_FOUND", "One or more links no longer exist.", 404);
  }

  // A reorder is meaningless across workspaces, and allowing it would let one
  // drag interleave two lists.
  const contexts = new Set(rows.map((row) => row.ctx));

  if (contexts.size > 1) {
    return apiError("INVALID_BODY", "order must not span workspaces.", 400);
  }

  const [ctx] = [...contexts];

  // Sequential rather than a single upsert: an upsert would need every non-null
  // column restated, which risks clobbering a title edit that landed between
  // this client's read and its drop.
  for (const row of rows) {
    const sortOrder = positions.get(row.id);

    if (sortOrder === undefined || sortOrder === row.sort_order) {
      continue;
    }

    const { error: updateError } = await supabase
      .from("dashboard_links")
      .update({ sort_order: sortOrder })
      .eq("id", row.id);

    if (updateError) {
      console.error("Link reorder write error:", updateError);
      return apiError("SERVER_ERROR", "Could not save the new order.", 500);
    }
  }

  const { data: refreshed, error: refreshError } = await supabase
    .from("dashboard_links")
    .select(LINK_COLUMNS)
    .eq("ctx", ctx)
    .order("sort_order", { ascending: true });

  if (refreshError) {
    console.error("Link reorder reload error:", refreshError);
    return apiError("SERVER_ERROR", "Could not reload the links.", 500);
  }

  const links: LinkItem[] = refreshed ?? [];

  return NextResponse.json({ links }, { status: 200 });
}
