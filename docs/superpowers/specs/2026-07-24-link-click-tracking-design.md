# Link click tracking + "frequently used" quick list

**Date:** 2026-07-24
**Status:** Approved design, ready for planning
**Scope:** One migration (2 columns + 1 RPC on `dashboard_links`), one new API route, a shared click beacon, a new Links sort, and a new Overview card. No auth changes.
**Mockup (approved):** https://claude.ai/code/artifact/421ea82c-731e-4d23-972b-8f1e041cf3f0

## Problem

Links are opened constantly but the dashboard has no memory of it. There is no
way to see which links you actually use, and no fast path to your most-used
ones — you scroll or search the same handful every day.

## Goal

Count clicks per link (all-time), show the count as a subtle badge, and surface
the most-clicked links two ways: a **"Most used"** sort in the Links section and
a **"Frequent links"** card on the Overview page. Both respect the active
Work/Home workspace (Links are workspace-scoped).

## Non-goals (user decisions / YAGNI)

- **No time-weighting / recency decay.** "Frequently used" = all-time
  `click_count`, ties broken by title. (A per-click events table was considered
  and rejected — a single counter is enough.)
- **No per-click history / events table.** Just a running counter and a
  `last_clicked_at` timestamp.
- **No "reset count" action** in the kebab menu (deferred; add later only if
  wanted).
- **No exact-count guarantee.** Clicks are recorded with a fire-and-forget
  beacon; a rare dropped beacon silently loses one count. This is acceptable for
  an approximate frequency signal and is a deliberate trade for zero navigation
  delay.

## Data model

Migration `supabase/migrations/202607240001_link_click_tracking.sql`:

1. Add to `public.dashboard_links`:
   - `click_count integer not null default 0`
   - `last_clicked_at timestamptz` (nullable — null = never clicked)
2. Index for the sort/card ordering:
   - `create index if not exists dashboard_links_ctx_clicks_idx on public.dashboard_links (ctx, click_count desc);`
3. Atomic increment RPC:

```sql
create or replace function public.increment_link_click(link_id uuid)
returns public.dashboard_links
language sql
security invoker           -- RLS still applies: the UPDATE only touches rows
                           -- when is_admin() is true, so this is not an
                           -- escalation. NEVER security definer here.
as $$
  update public.dashboard_links
     set click_count = click_count + 1,
         last_clicked_at = now()
   where id = link_id
  returning *;
$$;

grant execute on function public.increment_link_click(uuid) to anon, authenticated;
```

- **Why an RPC, not a `.update()`:** supabase-js cannot express `col = col + 1`;
  a read-modify-write in the route would drop a count under two rapid clicks.
  The single SQL statement is atomic and race-safe.
- **RLS:** `dashboard_links` already has `for all using (is_admin()) with check
  (is_admin())`. `security invoker` means a non-admin caller's UPDATE matches
  zero rows and the function returns no row → the route answers 404. No new
  policy is needed. (See [[is-admin-execute-grant]] — do not touch the
  `is_admin()` EXECUTE grant.)
- **Accepted side effect:** the existing `dashboard_links_set_updated_at`
  trigger fires on this UPDATE, so a click bumps `updated_at`. Nothing sorts on
  `links.updated_at` (the "recent" sort uses `created_at`), so this is harmless.

**Type + column changes:**
- `LinkItem` (`lib/dashboard/types.ts`) gains `click_count: number` and
  `last_clicked_at: string | null`.
- `LINK_COLUMNS` (`lib/dashboard/api.ts`) appends `, click_count, last_clicked_at`
  so every existing Links/Overview fetch returns them.

## Recording path

New route `POST /api/links/[id]/click` (mirrors `app/api/links/[id]/route.ts`):

- `requireAdminAuth(request)` is the first statement.
- `const { id } = await params;` then `isUuid(id)` guard → malformed id is a 404.
- `supabase.rpc("increment_link_click", { link_id: id })`.
- RPC returns the updated row → respond with the **bare link entity (200)**,
  matching the "update returns the entity" wire convention. RPC returns no row
  (unknown id, or RLS matched nothing) → `apiError("NOT_FOUND", …, 404)`. RPC
  error → `apiError("SERVER_ERROR", …, 500)`.
- No request body is read (there is nothing to send).

