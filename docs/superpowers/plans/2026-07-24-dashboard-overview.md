# Dashboard Overview Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/dashboard` → Links redirect with a read-only "Overview" briefing page — due & overdue GSD tasks (streamed) plus recent notes (workspace-scoped) — and add an Overview nav entry.

**Architecture:** `app/dashboard/page.tsx` becomes a server page that awaits two fast Supabase note queries and renders immediately; the tasks card is an async server component behind `<Suspense>` so the slow Project-GSD call streams in. All date bucketing happens in client components against the browser's local date (the server runs UTC). Spec: `docs/superpowers/specs/2026-07-24-dashboard-overview-design.md`.

**Tech Stack:** Next.js 16 App Router (RSC + Suspense streaming), Tailwind CSS v4, Supabase JS (server client), existing `lib/gsd/client`, Vitest.

## Global Constraints

- **Next.js 16 / Tailwind v4** differ from training data — consult `node_modules/next/dist/docs/` before deviating from the code given here.
- **Tasks are NOT workspace-scoped; notes ARE.** Do not add `useWorkspace()` anywhere in the tasks card (AGENTS.md calls accidental scoping the most common mistake in this repo).
- **Never compute "today" during server render** — server runs UTC; local dates enter client state via `useEffect` (pattern already in `components/dashboard/tasks/tasks-view.tsx:232-244`).
- **No new API routes, no DB migration, no data-fetching library, no `useEffect` state synchronisation** (the two sanctioned effects here are clock/date reads, matching tasks-view).
- Gates for every task: `npm run lint`, `npx tsc --noEmit`, `npm test` — run each **directly** (never piped into `tail`; exit codes must be the command's own). `npm run build` runs in the final task.
- Commit after each task with the message given in the task.

---

### Task 1: Pure overview helpers in `lib/dashboard/overview.ts`

**Files:**
- Create: `lib/dashboard/overview.ts`
- Create: `lib/dashboard/overview.test.ts`
- Modify: `components/dashboard/tasks/tasks-view.tsx:90-97` (replace private `localTodayIso` with an import)

**Interfaces:**
- Consumes: `GsdTask` from `@/lib/gsd/client` (fields used: `done: boolean`, `dueDate: string | null`).
- Produces (used by Tasks 2–3):
  - `localTodayIso(): string`
  - `formatShortDate(iso: string): string` — `"Jul 21"` from `"2026-07-21"`
  - `selectDueTasks(tasks: GsdTask[], todayIso: string): GsdTask[]`
  - `capRows<T>(rows: T[], max: number): { shown: T[]; extra: number }`
  - `noteSnippet(html: string, maxLength?: number): string` (default 120)
  - `relativeTime(iso: string, nowMs: number): string`

- [ ] **Step 1: Write the failing tests**

Create `lib/dashboard/overview.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  capRows,
  formatShortDate,
  localTodayIso,
  noteSnippet,
  relativeTime,
  selectDueTasks,
} from "@/lib/dashboard/overview";
import type { GsdTask } from "@/lib/gsd/client";

/** Minimal valid GsdTask; tests override only what they exercise. */
function task(overrides: Partial<GsdTask>): GsdTask {
  return {
    id: "t-default",
    title: "Task",
    done: false,
    status: "todo",
    priority: "none",
    dueDate: null,
    dueTime: null,
    repeat: "none",
    notes: "",
    assigneeId: null,
    linkedListId: null,
    subtasks: [],
    attachments: [],
    position: 0,
    tags: [],
    createdAt: "2026-07-01T00:00:00Z",
    listId: "l1",
    ...overrides,
  };
}

const TODAY = "2026-07-24";

describe("selectDueTasks", () => {
  it("keeps only open tasks due on or before today", () => {
    const tasks = [
      task({ id: "done", done: true, dueDate: "2026-07-20" }),
      task({ id: "no-due", dueDate: null }),
      task({ id: "future", dueDate: "2026-07-25" }),
      task({ id: "today", dueDate: TODAY }),
      task({ id: "overdue", dueDate: "2026-07-22" }),
    ];

    expect(selectDueTasks(tasks, TODAY).map((t) => t.id)).toEqual(["overdue", "today"]);
  });

  it("orders overdue oldest-first, then due-today in input order", () => {
    const tasks = [
      task({ id: "today-1", dueDate: TODAY }),
      task({ id: "overdue-new", dueDate: "2026-07-23" }),
      task({ id: "today-2", dueDate: TODAY }),
      task({ id: "overdue-old", dueDate: "2026-07-10" }),
    ];

    expect(selectDueTasks(tasks, TODAY).map((t) => t.id)).toEqual([
      "overdue-old",
      "overdue-new",
      "today-1",
      "today-2",
    ]);
  });

  it("returns empty for no matches", () => {
    expect(selectDueTasks([task({ dueDate: "2026-08-01" })], TODAY)).toEqual([]);
  });
});

describe("capRows", () => {
  it("passes through at or under the cap", () => {
    expect(capRows([1, 2, 3], 3)).toEqual({ shown: [1, 2, 3], extra: 0 });
  });

  it("slices and counts the remainder over the cap", () => {
    expect(capRows([1, 2, 3, 4, 5], 3)).toEqual({ shown: [1, 2, 3], extra: 2 });
  });
});

describe("noteSnippet", () => {
  it("strips tags, decodes basic entities, collapses whitespace", () => {
    expect(noteSnippet("<p>Alpha&nbsp;&amp; beta</p>\n<p>gamma</p>")).toBe("Alpha & beta gamma");
  });

  it("truncates long text with an ellipsis within maxLength", () => {
    const out = noteSnippet(`<p>${"word ".repeat(60)}</p>`, 40);

    expect(out.length).toBeLessThanOrEqual(40);
    expect(out.endsWith("…")).toBe(true);
  });

  it("returns empty string for empty/whitespace-only bodies", () => {
    expect(noteSnippet("<p> </p>")).toBe("");
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2026-07-24T12:00:00Z");

  it("buckets recent times", () => {
    expect(relativeTime("2026-07-24T11:59:40Z", now)).toBe("just now");
    expect(relativeTime("2026-07-24T11:35:00Z", now)).toBe("25m ago");
    expect(relativeTime("2026-07-24T07:00:00Z", now)).toBe("5h ago");
    expect(relativeTime("2026-07-23T09:00:00Z", now)).toBe("yesterday");
    expect(relativeTime("2026-07-20T12:00:00Z", now)).toBe("4d ago");
  });

  it("falls back to a short date at 7 days and beyond", () => {
    expect(relativeTime("2026-07-12T12:00:00Z", now)).toBe("Jul 12");
  });
});

describe("formatShortDate", () => {
  it("formats a date-only ISO string", () => {
    expect(formatShortDate("2026-07-21")).toBe("Jul 21");
  });
});

describe("localTodayIso", () => {
  it("returns a local YYYY-MM-DD string", () => {
    expect(localTodayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/dashboard/overview.test.ts`
Expected: FAIL — cannot resolve `@/lib/dashboard/overview`.

- [ ] **Step 3: Write the implementation**

Create `lib/dashboard/overview.ts`:

```ts
import type { GsdTask } from "@/lib/gsd/client";

/** Local YYYY-MM-DD for "today", in the viewer's timezone. */
export function localTodayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${now.getFullYear()}-${month}-${day}`;
}

