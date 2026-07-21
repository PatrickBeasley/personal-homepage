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
 * A row of `files_metadata`, as returned by `GET /api/files` and read directly
 * by the Documents page.
 *
 * Note what is absent: there is **no `ctx`**. `files_metadata` has no such
 * column and documents are not workspace-scoped — one flat list is shown
 * identically in Work and Home. Do not add workspace filtering here.
 *
 * `storage_path` and `uploaded_by` exist on the table but are not part of the
 * list contract; see `FILE_COLUMNS` in lib/dashboard/files.ts.
 */
export interface DocumentItem {
  id: string;
  file_name: string;
  file_extension: string | null;
  mime_type: string | null;
  file_size_bytes: number;
  description: string | null;
  visibility: "private" | "public";
  created_at: string;
}
