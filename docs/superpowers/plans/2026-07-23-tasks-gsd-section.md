# Tasks (GSD-backed) Dashboard Section — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/dashboard/tasks` section, structurally identical to the Links page, that reads and writes tasks through the Project-GSD API via server-only proxy routes.

**Architecture:** A server-only GSD client (`lib/gsd/client.ts`) holds the bearer key and translates failures into typed results; thin `requireAdminAuth`-guarded routes (`/api/tasks`, `/api/tasks/[id]/toggle`) proxy mutations; the server page fetches lists+tasks directly and hands plain arrays to a `"use client"` view that mirrors `links-view.tsx` (optimistic updates with rollback closures, derived filtering/sorting, localStorage view prefs).

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind v4, vitest (node-only, no jsdom). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-23-tasks-gsd-section-design.md` — read it before starting any task.

## Global Constraints

- `requireAdminAuth(request)` is the **first statement** of every route handler — before `params` is awaited, before the body is read.
- Params are `{ params: Promise<{ id: string }> }`, then `const { id } = await params`. Guard ids with `isUuid` so malformed ids are 404, not 500.
- Wire format: failures `{ error: "MACHINE_CODE", message: "human text" }`; create returns bare entity 201; update/toggle bare entity 200; lists one named collection key (`{ lists, tasks }`).
- **Not workspace-scoped.** Never import `useWorkspace` in Tasks code; no `ctx` anywhere.
- `GSD_API_KEY` is server-only (no `NEXT_PUBLIC_` prefix), read **only** in `lib/gsd/client.ts`, and must never appear in any log, error message, test assertion output, or committed file. Never print its value.
- GSD wire facts: responses camelCase, request bodies snake_case, errors `{error, message}`, unknown ids → 404, new tasks insert at top of list, repeating-task toggle advances `dueDate` instead of completing.
- No `useEffect` state synchronisation — derive from state each render. localStorage prefs restore is the one sanctioned effect (external store read), mirroring `links-view.tsx:402`.
- Gate every task on `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build` — **check exit codes directly**, never through a pipe (`cmd | tail -2 && echo OK` tests tail's exit code — a known false green in this repo).
- Commit messages end with the repo's standard Claude trailer lines.

---

### Task 1: GSD client — `lib/gsd/client.ts`

**Files:**
- Create: `lib/gsd/client.ts`
- Test: `lib/gsd/client.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces (exact exports later tasks rely on):
  - `interface GsdList { id: string; name: string; color: string; remaining: number; taskTemplateId: string | null }`
  - `interface GsdTask { id: string; title: string; done: boolean; status: "todo" | "doing" | "done"; priority: "none" | "low" | "med" | "high"; dueDate: string | null; dueTime: string | null; repeat: "none" | "daily" | "weekly" | "monthly"; notes: string; assigneeId: string | null; linkedListId: string | null; subtasks: { id: string; title: string; done: boolean; notes: string }[]; attachments: { id: string; name: string; size: number; type: string }[]; position: number; tags: string[]; createdAt: string; listId: string }`
  - `interface GsdError { status: number; code: string; message: string }`
  - `type GsdResult<T> = { ok: true; data: T } | { ok: false; error: GsdError }`
  - `isIsoDate(value: string): boolean`
  - `mapGsdFailure(failure: GsdError): { error: string; message: string; status: number }`
  - `getLists(): Promise<GsdResult<GsdList[]>>`
  - `getAllTasks(): Promise<GsdResult<GsdTask[]>>`
  - `createTask(listId: string, input: { title: string; due_date?: string }): Promise<GsdResult<GsdTask>>`
  - `toggleTask(id: string): Promise<GsdResult<GsdTask>>`

- [ ] **Step 1: Write the failing test**