/** "Jul 21" from a YYYY-MM-DD string. */
export function formatShortDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);

  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * Open tasks due on or before `todayIso`: overdue first (oldest due date
 * first), then due-today in GSD's own order. GSD due dates are date-only ISO
 * strings, so plain string comparison is a correct date comparison.
 */
export function selectDueTasks(tasks: GsdTask[], todayIso: string): GsdTask[] {
  const due = tasks.filter(
    (t): t is GsdTask & { dueDate: string } =>
      !t.done && t.dueDate !== null && t.dueDate <= todayIso
  );

  const overdue = due
    .filter((t) => t.dueDate < todayIso)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const dueToday = due.filter((t) => t.dueDate === todayIso);

  return [...overdue, ...dueToday];
}

/** First `max` rows plus how many were cut — feeds the "+N more" link. */
export function capRows<T>(rows: T[], max: number): { shown: T[]; extra: number } {
  if (rows.length <= max) {
    return { shown: rows, extra: 0 };
  }

  return { shown: rows.slice(0, max), extra: rows.length - max };
}

/**
 * Plain-text preview of a note's sanitized HTML body. Tags become spaces so
 * adjacent blocks don't fuse into one word; only the entities the sanitizer
 * emits need decoding.
 */
export function noteSnippet(html: string, maxLength = 120): string {
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** "just now", "5m ago", "3h ago", "yesterday", "4d ago", then "Jul 12". */
export function relativeTime(iso: string, nowMs: number): string {
  const diff = nowMs - Date.parse(iso);

  if (diff < MINUTE_MS) {
    return "just now";
  }
  if (diff < HOUR_MS) {
    return `${Math.floor(diff / MINUTE_MS)}m ago`;
  }
  if (diff < DAY_MS) {
    return `${Math.floor(diff / HOUR_MS)}h ago`;
  }
  if (diff < 2 * DAY_MS) {
    return "yesterday";
  }
  if (diff < 7 * DAY_MS) {
    return `${Math.floor(diff / DAY_MS)}d ago`;
  }

  return formatShortDate(iso.slice(0, 10));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/dashboard/overview.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: De-duplicate `localTodayIso` in tasks-view**

In `components/dashboard/tasks/tasks-view.tsx`, delete the private function (lines ~90–97):

```ts
/** Local YYYY-MM-DD for "today", in the viewer's timezone. */
function localTodayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${now.getFullYear()}-${month}-${day}`;
}
```

and add to the file's imports:

```ts
import { localTodayIso } from "@/lib/dashboard/overview";
```

(Keep the file's `formatDue`/`dueClass` untouched — they have Tasks-specific "Today" behavior.)

- [ ] **Step 6: Run the gates**

Run each directly: `npm run lint`, `npx tsc --noEmit`, `npm test`
Expected: all pass with exit code 0.

- [ ] **Step 7: Commit**

```bash
git add lib/dashboard/overview.ts lib/dashboard/overview.test.ts components/dashboard/tasks/tasks-view.tsx
git commit -m "feat(overview): pure helpers for due-task bucketing and note snippets"
```

---

### Task 2: Overview card chrome + tasks brief components

**Files:**
- Create: `components/dashboard/overview/overview-card.tsx`
- Create: `components/dashboard/overview/tasks-brief-skeleton.tsx`
- Create: `components/dashboard/overview/tasks-brief-view.tsx`
- Create: `components/dashboard/overview/tasks-brief.tsx`

**Interfaces:**
- Consumes (from Task 1): `selectDueTasks`, `capRows`, `formatShortDate`, `localTodayIso` from `@/lib/dashboard/overview`; `getLists`, `getAllTasks`, `GsdTask` from `@/lib/gsd/client`.
- Produces (used by Task 3 & 4):
  - `OverviewCard({ title, meta, href, children }: { title: string; meta?: string; href: string; children: React.ReactNode })` — default export, card shell with header + "View all →" link. No `"use client"` directive (usable from both server and client trees).
  - `TasksBriefSkeleton()` — default export, presentational, no props.
  - `TasksBrief()` — default export, **async server component**, no props.

There is no component-test infrastructure in this repo (Vitest covers `lib/` only); verification for this task is lint + typecheck, with behavior guaranteed by Task 1's tested helpers and the final build gate.

- [ ] **Step 1: Create the card shell**

Create `components/dashboard/overview/overview-card.tsx`:

```tsx
import Link from "next/link";

/**
 * Shared chrome for Overview cards: header row (title, mono meta, "View all")
 * above arbitrary body content. Deliberately not "use client" — the tasks
 * card uses it from a server tree, Recent notes from a client tree.
 */
export default function OverviewCard({
  title,
  meta,
  href,
  children,
}: {
  title: string;
  meta?: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow">
      <div className="flex items-center gap-[10px] border-b border-border px-5 py-[15px]">
        <h2 className="font-heading text-[17px] font-semibold">{title}</h2>
        {meta ? <span className="font-mono text-[11px] text-muted">{meta}</span> : null}
        <Link href={href} className="ml-auto text-[13px] font-semibold text-accent">
          View all →
        </Link>
      </div>
      {children}
    </section>
  );
}
```

- [ ] **Step 2: Create the skeleton**

Create `components/dashboard/overview/tasks-brief-skeleton.tsx`:

```tsx
/**
 * Body-only skeleton for the tasks card. Shared between the Suspense fallback
 * (while the GSD call streams) and TasksBriefView's pre-hydration frame, so
 * the stream resolves into an identical surface with no jump.
 */
export default function TasksBriefSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex animate-pulse flex-col gap-3 p-5 motion-reduce:animate-none"
    >
      <span className="block h-[14px] w-[84%] rounded bg-surface-2" />
      <span className="block h-[14px] w-[72%] rounded bg-surface-2" />
      <span className="block h-[14px] w-[58%] rounded bg-surface-2" />
    </div>
  );
}
```

- [ ] **Step 3: Create the client view (local-date bucketing)**

Create `components/dashboard/overview/tasks-brief-view.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import TasksBriefSkeleton from "@/components/dashboard/overview/tasks-brief-skeleton";
import { capRows, formatShortDate, localTodayIso, selectDueTasks } from "@/lib/dashboard/overview";
import type { GsdTask } from "@/lib/gsd/client";

