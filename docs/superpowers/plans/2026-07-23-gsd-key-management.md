# GSD Key Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Manage the Project-GSD API key from the dashboard (Settings card, verify-on-save, write-only), stored in Supabase instead of the `GSD_API_KEY` env var.

**Architecture:** A single-row `gsd_config` table behind admin-only RLS becomes the sole key source. `lib/gsd/key.ts` (`resolveGsdKey`) replaces the env read; `lib/gsd/client.ts` gains a key-override path exposed as `testGsdKey` for verify-on-save. One route file (`/api/gsd-key`, GET/PUT/DELETE) serves a new Settings "Integrations" card. Not-configured becomes a first-class 503 `NOT_CONFIGURED`, and the Tasks page renders a "Connect Project-GSD" setup card for it.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres + RLS), Tailwind v4, vitest (node-only). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-23-gsd-key-management-design.md` — read before starting any task.

## Global Constraints

- **No endpoint returns, logs, or echoes `api_key`.** `key_last4` is the only key-derived value that ever reaches a browser, computed server-side at save time. Status reads select `key_last4, updated_at` only — never the key column.
- The candidate key in PUT travels only in the `Authorization` header to `project-gsd.com` and into the `gsd_config` upsert — never into logs, error bodies, or responses.
- **During development and verification, no query in any session may select `api_key`** — status checks read `key_last4`/`updated_at` only.
- `requireAdminAuth(request)` is the **first statement** of every route handler.
- Wire format: failures `{ error, message }`; `{ ok: true }` for delete; bare status object otherwise.
- **Never save blind:** PUT stores nothing unless GSD accepted the candidate key on a live call.
- Not workspace-scoped anywhere (Settings and Tasks both already ignore the toggle).
- No `useEffect` state synchronisation — derive from state each render.
- Gate every task on `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build` — **check exit codes directly**, never through a pipe.
- One deliberate deviation from the spec's Files list: `resolveGsdKey` lives in a new `lib/gsd/key.ts` rather than inside `client.ts`, so `client.test.ts` stubs the seam with `vi.mock("@/lib/gsd/key")` instead of dragging Supabase mocks into the client tests. Same interface, better test isolation.

---

### Task 1: Migration — `gsd_config`

**Files:**
- Create: `supabase/migrations/202607230001_gsd_config.sql`

**Interfaces:**
- Produces: table `public.gsd_config` (`id smallint pk =1`, `api_key text`, `key_last4 text`, `updated_at timestamptz`) with admin-only RLS. Tasks 2-4 read/write it.

File only in this task — **do not apply it to any database**. The controller applies it to prod via the Supabase MCP before merge (recorded in Task 7), matching how `202607220001` shipped.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/202607230001_gsd_config.sql`:

```sql
-- Single-row config holding the Project-GSD API key, managed from the
-- dashboard's Settings page (spec: docs/superpowers/specs/
-- 2026-07-23-gsd-key-management-design.md). Replaces the GSD_API_KEY env var.
--
-- key_last4 is a separate column so status reads never touch api_key: the
-- GET /api/gsd-key handler and the Settings page select key_last4/updated_at
-- only, and no endpoint ever returns api_key.
--
-- Re-run guard: none needed — create table fails loudly if it already exists,
-- which is the correct signal that the version ledger is out of step.
--
-- Rollback:
--   drop table public.gsd_config;

create table public.gsd_config (
  id smallint primary key default 1 check (id = 1),
  api_key text not null,
  key_last4 text not null,
  updated_at timestamptz not null default now()
);

alter table public.gsd_config enable row level security;

-- Same admin-only shape as every private table: RLS policy expressions run in
-- the querying role's security context, so is_admin() must remain EXECUTE-able
-- by PUBLIC (see AGENTS.md — never revoke it).
create policy "gsd_config_admin_all" on public.gsd_config
  for all using (public.is_admin()) with check (public.is_admin());
```

- [ ] **Step 2: Gates and commit**

Run all four gates (migration files do not affect them, but run per repo policy), checking exit codes directly, then:

```bash
git add supabase/migrations/202607230001_gsd_config.sql
git commit -m "feat(gsd-key): add gsd_config table migration"
```

