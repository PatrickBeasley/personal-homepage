# Link Click Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Count clicks per link (all-time), show a subtle count badge, and surface most-used links via a new "Most used" sort in Links and a "Frequent links" card on the Overview page.

**Architecture:** A migration adds `click_count`/`last_clicked_at` to `dashboard_links` plus an atomic `SECURITY INVOKER` increment RPC (RLS still gates it). A `POST /api/links/[id]/click` route calls the RPC; a shared `recordLinkClick()` fires `navigator.sendBeacon` on click with an optimistic local badge bump. Ordering lives in `lib/dashboard/link-order.ts`; both surfaces reuse it. Spec: `docs/superpowers/specs/2026-07-24-link-click-tracking-design.md`.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + RLS + RPC), Tailwind v4, Vitest.

## Global Constraints

- **Next.js 16 / Tailwind v4** differ from training data — consult `node_modules/next/dist/docs/` before deviating from the code given here.
- **Links ARE workspace-scoped.** Both the "Most used" sort and the Frequent card filter by the active workspace. (This is a case where `useWorkspace()` is correct — but only for the Links/Overview-links surfaces, never for tasks.)
- **The increment RPC MUST be `SECURITY INVOKER`**, never `SECURITY DEFINER` — RLS (`is_admin()`) must keep gating the UPDATE so the RPC is not a privilege escalation. Do not alter the `is_admin()` EXECUTE grant.
- **Wire format:** the click route returns the bare updated link entity (200); unknown id → `apiError("NOT_FOUND", …, 404)`. `requireAdminAuth(request)` is the first statement; `isUuid(id)` guards `[id]` before the RPC.
- **Click recording is fire-and-forget** (`navigator.sendBeacon`) with an optimistic local increment and **no rollback** — a dropped beacon loses one count; the server value wins on next page load. This is intentional.
- **This repo has NO API-route test harness** (zero `*.test.ts` under `app/api`). Routes are verified by `npm run build` (route emitted) plus a code-inspection checklist, exactly as the existing GSD routes were. Pure logic (`lib/`) is unit-tested with Vitest.
- Gates run **directly**, one command each, never piped into `tail`/`grep` (exit codes must be the command's own). `npm run build` runs where noted.
- Commit after each task with the message given.

---

### Task 1: Migration + type + column list

**Files:**
- Create: `supabase/migrations/202607240001_link_click_tracking.sql`
- Modify: `lib/dashboard/types.ts` (add two fields to `LinkItem`)
- Modify: `lib/dashboard/api.ts:46-47` (`LINK_COLUMNS`)
- Modify: `lib/dashboard/link-order.test.ts:11-24` (the `link()` factory must supply the new fields)

**Interfaces:**
- Produces: `LinkItem` gains `click_count: number` and `last_clicked_at: string | null`; `LINK_COLUMNS` includes `click_count, last_clicked_at`; the migration defines `public.increment_link_click(link_id uuid) returns public.dashboard_links`.

The migration is a **file only** — it is NOT applied to any database in this task (a controller applies it in Task 6). There is no gate that runs the SQL, so it is verified by inspection; the TS changes are gated by tsc/test.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/202607240001_link_click_tracking.sql`:

```sql
-- Link click tracking: an all-time counter and last-clicked timestamp per link,
-- plus an atomic increment RPC. Powers the "Most used" sort and the Overview
-- "Frequent links" card.

alter table public.dashboard_links
  add column if not exists click_count integer not null default 0,
  add column if not exists last_clicked_at timestamptz;

-- Ordering index for the sort and the top-N card, per workspace.
create index if not exists dashboard_links_ctx_clicks_idx
  on public.dashboard_links (ctx, click_count desc);

-- Atomic increment. security invoker (the default, stated for emphasis) so the
-- existing "admins manage dashboard links" RLS policy still gates the UPDATE:
-- a non-admin caller matches zero rows and gets NULL back, which the route
-- turns into a 404. MUST NOT be security definer — that would bypass RLS.
create or replace function public.increment_link_click(link_id uuid)
returns public.dashboard_links
language sql
security invoker
as $$
  update public.dashboard_links
     set click_count = click_count + 1,
         last_clicked_at = now()
   where id = link_id
  returning *;
$$;

grant execute on function public.increment_link_click(uuid) to anon, authenticated;

comment on function public.increment_link_click(uuid) is
  'Atomically bumps a link''s click_count and last_clicked_at. security invoker so RLS gates it.';
```

- [ ] **Step 2: Add the fields to `LinkItem`**

In `lib/dashboard/types.ts`, inside the `LinkItem` interface (after `updated_at`, before the closing brace at line ~48-49), add:

```ts
  /** All-time click count, incremented by the click beacon. */
  click_count: number;
  /** When the link was last clicked; null if never. */
  last_clicked_at: string | null;
```

- [ ] **Step 3: Add the columns to `LINK_COLUMNS`**

In `lib/dashboard/api.ts`, change `LINK_COLUMNS` (lines 46-47) from:

```ts
export const LINK_COLUMNS =
  "id, ctx, category_id, title, url, description, sort_order, pinned, created_at, updated_at";
```

to:

```ts
export const LINK_COLUMNS =
  "id, ctx, category_id, title, url, description, sort_order, pinned, created_at, updated_at, click_count, last_clicked_at";
```

- [ ] **Step 4: Update the test factory**

In `lib/dashboard/link-order.test.ts`, the `link()` factory (lines 11-24) builds a full `LinkItem`. Add the two new fields to its defaults so it still typechecks:

```ts
function link(overrides: Partial<LinkItem> & { id: string }): LinkItem {
  return {
    ctx: "work",
    category_id: "cat-a",
    title: "Title",
    url: "https://example.com",
    description: null,
    sort_order: 0,
    pinned: false,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    click_count: 0,
    last_clicked_at: null,
    ...overrides,
  };
}
```

- [ ] **Step 5: Run the gates**

Run each directly: `npm run lint`, `npx tsc --noEmit`, `npm test`
Expected: all exit 0 (the existing link-order tests still pass — the factory change is additive; no behavior changed yet).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/202607240001_link_click_tracking.sql lib/dashboard/types.ts lib/dashboard/api.ts lib/dashboard/link-order.test.ts
git commit -m "feat(links): click-count schema, RPC, and LinkItem fields"
```

---

### Task 2: Ordering — "used" sort + frequent-links selection

**Files:**
- Modify: `lib/dashboard/link-order.ts:12` (`LinkSortKey`), `:31-54` (`compareLinks`), append `selectFrequentLinks`
- Modify: `lib/dashboard/link-order.test.ts` (add tests)

**Interfaces:**
- Consumes: `LinkItem` with `click_count` (Task 1).
- Produces:
  - `LinkSortKey` includes `"used"`.
  - `compareLinks(a, b, "used", names)` orders by `click_count` desc, then title, then id.
  - `selectFrequentLinks(links: LinkItem[], limit: number): LinkItem[]` — links with `click_count > 0`, ordered like `"used"`, capped at `limit`.

- [ ] **Step 1: Write the failing tests**

Add to `lib/dashboard/link-order.test.ts`. Inside the existing `describe("compareLinks", …)` block, add:

```ts
  it("orders by click_count descending for used", () => {
    const a = link({ id: "a", click_count: 5 });
    const b = link({ id: "b", click_count: 20 });
    const c = link({ id: "c", click_count: 12 });

    expect([a, b, c].sort((x, y) => compareLinks(x, y, "used", NAMES))).toEqual([b, c, a]);
  });

  it("breaks used ties by title then id", () => {
    const a = link({ id: "a2", title: "Beta", click_count: 7 });
    const b = link({ id: "a1", title: "Alpha", click_count: 7 });
    const c = link({ id: "a3", title: "Alpha", click_count: 7 });

    // Alpha before Beta; the two Alphas break by id (a1 < a3).
    expect([a, b, c].sort((x, y) => compareLinks(x, y, "used", NAMES))).toEqual([b, c, a]);
  });
```

Add a new top-level `describe` block:

```ts
describe("selectFrequentLinks", () => {
  it("excludes zero-count links and orders by used", () => {
    const links = [
      link({ id: "z", click_count: 0 }),
      link({ id: "a", click_count: 3 }),
      link({ id: "b", click_count: 9 }),
    ];

    expect(selectFrequentLinks(links, 5).map((l) => l.id)).toEqual(["b", "a"]);
  });

  it("caps at the limit", () => {
    const links = [1, 2, 3, 4, 5, 6].map((n) =>
      link({ id: `l${n}`, click_count: n })
    );

    expect(selectFrequentLinks(links, 3).map((l) => l.id)).toEqual(["l6", "l5", "l4"]);
  });

  it("returns empty when nothing has been clicked", () => {
    expect(selectFrequentLinks([link({ id: "a", click_count: 0 })], 5)).toEqual([]);
  });
});
```

Add `selectFrequentLinks` to the import at the top of the test file:

```ts
import {
  compareLinks,
  computeReorder,
  groupByCategory,
  partitionPinned,
  selectFrequentLinks,
} from "./link-order";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/dashboard/link-order.test.ts`
Expected: FAIL — `selectFrequentLinks` is not exported, and the `"used"` sort tests fail (unknown key falls through to the "recent" branch).

- [ ] **Step 3: Implement the ordering**

In `lib/dashboard/link-order.ts`, change the type (line 12):

```ts
export type LinkSortKey = "manual" | "recent" | "alpha" | "category" | "used";
```

In `compareLinks`, add a branch before the final `// "recent"` return (after the `"category"` block, ~line 50):

```ts
  if (sort === "used") {
    return (
      b.click_count - a.click_count ||
      a.title.localeCompare(b.title) ||
      a.id.localeCompare(b.id)
    );
  }
```

Append a new export at the end of the file:

```ts
/**
 * The most-clicked links for the "Frequent" surfaces: only links that have
 * actually been clicked, ordered by the same rule as the "used" sort, capped at
 * `limit`. Reuses `compareLinks` so the ordering can never drift from the sort.
 */
export function selectFrequentLinks(links: LinkItem[], limit: number): LinkItem[] {
  const NO_NAMES = new Map<string, string>(); // "used" ignores category names
  return links
    .filter((link) => link.click_count > 0)
    .sort((a, b) => compareLinks(a, b, "used", NO_NAMES))
    .slice(0, limit);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/dashboard/link-order.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Run the gates**

Run each directly: `npm run lint`, `npx tsc --noEmit`, `npm test`
Expected: all exit 0.

- [ ] **Step 6: Commit**

```bash
git add lib/dashboard/link-order.ts lib/dashboard/link-order.test.ts
git commit -m "feat(links): used-sort comparator and selectFrequentLinks"
```

---

### Task 3: Click beacon helper + increment route

**Files:**
- Create: `lib/dashboard/record-click.ts`
- Create: `app/api/links/[id]/click/route.ts`

**Interfaces:**
- Consumes: `requireAdminAuth`, `apiError`, `isUuid` from `@/lib/dashboard/api` / `@/lib/auth/admin-guard`; the `increment_link_click` RPC (Task 1).
- Produces:
  - `recordLinkClick(id: string): void` (fires `navigator.sendBeacon`).
  - `POST /api/links/[id]/click` → bare updated link entity (200) / 404 / 500.

This task has no unit test (no route-test harness in the repo). Verify via build + the inspection checklist in Step 4.

- [ ] **Step 1: Write the beacon helper**

Create `lib/dashboard/record-click.ts`:

```ts
/**
 * Records a link click without delaying navigation. `sendBeacon` queues a POST
 * the browser is guaranteed to send even as the new tab opens; there is no
 * response to read, by design. A dropped beacon simply loses one count — the
 * stored value reconciles on the next page load. Callers optimistically bump
 * their local count separately so the badge updates immediately.
 */
export function recordLinkClick(id: string): void {
  if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") {
    return;
  }

  navigator.sendBeacon(`/api/links/${id}/click`);
}
```

- [ ] **Step 2: Write the route**

Create `app/api/links/[id]/click/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";

