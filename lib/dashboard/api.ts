import { NextResponse } from "next/server";

import type { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Category, CategoryKind, Ctx } from "@/lib/dashboard/types";

/**
 * Wire conventions shared by every dashboard API route.
 *
 * Success responses carry the entity itself (or `{ ok: true }` for deletes);
 * list endpoints carry a single named collection key, matching the established
 * `app/api/files/route.ts` idiom.
 *
 * Failures always carry `{ error: <MACHINE_CODE>, message: <human text> }` so
 * clients can branch on `error` and surface `message` verbatim in a toast.
 */
export type ApiErrorCode =
  | "INVALID_BODY"
  | "INVALID_CTX"
  | "INVALID_URL"
  | "INVALID_CATEGORY"
  | "NOT_FOUND"
  | "CONFLICT"
  | "SERVER_ERROR";

export function apiError(error: ApiErrorCode, message: string, status: number) {
  return NextResponse.json({ error, message }, { status });
}

/** The client returned by `requireAdminAuth` — already scoped to the caller's session. */
export type DashboardSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export const LINK_COLUMNS =
  "id, ctx, category_id, title, url, description, sort_order, created_at, updated_at";

export const CATEGORY_COLUMNS = "id, ctx, kind, name, sort_order";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Guards route params before they reach Postgres: a non-UUID id would make the
 * query fail with a 22P02 syntax error and surface as a 500, when the honest
 * answer is simply that no such row exists.
 */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** Parses a JSON request body into a plain object, or null if it is anything else. */
export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return null;
    }

    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Normalizes a user-supplied URL the way the design does — prepending
 * `https://` when the scheme is omitted — then validates it.
 *
 * URLs stored here are rendered as `href`s, so the scheme check is the XSS
 * gate: `javascript:`, `data:` and friends must never reach the database. The
 * prepend runs first, exactly as in the design, which turns a bare
 * `javascript:alert(1)` into an unparseable authority; the explicit protocol
 * allow-list below then catches everything the prepend does not.
 *
 * Returns the normalized absolute URL, or null when it is not a usable
 * http(s) URL.
 */
export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();

  if (!trimmed) {
    return null;
  }

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;

  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  // A URL with no host ("https://?x=1") parses but is not a link anyone can follow.
  if (!parsed.hostname) {
    return null;
  }

  return parsed.toString();
}

/**
 * Confirms a category exists and belongs to the same workspace and section as
 * the item being written. `ctx` is denormalized onto item rows for single-table
 * filtering, so the API — not the database — owns keeping the two in step.
 */
export async function findMatchingCategory(
  supabase: DashboardSupabaseClient,
  categoryId: string,
  ctx: Ctx,
  kind: CategoryKind
): Promise<Category | null> {
  if (!isUuid(categoryId)) {
    return null;
  }

  const { data, error } = await supabase
    .from("dashboard_categories")
    .select(CATEGORY_COLUMNS)
    .eq("id", categoryId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const category = data as Category;

  return category.ctx === ctx && category.kind === kind ? category : null;
}