---

### Task 2: Key seam + client changes

**Files:**
- Create: `lib/gsd/key.ts`
- Test: `lib/gsd/key.test.ts`
- Modify: `lib/gsd/client.ts` (header comment, `GsdError` doc, `mapGsdFailure` `-1` row, `gsdFetch` key resolution + override param, new `testGsdKey` export)
- Modify: `lib/gsd/client.test.ts` (env stubs → seam mock; updated `-1` mapping test; new `testGsdKey` tests)

**Interfaces:**
- Consumes: `createServerSupabaseClient` from `@/lib/supabase/server`; table `gsd_config` (Task 1).
- Produces:
  - `resolveGsdKey(): Promise<string | null>` from `@/lib/gsd/key`
  - `testGsdKey(candidate: string): Promise<GsdResult<GsdList[]>>` from `@/lib/gsd/client`
  - `mapGsdFailure` `-1` row now `{ error: "NOT_CONFIGURED", message: "Add your Project-GSD key in Settings.", status: 503 }`
  - Everything else exported by `@/lib/gsd/client` keeps its exact current signature.

- [ ] **Step 1: Write the failing seam test**

Create `lib/gsd/key.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const maybeSingle = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    from: vi.fn(() => ({ select: vi.fn(() => ({ maybeSingle })) })),
  })),
}));

import { resolveGsdKey } from "@/lib/gsd/key";

describe("resolveGsdKey", () => {
  beforeEach(() => {
    maybeSingle.mockReset();
  });

  it("returns the key when the row exists", async () => {
    maybeSingle.mockResolvedValue({ data: { api_key: "gsd_abc123" }, error: null });

    expect(await resolveGsdKey()).toBe("gsd_abc123");
  });

  it("returns null when no row exists", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });

    expect(await resolveGsdKey()).toBeNull();
  });

  it("returns null on a query error rather than throwing", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    maybeSingle.mockResolvedValue({ data: null, error: { message: "boom" } });

    expect(await resolveGsdKey()).toBeNull();
    errorSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/gsd/key.test.ts`
Expected: FAIL — cannot resolve `@/lib/gsd/key`.

- [ ] **Step 3: Write `lib/gsd/key.ts`**

```ts
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Resolves the Project-GSD API key from the gsd_config row, through the
 * caller's session-scoped client — every GSD call site is already behind
 * requireAdminAuth or the dashboard layout guard, so RLS admits exactly the
 * sessions that may use the key.
 *
 * Returns null when unconfigured. A query error also resolves to null (and
 * is logged) so callers surface the same not-configured state instead of a
 * fake server fault; the Settings card is the remedy either way.
 *
 * Isolated in its own module so lib/gsd/client.test.ts can stub this one
 * seam (vi.mock) without importing Supabase mocks. Nothing here may log the
 * key value.
 */
export async function resolveGsdKey(): Promise<string | null> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("gsd_config")
    .select("api_key")
    .maybeSingle();

  if (error) {
    // The Supabase error object; never the key.
    console.error("GSD key lookup error:", error);
    return null;
  }

  return data?.api_key ?? null;
}
```

- [ ] **Step 4: Run the seam test to verify it passes**

Run: `npx vitest run lib/gsd/key.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Update `lib/gsd/client.ts`**

Five edits — exact replacements:

**(a)** Header comment, lines 1-13. Replace the first paragraph sentence mentioning the env var:

```ts
/**
 * Server-only client for the Project-GSD API. The key is resolved from the
 * gsd_config table via resolveGsdKey (lib/gsd/key.ts) — the env var is gone.
 * Nothing in this module may log, echo, or embed the key in an error: every
 * failure message below is static or comes verbatim from GSD's response body.
 *
 * GSD wire conventions (see the API reference in the 2026-07-23 spec):
 * responses are camelCase, request bodies are snake_case, errors are
 * `{ error, message }`, unknown/foreign/archived ids answer 404.
 *
 * Calls never throw for API-level failures — they resolve to a GsdResult so
 * route handlers can map failures deliberately instead of catching.
 */