const MAX_ROWS = 10;

export default function TasksBriefView({
  tasks,
  listNames,
}: {
  tasks: GsdTask[];
  listNames: Record<string, string>;
}) {
  /*
   * "Today" is client-local information the server render cannot know: the
   * server runs in UTC, so bucketing during render would disagree with the
   * client for part of every day — a hydration mismatch. Same sanctioned
   * clock-read-in-effect as tasks-view. While null, this renders the same
   * skeleton as the Suspense fallback, so the swap is invisible.
   */
  const [todayIso, setTodayIso] = useState<string | null>(null);

  useEffect(() => {
    setTodayIso(localTodayIso());
  }, []);

  if (todayIso === null) {
    return <TasksBriefSkeleton />;
  }

  const due = selectDueTasks(tasks, todayIso);

  if (due.length === 0) {
    return (
      <div className="p-5">
        <p className="font-heading text-[15px] font-semibold">Nothing due — all clear</p>
        <p className="mt-1 text-sm text-text-2">
          No overdue or due-today tasks.{" "}
          <Link href="/dashboard/tasks" className="font-semibold text-accent">
            Open Tasks
          </Link>{" "}
          to see everything else.
        </p>
      </div>
    );
  }

  const { shown, extra } = capRows(due, MAX_ROWS);

  return (
    <ul className="m-0 list-none p-0">
      {shown.map((task) => {
        // selectDueTasks only returns tasks with a dueDate ≤ today.
        const overdue = task.dueDate !== null && task.dueDate < todayIso;

        return (
          <li
            key={task.id}
            className="flex items-center gap-3 border-b border-border px-5 py-[13px] last:border-b-0"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-text">{task.title}</span>
              <span className="block truncate font-mono text-[11px] text-muted">
                {listNames[task.listId] ?? "—"}
              </span>
            </span>
            {overdue ? (
              <span className="flex-none rounded-full bg-red-500/10 px-[10px] py-[3px] font-mono text-[11px] font-medium text-red-500">
                Overdue · {task.dueDate === null ? "" : formatShortDate(task.dueDate)}
              </span>
            ) : (
              <span className="flex-none rounded-full bg-accent-soft px-[10px] py-[3px] font-mono text-[11px] font-medium text-accent">
                Today
              </span>
            )}
          </li>
        );
      })}
      {extra > 0 ? (
        <li>
          <Link
            href="/dashboard/tasks"
            className="block px-5 py-[13px] text-[13px] font-semibold text-accent"
          >
            ＋{extra} more in Tasks
          </Link>
        </li>
      ) : null}
    </ul>
  );
}
```

- [ ] **Step 4: Create the async server component**

Create `components/dashboard/overview/tasks-brief.tsx`:

```tsx
import Link from "next/link";

