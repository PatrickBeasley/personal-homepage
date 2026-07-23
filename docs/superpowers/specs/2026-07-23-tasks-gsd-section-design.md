# Tasks: GSD-backed dashboard section

**Date:** 2026-07-23
**Status:** Approved design, ready for planning
**Scope:** New dashboard section (page + API routes + GSD client). No DB migration —
this section stores nothing in Supabase.

## Problem

Tasks live in Project-GSD (project-gsd.com) and are invisible from the dashboard.
The dashboard should surface them — see what's open, check things off, add new
ones — without replacing GSD as the system of record.

## Goal

A **Tasks** section at `/dashboard/tasks`, structurally identical to the Links
page, that reads and writes tasks through the GSD API (`https://project-gsd.com/api/v1`,
bearer-key auth). Light scope: view, check off / un-check, quick add. Everything
else (editing details, subtasks, tags, list management) stays in GSD itself.

## Non-goals (YAGNI — user decisions)

- No editing of task fields, no archiving/deleting tasks, no subtasks, tags,
  notes, assignees, or attachments. **No per-row kebab menu.**
- No list creation, rename, or reorder from the dashboard (no "+ New list…" in
  the picker — unlike Links categories, lists are managed in GSD).
- No drag reorder of tasks.
- No polling or focus-refetch: data loads on navigation, plus a manual refresh
  button. (GSD is edited elsewhere, so the page can be stale; that is accepted.)
- **Not workspace-scoped.** Like Documents/Settings, Tasks ignores the
  Work/Home toggle. Do not add `useWorkspace()` filtering (AGENTS.md names this
  the single most common mistake in this repo).

## External API facts that shape the design

From the GSD API reference (uploaded 2026-07-23):

- Bearer key auth; 60 requests/min per key; missing/revoked key → 401.
- **Responses are camelCase; request bodies are snake_case.**
- Errors are `{ "error": "CODE", "message": "text" }` — the same wire shape as
  this repo's `apiError()`.
- Unknown/foreign/archived ids → 404, never 403.
- `POST /lists/{id}/tasks` inserts new tasks **at the top** of the list.
- `POST /tasks/{id}/toggle` completes/uncompletes — but **repeating tasks
  advance their due date instead** and stay open.
- `GET /tasks` returns every active task, list order then task order — one call
  covers all lists.
- DELETE archives (recoverable); the API cannot hard-delete. (Unused here.)

## Architecture

```
/dashboard/tasks (server page) ──2 GSD calls──▶ GSD API
        │ lists[], tasks[]
        ▼
 TasksView ("use client")
        │ fetch (refresh / create / toggle)
        ▼
 /api/tasks*  (requireAdminAuth first) ──lib/gsd/client──▶ GSD API
```

The `GSD_API_KEY` is read **only** inside `lib/gsd/client.ts` — server-only, no
`NEXT_PUBLIC_` prefix, never sent to or readable by the browser. The browser
talks exclusively to our own routes.

### 1. `lib/gsd/client.ts` — server-only GSD client

- Constant base URL `https://project-gsd.com/api/v1`; key from `process.env.GSD_API_KEY`.
- Exposes exactly four calls: `getLists()`, `getAllTasks()`,
  `createTask(listId, { title, due_date? })`, `toggleTask(id)`.