```

Then add the import as the first statement after the comment:

```ts
import { resolveGsdKey } from "@/lib/gsd/key";
```

**(b)** `GsdError` doc comment (currently says "GSD_API_KEY is not configured"):

```ts
/**
 * `status` is the upstream HTTP status, with two synthetic values:
 * `0` = never got a usable response (network failure, timeout, non-JSON 200);
 * `-1` = no Project-GSD key is configured (no request was attempted).
 */
```

**(c)** `mapGsdFailure`'s `-1` row. Replace:

```ts
  if (failure.status === -1) {
    return { error: "SERVER_ERROR", message: "The task service is not configured.", status: 500 };
  }
```

with:

```ts
  // Not-configured is a setup state, not a server fault: the Settings card is
  // the remedy, so the code and message point there.
  if (failure.status === -1) {
    return {
      error: "NOT_CONFIGURED",
      message: "Add your Project-GSD key in Settings.",
      status: 503,
    };
  }
```

**(d)** `gsdFetch` — new optional third parameter and DB-backed key resolution. Replace the function signature and the key block:

```ts
async function gsdFetch<T>(
  path: string,
  init?: { method?: "GET" | "POST"; body?: Record<string, unknown> },
  keyOverride?: string
): Promise<GsdResult<T>> {
  // The override is the verify-on-save path (testGsdKey): the candidate key
  // is used for exactly one request and never stored here.
  const key = keyOverride ?? (await resolveGsdKey());

  if (!key) {
    return {
      ok: false,
      error: { status: -1, code: "NO_KEY", message: "No Project-GSD API key is configured." },
    };
  }
```

(The rest of `gsdFetch` — headers, fetch, error translation — is unchanged.)

**(e)** New export, placed after `toggleTask`:

```ts
/**
 * Verifies a candidate key by listing lists with it. Used by the PUT
 * /api/gsd-key handler before storing: any `ok: true` means GSD accepted the
 * key. No shape guard needed — validity is the question, not the payload.
 */
export function testGsdKey(candidate: string): Promise<GsdResult<GsdList[]>> {
  return gsdFetch<GsdList[]>("/lists", undefined, candidate);
}
```

- [ ] **Step 6: Update `lib/gsd/client.test.ts`**

Four edits:

**(a)** Replace the env stubbing with the seam mock. At the top of the file (before the `@/lib/gsd/client` import), add:

```ts
vi.mock("@/lib/gsd/key", () => ({
  resolveGsdKey: vi.fn(),
}));
```

Add `resolveGsdKey` to the imports:

```ts
import { resolveGsdKey } from "@/lib/gsd/key";
```

Add `testGsdKey` to the `@/lib/gsd/client` import list.

In `beforeEach`, replace `vi.stubEnv("GSD_API_KEY", KEY);` with:

```ts
vi.mocked(resolveGsdKey).mockResolvedValue(KEY);
```

In `afterEach`, drop `vi.unstubAllEnvs();` (keep `vi.unstubAllGlobals()` for the fetch stub).

**(b)** Replace the "fails fast when GSD_API_KEY is unset" test:

```ts
  it("fails fast when no key is configured, without calling fetch", async () => {
    vi.mocked(resolveGsdKey).mockResolvedValue(null);

    const result = await getLists();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(-1);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
```

**(c)** Replace the `mapGsdFailure` unset-key test:

```ts
    it("maps unset-key (-1) to a 503 NOT_CONFIGURED pointing at Settings", () => {
      expect(mapGsdFailure({ status: -1, code: "NO_KEY", message: "x" })).toEqual({
        error: "NOT_CONFIGURED",
        message: "Add your Project-GSD key in Settings.",
        status: 503,
      });
    });
```

**(d)** New `describe` block for `testGsdKey`, after the `isIsoDate` block:

```ts
  describe("testGsdKey", () => {
    it("uses the candidate key without touching the stored one", async () => {
      fetchMock.mockResolvedValue(jsonResponse([]));

      const result = await testGsdKey("gsd_candidate_not_real");

      expect(result.ok).toBe(true);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://project-gsd.com/api/v1/lists");
      expect(init.headers.Authorization).toBe("Bearer gsd_candidate_not_real");
      expect(resolveGsdKey).not.toHaveBeenCalled();
    });

    it("surfaces a 401 rejection as a typed failure without the candidate key", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ error: "UNAUTHORIZED", message: "Bad key." }, 401)
      );

      const result = await testGsdKey("gsd_candidate_not_real");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.status).toBe(401);
      }
      expect(JSON.stringify(result)).not.toContain("gsd_candidate_not_real");
    });
  });