import TasksBriefView from "@/components/dashboard/overview/tasks-brief-view";
import { getAllTasks, getLists } from "@/lib/gsd/client";

/**
 * Streams inside the Overview page's <Suspense>. NOT workspace-scoped: GSD
 * knows nothing about Work/Home. Failures degrade to an inline card — never
 * a page-level error — because the rest of the Overview is independent.
 */
export default async function TasksBrief() {
  const [lists, tasks] = await Promise.all([getLists(), getAllTasks()]);

  const failure = !lists.ok ? lists.error : !tasks.ok ? tasks.error : null;

  if (failure) {
    // status -1 = no key configured — a setup state, not an error.
    if (failure.status === -1) {
      return (
        <div className="p-5">
          <p className="font-heading text-[15px] font-semibold">Connect Project-GSD</p>
          <p className="mt-1 text-sm text-text-2">
            Tasks show here once an API key is connected. Add one in{" "}
            <Link href="/dashboard/settings" className="font-semibold text-accent">
              Settings
            </Link>
            .
          </p>
        </div>
      );
    }

    // GsdError never contains the key, so this log is safe.
    console.error("Overview tasks load error:", failure);

    return (
      <div className="p-5">
        <p className="font-heading text-[15px] font-semibold">Tasks unavailable</p>
        <p className="mt-1 text-sm text-text-2">
          Project-GSD didn&rsquo;t respond. The rest of the page is unaffected — try again from{" "}
          <Link href="/dashboard/tasks" className="font-semibold text-accent">
            Tasks
          </Link>
          .
        </p>
      </div>
    );
  }

  if (!lists.ok || !tasks.ok) {
    // Unreachable (failure covered both), but narrows the types below.
    return null;
  }

  // Server→client props must be serializable: a plain Record, not a Map.
  const listNames = Object.fromEntries(lists.data.map((list) => [list.id, list.name]));

  return <TasksBriefView tasks={tasks.data} listNames={listNames} />;
}
```

- [ ] **Step 5: Run the gates**

Run each directly: `npm run lint`, `npx tsc --noEmit`, `npm test`
Expected: all pass with exit code 0.

- [ ] **Step 6: Commit**

```bash
git add components/dashboard/overview/
git commit -m "feat(overview): tasks brief card with streamed GSD states"
```

---

### Task 3: Recent notes card

**Files:**
- Create: `components/dashboard/overview/recent-notes.tsx`

**Interfaces:**
- Consumes: `OverviewCard` (Task 2), `noteSnippet`/`relativeTime` (Task 1), `useWorkspace` from `@/components/dashboard/workspace-context`, `NoteItem` from `@/lib/dashboard/types`.
- Produces (used by Task 4): `RecentNotes({ workNotes, homeNotes }: { workNotes: NoteItem[]; homeNotes: NoteItem[] })` — default export, `"use client"`.

- [ ] **Step 1: Create the component**

Create `components/dashboard/overview/recent-notes.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import OverviewCard from "@/components/dashboard/overview/overview-card";
import { useWorkspace } from "@/components/dashboard/workspace-context";
import { noteSnippet, relativeTime } from "@/lib/dashboard/overview";
import type { NoteItem } from "@/lib/dashboard/types";