- Request bodies snake_case; responses camelCase (`GsdList`, `GsdTask` types
  defined here, mirroring the reference's List/Task objects).
- Every call resolves to `{ ok: true, data }` or `{ ok: false, error: GsdError }`
  where `GsdError = { status, code, message }` — the client **never throws** for
  API-level failures. `AbortSignal.timeout(10_000)` bounds each request;
  timeouts, network failures, and non-JSON bodies become a synthetic
  `GsdError` with `status: 0`.
- The key must never be logged or echoed in any error path.

### 2. Route handlers

All follow the binding conventions: `requireAdminAuth(request)` as the first
statement, `isUuid` guards, `apiError()` wire format.

| Route | Behaviour | Success |
|---|---|---|
| `GET /api/tasks` | Refresh: `getLists()` + `getAllTasks()` in parallel | 200 `{ lists, tasks }` |
| `POST /api/tasks` | Body `{ list_id, title, due_date? }` → GSD `POST /lists/{list_id}/tasks` | 201 bare Task |
| `POST /api/tasks/[id]/toggle` | GSD `POST /tasks/{id}/toggle` | 200 bare Task |

Local validation (fast 400s, before any GSD call): body must be a JSON object;
`list_id` / `[id]` must be uuids (`isUuid` — malformed id is 404 on the id
route, 400 `INVALID_BODY` in the body); `title` required non-empty string;
`due_date`, when present, must match `YYYY-MM-DD`. Semantic validation beyond
that is GSD's job — its 400s forward verbatim.

**Upstream error mapping** (in one shared helper in `lib/gsd/client.ts` or the
route module):

| GSD failure | Our response |
|---|---|
| 400 (`INVALID_TITLE`, `INVALID_DUE_DATE`, …) | 400, code + message forwarded verbatim |
| 404 | 404 `NOT_FOUND` |
| 429 | 429 `RATE_LIMITED`, message forwarded |
| 401 (key bad/revoked) | **502 `GSD_AUTH_FAILED`** — our config problem, not the caller's session |
| Network / timeout / 5xx / non-JSON | 502 `GSD_UNAVAILABLE` |
| `GSD_API_KEY` unset | 500 `SERVER_ERROR` (logged) |

### 3. `app/dashboard/tasks/page.tsx` — server page

Mirrors the Notes page shape: calls `getLists()` and `getAllTasks()` in
parallel, renders the standard error card ("Tasks could not be loaded…") if
either fails, otherwise hands plain arrays to `TasksView`. Two GSD requests per
load — well inside the 60/min limit.

### 4. Navigation

Add a **Tasks** entry (label "Tasks") to the dashboard shell's sidebar and
mobile tab bar, with a checkbox-square icon added to
`components/dashboard/icons.tsx` in the existing verbatim-SVG style.

## UI — `components/dashboard/tasks/tasks-view.tsx`

**Approved via interactive mockup (revision 2, 2026-07-23, artifact
`5b7cee49`). The Links page (`components/dashboard/links/links-view.tsx`) is the
structural reference; deviations below are deliberate.**

One section card, the Links shell:

- **Header row:** accent icon + "Tasks" + count of *open* tasks in the current
  view (mono, like Links' count), a bordered refresh icon-button (spinner while
  in flight; re-pulls `GET /api/tasks` and replaces both arrays wholesale), and
  a **"+ Add task"** accent button.
- **Add form** (expandable band, `bg-surface-2`, same as Links): Title input,
  optional `<input type="date">`, and a **list picker** `<select>` where Links
  has the category picker — GSD lists in display order, no create-new option.
  Save → optimistic insert at the **top of that list's order** (matching where
  GSD inserts), POST, replace with the server Task on 201, rollback + reopen
  form + toast on failure — the exact `handleSubmit` shape from Links.
- **Toolbar row** (same order as Links): search ("Search tasks…", matches
  title), filter select ("All lists" + each list), sort select, **Group**
  checkbox.
  - Sort options: **Manual** (GSD's order: list display order, then task
    `position` — the default), **Due date** (soonest first, undated last),
    **A–Z**, **Priority** (high → low; ties fall back to manual).
  - View prefs (sort, filter, grouped) persist to localStorage as
    `pb-tasks-prefs` with the same validated-read / write-from-handlers
    mechanism as `pb-links-prefs`. Search is not persisted.
- **Rows** (Links row style): leading **checkbox** (19px circle, accent fill
  when checked) in place of the letter avatar; title (semibold, truncating);
  beneath it the small mono meta line — high-priority flag (red, only when
  `priority === "high"`; nothing for none/low/med), repeat glyph (↻, when
  `repeat !== "none"`), due date (red overdue, accent "Today", muted future;
  absent when null). Trailing **list chip** — category-chip styling plus a 7px
  dot in the list's GSD `color`.