import { requireAdminAuth } from "@/lib/auth/admin-guard";
import { apiError, isUuid } from "@/lib/dashboard/api";
import type { LinkItem } from "@/lib/dashboard/types";

/**
 * POST /api/links/[id]/click
 *
 * Atomically increments the link's click_count (and last_clicked_at) via the
 * increment_link_click RPC, which runs security invoker so the admin RLS policy
 * still gates the write. Returns the updated link entity (200); an unknown id —
 * or an id RLS refuses — comes back as NULL from the RPC and is a 404.
 *
 * Called by navigator.sendBeacon, which ignores the response; the body exists
 * for the wire convention and for reading the stored value in verification.
 */
export async function POST(
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
    .rpc("increment_link_click", { link_id: id })
    .maybeSingle();

  if (error) {
    console.error("Link click increment error:", error);
    return apiError("SERVER_ERROR", "Could not record the click.", 500);
  }

  if (!data) {
    return apiError("NOT_FOUND", "No link with that id.", 404);
  }

  return NextResponse.json(data as LinkItem, { status: 200 });
}
```

- [ ] **Step 3: Run the gates (including build)**

Run each directly: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`
Expected: all exit 0. In the build route list, confirm `/api/links/[id]/click` appears as a dynamic (ƒ) route.

- [ ] **Step 4: Inspection checklist (record results in the report)**