```

- [ ] **Step 7: Run the client tests**

Run: `npx vitest run lib/gsd/client.test.ts lib/gsd/key.test.ts`
Expected: PASS (21 + 3 tests).

- [ ] **Step 8: Gates and commit**

All four gates, exit codes direct. Then:

```bash
git add lib/gsd/key.ts lib/gsd/key.test.ts lib/gsd/client.ts lib/gsd/client.test.ts
git commit -m "feat(gsd-key): resolve key from gsd_config; add testGsdKey; NOT_CONFIGURED mapping"
```

---

### Task 3: Status type + `/api/gsd-key` routes

**Files:**
- Modify: `lib/dashboard/types.ts` (append one interface)
- Create: `app/api/gsd-key/route.ts`

**Interfaces:**
- Consumes: `testGsdKey`, `mapGsdFailure` (`@/lib/gsd/client`, Task 2); `apiError`, `readJsonObject` (`@/lib/dashboard/api`); `requireAdminAuth` (`@/lib/auth/admin-guard`); table `gsd_config` (Task 1).
- Produces:
  - `interface GsdKeyStatus { configured: boolean; last4: string | null; updated_at: string | null }` in `@/lib/dashboard/types` (Task 4 imports it).
  - `GET /api/gsd-key` → 200 `GsdKeyStatus`; `PUT` body `{ api_key }` → 200 `GsdKeyStatus` (configured true); `DELETE` → 200 `{ ok: true }`.

No test file: handlers are thin; the verify logic is Task 2's tested `testGsdKey`, and the validation is three inline checks. Gates + review + deferred live acceptance cover them.

- [ ] **Step 1: Append to `lib/dashboard/types.ts`**

```ts
/**
 * Status of the stored Project-GSD API key, as returned by /api/gsd-key.
 * Deliberately never includes the key itself: `last4` is computed server-side
 * at save time and is the only key-derived value that reaches a browser.
 */
export interface GsdKeyStatus {
  configured: boolean;
  last4: string | null;
  updated_at: string | null;
}
```

- [ ] **Step 2: Write `app/api/gsd-key/route.ts`**

```ts
import { NextResponse, type NextRequest } from "next/server";

import { requireAdminAuth } from "@/lib/auth/admin-guard";
import { apiError, readJsonObject } from "@/lib/dashboard/api";
import type { GsdKeyStatus } from "@/lib/dashboard/types";
import { testGsdKey } from "@/lib/gsd/client";

/**
 * Write-only management of the Project-GSD API key (spec:
 * 2026-07-23-gsd-key-management-design.md). The key goes in via PUT and never
 * comes back out: GET selects key_last4/updated_at only, and no response,
 * log, or error body here may ever contain api_key.
 */

/** Sanity cap; real GSD keys are far shorter. Verification is the true gate. */
const GSD_KEY_MAX_LENGTH = 200;

/**
 * GET /api/gsd-key
 * Status only. `configured` is row-existence; the key column is not read.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAdminAuth(request);
  if (authResult.error) {
    return authResult.error;
  }

  const { supabase } = authResult;

  const { data, error } = await supabase
    .from("gsd_config")
    .select("key_last4, updated_at")
    .maybeSingle();

  if (error) {
    console.error("GSD key status read error:", error);
    return apiError("SERVER_ERROR", "Could not read the key status.", 500);
  }

  const status: GsdKeyStatus = {
    configured: data !== null,
    last4: data?.key_last4 ?? null,
    updated_at: data?.updated_at ?? null,
  };

  return NextResponse.json(status, { status: 200 });
}

/**
 * PUT /api/gsd-key
 * Verify-on-save: the candidate is sent to GSD (GET /lists) and stored only
 * if GSD accepts it. Nothing is written on any verification failure, so a
 * saved-but-dead key is impossible.
 */