- **Grouping:** Group = on sections open tasks by list with the same
  `bg-surface-2` mono band headers (label + count), in **GSD's list display
  order** (that order is user-chosen in GSD; Links sorts groups alphabetically
  but its categories have no display order — deliberate deviation). The active
  sort orders rows within each section.
- **Done band:** all visible done tasks sit in a single struck-through, dimmed
  **"Done"** band at the bottom of the scroll area (the structural twin of
  Links' Pinned band, opposite end), regardless of grouping, in manual order.
  Un-checking lifts a task back into the open set.
- **Empty state:** "No tasks match. Add one ↑" centered, Links style.

### Mutations

- **Toggle (non-repeating):** optimistic — flip `done`/`status` locally (row
  moves to/from the Done band immediately), POST toggle, apply the returned
  Task on success, rollback via captured-value closure + toast on failure.
- **Toggle (repeating, `repeat !== "none"`):** *not* optimistic — GSD advances
  the due date instead of completing, so there is nothing safe to guess. POST,
  then apply the returned Task (new `dueDate`, still open) with a brief
  accent-flash on the row. On failure: toast, no state change.
- **Add:** optimistic with an `optimistic-` temp id (Links' pattern); the row's
  checkbox is disabled while optimistic (no server id to toggle).
- Failure messages come from the response body via `readApiError`, which moves
  from `links-view.tsx` to a shared `lib/dashboard/` module (targeted
  improvement; Links imports it from there — behaviour unchanged).

### Derived, not synced

All filtering/sorting/grouping derives from `tasks` + view state at render, in
`useMemo` — no effect-driven state sync (repo rule). Counts recompute from the
same derivation.

## Environment / deploy

- `GSD_API_KEY` added to `.env.local` (gitignored), `.env.example`
  (placeholder), and Vercel env for **both Preview and Production** (separate
  scopes — README gotcha).
- The key is created/revoked on the GSD Account page; a revoked key surfaces as
  502 `GSD_AUTH_FAILED` everywhere, and the page-load error card.

## Testing / verification

Gate on `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build` —
checking exit codes directly (AGENTS.md).

The vitest harness is node-only pure-logic (no jsdom), so:

- **`lib/dashboard/task-order.ts`** — `compareTasks(a, b, sortKey, listRank)`,
  `groupByList`, `partitionDone` extracted pure and unit-tested, mirroring
  `link-order.test.ts`: each sort key, undated-last, priority ties, group
  ordering, done partition.
- **`lib/gsd/client.ts`** — tested with mocked `global.fetch`: bearer header
  attached, snake_case bodies, camelCase parsing, each error-mapping row
  (400 passthrough, 404, 429, 401→GSD_AUTH_FAILED shape, network/timeout →
  status 0), timeout abort, and that no error path contains the key.
- Route-handler behaviours that reduce to pure logic (body validation, error
  mapping) live in testable helpers; the handlers stay thin.

**Deferred, not skipped** (recorded for live acceptance, per AGENTS.md):
against real GSD with the real key — created task appears in the GSD app at the
top of its list; toggle syncs both ways; a repeating task's date advances;
revoked-key path shows the error card. Prove by reading GSD's state, not by
trusting our 200s.

## Files touched

- `lib/gsd/client.ts` (+ `client.test.ts`) — new.
- `lib/dashboard/task-order.ts` (+ `task-order.test.ts`) — new.
- `lib/dashboard/read-api-error.ts` — extracted from `links-view.tsx`.
- `app/api/tasks/route.ts`, `app/api/tasks/[id]/toggle/route.ts` — new.
- `app/dashboard/tasks/page.tsx` — new.
- `components/dashboard/tasks/tasks-view.tsx` — new.
- `components/dashboard/icons.tsx` — add Tasks nav icon.
- `components/dashboard/shell.tsx` — Tasks nav entry (sidebar + tab bar).
- `components/dashboard/links/links-view.tsx` — import `readApiError` from its
  new home (no behaviour change).
- `.env.example`, README env list — `GSD_API_KEY`.