/**
 * Workspace-scoped (unlike the tasks card): both workspaces arrive as props,
 * so the Work/Home toggle is a re-filter, not a refetch — the Notes page's
 * own pattern.
 */
export default function RecentNotes({
  workNotes,
  homeNotes,
}: {
  workNotes: NoteItem[];
  homeNotes: NoteItem[];
}) {
  const { workspace } = useWorkspace();
  const notes = workspace === "work" ? workNotes : homeNotes;

  // Relative times read the clock, which the server render cannot share —
  // same sanctioned clock-read-in-effect as tasks-view. Pills appear one
  // frame after hydration; the rows themselves render immediately.
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    setNowMs(Date.now());
  }, []);

  return (
    <OverviewCard title="Recent notes" meta={`${workspace} · by last edit`} href="/dashboard/notes">
      {notes.length === 0 ? (
        <p className="px-5 py-[18px] text-sm text-text-2">No notes in this workspace yet.</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {notes.map((note) => (
            <li key={note.id} className="border-b border-border last:border-b-0">
              <Link
                href="/dashboard/notes"
                className="flex items-center gap-3 px-5 py-[13px] hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-text">
                    {note.title}
                  </span>
                  <span className="block truncate text-xs text-text-2">
                    {noteSnippet(note.content_html)}
                  </span>
                </span>
                {nowMs === null ? null : (
                  <span className="flex-none rounded-full bg-surface-2 px-[10px] py-[3px] font-mono text-[11px] text-muted">
                    {relativeTime(note.updated_at, nowMs)}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </OverviewCard>
  );
}
```

- [ ] **Step 2: Run the gates**

Run each directly: `npm run lint`, `npx tsc --noEmit`, `npm test`
Expected: all pass with exit code 0.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/overview/recent-notes.tsx
git commit -m "feat(overview): recent notes card, workspace-scoped"
```

---

### Task 4: Overview page replaces the redirect

**Files:**
- Modify: `app/dashboard/page.tsx` (full replacement — today it is a 5-line redirect to `/dashboard/links`)

**Interfaces:**
- Consumes: `OverviewCard`, `TasksBrief`, `TasksBriefSkeleton` (Task 2), `RecentNotes` (Task 3), `NOTE_COLUMNS` from `@/lib/dashboard/api`, `NoteItem` from `@/lib/dashboard/types`, `createServerSupabaseClient` from `@/lib/supabase/server`.
- Produces: `/dashboard` renders the Overview; login lands here (the auth flow's default `next` is already `/dashboard` — no auth changes).

- [ ] **Step 1: Replace the page**

Replace the entire contents of `app/dashboard/page.tsx`:

```tsx
import type { Metadata } from "next";
import { Suspense } from "react";

import OverviewCard from "@/components/dashboard/overview/overview-card";
import RecentNotes from "@/components/dashboard/overview/recent-notes";
import TasksBrief from "@/components/dashboard/overview/tasks-brief";
import TasksBriefSkeleton from "@/components/dashboard/overview/tasks-brief-skeleton";
import { NOTE_COLUMNS } from "@/lib/dashboard/api";
import type { NoteItem } from "@/lib/dashboard/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Overview",
};

// Cookie reads and the no-store GSD fetch force this anyway; declared to
// match the Tasks page's explicitness.
export const dynamic = "force-dynamic";

/**
 * Post-login briefing: due & overdue tasks (streamed — GSD is an external
 * call and must not block the page), then recent notes. The notes queries
 * are fast Supabase reads, awaited before first byte; per-workspace limits
 * keep one workspace from starving the other in the client-side re-filter.
 */
export default async function OverviewPage() {
  // The dashboard layout has already established that the caller is the admin.
  const supabase = await createServerSupabaseClient();

  const [workResult, homeResult] = await Promise.all([
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
  ]);

  const notesError = workResult.error ?? homeResult.error;

  if (notesError) {
    console.error("Overview notes load error:", notesError);
  }

  const workNotes: NoteItem[] = workResult.data ?? [];
  const homeNotes: NoteItem[] = homeResult.data ?? [];

  return (
    <>
      <OverviewCard title="Needs attention" meta="project-gsd" href="/dashboard/tasks">
        <Suspense fallback={<TasksBriefSkeleton />}>
          <TasksBrief />
        </Suspense>
      </OverviewCard>

      {notesError ? (
        <section className="rounded-2xl border border-border bg-surface p-5 shadow">
          <h2 className="font-heading text-[17px] font-semibold">Recent notes</h2>
          <p className="mt-2 text-sm text-text-2">
            Notes could not be loaded. Reload the page — if it keeps failing, the dashboard
            tables are unavailable.
          </p>
        </section>
      ) : (
        <RecentNotes workNotes={workNotes} homeNotes={homeNotes} />
      )}
    </>
  );
}
```

- [ ] **Step 2: Manually verify streaming in the dev server**

Run: `npm run dev` — **confirm the port is free first and that the ready line names this process** (a stale server on the same port has produced false passes in this repo twice). Visit `http://127.0.0.1:3000/dashboard` logged in as admin:

- Page shell + notes card appear immediately; the tasks card shows the 3-bar skeleton, then resolves.
- With no GSD key configured, the card shows "Connect Project-GSD" instead.
- Workspace toggle re-filters Recent notes without a reload and flips the accent.

Stop the dev server afterwards.

- [ ] **Step 3: Run the gates**

Run each directly: `npm run lint`, `npx tsc --noEmit`, `npm test`
Expected: all pass with exit code 0.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat(overview): /dashboard renders the briefing instead of redirecting to Links"
```

---

### Task 5: Overview in the shell navigation

**Files:**
- Modify: `components/dashboard/icons.tsx` (append one icon)
- Modify: `components/dashboard/shell.tsx:21-45` (section type, nav entries, active-state), `:83` (isActive)

**Interfaces:**
- Consumes: existing `NavEntry`/`NAV_ENTRIES`/`isActive` structures in shell.tsx.
- Produces: `OverviewIcon` export in icons.tsx; `DashboardSection` includes `"overview"` (its `DashboardCounts` key exists but no caller supplies a count — no badge renders).

- [ ] **Step 1: Add the icon**

Append to `components/dashboard/icons.tsx` (same `base` spread as its siblings):

```tsx
export function OverviewIcon({ size = 18 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size} strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="m14.8 9.2-1.9 4.7-4.7 1.9 1.9-4.7z" />
    </svg>
  );
}
```

- [ ] **Step 2: Wire the nav entry**

In `components/dashboard/shell.tsx`:

1. Add `OverviewIcon` to the existing import from `@/components/dashboard/icons`.

2. Extend the section type (line 21):

```ts
export type DashboardSection = "overview" | "links" | "notes" | "tasks" | "documents" | "feeds" | "settings";
```

3. Update the `NavEntry.inTabBar` comment (lines 31-34) — it currently says five tabs:

```ts
  /**
   * The bottom tab bar carries the content sections only (Settings stays
   * sidebar-only). Overview and Tasks post-date the design's original four;
   * six tabs.
   */
```

4. Add Overview as the **first** entry of `NAV_ENTRIES` (line 38):

```ts
const NAV_ENTRIES: NavEntry[] = [
  { key: "overview", label: "Overview", href: "/dashboard", Icon: OverviewIcon, inTabBar: true },
  { key: "links", label: "Links", href: "/dashboard/links", Icon: LinkIcon, inTabBar: true },
  // ...remaining entries unchanged
];
```

5. Replace `isActive` (line 83) — the `startsWith` form would light Overview on **every** section, since all live under `/dashboard`:

```ts
  // Overview's href is the section root, so it must match exactly — the
  // prefix rule would light it for every section.
  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname === href || pathname.startsWith(`${href}/`);
```

- [ ] **Step 3: Manually verify active states**

In the dev server (same port hygiene as Task 4): on `/dashboard` only Overview is highlighted (sidebar and mobile tab bar); on `/dashboard/links` only Links is; the header title reads "Overview" on `/dashboard`. At 375px width the six tabs fit without wrapping.

- [ ] **Step 4: Run the gates**

Run each directly: `npm run lint`, `npx tsc --noEmit`, `npm test`
Expected: all pass with exit code 0.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/icons.tsx components/dashboard/shell.tsx
git commit -m "feat(overview): Overview nav entry with exact-match active state"
```

---

### Task 6: Full gates + deferred-verification record

**Files:**
- None created; this task runs the whole-branch gates and records what live verification remains.

- [ ] **Step 1: Run all four gates**

Run each **directly**, one at a time, checking each exit code:

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

Expected: all pass with exit code 0. Never pipe into `tail`/`grep` — that tests the pipe's exit code, not the gate's (this repo has been burned by exactly this).

- [ ] **Step 2: Record deferred verification**

These need live prod or real hardware and are **deferred, not skipped** (AGENTS.md). Record them in the PR description / branch notes:

- Live prod: login lands on `/dashboard` Overview; GSD skeleton visibly streams in; "Connect Project-GSD" state if the key is absent.
- Real phone at 375px: six-tab bar fits; tab navigation to Overview works.
- Visual: `app/dashboard/loading.tsx` (one fill-height card) swaps into two stacked cards — confirm it doesn't jar; only reshape the skeleton if it does.

- [ ] **Step 3: Commit any stragglers and verify clean tree**

```bash
git status --untracked-files=all
```

Expected: clean tree on `feature/dashboard-overview` (anchored-gitignore check per global CLAUDE.md).