export async function PUT(request: NextRequest) {
  const authResult = await requireAdminAuth(request);
  if (authResult.error) {
    return authResult.error;
  }

  const { supabase } = authResult;
  const body = await readJsonObject(request);

  if (!body) {
    return apiError("INVALID_BODY", "Request body must be a JSON object.", 400);
  }

  const { api_key: apiKey } = body;

  if (typeof apiKey !== "string" || !apiKey.trim()) {
    return apiError("INVALID_BODY", "api_key is required.", 400);
  }

  const candidate = apiKey.trim();

  if (candidate.length > GSD_KEY_MAX_LENGTH) {
    return apiError("INVALID_BODY", "api_key is implausibly long.", 400);
  }

  const verify = await testGsdKey(candidate);

  if (!verify.ok) {
    // 401 here is GSD rejecting the CANDIDATE — the one case where "the key
    // is wrong" is the caller's fault and a 400, unlike the task routes'
    // 401→502 mapping for the stored key.
    if (verify.error.status === 401) {
      return NextResponse.json(
        { error: "INVALID_KEY", message: "Project-GSD rejected this key. Nothing was saved." },
        { status: 400 }
      );
    }

    if (verify.error.status === 429) {
      return NextResponse.json(
        { error: "RATE_LIMITED", message: verify.error.message },
        { status: 429 }
      );
    }

    return NextResponse.json(
      {
        error: "GSD_UNAVAILABLE",
        message: "Could not verify the key — Project-GSD is unreachable. Nothing was saved.",
      },
      { status: 502 }
    );
  }

  const { data, error } = await supabase
    .from("gsd_config")
    .upsert({
      id: 1,
      api_key: candidate,
      key_last4: candidate.slice(-4),
      updated_at: new Date().toISOString(),
    })
    .select("key_last4, updated_at")
    .single();

  if (error || !data) {
    console.error("GSD key save error:", error);
    return apiError("SERVER_ERROR", "The key verified but could not be saved.", 500);
  }

  const status: GsdKeyStatus = {
    configured: true,
    last4: data.key_last4,
    updated_at: data.updated_at,
  };

  return NextResponse.json(status, { status: 200 });
}

/**
 * DELETE /api/gsd-key
 * Idempotent: deleting when unconfigured still answers { ok: true }.
 */
