# Overview: post-login dashboard landing page

**Date:** 2026-07-24
**Status:** Approved design, ready for planning
**Scope:** `/dashboard` becomes a real page (today it redirects to Links) plus a
nav entry in the shell. No DB migration, no new API routes.
**Mockup (approved):** https://claude.ai/code/artifact/a7d9ad7e-4ff2-450f-900d-1423c2f99022

## Problem

Post-login, the dashboard drops the owner into Links (`app/dashboard/page.tsx`
redirects). There is no place that answers "what needs attention right now" —
overdue tasks and recent notes each require navigating to their section.

## Goal

A read-only **briefing** at `/dashboard`, titled **Overview**, ordered by
attention: due & overdue tasks first, then recently edited notes. Login lands
here (the login flow's default `next` is already `/dashboard`; removing the
redirect is sufficient).

## Non-goals (user decisions)

- **No quick capture** of any kind — every card links into its section for actions.
- **Only two cards**: Tasks and Notes. No Links, Documents, or Feeds blocks
  (Feeds has no real data yet — `FeedsPanel` is placeholder cards).
- No polling or refresh button; data loads on navigation.
- No per-item actions (no checking off tasks from the Overview).

## Page composition

Two stacked cards in the standard card idiom
(`rounded-2xl border border-border bg-surface shadow`), header shows
"Overview" via the shell's existing title mechanism.

### Card 1 — "Needs attention" (tasks, streamed)

- Source: Project-GSD via `lib/gsd/client` (`getLists()` + `getAllTasks()` in
  parallel). **Not workspace-scoped** — GSD knows nothing about Work/Home
  (AGENTS.md names accidental scoping the most common mistake here).
- Contents: open tasks with a non-null `dueDate`, bucketed **overdue**
  (dueDate before today) then **due today**; overdue rows get a
  red-tinted date pill, today rows an accent pill. Each row: task title,
  list name, due pill. Card header links "View all →" to `/dashboard/tasks`.
- Cap at 10 rows; if more, a final "+N more in Tasks" row links through.
- **Timezone rule:** the server passes raw open-with-dueDate tasks to a small
  client component that buckets against the *browser's* local date. The server
  must not compute "today" — Vercel runs UTC and would mis-bucket evenings.
  The bucketing helper takes `today` as an argument (pure, testable).
- **Streaming:** the card is an async server component wrapped in
  `<Suspense>` with a skeleton fallback, per AGENTS.md's slow-external-call
  rule — the page itself never blocks on GSD.
- States:
  - *Skeleton* while the GSD call resolves.
  - *No key configured* (`status === -1`): compact "Connect Project-GSD" card
    pointing at Settings (same copy pattern as the Tasks page).
  - *GSD error*: quiet inline card ("Tasks unavailable… the rest of the page
    is unaffected"), never a page-level failure.
  - *Empty*: "Nothing due — all clear" with a link to Tasks.

### Card 2 — "Recent notes" (workspace-scoped)

- Source: Supabase `dashboard_notes`, two queries in the page's server fetch
  (one per `ctx`, `order updated_at desc`, `limit 5` each) so the client holds
  both workspaces and the Work/Home toggle re-filters without a refetch —
  the same pattern as the Notes page.
- "Recent" = most recently **edited** (`updated_at`), matching Notes' own
  definition.
- Each row: title, one-line snippet (body first line, ellipsized), relative
  time pill. Rows link to `/dashboard/notes`. Header links "View all →".
- Query error: inline error card in place of this card only.

## Architecture

```
app/dashboard/page.tsx  (server, force-dynamic)
 ├─ Supabase: recent notes ×2 ctx  ──▶ <RecentNotes> ("use client", useWorkspace filter)
 └─ <Suspense fallback={skeleton}>
      └─ <TasksBrief> (async server) ──getLists + getAllTasks──▶ GSD API
           └─ <TasksBriefView> ("use client", local-date bucketing)
```

New files under `components/dashboard/overview/`; date bucketing in
`lib/dashboard/due.ts` (or colocated — planner's choice, but pure and unit-tested).

## Shell / navigation changes (`components/dashboard/shell.tsx`)

- `DashboardSection` gains `"overview"`; `NAV_ENTRIES` gains
  `{ key: "overview", label: "Overview", href: "/dashboard", inTabBar: true }`
  as the **first** entry (needs an icon in `icons.tsx`).
- **Active-state must be exact-match for Overview**: the shared
  `isActive` uses `startsWith(href + "/")`, which would light Overview on
  every section. Overview is active only when `pathname === "/dashboard"`.
- Mobile tab bar goes from five tabs to six — update the `NavEntry` comment
  that says five. Settings stays sidebar-only.
- No badge count for Overview.
- The mockup's "new" tag next to Overview is mockup decoration only — not shipped.

## Rendering & perf

- The page is per-request (`force-dynamic` semantics arrive anyway via cookies
  + no-store GSD fetch; declare `export const dynamic = "force-dynamic"` to
  match Tasks' explicitness).
- `app/dashboard/loading.tsx` already covers this segment's page, so
  client-side navigation to Overview gets the instant skeleton. Verify the
  skeleton's shape still reads as a fill (two cards) — adjust only if it jars.
- `metadata.title = "Overview"`.

## Testing

- Unit-test the bucketing helper: overdue / today / future / null `dueDate`
  excluded / cap-at-10 behavior, with `today` injected — no clock reads.
- Snippet derivation (first line, ellipsis) unit-tested if non-trivial.
- Standard gates: `npm run lint`, `npx tsc --noEmit`, `npm test`,
  `npm run build`.
- **Deferred, not skipped** (record in the PR): visual check on live prod that
  login lands on Overview and the GSD skeleton streams in; real-phone check of
  the six-tab bar width at 375px.