Create `lib/gsd/client.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createTask,
  getAllTasks,
  getLists,
  isIsoDate,
  mapGsdFailure,
  toggleTask,
  type GsdTask,
} from "@/lib/gsd/client";

const KEY = "gsd_testkey_not_real";

/** Minimal valid Task for response payloads. */
const TASK: GsdTask = {
  id: "9b2f8c1e-0000-4000-8000-000000000001",
  title: "Buy milk",
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
  createdAt: "2026-07-23T00:00:00Z",
  listId: "9b2f8c1e-0000-4000-8000-000000000002",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("gsd client", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv("GSD_API_KEY", KEY);
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends the bearer key and hits the lists endpoint", async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));

    const result = await getLists();

    expect(result).toEqual({ ok: true, data: [] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://project-gsd.com/api/v1/lists");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(init.body).toBeUndefined();
  });

  it("fetches all tasks in one call", async () => {
    fetchMock.mockResolvedValue(jsonResponse([TASK]));

    const result = await getAllTasks();

    expect(result.ok).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe("https://project-gsd.com/api/v1/tasks");
  });

  it("creates a task with a snake_case JSON body", async () => {
    fetchMock.mockResolvedValue(jsonResponse(TASK, 201));

    const result = await createTask(TASK.listId, { title: "Buy milk", due_date: "2026-07-24" });

    expect(result).toEqual({ ok: true, data: TASK });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://project-gsd.com/api/v1/lists/${TASK.listId}/tasks`);
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ title: "Buy milk", due_date: "2026-07-24" });
  });

  it("toggles a task with an empty POST", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...TASK, done: true, status: "done" }));

    const result = await toggleTask(TASK.id);

    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://project-gsd.com/api/v1/tasks/${TASK.id}/toggle`);
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
  });

  it("surfaces a GSD error body as a typed failure", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: "INVALID_TITLE", message: "Title is required." }, 400)
    );

    const result = await getLists();

    expect(result).toEqual({
      ok: false,
      error: { status: 400, code: "INVALID_TITLE", message: "Title is required." },
    });
  });

  it("handles a non-JSON error body without throwing", async () => {
    fetchMock.mockResolvedValue(new Response("Bad Gateway", { status: 502 }));

    const result = await getLists();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(502);
      expect(result.error.code).toBe("UPSTREAM_ERROR");
    }
  });

  it("handles a non-JSON success body as a failure, not a crash", async () => {
    fetchMock.mockResolvedValue(new Response("<html>login</html>", { status: 200 }));

    const result = await getLists();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(0);
    }
  });

  it("turns a network failure into a status-0 error", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    const result = await getAllTasks();

    expect(result).toEqual({
      ok: false,
      error: { status: 0, code: "NETWORK", message: "Could not reach Project-GSD." },
    });
  });

  it("fails fast when GSD_API_KEY is unset, without calling fetch", async () => {
    vi.stubEnv("GSD_API_KEY", "");

    const result = await getLists();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(-1);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never leaks the key into any error path", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: "RATE_LIMITED", message: "Slow down." }, 429)
    );

    const result = await getLists();

    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  describe("mapGsdFailure", () => {
    it("maps unset-key (-1) to a 500 SERVER_ERROR", () => {
      expect(mapGsdFailure({ status: -1, code: "NO_KEY", message: "x" })).toEqual({
        error: "SERVER_ERROR",
        message: "The task service is not configured.",
        status: 500,
      });
    });

    it("maps GSD 401 to 502 GSD_AUTH_FAILED (our config problem, not the caller's)", () => {
      expect(mapGsdFailure({ status: 401, code: "UNAUTHORIZED", message: "x" })).toEqual({
        error: "GSD_AUTH_FAILED",
        message: "Project-GSD rejected the API key.",
        status: 502,
      });
    });

    it("maps GSD 404 to our 404 NOT_FOUND", () => {
      expect(mapGsdFailure({ status: 404, code: "NOT_FOUND", message: "x" })).toEqual({
        error: "NOT_FOUND",
        message: "That task or list does not exist in Project-GSD.",
        status: 404,
      });
    });

    it("forwards GSD 429 with its message", () => {
      expect(mapGsdFailure({ status: 429, code: "RATE_LIMITED", message: "Slow down." })).toEqual({
        error: "RATE_LIMITED",
        message: "Slow down.",
        status: 429,
      });
    });

    it("forwards GSD 400 codes and messages verbatim", () => {
      expect(
        mapGsdFailure({ status: 400, code: "INVALID_DUE_DATE", message: "Bad date." })
      ).toEqual({ error: "INVALID_DUE_DATE", message: "Bad date.", status: 400 });
    });

    it("maps everything else (network, 5xx) to 502 GSD_UNAVAILABLE", () => {
      for (const status of [0, 500, 502, 503]) {
        expect(mapGsdFailure({ status, code: "X", message: "x" })).toEqual({
          error: "GSD_UNAVAILABLE",
          message: "Project-GSD is unreachable. Try again shortly.",
          status: 502,
        });
      }
    });
  });

  describe("isIsoDate", () => {
    it("accepts YYYY-MM-DD and rejects everything else", () => {
      expect(isIsoDate("2026-07-23")).toBe(true);
      expect(isIsoDate("2026-7-23")).toBe(false);
      expect(isIsoDate("23-07-2026")).toBe(false);
      expect(isIsoDate("2026-07-23T00:00:00Z")).toBe(false);
      expect(isIsoDate("")).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/gsd/client.test.ts`
Expected: FAIL — cannot resolve `@/lib/gsd/client`.

- [ ] **Step 3: Write the implementation**

Create `lib/gsd/client.ts`:

```ts
/**
 * Server-only client for the Project-GSD API — the single place the
 * GSD_API_KEY is ever read. Nothing in this module may log, echo, or embed the
 * key in an error: every failure message below is static or comes verbatim
 * from GSD's response body.
 *
 * GSD wire conventions (see the API reference in the 2026-07-23 spec):
 * responses are camelCase, request bodies are snake_case, errors are
 * `{ error, message }`, unknown/foreign/archived ids answer 404.
 *
 * Calls never throw for API-level failures — they resolve to a GsdResult so
 * route handlers can map failures deliberately instead of catching.
 */

const BASE_URL = "https://project-gsd.com/api/v1";
const TIMEOUT_MS = 10_000;

export interface GsdList {
  id: string;
  name: string;
  color: string;
  remaining: number;
  taskTemplateId: string | null;
}

export interface GsdSubtask {
  id: string;
  title: string;
  done: boolean;
  notes: string;
}

export interface GsdAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
}

export interface GsdTask {
  id: string;
  title: string;
  done: boolean;
  status: "todo" | "doing" | "done";
  priority: "none" | "low" | "med" | "high";
  dueDate: string | null;
  dueTime: string | null;
  repeat: "none" | "daily" | "weekly" | "monthly";
  notes: string;
  assigneeId: string | null;
  linkedListId: string | null;
  subtasks: GsdSubtask[];
  attachments: GsdAttachment[];
  position: number;
  tags: string[];
  createdAt: string;
  listId: string;
}

/**
 * `status` is the upstream HTTP status, with two synthetic values:
 * `0` = never got a usable response (network failure, timeout, non-JSON 200);
 * `-1` = GSD_API_KEY is not configured (no request was attempted).
 */
export interface GsdError {
  status: number;
  code: string;
  message: string;
}

export type GsdResult<T> = { ok: true; data: T } | { ok: false; error: GsdError };

/** GSD dates are date-only strings; this is the shape gate before forwarding. */
export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Translates a GsdError into this repo's wire format. Kept pure (data in,
 * data out) so it is unit-testable without NextResponse; route handlers wrap
 * the result in NextResponse.json themselves.
 *
 * 401 becomes a 502, not a 401: the caller's dashboard session is fine — the
 * *server's* key is bad — and answering 401 would read as "log in again".
 */
export function mapGsdFailure(failure: GsdError): {
  error: string;
  message: string;
  status: number;
} {
  if (failure.status === -1) {
    return { error: "SERVER_ERROR", message: "The task service is not configured.", status: 500 };
  }

  if (failure.status === 401) {
    return { error: "GSD_AUTH_FAILED", message: "Project-GSD rejected the API key.", status: 502 };
  }

  if (failure.status === 404) {
    return {
      error: "NOT_FOUND",
      message: "That task or list does not exist in Project-GSD.",
      status: 404,
    };
  }

  if (failure.status === 429) {
    return { error: "RATE_LIMITED", message: failure.message, status: 429 };
  }

  // GSD 400s (INVALID_TITLE, INVALID_DUE_DATE, …) share our wire shape and the
  // remedy is the caller's, so code and message forward verbatim.
  if (failure.status === 400) {
    return { error: failure.code, message: failure.message, status: 400 };
  }

  return {
    error: "GSD_UNAVAILABLE",
    message: "Project-GSD is unreachable. Try again shortly.",
    status: 502,
  };
}

async function gsdFetch<T>(
  path: string,
  init?: { method?: "GET" | "POST"; body?: Record<string, unknown> }
): Promise<GsdResult<T>> {
  const key = process.env.GSD_API_KEY;

  if (!key) {
    return {
      ok: false,
      error: { status: -1, code: "NO_KEY", message: "GSD_API_KEY is not set." },
    };
  }

  const headers: Record<string, string> = { Authorization: `Bearer ${key}` };

  if (init?.body) {
    headers["Content-Type"] = "application/json";
  }

  let response: Response;

  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: init?.method ?? "GET",
      headers,
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    // Timeout aborts and DNS/connection failures both land here. The cause is
    // deliberately not included: fetch errors can embed the request URL, and
    // nothing upstream-shaped is trustworthy enough to surface.
    return {
      ok: false,
      error: { status: 0, code: "NETWORK", message: "Could not reach Project-GSD." },
    };
  }

  let payload: unknown = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const { error, message } = (payload ?? {}) as { error?: unknown; message?: unknown };

    return {
      ok: false,
      error: {
        status: response.status,
        code: typeof error === "string" && error ? error : "UPSTREAM_ERROR",
        message:
          typeof message === "string" && message
            ? message
            : `Project-GSD responded ${response.status}.`,
      },
    };
  }

  if (payload === null) {
    return {
      ok: false,
      error: { status: 0, code: "BAD_RESPONSE", message: "Project-GSD returned a non-JSON response." },
    };
  }

  return { ok: true, data: payload as T };
}

/** Active lists in display order. */
export function getLists(): Promise<GsdResult<GsdList[]>> {
  return gsdFetch<GsdList[]>("/lists");
}

/** Every active task across all lists — list order, then task order. */
export function getAllTasks(): Promise<GsdResult<GsdTask[]>> {
  return gsdFetch<GsdTask[]>("/tasks");
}

/** Creates a task; GSD inserts it at the top of the list and assigns the uuid. */
export function createTask(
  listId: string,
  input: { title: string; due_date?: string }
): Promise<GsdResult<GsdTask>> {
  return gsdFetch<GsdTask>(`/lists/${listId}/tasks`, { method: "POST", body: input });
}

/**
 * Completes/uncompletes a task. Repeating tasks advance their due date
 * instead and stay open — callers must apply the returned Task rather than
 * assuming the toggle flipped `done`.
 */
export function toggleTask(id: string): Promise<GsdResult<GsdTask>> {
  return gsdFetch<GsdTask>(`/tasks/${id}/toggle`, { method: "POST" });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/gsd/client.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Gates and commit**

Run each and check its exit code directly: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`.

```bash
git add lib/gsd/client.ts lib/gsd/client.test.ts
git commit -m "feat(tasks): add server-only GSD API client"
```

---

### Task 2: Ordering helpers — `lib/dashboard/task-order.ts`

**Files:**
- Create: `lib/dashboard/task-order.ts`
- Test: `lib/dashboard/task-order.test.ts`

**Interfaces:**
- Consumes: `GsdList`, `GsdTask` from `@/lib/gsd/client` (Task 1).
- Produces:
  - `type TaskSortKey = "manual" | "due" | "alpha" | "priority"`
  - `interface TaskGroup { key: string; label: string; color: string; tasks: GsdTask[] }`
  - `buildListRank(lists: GsdList[]): Map<string, number>`
  - `compareTasks(a: GsdTask, b: GsdTask, sort: TaskSortKey, listRank: Map<string, number>): number`
  - `partitionDone(tasks: GsdTask[]): { open: GsdTask[]; done: GsdTask[] }`
  - `groupByListId(tasks: GsdTask[], lists: GsdList[]): TaskGroup[]`

- [ ] **Step 1: Write the failing test**

Create `lib/dashboard/task-order.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  buildListRank,
  compareTasks,
  groupByListId,
  partitionDone,
} from "@/lib/dashboard/task-order";
import type { GsdList, GsdTask } from "@/lib/gsd/client";

const LISTS: GsdList[] = [
  { id: "list-a", name: "Inbox", color: "#3d6bff", remaining: 2, taskTemplateId: null },
  { id: "list-b", name: "Errands", color: "#f59f00", remaining: 1, taskTemplateId: null },
];

function task(overrides: Partial<GsdTask> & { id: string }): GsdTask {
  return {
    title: "t",
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
    createdAt: "2026-07-23T00:00:00Z",
    listId: "list-a",
    ...overrides,
  };
}

describe("buildListRank", () => {
  it("ranks lists by their display order", () => {
    const rank = buildListRank(LISTS);

    expect(rank.get("list-a")).toBe(0);
    expect(rank.get("list-b")).toBe(1);
  });
});

describe("compareTasks", () => {
  const rank = buildListRank(LISTS);

  it("manual: list order first, then position, then id tie-break", () => {
    const a = task({ id: "a", listId: "list-b", position: 0 });
    const b = task({ id: "b", listId: "list-a", position: 5 });
    const c = task({ id: "c", listId: "list-a", position: 5 });

    expect(compareTasks(a, b, "manual", rank)).toBeGreaterThan(0);
    expect(compareTasks(b, c, "manual", rank)).toBeLessThan(0);
  });

  it("manual: a list missing from the rank map sorts last, not first", () => {
    const known = task({ id: "a", listId: "list-a" });
    const unknown = task({ id: "b", listId: "list-gone" });

    expect(compareTasks(known, unknown, "manual", rank)).toBeLessThan(0);
  });

  it("due: soonest first, undated last, manual as tie-break", () => {
    const early = task({ id: "a", dueDate: "2026-07-20" });
    const late = task({ id: "b", dueDate: "2026-08-01" });
    const none = task({ id: "c", dueDate: null });

    expect(compareTasks(early, late, "due", rank)).toBeLessThan(0);
    expect(compareTasks(none, early, "due", rank)).toBeGreaterThan(0);
    expect(compareTasks(early, early, "due", rank)).toBe(0);
  });

  it("alpha: title, id tie-break", () => {
    const a = task({ id: "a", title: "Apples" });
    const b = task({ id: "b", title: "Bananas" });

    expect(compareTasks(a, b, "alpha", rank)).toBeLessThan(0);
  });

  it("priority: high first, everything else falls back to manual", () => {
    const high = task({ id: "a", priority: "high", listId: "list-b", position: 9 });
    const med = task({ id: "b", priority: "med", listId: "list-a", position: 0 });
    const low = task({ id: "c", priority: "low", listId: "list-a", position: 1 });

    expect(compareTasks(high, med, "priority", rank)).toBeLessThan(0);
    // med vs low: neither is high, so manual order (position) decides.
    expect(compareTasks(med, low, "priority", rank)).toBeLessThan(0);
  });
});

describe("partitionDone", () => {
  it("splits done off while preserving order within each half", () => {
    const tasks = [
      task({ id: "a", done: true }),
      task({ id: "b" }),
      task({ id: "c", done: true }),
      task({ id: "d" }),
    ];

    const { open, done } = partitionDone(tasks);

    expect(open.map((t) => t.id)).toEqual(["b", "d"]);
    expect(done.map((t) => t.id)).toEqual(["a", "c"]);
  });
});

describe("groupByListId", () => {
  it("sections tasks by list in GSD display order, keeping task order", () => {
    const tasks = [
      task({ id: "a", listId: "list-b" }),
      task({ id: "b", listId: "list-a" }),
      task({ id: "c", listId: "list-a" }),
    ];

    const groups = groupByListId(tasks, LISTS);

    expect(groups.map((g) => g.label)).toEqual(["Inbox", "Errands"]);
    expect(groups[0].tasks.map((t) => t.id)).toEqual(["b", "c"]);
    expect(groups[0].color).toBe("#3d6bff");
  });

  it("omits lists with no matching tasks", () => {
    const groups = groupByListId([task({ id: "a", listId: "list-a" })], LISTS);

    expect(groups.map((g) => g.key)).toEqual(["list-a"]);
  });

  it("keeps tasks whose list is unknown in a trailing group rather than dropping them", () => {
    const groups = groupByListId([task({ id: "a", listId: "list-gone" })], LISTS);

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Other");
    expect(groups[0].tasks.map((t) => t.id)).toEqual(["a"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/dashboard/task-order.test.ts`
Expected: FAIL — cannot resolve `@/lib/dashboard/task-order`.

- [ ] **Step 3: Write the implementation**

Create `lib/dashboard/task-order.ts`:

```ts
import type { GsdList, GsdTask } from "@/lib/gsd/client";

/**
 * Ordering rules for the Tasks card, kept out of the view so they can be
 * tested without a DOM — the same shape as lib/dashboard/link-order.ts.
 *
 * Every comparator falls through to an id tie-break: without it, equal keys
 * sort unstably and rows appear to jump between renders.
 */

export type TaskSortKey = "manual" | "due" | "alpha" | "priority";

/** A contiguous run of tasks rendered under one list heading. */
export interface TaskGroup {
  key: string;
  label: string;
  color: string;
  tasks: GsdTask[];
}

/** Shown for a task whose list is not in the lists payload (e.g. archived). */
export const UNKNOWN_LIST_LABEL = "Other";

/** GSD's list display order, as rank lookups for the manual sort. */
export function buildListRank(lists: GsdList[]): Map<string, number> {
  return new Map(lists.map((list, index) => [list.id, index]));
}

/** A missing list ranks after every known one instead of colliding with rank 0. */
function rankOf(listId: string, listRank: Map<string, number>): number {
  return listRank.get(listId) ?? Number.MAX_SAFE_INTEGER;
}

function compareManual(a: GsdTask, b: GsdTask, listRank: Map<string, number>): number {
  return (
    rankOf(a.listId, listRank) - rankOf(b.listId, listRank) ||
    a.position - b.position ||
    a.id.localeCompare(b.id)
  );
}

export function compareTasks(
  a: GsdTask,
  b: GsdTask,
  sort: TaskSortKey,
  listRank: Map<string, number>
): number {
  if (sort === "alpha") {
    return a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
  }

  if (sort === "due") {
    // Date-only ISO strings compare correctly as strings; undated sorts last.
    if (a.dueDate === null || b.dueDate === null) {
      if (a.dueDate === b.dueDate) {
        return compareManual(a, b, listRank);
      }

      return a.dueDate === null ? 1 : -1;
    }

    return a.dueDate.localeCompare(b.dueDate) || compareManual(a, b, listRank);
  }

  if (sort === "priority") {
    // Per the spec only "high" is surfaced in the UI, so only high is ranked;
    // everything else keeps manual order.
    const highDelta = Number(b.priority === "high") - Number(a.priority === "high");

    return highDelta || compareManual(a, b, listRank);
  }

  return compareManual(a, b, listRank);
}

/**
 * Splits done tasks off for the bottom band. Order within each half is
 * preserved, so the caller sorts first and partitions second.
 */
export function partitionDone(tasks: GsdTask[]): { open: GsdTask[]; done: GsdTask[] } {
  const open: GsdTask[] = [];
  const done: GsdTask[] = [];

  for (const task of tasks) {
    (task.done ? done : open).push(task);
  }

  return { open, done };
}

/**
 * Sections tasks by list in GSD's display order — that order is user-chosen
 * in GSD, unlike Links' alphabetical grouping (categories have no display
 * order). Task order inside each section is whatever the caller sorted.
 *
 * A task whose list is missing from the payload lands in a trailing "Other"
 * group rather than being dropped — losing a row would be worse than an
 * oddly-labelled group.
 */
export function groupByListId(tasks: GsdTask[], lists: GsdList[]): TaskGroup[] {
  const byList = new Map<string, GsdTask[]>();

  for (const task of tasks) {
    const bucket = byList.get(task.listId);

    if (bucket) {
      bucket.push(task);
    } else {
      byList.set(task.listId, [task]);
    }
  }

  const groups: TaskGroup[] = [];

  for (const list of lists) {
    const bucket = byList.get(list.id);

    if (bucket) {
      groups.push({ key: list.id, label: list.name, color: list.color, tasks: bucket });
      byList.delete(list.id);
    }
  }

  // Whatever remains references lists GSD did not return.
  const orphans = [...byList.values()].flat();

  if (orphans.length > 0) {
    groups.push({ key: "unknown", label: UNKNOWN_LIST_LABEL, color: "#79808e", tasks: orphans });
  }

  return groups;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/dashboard/task-order.test.ts`
Expected: PASS.

- [ ] **Step 5: Gates and commit**

Run gates (`npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`), then:

```bash
git add lib/dashboard/task-order.ts lib/dashboard/task-order.test.ts
git commit -m "feat(tasks): add task ordering/grouping helpers"
```

---

### Task 3: Extract `readApiError` to a shared module

**Files:**
- Create: `lib/dashboard/read-api-error.ts`
- Test: `lib/dashboard/read-api-error.test.ts`
- Modify: `components/dashboard/links/links-view.tsx:109-133` (remove the local function, import instead)

**Interfaces:**
- Produces: `readApiError(response: Response, fallback: string): Promise<string>` from `@/lib/dashboard/read-api-error`. Behaviour is byte-identical to the current local function in `links-view.tsx` — this is a move, not a rewrite.

- [ ] **Step 1: Write the failing test**

Create `lib/dashboard/read-api-error.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { readApiError } from "@/lib/dashboard/read-api-error";

function response(body: string, status = 400) {
  return new Response(body, { status });
}

describe("readApiError", () => {
  it("prefers message over error code", async () => {
    const result = await readApiError(
      response(JSON.stringify({ error: "INVALID_TITLE", message: "Title is required." })),
      "fallback"
    );

    expect(result).toBe("Title is required.");
  });

  it("falls back to the error code when message is absent (requireAdminAuth shape)", async () => {
    const result = await readApiError(response(JSON.stringify({ error: "UNAUTHENTICATED" })), "fallback");

    expect(result).toBe("UNAUTHENTICATED");
  });

  it("falls back for non-JSON bodies", async () => {
    expect(await readApiError(response("<html>"), "fallback")).toBe("fallback");
  });

  it("falls back for empty-string message and error", async () => {
    expect(await readApiError(response(JSON.stringify({ error: "", message: "" })), "fallback")).toBe(
      "fallback"
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/dashboard/read-api-error.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Create the module and rewire Links**

Create `lib/dashboard/read-api-error.ts` — the function body is **moved verbatim** from `components/dashboard/links/links-view.tsx:113-133`:

```ts
/**
 * Pulls a human-readable message off a failed API response. Dashboard routes
 * answer with `{ error, message }`; `requireAdminAuth` answers with `{ error }`
 * alone, so both shapes are handled before falling back.
 *
 * Shared by the Links and Tasks views; extracted from links-view.tsx unchanged.
 */
export async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await response.json();

    if (typeof body === "object" && body !== null) {
      const { message, error } = body as { message?: unknown; error?: unknown };

      if (typeof message === "string" && message) {
        return message;
      }

      if (typeof error === "string" && error) {
        return error;
      }
    }
  } catch {
    // Non-JSON error responses fall through to the generic message.
  }

  return fallback;
}
```

In `components/dashboard/links/links-view.tsx`:
1. Delete the local `readApiError` function (lines 108-133, including its doc comment).
2. Add to the imports (with the other `@/lib/dashboard/*` imports):

```ts
import { readApiError } from "@/lib/dashboard/read-api-error";
```

No call sites change.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/dashboard/read-api-error.test.ts`
Expected: PASS.

- [ ] **Step 5: Gates and commit**

Run gates. `npm run build` matters here — it proves links-view still compiles with the import.

```bash
git add lib/dashboard/read-api-error.ts lib/dashboard/read-api-error.test.ts components/dashboard/links/links-view.tsx
git commit -m "refactor(dashboard): extract readApiError to a shared module"
```

---

### Task 4: Proxy routes — `/api/tasks` and `/api/tasks/[id]/toggle`

**Files:**
- Create: `app/api/tasks/route.ts`
- Create: `app/api/tasks/[id]/toggle/route.ts`

**Interfaces:**
- Consumes: `getLists`, `getAllTasks`, `createTask`, `toggleTask`, `isIsoDate`, `mapGsdFailure`, `GsdError` from `@/lib/gsd/client` (Task 1); `apiError`, `isUuid`, `readJsonObject` from `@/lib/dashboard/api`; `requireAdminAuth` from `@/lib/auth/admin-guard`.
- Produces (the client view in Task 6 depends on these exact contracts):
  - `GET /api/tasks` → 200 `{ lists: GsdList[], tasks: GsdTask[] }`
  - `POST /api/tasks` body `{ list_id, title, due_date? }` → 201 bare `GsdTask`
  - `POST /api/tasks/[id]/toggle` → 200 bare `GsdTask`
  - All failures: `{ error, message }` per the mapping table in the spec.

No route-level test file: the vitest harness is node-only pure-logic, and everything decision-shaped here (error mapping, date validation) is already unit-tested in Task 1. The handlers stay thin; gates + live verification cover them.

- [ ] **Step 1: Write `app/api/tasks/route.ts`**

```ts
import { NextResponse, type NextRequest } from "next/server";

import { requireAdminAuth } from "@/lib/auth/admin-guard";
import { apiError, isUuid, readJsonObject } from "@/lib/dashboard/api";
import {
  createTask,
  getAllTasks,
  getLists,
  isIsoDate,
  mapGsdFailure,
  type GsdError,
} from "@/lib/gsd/client";

/**
 * Proxy routes for Project-GSD. Not workspace-scoped (like Documents): tasks
 * live in GSD, which knows nothing about Work/Home. The bearer key never
 * leaves lib/gsd/client.ts; the browser only ever talks to these routes.
 */

/** GSD failures answer in our wire format via the tested pure mapper. */
function gsdFailure(failure: GsdError) {
  const { error, message, status } = mapGsdFailure(failure);

  return NextResponse.json({ error, message }, { status });
}

/**
 * GET /api/tasks
 * The refresh endpoint: lists + tasks in one response so the client can swap
 * its whole state atomically. Two GSD calls, well inside the 60/min limit.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAdminAuth(request);
  if (authResult.error) {
    return authResult.error;
  }

  const [lists, tasks] = await Promise.all([getLists(), getAllTasks()]);

  if (!lists.ok) {
    return gsdFailure(lists.error);
  }

  if (!tasks.ok) {
    return gsdFailure(tasks.error);
  }

  return NextResponse.json({ lists: lists.data, tasks: tasks.data }, { status: 200 });
}

/**
 * POST /api/tasks
 * Creates a task in a list. GSD assigns the id and inserts at the top of the
 * list; the 201 body is GSD's Task verbatim, so the client's optimistic row
 * is replaced by the authoritative entity.
 *
 * Validation here is shape-only (fast 400s before spending a GSD request);
 * GSD stays the authority on semantics and its 400s forward verbatim.
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAdminAuth(request);
  if (authResult.error) {
    return authResult.error;
  }

  const body = await readJsonObject(request);

  if (!body) {
    return apiError("INVALID_BODY", "Request body must be a JSON object.", 400);
  }

  const { list_id: listId, title, due_date: dueDate } = body;

  if (typeof listId !== "string" || !isUuid(listId)) {
    return apiError("INVALID_BODY", "list_id must be a list uuid.", 400);
  }

  if (typeof title !== "string" || !title.trim()) {
    return apiError("INVALID_TITLE", "title is required.", 400);
  }

  if (dueDate !== undefined && (typeof dueDate !== "string" || !isIsoDate(dueDate))) {
    return apiError("INVALID_BODY", 'due_date must be "YYYY-MM-DD".', 400);
  }

  const result = await createTask(listId, {
    title: title.trim(),
    ...(typeof dueDate === "string" ? { due_date: dueDate } : {}),
  });

  if (!result.ok) {
    return gsdFailure(result.error);
  }

  return NextResponse.json(result.data, { status: 201 });
}
```

- [ ] **Step 2: Write `app/api/tasks/[id]/toggle/route.ts`**

```ts
import { NextResponse, type NextRequest } from "next/server";

import { requireAdminAuth } from "@/lib/auth/admin-guard";
import { apiError, isUuid } from "@/lib/dashboard/api";
import { mapGsdFailure, toggleTask, type GsdError } from "@/lib/gsd/client";

function gsdFailure(failure: GsdError) {
  const { error, message, status } = mapGsdFailure(failure);

  return NextResponse.json({ error, message }, { status });
}

/**
 * POST /api/tasks/[id]/toggle
 * Completes/uncompletes via GSD. The 200 body is GSD's updated Task verbatim —
 * for repeating tasks that means a new dueDate and done still false, so the
 * client must apply the entity, not assume the flag flipped.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdminAuth(request);
  if (authResult.error) {
    return authResult.error;
  }

  const { id } = await params;

  // GSD ids are uuids; a malformed id can never exist, so answer 404 without
  // spending a GSD request on it.
  if (!isUuid(id)) {
    return apiError("NOT_FOUND", "No task with that id.", 404);
  }

  const result = await toggleTask(id);

  if (!result.ok) {
    return gsdFailure(result.error);
  }

  return NextResponse.json(result.data, { status: 200 });
}
```

- [ ] **Step 3: Gates and commit**

Run gates (`npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`), then:

```bash
git add app/api/tasks
git commit -m "feat(tasks): add GSD proxy routes (list+create, toggle)"
```

---

### Task 5: Icons and navigation entry

**Files:**
- Modify: `components/dashboard/icons.tsx` (append three icons)
- Modify: `components/dashboard/shell.tsx:20` (`DashboardSection`), `:34-40` (`NAV_ENTRIES`)

**Interfaces:**
- Produces: `TaskIcon`, `RefreshIcon`, `RepeatIcon`, `FlagIcon` exported from `@/components/dashboard/icons`, each `({ size }: { size?: number }) => ReactElement` like every existing icon. Task 6 imports all four.

- [ ] **Step 1: Append icons to `components/dashboard/icons.tsx`**

Append at the end of the file, matching the existing verbatim-SVG style (the shared `base` const is already in scope):

```tsx
export function TaskIcon({ size = 18 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size} strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="m8.5 12.2 2.4 2.4 4.8-5.2" />
    </svg>
  );
}

export function RefreshIcon({ size = 16 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M20 12a8 8 0 1 1-2.3-5.6" />
      <path d="M20 4v4.4h-4.4" />
    </svg>
  );
}

export function RepeatIcon({ size = 12 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size} strokeLinejoin="round">
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

export function FlagIcon({ size = 12 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size} strokeLinejoin="round">
      <path d="M5 21V4" />
      <path d="M5 4h12l-3 4 3 4H5" />
    </svg>
  );
}
```

- [ ] **Step 2: Add the nav entry in `components/dashboard/shell.tsx`**

Change the section union (line 20):

```ts
export type DashboardSection = "links" | "notes" | "tasks" | "documents" | "feeds" | "settings";
```

Add `TaskIcon` to the existing icons import, and insert the Tasks entry after Notes in `NAV_ENTRIES`:

```ts
const NAV_ENTRIES: NavEntry[] = [
  { key: "links", label: "Links", href: "/dashboard/links", Icon: LinkIcon, inTabBar: true },
  { key: "notes", label: "Notes", href: "/dashboard/notes", Icon: NoteIcon, inTabBar: true },
  { key: "tasks", label: "Tasks", href: "/dashboard/tasks", Icon: TaskIcon, inTabBar: true },
  { key: "documents", label: "Documents", href: "/dashboard/documents", Icon: DocIcon, inTabBar: true },
  { key: "feeds", label: "Feeds", href: "/dashboard/feeds", Icon: FeedIcon, inTabBar: true },
  { key: "settings", label: "Settings", href: "/dashboard/settings", Icon: GearIcon, inTabBar: false },
];
```

Update the `inTabBar` doc comment on the `NavEntry` interface, since the design's "four content sections" statement predates this section:

```ts
  /**
   * The bottom tab bar carries the content sections only (Settings stays
   * sidebar-only). Tasks post-dates the design's original four; five tabs.
   */
  inTabBar: boolean;
```

- [ ] **Step 3: Gates and commit**

Run gates, then:

```bash
git add components/dashboard/icons.tsx components/dashboard/shell.tsx
git commit -m "feat(tasks): add Tasks nav entry and icons"
```

---

### Task 6: Server page and Tasks view

**Files:**
- Create: `app/dashboard/tasks/page.tsx`
- Create: `components/dashboard/tasks/tasks-view.tsx`

**Interfaces:**
- Consumes: everything produced by Tasks 1-5 (exact names in their Interfaces blocks). Route contracts from Task 4.
- Produces: the working page. `TasksView` props: `{ initialLists: GsdList[]; initialTasks: GsdTask[] }`.

**Design authority:** the approved mockup (artifact `5b7cee49`, revision 2, 2026-07-23) and `links-view.tsx` as the structural reference. Class strings below are lifted from `links-view.tsx` — keep them byte-identical where they match, that is the continuity the user asked for.

- [ ] **Step 1: Write `app/dashboard/tasks/page.tsx`**

```tsx
import type { Metadata } from "next";

import TasksView from "@/components/dashboard/tasks/tasks-view";
import { getAllTasks, getLists } from "@/lib/gsd/client";

export const metadata: Metadata = {
  title: "Tasks",
};

// The GSD fetches use cache: "no-store", which requires request-time rendering.
export const dynamic = "force-dynamic";

export default async function TasksPage() {
  // The dashboard layout has already established that the caller is the admin.
  // Tasks are NOT workspace-scoped (like Documents): GSD knows nothing about
  // Work/Home, so both workspaces see the same data.
  const [lists, tasks] = await Promise.all([getLists(), getAllTasks()]);

  if (!lists.ok || !tasks.ok) {
    // GsdError never contains the key, so this log is safe.
    console.error("Tasks page load error:", !lists.ok ? lists.error : tasks.error);

    return (
      <section className="rounded-2xl border border-border bg-surface p-5 shadow">
        <h2 className="font-heading text-[17px] font-semibold">Tasks</h2>
        <p className="mt-2 text-sm text-text-2">
          Tasks could not be loaded from Project-GSD. Reload the page — if it keeps
          failing, check that the GSD API key is configured and valid.
        </p>
      </section>
    );
  }

  return <TasksView initialLists={lists.data} initialTasks={tasks.data} />;
}
```

- [ ] **Step 2: Write `components/dashboard/tasks/tasks-view.tsx`**

```tsx
"use client";

import { useEffect, useId, useMemo, useState } from "react";

import {
  FlagIcon,
  RefreshIcon,
  RepeatIcon,
  SearchIcon,
  TaskIcon,
} from "@/components/dashboard/icons";
import { useToast } from "@/components/dashboard/toast";
import { readApiError } from "@/lib/dashboard/read-api-error";
import {
  buildListRank,
  compareTasks,
  groupByListId,
  partitionDone,
  type TaskSortKey,
} from "@/lib/dashboard/task-order";
import type { GsdList, GsdTask } from "@/lib/gsd/client";

const SORT_OPTIONS: { value: TaskSortKey; label: string }[] = [
  { value: "manual", label: "Manual" },
  { value: "due", label: "Due date" },
  { value: "alpha", label: "A–Z" },
  { value: "priority", label: "Priority" },
];

/** localStorage key for the remembered Tasks view (sort, grouping, filter). */
const TASKS_PREFS_KEY = "pb-tasks-prefs";

/** The remembered view. Every field optional so a partial/older payload still applies. */
interface TasksPrefs {
  sort?: TaskSortKey;
  grouped?: boolean;
  filter?: string;
}

/**
 * Reads the remembered view from localStorage, validating each field so a
 * corrupt or stale payload can never push an invalid sort key into state.
 * Mirrors readLinksPrefs in links-view.tsx.
 */
function readTasksPrefs(): TasksPrefs | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(TASKS_PREFS_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const prefs: TasksPrefs = {};

    if (typeof parsed.sort === "string" && SORT_OPTIONS.some((option) => option.value === parsed.sort)) {
      prefs.sort = parsed.sort as TaskSortKey;
    }

    if (typeof parsed.grouped === "boolean") {
      prefs.grouped = parsed.grouped;
    }

    if (typeof parsed.filter === "string") {
      prefs.filter = parsed.filter;
    }

    return prefs;
  } catch {
    return null;
  }
}

const INPUT_CLASS =
  "h-[38px] rounded-[9px] border border-border-2 bg-surface px-3 text-sm text-text";

const CONTROL_CLASS =
  "h-9 rounded-[9px] border border-border-2 bg-surface-2 px-[10px] text-[13px] text-text";

/**
 * Marks a row that exists only in local state while its POST is in flight.
 * Such a row has no GSD id yet, so it cannot be toggled.
 */
const OPTIMISTIC_PREFIX = "optimistic-";

/** Local YYYY-MM-DD for "today", in the viewer's timezone. */
function localTodayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${now.getFullYear()}-${month}-${day}`;
}

/** "Jul 21", or "Today" when the date matches todayIso. */
function formatDue(iso: string, todayIso: string | null): string {
  if (todayIso !== null && iso === todayIso) {
    return "Today";
  }

  const [year, month, day] = iso.split("-").map(Number);

  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** Tone class for a due date: overdue red, today accent, future muted. */
function dueClass(iso: string, todayIso: string | null): string {
  if (todayIso === null) {
    return "text-muted";
  }

  if (iso < todayIso) {
    return "font-semibold text-red-500";
  }

  if (iso === todayIso) {
    return "font-semibold text-accent-2";
  }

  return "text-muted";
}

function TaskRow({
  task,
  listName,
  listColor,
  todayIso,
  busy,
  onToggle,
}: {
  task: GsdTask;
  listName: string;
  listColor: string;
  todayIso: string | null;
  busy: boolean;
  onToggle: (task: GsdTask) => void;
}) {
  const repeating = task.repeat !== "none";

  return (
    <li className="flex items-center gap-3 border-b border-border px-5 py-[13px] hover:bg-surface-2">
      <input
        type="checkbox"
        checked={task.done}
        disabled={busy}
        onChange={() => onToggle(task)}
        aria-label={`${task.done ? "Un-complete" : "Complete"} ${task.title}${
          repeating ? " (repeating — advances the due date)" : ""
        }`}
        className="h-[19px] w-[19px] flex-none cursor-pointer appearance-none rounded-full border-2 border-border-2 transition-colors checked:border-accent checked:bg-accent hover:border-accent disabled:cursor-not-allowed disabled:opacity-50 [&:checked]:bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22><path d=%22m4 8.4 2.7 2.7L12.3 5%22 fill=%22none%22 stroke=%22white%22 stroke-width=%222.4%22 stroke-linecap=%22round%22/></svg>')] [&:checked]:bg-center [&:checked]:bg-no-repeat"
      />

      <div className="min-w-0 flex-1">
        <span
          className={[
            "block truncate text-sm",
            task.done ? "font-normal text-muted line-through" : "font-semibold text-text",
          ].join(" ")}
        >
          {task.title}
        </span>
        {task.priority === "high" || repeating || task.dueDate ? (
          <span
            className={[
              "flex items-center gap-[7px] font-mono text-[11px] text-muted",
              task.done ? "opacity-60" : "",
            ].join(" ")}
          >
            {task.priority === "high" ? (
              <span className="text-red-500" title="High priority">
                <FlagIcon />
              </span>
            ) : null}
            {repeating ? (
              <span title={`Repeats ${task.repeat}`}>
                <RepeatIcon />
              </span>
            ) : null}
            {task.dueDate ? (
              <span className={task.done ? "text-muted" : dueClass(task.dueDate, todayIso)}>
                {formatDue(task.dueDate, todayIso)}
              </span>
            ) : null}
          </span>
        ) : null}
      </div>

      <span className="flex flex-none items-center gap-[6px] whitespace-nowrap rounded-[20px] border border-border bg-surface-2 px-[9px] py-[3px] text-[11px] text-text-2">
        <span
          aria-hidden="true"
          className="h-[7px] w-[7px] rounded-full"
          style={{ background: listColor }}
        />
        {listName}
      </span>
    </li>
  );
}

export default function TasksView({
  initialLists,
  initialTasks,
}: {
  initialLists: GsdList[];
  initialTasks: GsdTask[];
}) {
  const showToast = useToast();

  const [lists, setLists] = useState<GsdList[]>(initialLists);
  const [tasks, setTasks] = useState<GsdTask[]>(initialTasks);
  const [formOpen, setFormOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDue, setDraftDue] = useState("");
  const [draftListId, setDraftListId] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [listFilter, setListFilter] = useState("all");
  const [sort, setSort] = useState<TaskSortKey>("manual");
  const [grouped, setGrouped] = useState(false);
  // Repeating tasks toggle non-optimistically; their ids sit here while the
  // POST is in flight so the checkbox cannot be double-fired.
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  /*
   * "Today" is client-local information the server render cannot know: the
   * server runs in UTC, so computing it during render would make "Today" (and
   * the overdue tone) disagree between the server HTML and the client's first
   * render for part of every day — a hydration mismatch. Like the prefs
   * restore below, it is a genuine external read, so it enters state in an
   * effect; dates paint neutral for one frame, then take their tone.
   */
  const [todayIso, setTodayIso] = useState<string | null>(null);

  useEffect(() => {
    setTodayIso(localTodayIso());
  }, []);

  // Restore the last-used view once on mount — the same sanctioned external
  // -store read links-view.tsx performs, for the same hydration reason.
  useEffect(() => {
    const prefs = readTasksPrefs();

    if (!prefs) {
      return;
    }

    if (prefs.sort !== undefined) {
      setSort(prefs.sort);
    }

    if (prefs.grouped !== undefined) {
      setGrouped(prefs.grouped);
    }

    if (prefs.filter !== undefined) {
      setListFilter(prefs.filter);
    }
  }, []);

  // Written from the change handlers rather than an effect, so the mount
  // restore can never race a write of the defaults (links-view convention).
  function persistPrefs(next: TasksPrefs) {
    try {
      window.localStorage.setItem(
        TASKS_PREFS_KEY,
        JSON.stringify({ sort, grouped, filter: listFilter, ...next })
      );
    } catch {
      // Private mode or a full quota just means the view is not remembered.
    }
  }

  function handleSortChange(value: TaskSortKey) {
    setSort(value);
    persistPrefs({ sort: value });
  }

  function handleGroupedChange(value: boolean) {
    setGrouped(value);
    persistPrefs({ grouped: value });
  }

  function handleFilterChange(value: string) {
    setListFilter(value);
    persistPrefs({ filter: value });
  }

  const formId = useId();
  const searchId = useId();
  const filterId = useId();
  const sortId = useId();
  const titleId = useId();
  const dueId = useId();
  const listFieldId = useId();

  const listRank = useMemo(() => buildListRank(lists), [lists]);

  const listNames = useMemo(() => new Map(lists.map((list) => [list.id, list.name])), [lists]);
  const listColors = useMemo(() => new Map(lists.map((list) => [list.id, list.color])), [lists]);

  // Derived, never reset in an effect: a filter or draft list that no longer
  // exists simply stops being a valid choice and falls back on this render.
  const activeFilter = lists.some((list) => list.id === listFilter) ? listFilter : "all";
  const activeDraftListId = lists.some((list) => list.id === draftListId)
    ? draftListId
    : (lists[0]?.id ?? "");

  const visibleTasks = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return tasks
      .filter((task) => activeFilter === "all" || task.listId === activeFilter)
      .filter((task) => !needle || task.title.toLowerCase().includes(needle));
  }, [tasks, activeFilter, query]);

  // Partition after sorting, so both halves hold the active order; the Done
  // band then re-sorts manually — completion order is noise, GSD order is not.
  const { open, done } = useMemo(() => {
    const sorted = [...visibleTasks].sort((a, b) => compareTasks(a, b, sort, listRank));
    const parts = partitionDone(sorted);

    return {
      open: parts.open,
      done: [...parts.done].sort((a, b) => compareTasks(a, b, "manual", listRank)),
    };
  }, [visibleTasks, sort, listRank]);

  // Grouping is a view toggle, not a sort: it sections whatever `open` already
  // holds, so the active sort still decides the order inside each section.
  const groups = useMemo(() => {
    if (!grouped) {
      return null;
    }

    return groupByListId(open, lists);
  }, [grouped, open, lists]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const title = draftTitle.trim();
    const listId = activeDraftListId;

    if (!title || !listId || saving) {
      return;
    }

    const dueDate = draftDue || null;
    // Purely local, never sent anywhere: distinct from every real uuid until
    // GSD's row (with GSD's id) replaces it.
    const temporaryId = `${OPTIMISTIC_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}`;
    // GSD inserts new tasks at the top of the list, so the optimistic row
    // takes a position below every existing one — position 0 is the top.
    const topPosition = Math.min(
      0,
      ...tasks.filter((task) => task.listId === listId).map((task) => task.position)
    );
    const optimistic: GsdTask = {
      id: temporaryId,
      title,
      done: false,
      status: "todo",
      priority: "none",
      dueDate,
      dueTime: null,
      repeat: "none",
      notes: "",
      assigneeId: null,
      linkedListId: null,
      subtasks: [],
      attachments: [],
      position: topPosition - 1,
      tags: [],
      createdAt: new Date().toISOString(),
      listId,
    };

    setTasks((previous) => [optimistic, ...previous]);
    setDraftTitle("");
    setDraftDue("");
    setFormOpen(false);
    setSaving(true);

    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          list_id: listId,
          title,
          ...(dueDate ? { due_date: dueDate } : {}),
        }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Could not save the task."));
      }

      // The 201 carries GSD's authoritative Task — real uuid, real position.
      const saved: GsdTask = await response.json();

      setTasks((previous) => previous.map((task) => (task.id === temporaryId ? saved : task)));
      showToast("Task added");
    } catch (error) {
      setTasks((previous) => previous.filter((task) => task.id !== temporaryId));
      // Give the draft back, but never over the top of something typed since.
      setDraftTitle((current) => current || title);
      setDraftDue((current) => current || (dueDate ?? ""));
      setFormOpen(true);
      showToast(error instanceof Error ? error.message : "Could not save the task.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(target: GsdTask) {
    if (target.id.startsWith(OPTIMISTIC_PREFIX) || pendingIds.has(target.id)) {
      return;
    }

    const repeating = target.repeat !== "none";

    if (repeating) {
      // GSD advances the due date instead of completing — there is nothing
      // safe to guess, so wait for the entity and apply it.
      setPendingIds((previous) => new Set(previous).add(target.id));
    } else {
      const nextDone = !target.done;

      setTasks((previous) =>
        previous.map((task) =>
          task.id === target.id
            ? { ...task, done: nextDone, status: nextDone ? "done" : "todo" }
            : task
        )
      );
    }

    try {
      const response = await fetch(`/api/tasks/${target.id}/toggle`, { method: "POST" });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Could not update the task."));
      }

      // Always apply GSD's returned Task — it is authoritative for every
      // field (repeating tasks come back open with a new dueDate).
      const saved: GsdTask = await response.json();

      setTasks((previous) => previous.map((task) => (task.id === target.id ? saved : task)));
    } catch (error) {
      if (!repeating) {
        setTasks((previous) =>
          previous.map((task) => (task.id === target.id ? target : task))
        );
      }

      showToast(error instanceof Error ? error.message : "Could not update the task.");
    } finally {
      if (repeating) {
        setPendingIds((previous) => {
          const next = new Set(previous);

          next.delete(target.id);

          return next;
        });
      }
    }
  }

  async function handleRefresh() {
    if (refreshing) {
      return;
    }

    setRefreshing(true);

    try {
      const response = await fetch("/api/tasks");

      if (!response.ok) {
        throw new Error(await readApiError(response, "Could not refresh tasks."));
      }

      const fresh: { lists: GsdList[]; tasks: GsdTask[] } = await response.json();

      // Wholesale swap: GSD is the source of truth and this is the freshest
      // full snapshot; any optimistic leftovers are superseded by it.
      setLists(fresh.lists);
      setTasks(fresh.tasks);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not refresh tasks.");
    } finally {
      setRefreshing(false);
    }
  }

  function renderRows(rows: GsdTask[]) {
    return (
      <ul className="list-none">
        {rows.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            listName={listNames.get(task.listId) ?? "Other"}
            listColor={listColors.get(task.listId) ?? "var(--muted)"}
            todayIso={todayIso}
            busy={task.id.startsWith(OPTIMISTIC_PREFIX) || pendingIds.has(task.id)}
            onToggle={handleToggle}
          />
        ))}
      </ul>
    );
  }

  return (
    <section className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-[18px]">
        <div className="flex min-w-[160px] flex-1 items-center gap-[10px]">
          <span className="flex text-accent">
            <TaskIcon />
          </span>
          <h2 className="font-heading text-[17px] font-semibold">Tasks</h2>
          <span className="font-mono text-xs text-muted">{open.length}</span>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          aria-label="Refresh from Project-GSD"
          title="Refresh"
          className="grid h-[34px] w-[34px] cursor-pointer place-items-center rounded-[9px] border border-border bg-transparent text-muted hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className={refreshing ? "flex animate-spin" : "flex"}>
            <RefreshIcon />
          </span>
        </button>
        <button
          type="button"
          onClick={() => setFormOpen((formIsOpen) => !formIsOpen)}
          aria-expanded={formOpen}
          aria-controls={formOpen ? formId : undefined}
          className="inline-flex h-[34px] cursor-pointer items-center gap-1.5 rounded-[9px] px-[14px] text-[13px] font-semibold text-white bg-accent"
        >
          + Add task
        </button>
      </div>

      {formOpen ? (
        <form
          id={formId}
          onSubmit={handleSubmit}
          className="grid animate-[pbPop_0.2s_ease_both] grid-cols-[2fr_auto_1fr_auto] gap-[10px] border-b border-border bg-surface-2 px-5 py-4 motion-reduce:animate-none max-[560px]:grid-cols-1"
        >
          <label htmlFor={titleId} className="sr-only">
            Task title
          </label>
          <input
            id={titleId}
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            placeholder="Task title"
            required
            className={INPUT_CLASS}
          />

          <label htmlFor={dueId} className="sr-only">
            Due date (optional)
          </label>
          <input
            id={dueId}
            type="date"
            value={draftDue}
            onChange={(event) => setDraftDue(event.target.value)}
            className={INPUT_CLASS}
          />

          <label htmlFor={listFieldId} className="sr-only">
            List
          </label>
          <select
            id={listFieldId}
            value={activeDraftListId}
            onChange={(event) => setDraftListId(event.target.value)}
            className={INPUT_CLASS}
          >
            {lists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name}
              </option>
            ))}
          </select>

          <button
            type="submit"
            disabled={saving || lists.length === 0}
            className="h-[38px] cursor-pointer rounded-[9px] px-4 text-sm font-semibold text-white bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save
          </button>
        </form>
      ) : null}

      <div className="flex flex-wrap items-center gap-[10px] border-b border-border px-5 py-3">
        <div className="relative min-w-[150px] flex-1">
          <label htmlFor={searchId} className="sr-only">
            Search tasks
          </label>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-[11px] top-1/2 -translate-y-1/2 text-muted"
          >
            <SearchIcon />
          </span>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tasks…"
            className={`${CONTROL_CLASS} w-full pl-[34px]`}
          />
        </div>

        <label htmlFor={filterId} className="sr-only">
          Filter by list
        </label>
        <select
          id={filterId}
          value={activeFilter}
          onChange={(event) => handleFilterChange(event.target.value)}
          className={CONTROL_CLASS}
        >
          <option value="all">All lists</option>
          {lists.map((list) => (
            <option key={list.id} value={list.id}>
              {list.name}
            </option>
          ))}
        </select>

        <label htmlFor={sortId} className="sr-only">
          Sort tasks
        </label>
        <select
          id={sortId}
          value={sort}
          onChange={(event) => handleSortChange(event.target.value as TaskSortKey)}
          className={CONTROL_CLASS}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-[9px] border border-border-2 bg-surface-2 px-[10px] text-[13px] text-text">
          <input
            type="checkbox"
            checked={grouped}
            onChange={(event) => handleGroupedChange(event.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--accent)]"
          />
          Group
        </label>
      </div>

      <div className="max-h-[520px] flex-1 overflow-auto">
        {open.length === 0 && done.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted">
            No tasks match. Add one ↑
          </p>
        ) : (
          <>
            {groups
              ? groups.map((group) => (
                  <div key={group.key}>
                    <h3 className="flex items-center justify-between border-b border-border bg-surface-2 px-5 py-2 font-mono text-[11px] uppercase tracking-wide text-muted">
                      <span className="flex items-center gap-[7px]">
                        <span
                          aria-hidden="true"
                          className="h-[7px] w-[7px] rounded-full"
                          style={{ background: group.color }}
                        />
                        {group.label}
                      </span>
                      <span>{group.tasks.length}</span>
                    </h3>
                    {renderRows(group.tasks)}
                  </div>
                ))
              : renderRows(open)}

            {done.length > 0 ? (
              <div>
                <h3 className="flex items-center justify-between border-b border-border bg-surface-2 px-5 py-2 font-mono text-[11px] uppercase tracking-wide text-muted">
                  Done
                  <span>{done.length}</span>
                </h3>
                {renderRows(done)}
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Gates**

Run all four gates. `npm run build` must show `/dashboard/tasks` as a dynamic route.

- [ ] **Step 4: Live smoke check (dev server, no GSD key needed for the failure path)**

Start `npm run dev` (confirm the ready line came from **your** process — a stale server on the port has produced false passes in this repo twice). Without `GSD_API_KEY` in `.env.local`, visiting `/dashboard/tasks` as the admin must render the error card, not a crash. Stop the server. If a real key is available in `.env.local`, also confirm the happy path renders rows. Record whichever half could not be run as deferred in the final task.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/tasks components/dashboard/tasks
git commit -m "feat(tasks): add Tasks page and view (Links-pattern UI over GSD)"
```

---

### Task 7: Environment and docs

**Files:**
- Modify: `.env.example`
- Modify: `README.md` (env var list, dashboard section table)

- [ ] **Step 1: Update `.env.example`**

The current file has a duplicated `ADMIN_EMAIL=` line — fix that while here. Full new content:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SITE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_EMAIL=
GSD_API_KEY=
```

- [ ] **Step 2: Update `README.md`**

In the dashboard section table, add after the Notes row:

```markdown
| Tasks | Project-GSD tasks: view, check off, quick add. Proxied server-side; not workspace-scoped |
```

In the required-env list, add:

```markdown
- `GSD_API_KEY` — Project-GSD API key (server-only; created on the GSD Account page)
```

`GSD_API_KEY` must also be added to Vercel for **both Preview and Production** — that requires the real key, so it is a user action; record it in the final task's deferred list rather than attempting it.

- [ ] **Step 3: Gates and commit**

Run gates, then:

```bash
git add .env.example README.md
git commit -m "docs(tasks): document GSD_API_KEY and the Tasks section"
```

---

### Task 8: Final verification

- [ ] **Step 1: Full gates, exit codes checked directly**

Run in order, each followed by an explicit exit-code check (`$LASTEXITCODE` in PowerShell, `$?` in bash — never through a pipe):

1. `npm run lint`
2. `npx tsc --noEmit`
3. `npm test`
4. `npm run build`

- [ ] **Step 2: Whole-branch review**

Dispatch the final whole-branch code review (most capable model, per the user's standing subagent-model preferences) over every commit since the plan started. Reviewer must check: the Global Constraints list above, the spec's error-mapping table, no `useWorkspace` anywhere in Tasks code, no path by which `GSD_API_KEY` reaches a log or the client bundle, and class-string parity with `links-view.tsx`.

- [ ] **Step 3: Record the deferred live acceptance**

These need the real GSD key and a live session; they are **deferred, not skipped**. Record them (e.g. in the session summary and morning-checklist memory) as pending:

- `GSD_API_KEY` added to `.env.local` and to Vercel Preview + Production.
- Created task appears in the GSD app, at the top of the chosen list, with GSD's uuid.
- Toggle syncs both ways (check in dashboard → done in GSD; un-check in GSD → refresh shows it open).
- A repeating task's toggle advances its due date and it stays open in the dashboard.
- Revoked/absent key renders the error card on page load and `GSD_AUTH_FAILED` toasts on mutations.
- Prove by reading GSD's state (its app or a GET), not by trusting our own 200s.

---

## Self-review notes (already applied)

- Spec coverage: client (T1), ordering (T2), readApiError extraction (T3), routes + mapping table (T4), nav (T5), page + view with prefs/optimistic rules/repeat exception/Done band (T6), env + README (T7), gates + deferred live acceptance (T8). The spec's "brief accent-flash on repeat" is **dropped** (YAGNI: the date visibly changes and the row stays put; a flash needs animation state that buys little) — flagged here as a deliberate deviation for the reviewer.
- Type consistency: `GsdResult`/`GsdError`/`GsdTask`/`GsdList` names match across T1/T2/T4/T6; `mapGsdFailure` return keys `{ error, message, status }` match route usage; `TaskSortKey` values match `SORT_OPTIONS` and `readTasksPrefs` validation.
- The mockup's checkbox used a CSS `clip-path` check glyph; the view uses an inline SVG data-URI background instead — Tailwind cannot express the pseudo-element approach inline, and the rendered result is the same.