**Shared client helper** `recordLinkClick(id: string): void` (new small module,
e.g. `lib/dashboard/record-click.ts`):

```ts
export function recordLinkClick(id: string): void {
  // Fire-and-forget: sendBeacon is guaranteed to send even as the new tab
  // opens, with zero navigation delay. No response is available, by design.
  navigator.sendBeacon(`/api/links/${id}/click`);
}
```

Used by both link surfaces so the transport lives in one place.

## Surface 1 — Links section ("Most used" sort + badge)

`lib/dashboard/link-order.ts`:
- `LinkSortKey` gains `"used"`.
- `compareLinks` new branch:
  `b.click_count - a.click_count || a.title.localeCompare(b.title) || a.id.localeCompare(b.id)`.

`components/dashboard/links/links-view.tsx`:
- `SORT_OPTIONS` gains `{ value: "used", label: "Most used" }`. The existing
  prefs validation already rejects any value not in `SORT_OPTIONS`, so the
  remembered-view code needs no other change.
- Each link row renders a muted count badge (mono, pill, cursor glyph +
  `click_count`). When the active sort is `"used"`, the badge tints to the
  workspace accent to signal it is the ranking key (per the mockup).
- The row's link `onClick` calls `recordLinkClick(link.id)` **and** optimistically
  increments that link's `click_count` in local state, so the badge updates and a
  `"used"` sort re-orders live. No rollback (the beacon has no failure signal);
  the server value wins on next page load. Pinning still wins over the sort (the
  pinned band is unaffected).

## Surface 2 — Overview "Frequent links" card

- `app/dashboard/page.tsx` adds two `dashboard_links` reads (one per `ctx`),
  ordered `click_count desc`, `.limit(5)`, in the existing `Promise.all` —
  same both-workspaces-loaded pattern as Recent notes.
- New `components/dashboard/overview/frequent-links.tsx` (`"use client"`):
  takes `workLinks`/`homeLinks`, uses `useWorkspace()` to pick, wraps
  `OverviewCard` (title "Frequent links", `href="/dashboard/links"`).
  - Shows only links with `click_count > 0`, top 5. Each row: title, host,
    accent-tinted count badge; the title links out with `target="_blank"` and
    calls `recordLinkClick(id)` (optimistically bumping local state, same as
    the Links surface).
  - Empty state (no clicks yet): "Your most-used links will show here once you
    start clicking."
- A note query error on the page already degrades to an inline notes-error card;
  a links query error degrades the same way in place of this card only.

**Selection helper** (pure, unit-tested) — filter `click_count > 0`, sort by the
same key as the `"used"` comparator, take top N. Colocate in
`lib/dashboard/link-order.ts` (e.g. `selectFrequentLinks(links, limit)`), reusing
the ordering rule rather than duplicating it.

## Error handling

- Dropped beacon → one uncounted click, no user-visible effect.
- Increment route returns the standard `apiError` wire shape; auth-first and
  `isUuid` guards match the sibling routes.
- Editing a link keeps its count (same row); deleting removes it with the row.
- Local optimistic count can drift from the server by at most the beacons in
  flight; a page load reconciles to the stored value.

## Testing

- **`compareLinks` `"used"` branch** (`lib/dashboard/link-order.test.ts`):
  orders by `click_count` desc; ties broken by title then id; zero counts sort
  last among themselves stably.
- **`selectFrequentLinks`**: excludes `click_count === 0`; returns at most N;
  correct order; empty input → empty.
- **Route** `app/api/links/[id]/click`: auth-first (401 before the RPC is
  called), malformed id → 404 (RPC not called), success returns the updated
  entity (200) with mocked RPC, unknown id (RPC returns null) → 404. Follows the
  existing links route test pattern.
- Gates: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`, each
  run directly (never piped into `tail`/`grep`).
- **Migration application** to prod is a controller step (via Supabase MCP),
  after which `get_advisors(security)` is checked for any new warning.

**Deferred, not skipped** (needs a live signed-in session / real data — record
in the PR): a real left-click fires the beacon and the stored `click_count`
increments (prove by reading the row, not trusting the 200); the count persists
across reload; the "Most used" sort and Frequent card order correctly per
workspace; middle-click / cmd-click behavior is acceptable (may not count — the
`onClick` path is left-click; this is an accepted limitation to document).
