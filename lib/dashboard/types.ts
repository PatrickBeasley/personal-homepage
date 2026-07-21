/**
 * Shared dashboard entity types. Single source of truth for both server code
 * (route handlers, server components) and client views — later sections
 * (Notes, Documents, Settings) add their own rows here rather than redeclaring
 * shapes next to the components that render them.
 *
 * Field names mirror the columns in
 * supabase/migrations/202607210001_dashboard_schema.sql verbatim, so a row read
 * from Supabase is already a valid entity with no mapping layer in between.
 */

/** Workspace a row belongs to. Matches the `ctx` check constraint. */
export type Ctx = "work" | "home";

/** Which section a category belongs to. Matches the `kind` check constraint. */
export type CategoryKind = "link" | "note";

export function isCtx(value: unknown): value is Ctx {
  return value === "work" || value === "home";
}

export interface Category {
  id: string;
  ctx: Ctx;
  kind: CategoryKind;
  name: string;
  sort_order: number;
}

export interface LinkItem {
  id: string;
  ctx: Ctx;
  category_id: string;
  title: string;
  url: string;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/**
 * A note. Unlike a link, `title` may legitimately be empty — the editor creates
 * the row before anything is typed into it, and the UI renders "Untitled" for
 * the empty case. `content_html` always holds *sanitized* markup: the API runs
 * `sanitizeNoteHtml` on every write, so nothing else in the app has to.
 *
 * `updated_at` is maintained by the `dashboard_notes_set_updated_at` trigger and
 * must never be written from application code; the "Recent" sort reads it.
 */
export interface NoteItem {
  id: string;
  ctx: Ctx;
  category_id: string;
  title: string;
  content_html: string;
  created_at: string;
  updated_at: string;
}
