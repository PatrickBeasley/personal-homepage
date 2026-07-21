import { NextResponse, type NextRequest } from "next/server";

import { requireAdminAuth } from "@/lib/auth/admin-guard";
import {
  NOTE_COLUMNS,
  apiError,
  findMatchingCategory,
  readJsonObject,
} from "@/lib/dashboard/api";
import { isCtx, type NoteItem } from "@/lib/dashboard/types";
import {
  NOTE_CONTENT_MAX_LENGTH,
  NOTE_TITLE_MAX_LENGTH,
  sanitizeNoteHtml,
} from "@/lib/sanitize";

/**
 * GET /api/notes
 * Lists every note, most recently *edited* first — the design's "Recent" sort
 * for notes is `updated_at` desc, not `created_at` desc as it is for links,
 * because a note's whole life is editing it. Optional `?ctx=work|home` narrows
 * to one workspace; the dashboard page omits it and filters client-side so
 * switching workspaces needs no refetch.
 */
export async function GET(request: NextRequest) {
  // Auth first, before any query or body work: RLS is defense in depth here,
  // not the only gate.
  const authResult = await requireAdminAuth(request);
  if (authResult.error) {
    return authResult.error;
  }

  const { supabase } = authResult;
  const ctxParam = request.nextUrl.searchParams.get("ctx");

  if (ctxParam !== null && !isCtx(ctxParam)) {
    return apiError("INVALID_CTX", "ctx must be either \"work\" or \"home\".", 400);
  }

  let query = supabase
    .from("dashboard_notes")
    .select(NOTE_COLUMNS)
    .order("updated_at", { ascending: false });

  if (ctxParam !== null) {
    query = query.eq("ctx", ctxParam);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Notes list error:", error);
    return apiError("SERVER_ERROR", "Could not load notes.", 500);
  }

  const notes: NoteItem[] = data ?? [];

  return NextResponse.json({ notes }, { status: 200 });
}

/**
 * POST /api/notes
 * Creates a note. `title` and `content_html` are optional and may be empty:
 * the editor creates the row up front so that the first autosave already has a
 * server id to PATCH, which is the only way the debounced save can be ordered.
 *
 * `content_html` is sanitized here, server-side, before the row is written —
 * the client's editor is a convenience, never the security boundary.
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

  const { ctx, title, category_id: categoryId, content_html: contentHtml } = body;

  if (!isCtx(ctx)) {
    return apiError("INVALID_CTX", "ctx must be either \"work\" or \"home\".", 400);
  }

  if (typeof categoryId !== "string" || !categoryId) {
    return apiError("INVALID_BODY", "category_id is required.", 400);
  }

  if (title !== undefined && typeof title !== "string") {
    return apiError("INVALID_BODY", "title must be a string.", 400);
  }

  // Measured against the raw value, before trimming or sanitizing, so a paste
  // bomb is rejected rather than parsed.
  if (typeof title === "string" && title.length > NOTE_TITLE_MAX_LENGTH) {
    return apiError(
      "INVALID_TITLE",
      `title must be ${NOTE_TITLE_MAX_LENGTH} characters or fewer.`,
      400
    );
  }

  if (contentHtml !== undefined && typeof contentHtml !== "string") {
    return apiError("INVALID_BODY", "content_html must be a string.", 400);
  }

  if (typeof contentHtml === "string" && contentHtml.length > NOTE_CONTENT_MAX_LENGTH) {
    return apiError(
      "INVALID_CONTENT",
      `content_html must be ${NOTE_CONTENT_MAX_LENGTH} characters or fewer.`,
      400
    );
  }

  const category = await findMatchingCategory(supabase, categoryId, ctx, "note");

  if (!category) {
    return apiError(
      "INVALID_CATEGORY",
      "category_id must be a note category in the same workspace.",
      400
    );
  }

  const { data, error } = await supabase
    .from("dashboard_notes")
    .insert({
      ctx,
      category_id: categoryId,
      title: typeof title === "string" ? title.trim() : "",
      content_html: typeof contentHtml === "string" ? sanitizeNoteHtml(contentHtml) : "",
    })
    .select(NOTE_COLUMNS)
    .single();

  if (error || !data) {
    console.error("Note create error:", error);
    return apiError("SERVER_ERROR", "Could not save the note.", 500);
  }

  const note: NoteItem = data;

  return NextResponse.json(note, { status: 201 });
}