export async function DELETE(request: NextRequest) {
  const authResult = await requireAdminAuth(request);
  if (authResult.error) {
    return authResult.error;
  }

  const { supabase } = authResult;

  const { error } = await supabase.from("gsd_config").delete().eq("id", 1);

  if (error) {
    console.error("GSD key delete error:", error);
    return apiError("SERVER_ERROR", "Could not remove the key.", 500);
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
```

- [ ] **Step 3: Gates and commit**

All four gates, exit codes direct; the build must list `/api/gsd-key`. Then:

```bash
git add lib/dashboard/types.ts app/api/gsd-key/route.ts
git commit -m "feat(gsd-key): add write-only /api/gsd-key routes (status, verify-on-save, remove)"
```

---

### Task 4: Settings Integrations card

**Files:**
- Create: `components/dashboard/settings/gsd-key-card.tsx`
- Modify: `app/dashboard/settings/page.tsx` (fetch status row, mount the card)
- Modify: `components/dashboard/settings/settings-view.tsx:42-68` (drop the local `readApiError` copy, import the shared one — dedup while touching this area)

**Interfaces:**
- Consumes: `GsdKeyStatus` (`@/lib/dashboard/types`, Task 3); `/api/gsd-key` routes (Task 3); `readApiError` (`@/lib/dashboard/read-api-error`); `useToast`; `TaskIcon`.
- Produces: `GsdKeyCard` default export, props `{ initialStatus: GsdKeyStatus }`.

- [ ] **Step 1: Write `components/dashboard/settings/gsd-key-card.tsx`**

```tsx
"use client";

import { useId, useState } from "react";

import { TaskIcon } from "@/components/dashboard/icons";
import { useToast } from "@/components/dashboard/toast";
import { readApiError } from "@/lib/dashboard/read-api-error";
import type { GsdKeyStatus } from "@/lib/dashboard/types";

/**
 * "Jul 23" from a timestamptz ISO string. Formats the UTC date components
 * with a fixed locale so server and client render the same text — no
 * timezone-dependent hydration drift.
 */
function formatSavedDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);

  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * Write-only management of the Project-GSD key. The input never echoes a
 * stored key (there is no read-back API); after a successful save it is
 * cleared and only the last-4 hint renders. Non-optimistic throughout:
 * verify-on-save is inherently a server round-trip, so a saving state and a
 * toast are the whole story — no rollback machinery.
 *
 * Like the rest of Settings, this card is not workspace-scoped.
 */
export default function GsdKeyCard({ initialStatus }: { initialStatus: GsdKeyStatus }) {
  const showToast = useToast();

  const [status, setStatus] = useState<GsdKeyStatus>(initialStatus);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const inputId = useId();

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const candidate = draft.trim();

    if (!candidate || saving) {
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/gsd-key", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: candidate }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Could not save the key."));
      }

      const saved: GsdKeyStatus = await response.json();
      const replaced = status.configured;

      setStatus(saved);
      setDraft("");
      showToast(replaced ? "Project-GSD key updated" : "Project-GSD connected");
    } catch (error) {
      // The typed key stays in the input so a rejected paste can be corrected.
      showToast(error instanceof Error ? error.message : "Could not save the key.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (removing) {
      return;
    }

    setRemoving(true);

    try {
      const response = await fetch("/api/gsd-key", { method: "DELETE" });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Could not remove the key."));
      }

      setStatus({ configured: false, last4: null, updated_at: null });
      showToast("Project-GSD key removed");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not remove the key.");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface shadow">
      <div className="flex items-center gap-[10px] border-b border-border px-5 py-[18px]">
        <span className="flex text-accent">
          <TaskIcon />
        </span>
        <h2 className="font-heading text-[17px] font-semibold">Integrations</h2>
      </div>

      <div className="flex flex-col gap-3 p-5">
        <p className="text-sm text-text-2">
          Tasks reads from Project-GSD. Keys are created on your GSD Account page and
          verified against GSD before being saved. A saved key is never shown again —
          only its last four characters.
        </p>

        {status.configured ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-text">
              Key set
              {status.last4 ? (
                <>
                  {" "}· ends in <span className="font-mono">…{status.last4}</span>
                </>
              ) : null}
              {status.updated_at ? ` · saved ${formatSavedDate(status.updated_at)}` : null}
            </span>
            <button
              type="button"
              onClick={() => void handleRemove()}
              disabled={removing}
              className="h-[34px] cursor-pointer rounded-[9px] border border-border bg-transparent px-3 text-[13px] text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        ) : null}

        <form onSubmit={(event) => void handleSave(event)} className="flex flex-wrap gap-[10px]">
          <label htmlFor={inputId} className="sr-only">
            {status.configured ? "Replace the Project-GSD API key" : "Project-GSD API key"}
          </label>
          <input
            id={inputId}
            type="password"
            autoComplete="off"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={status.configured ? "Replace key: gsd_…" : "gsd_…"}
            maxLength={200}
            className="h-[38px] min-w-0 flex-1 rounded-[9px] border border-border-2 bg-surface-2 px-3 font-mono text-sm text-text"
          />
          <button
            type="submit"
            disabled={saving || !draft.trim()}
            className="h-[38px] cursor-pointer rounded-[9px] bg-accent px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Verifying…" : "Save"}
          </button>
        </form>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Update `app/dashboard/settings/page.tsx`**

Full new content (adds the status fetch and mounts the card; the categories flow is unchanged):

```tsx
import type { Metadata } from "next";

import GsdKeyCard from "@/components/dashboard/settings/gsd-key-card";
import SettingsView from "@/components/dashboard/settings/settings-view";
import { CATEGORY_COLUMNS } from "@/lib/dashboard/api";
import type { Category, GsdKeyStatus } from "@/lib/dashboard/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  // The dashboard layout has already established that the caller is the admin,
  // and RLS restricts these tables to that same identity.
  const supabase = await createServerSupabaseClient();

  // Unlike Links and Notes, this page never filters by workspace: the design
  // renders a Work card and a Home card side by side, so the whole table is the
  // payload rather than a per-workspace slice.
  const [categoriesResult, keyResult] = await Promise.all([
    supabase
      .from("dashboard_categories")
      .select(CATEGORY_COLUMNS)
      .order("ctx", { ascending: true })
      .order("kind", { ascending: true })
      .order("sort_order", { ascending: true }),
    // Status only — key_last4/updated_at. The api_key column is never read
    // for display anywhere in the app.
    supabase.from("gsd_config").select("key_last4, updated_at").maybeSingle(),
  ]);

  if (categoriesResult.error) {
    console.error("Settings page load error:", categoriesResult.error);

    return (
      <section className="rounded-2xl border border-border bg-surface p-5 shadow">
        <h2 className="font-heading text-[17px] font-semibold">Categories &amp; Types</h2>
        <p className="mt-2 text-sm text-text-2">
          Categories could not be loaded. Reload the page — if it keeps failing, the dashboard
          tables are unavailable.
        </p>
      </section>
    );
  }

  // A failed status read is non-fatal: the card starts as "not connected" and
  // the routes report real errors on any action.
  if (keyResult.error) {
    console.error("Settings GSD key status error:", keyResult.error);
  }

  const categories: Category[] = categoriesResult.data ?? [];
  const keyStatus: GsdKeyStatus = {
    configured: !keyResult.error && keyResult.data !== null,
    last4: keyResult.data?.key_last4 ?? null,
    updated_at: keyResult.data?.updated_at ?? null,
  };

  return (
    <>
      <SettingsView initialCategories={categories} />
      <GsdKeyCard initialStatus={keyStatus} />
    </>
  );
}
```

(The dashboard layout's content container is `flex flex-col gap-5`, so the two sections stack with standard spacing.)

- [ ] **Step 3: Dedup `readApiError` in `components/dashboard/settings/settings-view.tsx`**

Delete the local `readApiError` function and its doc comment (currently lines 42-68 — verify against the actual file before deleting), and add to the imports:

```ts
import { readApiError } from "@/lib/dashboard/read-api-error";
```

Call sites are unchanged (same name and signature). The shared module's doc comment already covers the behavior; the deleted local comment's note about `LAST_CATEGORY`/`CATEGORY_IN_USE` reaching the user verbatim remains true through the shared implementation.

- [ ] **Step 4: Gates and commit**

All four gates, exit codes direct (the build proves settings-view compiles with the import). Then:

```bash
git add components/dashboard/settings/gsd-key-card.tsx app/dashboard/settings/page.tsx components/dashboard/settings/settings-view.tsx
git commit -m "feat(gsd-key): Settings Integrations card (write-only, verify-on-save)"
```

---

### Task 5: Tasks page setup card

**Files:**
- Modify: `app/dashboard/tasks/page.tsx`

**Interfaces:**
- Consumes: the `-1` status on `GsdError` (Task 2's contract: `resolveGsdKey` null → `status: -1`).

- [ ] **Step 1: Update `app/dashboard/tasks/page.tsx`**

Full new content (adds the `Link` import, the failure branch split, and the setup card; the happy path is unchanged):

```tsx
import type { Metadata } from "next";
import Link from "next/link";

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

  const failure = !lists.ok ? lists.error : !tasks.ok ? tasks.error : null;

  if (failure) {
    // status -1 = no key configured — a setup state, not an error. The card
    // points at Settings instead of telling the owner to "check" anything.
    if (failure.status === -1) {
      return (
        <section className="rounded-2xl border border-border bg-surface p-5 shadow">
          <h2 className="font-heading text-[17px] font-semibold">Connect Project-GSD</h2>
          <p className="mt-2 text-sm text-text-2">
            Tasks shows your Project-GSD lists once an API key is connected. Add one in{" "}
            <Link href="/dashboard/settings" className="font-semibold">
              Settings
            </Link>
            .
          </p>
        </section>
      );
    }

    // GsdError never contains the key, so this log is safe.
    console.error("Tasks page load error:", failure);

    return (
      <section className="rounded-2xl border border-border bg-surface p-5 shadow">
        <h2 className="font-heading text-[17px] font-semibold">Tasks</h2>
        <p className="mt-2 text-sm text-text-2">
          Tasks could not be loaded from Project-GSD. Reload the page — if it keeps
          failing, check the key in Settings.
        </p>
      </section>
    );
  }

  if (!lists.ok || !tasks.ok) {
    // Unreachable (failure covered both), but narrows the types below.
    return null;
  }

  return <TasksView initialLists={lists.data} initialTasks={tasks.data} />;
}
```

(The explicit re-check before the happy return exists because `failure === null` does not narrow `lists`/`tasks` for TypeScript — same cross-union limitation the original ternary hit.)

- [ ] **Step 2: Gates and commit**

All four gates, exit codes direct. Then:

```bash
git add app/dashboard/tasks/page.tsx
git commit -m "feat(gsd-key): Connect Project-GSD setup card on the Tasks page"
```

---

### Task 6: Env and docs cleanup

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: `.env.example`** — remove the `GSD_API_KEY=` line. Full new content:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SITE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_EMAIL=
```

- [ ] **Step 2: `README.md`** — three edits:

1. Env intro line: change "all five" back to "all four".
2. Remove the `- \`GSD_API_KEY\` — Project-GSD API key (server-only; created on the GSD Account page)` bullet.
3. Tasks row in the dashboard table becomes:

```markdown
| Tasks | Project-GSD tasks: view, check off, quick add. Proxied server-side; key managed in Settings; not workspace-scoped |
```

Also add `gsd_config` to the data-model table (after the `files_metadata` row):

```markdown
| `gsd_config` | Single-row Project-GSD API key, managed from Settings (write-only; never returned by any API) |
```

- [ ] **Step 3: Gates and commit**

All four gates, exit codes direct. Then:

```bash
git add .env.example README.md
git commit -m "docs(gsd-key): env var removed; key managed in Settings"
```

---

### Task 7: Final verification

- [ ] **Step 1: Full gates on the branch tip**, each exit code checked directly: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`. Build must list `/api/gsd-key` and still list `/dashboard/tasks` + `/dashboard/settings` as dynamic.

- [ ] **Step 2: Whole-branch review** (most capable model). Reviewer must check: every Global Constraint above; that no code path — route, page, card, client, test — selects, returns, or logs `api_key` except the PUT upsert and `resolveGsdKey`'s internal select; the PUT 401→400 `INVALID_KEY` vs task-routes 401→502 distinction; migration RLS shape; that `settings-view.tsx`'s dedup changed no behavior.

- [ ] **Step 3: Migration application (controller, pre-merge).** Apply `202607230001_gsd_config.sql` to prod via the Supabase MCP (`apply_migration`), then verify by introspection: table exists, RLS enabled, policy present — **selecting only from information_schema/pg_catalog, never `select api_key`**. Run `get_advisors` and confirm no new issues beyond the known accepted ones.

- [ ] **Step 4: Record the deferred live acceptance** (needs the real GSD key; prove by reading state, not 200s):
  - Paste the real key in Settings → "Verifying…" → connected status with correct last4 → Tasks page loads real lists.
  - Paste a garbage key → `INVALID_KEY` toast; `gsd_config` still empty (prove via a `key_last4`-only query).
  - Remove → Tasks page shows the Connect setup card.
  - Rotation: remint in GSD, Replace in dashboard → Tasks works on the next request, no redeploy.

---

## Self-review notes (already applied)

- Spec coverage: migration (T1), key seam + client + NOT_CONFIGURED (T2), status type + routes (T3), Settings card + page + dedup (T4), Tasks setup card (T5), env/docs (T6), gates + migration application + deferred acceptance (T7). The spec's "PUT-route validation reduced to pure helpers where practical" is satisfied by the checks being three inline lines — nothing worth extracting (YAGNI); flagged here as the deliberate reading.
- Type consistency: `GsdKeyStatus` shape identical across T3 route, T4 card/page; `testGsdKey(candidate)` name/signature identical in T2 definition and T3 usage; `-1` semantics consistent across T2 (client), T5 (page branch).
- The T5 page keeps an explicitly-unreachable narrowing guard with a comment — TypeScript's cross-union narrowing limitation (already hit once in this codebase) makes it necessary; reviewers should not "simplify" it away.