Confirm by reading the route file:
- `requireAdminAuth(request)` is the FIRST statement; on `authResult.error`, returns before `params` is awaited or the RPC is called.
- `isUuid(id)` runs before the RPC — a malformed id is a 404, never a Postgres `22P02` → 500.
- The RPC name and arg key are exactly `increment_link_click` / `link_id` (must match Task 1's migration).
- The success path returns the bare entity (200); `!data` → 404; `error` → 500. No secret columns exist on `dashboard_links`, so returning the row is safe.

- [ ] **Step 5: Commit**

```bash
git add lib/dashboard/record-click.ts "app/api/links/[id]/click/route.ts"
git commit -m "feat(links): click beacon helper and increment route"
```

---

### Task 4: Links section — badge, "Most used" sort, click wiring

**Files:**
- Modify: `components/dashboard/links/links-view.tsx` (`SORT_OPTIONS`, `LinkRow` badge + click, parent handler)

**Interfaces:**
- Consumes: `recordLinkClick` (Task 3); `LinkSortKey` now includes `"used"` (Task 2); `link.click_count` (Task 1).
- Produces: a "Most used" sort option; a per-row count badge (accent-tinted when the active sort is `"used"`); a click that fires the beacon and optimistically bumps local state.

No unit test (view logic; the pure pieces are tested in Task 2). Verify via lint/tsc/test/build.

- [ ] **Step 1: Add the sort option**

In `components/dashboard/links/links-view.tsx`, add to `SORT_OPTIONS` (lines 30-35), after the `"category"` entry:

```ts
  { value: "used", label: "Most used" },
```

- [ ] **Step 2: Import the beacon helper**

Add near the other `@/lib/dashboard` imports at the top of the file:

```ts
import { recordLinkClick } from "@/lib/dashboard/record-click";
```

- [ ] **Step 3: Add the parent click handler and pass sort down**

In `DashboardLinksView` (the default export, state at line 349), add a handler after the existing handlers (e.g. near `handleSortChange`):

```ts
  // Fire-and-forget beacon plus an optimistic local bump so the badge updates
  // and a "used" sort re-orders immediately. No rollback — the server value
  // wins on the next page load (see record-click.ts).
  function handleLinkActivate(link: LinkItem) {
    recordLinkClick(link.id);
    setLinks((prev) =>
      prev.map((item) =>
        item.id === link.id ? { ...item, click_count: item.click_count + 1 } : item
      )
    );
  }
```

Find where `LinkRow` is rendered (it is rendered in the pinned band and the main/grouped lists). For every `<LinkRow ... />` usage, add these two props:

```tsx
          onActivate={handleLinkActivate}
          rankBadge={sort === "used"}
```

- [ ] **Step 4: Extend `LinkRow` to show the badge and record clicks**

In the `LinkRow` component (signature at lines 251-276), add to the destructured props and the prop type:

```tsx
function LinkRow({
  link,
  categoryName,
  draggable,
  onEdit,
  onTogglePin,
  onDelete,
  onActivate,
  rankBadge,
  dragHandleProps,
  rowProps,
}: {
  link: LinkItem;
  categoryName: string;
  draggable: boolean;
  onEdit: (link: LinkItem) => void;
  onTogglePin: (link: LinkItem) => void;
  onDelete: (link: LinkItem) => void;
  onActivate: (link: LinkItem) => void;
  rankBadge: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLElement>;
  rowProps?: React.HTMLAttributes<HTMLLIElement> & {
    ref?: (element: HTMLElement | null) => void;
    [key: `data-${string}`]: string | undefined;
  };
}) {
```

Add an `onClick` to the link anchor (currently lines 311-318):

```tsx
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onActivate(link)}
          className="block truncate text-sm font-semibold text-text hover:text-accent"
        >
          {link.title}
        </a>
```

Insert the count badge between the title/host `<div>` (ends ~line 322) and the category pill (`{categoryName}` span, ~line 324). The badge is muted normally, accent-tinted when `rankBadge`:

```tsx
      <span
        aria-label={`${link.click_count} clicks`}
        className={[
          "flex flex-none items-center gap-[5px] rounded-[20px] border px-[9px] py-[3px] font-mono text-[11px] tabular-nums",
          rankBadge
            ? "border-transparent bg-accent-soft text-accent"
            : "border-border bg-surface-2 text-muted",
        ].join(" ")}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="11"
          height="11"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 4l7 16 2-7 7-2z" />
        </svg>
        {link.click_count}
      </span>
```

- [ ] **Step 5: Run the gates (including build)**

Run each directly: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`
Expected: all exit 0. (tsc will fail if any `LinkRow` usage is missing the new required `onActivate`/`rankBadge` props — that is the safety net; add the props to every usage.)

- [ ] **Step 6: Commit**

```bash
git add components/dashboard/links/links-view.tsx
git commit -m "feat(links): count badge, Most-used sort, and click recording"
```

---

### Task 5: Overview "Frequent links" card

**Files:**
- Create: `components/dashboard/overview/frequent-links.tsx`
- Modify: `app/dashboard/page.tsx` (two link queries + render the card)

**Interfaces:**
- Consumes: `OverviewCard` (from the Overview feature), `selectFrequentLinks` (Task 2), `recordLinkClick` (Task 3), `useWorkspace()`, `LinkItem`, `LINK_COLUMNS`, `createServerSupabaseClient`.
- Produces: a workspace-scoped top-5 Frequent-links card on `/dashboard`.

No unit test (view logic; `selectFrequentLinks` is tested in Task 2). Verify via lint/tsc/build.

- [ ] **Step 1: Create the card component**

Create `components/dashboard/overview/frequent-links.tsx`:

```tsx
"use client";

import OverviewCard from "@/components/dashboard/overview/overview-card";
import { useWorkspace } from "@/components/dashboard/workspace-context";
import { selectFrequentLinks } from "@/lib/dashboard/link-order";
import { recordLinkClick } from "@/lib/dashboard/record-click";
import type { LinkItem } from "@/lib/dashboard/types";

const LIMIT = 5;

/** Host label for the sub-line, mirroring the Links section's presentation. */
function hostLabel(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Workspace-scoped top-5 most-clicked links. Both workspaces arrive as props;
 * the Work/Home toggle is a re-filter, not a refetch — the Overview pattern.
 */
export default function FrequentLinks({
  workLinks,
  homeLinks,
}: {
  workLinks: LinkItem[];
  homeLinks: LinkItem[];
}) {
  const { workspace } = useWorkspace();
  const links = selectFrequentLinks(workspace === "work" ? workLinks : homeLinks, LIMIT);

  return (
    <OverviewCard title="Frequent links" meta={`${workspace} · most used`} href="/dashboard/links">
      {links.length === 0 ? (
        <p className="px-5 py-[18px] text-sm text-text-2">
          Your most-used links will show here once you start clicking.
        </p>
      ) : (
        <ul className="m-0 list-none p-0">
          {links.map((link) => (
            <li key={link.id} className="border-b border-border last:border-b-0">
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => recordLinkClick(link.id)}
                className="flex items-center gap-3 px-5 py-[13px] hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-text">
                    {link.title}
                  </span>
                  <span className="block truncate font-mono text-[11px] text-muted">
                    {hostLabel(link.url)}
                  </span>
                </span>
                <span
                  aria-label={`${link.click_count} clicks`}
                  className="flex flex-none items-center gap-[5px] rounded-[20px] border border-transparent bg-accent-soft px-[9px] py-[3px] font-mono text-[11px] tabular-nums text-accent"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    width="11"
                    height="11"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 4l7 16 2-7 7-2z" />
                  </svg>
                  {link.click_count}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </OverviewCard>
  );
}
```

Note: the Overview card does NOT optimistically bump (unlike the Links section) — a click there navigates away from `/dashboard`, so a live re-order is pointless; the beacon still records it and the next visit reflects the new count. This is intentional; keep it simple.

- [ ] **Step 2: Add the link queries to the Overview page**

In `app/dashboard/page.tsx`, add the import:

```tsx
import FrequentLinks from "@/components/dashboard/overview/frequent-links";
import { LINK_COLUMNS, NOTE_COLUMNS } from "@/lib/dashboard/api";
import type { LinkItem, NoteItem } from "@/lib/dashboard/types";
```

(Adjust the existing `NOTE_COLUMNS` / `NoteItem` imports to the combined forms above rather than duplicating them.)

Extend the existing `Promise.all` to also fetch links per workspace, ordered by `click_count` desc, limit 5:

```tsx
  const [workResult, homeResult, workLinksResult, homeLinksResult] = await Promise.all([
    supabase
      .from("dashboard_notes")
      .select(NOTE_COLUMNS)
      .eq("ctx", "work")
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase
      .from("dashboard_notes")
      .select(NOTE_COLUMNS)
      .eq("ctx", "home")
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase
      .from("dashboard_links")
      .select(LINK_COLUMNS)
      .eq("ctx", "work")
      .order("click_count", { ascending: false })
      .limit(5),
    supabase
      .from("dashboard_links")
      .select(LINK_COLUMNS)
      .eq("ctx", "home")
      .order("click_count", { ascending: false })
      .limit(5),
  ]);
```

After the existing `notesError` handling, add:

```tsx
  if (workLinksResult.error || homeLinksResult.error) {
    console.error(
      "Overview links load error:",
      workLinksResult.error ?? homeLinksResult.error
    );
  }

  const workLinks: LinkItem[] = workLinksResult.data ?? [];
  const homeLinks: LinkItem[] = homeLinksResult.data ?? [];
```

Render the card after the Recent-notes block, inside the returned fragment:

```tsx
      <FrequentLinks workLinks={workLinks} homeLinks={homeLinks} />
```

(The `?? []` fallback means a links-query error degrades to the empty-state card rather than taking down the page — consistent with the notes handling.)

- [ ] **Step 3: Run the gates (including build)**

Run each directly: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`
Expected: all exit 0. Confirm `/dashboard` remains dynamic (ƒ) in the build output.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/overview/frequent-links.tsx app/dashboard/page.tsx
git commit -m "feat(overview): Frequent links card, workspace-scoped"
```

---

### Task 6: Full gates, migration application, deferred record

**Files:** none created; controller-run verification and DB migration application.

- [ ] **Step 1: Run all four gates on the branch tip**

Run each **directly**, checking each exit code:

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

Expected: all exit 0. Build shows `/api/links/[id]/click` (ƒ) and `/dashboard` (ƒ).

- [ ] **Step 2: Apply the migration to the database (controller, via Supabase MCP)**

Apply `202607240001_link_click_tracking.sql` with `apply_migration`. Then verify **without selecting any secret** (there are none on `dashboard_links`, but keep to introspection):
- `list_tables` / `information_schema.columns` shows `click_count` (integer, default 0, not null) and `last_clicked_at` (timestamptz) on `dashboard_links`.
- The `increment_link_click` function exists and is `security invoker` (`pg_proc.prosecdef = false`).
- `get_advisors(security)` reports no NEW warning attributable to this migration (pre-existing accepted warnings per `[[is-admin-execute-grant]]` are expected).

- [ ] **Step 3: Record deferred verification**

These need a live signed-in session / real clicks and are **deferred, not skipped** (record in the PR):
- A real left-click on a link fires the beacon and the stored `click_count` increments — **prove by reading the row** (`select id, click_count, last_clicked_at from dashboard_links where id = …`), not by trusting the 200.
- The count persists across a page reload.
- The "Most used" sort and the Frequent card order correctly, per workspace (Work vs Home show different lists).
- Middle-click / cmd-click may not count (the `onClick` path is left-click) — confirm this is acceptable; it is documented as a known limitation.

- [ ] **Step 4: Confirm a clean tree**

```bash
git status --untracked-files=all
```

Expected: clean tree on `feature/link-click-tracking` (anchored-gitignore check per global CLAUDE.md).
