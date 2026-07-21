import { NextResponse, type NextRequest } from "next/server";

import { requireAdminAuth } from "@/lib/auth/admin-guard";
import {
  LINK_COLUMNS,
  apiError,
  findMatchingCategory,
  normalizeUrl,
  readJsonObject,
} from "@/lib/dashboard/api";
import { isCtx, type LinkItem } from "@/lib/dashboard/types";

/**
 * GET /api/links
 * Lists every link the admin owns, newest first — the design's default "Recent"
 * sort. Optional `?ctx=work|home` narrows to one workspace; the dashboard page
 * omits it and filters client-side so switching workspaces needs no refetch.
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
    .from("dashboard_links")
    .select(LINK_COLUMNS)
    .order("created_at", { ascending: false });

  if (ctxParam !== null) {
    query = query.eq("ctx", ctxParam);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Links list error:", error);
    return apiError("SERVER_ERROR", "Could not load links.", 500);
  }

  const links: LinkItem[] = data ?? [];

  return NextResponse.json({ links }, { status: 200 });
}

/**
 * POST /api/links
 * Creates a link. The URL is normalized (a missing scheme becomes `https://`,
 * matching the design) before validation, and only http/https survive — these
 * values are rendered as hrefs, so the scheme check is a real XSS gate.
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

  const { ctx, title, url, category_id: categoryId, description } = body;

  if (!isCtx(ctx)) {
    return apiError("INVALID_CTX", "ctx must be either \"work\" or \"home\".", 400);
  }

  if (typeof title !== "string" || !title.trim()) {
    return apiError("INVALID_BODY", "title is required.", 400);
  }

  if (typeof url !== "string") {
    return apiError("INVALID_BODY", "url is required.", 400);
  }

  const normalizedUrl = normalizeUrl(url);

  if (!normalizedUrl) {
    return apiError("INVALID_URL", "url must be a valid http or https address.", 400);
  }

  if (typeof categoryId !== "string" || !categoryId) {
    return apiError("INVALID_BODY", "category_id is required.", 400);
  }

  if (description !== undefined && description !== null && typeof description !== "string") {
    return apiError("INVALID_BODY", "description must be a string.", 400);
  }

  const category = await findMatchingCategory(supabase, categoryId, ctx, "link");

  if (!category) {
    return apiError(
      "INVALID_CATEGORY",
      "category_id must be a link category in the same workspace.",
      400
    );
  }

  const { data, error } = await supabase
    .from("dashboard_links")
    .insert({
      ctx,
      category_id: categoryId,
      title: title.trim(),
      url: normalizedUrl,
      description: typeof description === "string" ? description.trim() || null : null,
    })
    .select(LINK_COLUMNS)
    .single();

  if (error || !data) {
    console.error("Link create error:", error);
    return apiError("SERVER_ERROR", "Could not save the link.", 500);
  }

  const link: LinkItem = data;

  return NextResponse.json(link, { status: 201 });
}
