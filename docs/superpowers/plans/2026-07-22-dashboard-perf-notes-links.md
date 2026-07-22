# Dashboard Performance, Notes Fixes and Links Ordering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove two network auth round-trips from every authenticated request, fix two Notes rendering bugs, and give Links a manual drag order, category grouping, pinning, and inline category creation.

**Architecture:** Three independent tracks. **A (Tasks 1–4)** replaces `auth.getUser()` with locally-verified `auth.getClaims()` backed by a module-level JWKS cache, and narrows the proxy matcher. **B (Tasks 5–6)** is CSS-only. **C (Tasks 7–12)** adds a `pinned` column and manual `sort_order`, pure ordering functions with unit tests, two API endpoints, and a hand-rolled Pointer Events drag.

**Tech Stack:** Next.js 16.2.1 (App Router), React 19.2.4, Tailwind CSS v4, Supabase (`@supabase/ssr` 0.10.0, `@supabase/supabase-js` 2.101.0), Vitest 4.

**Spec:** `docs/superpowers/specs/2026-07-22-dashboard-perf-notes-links-design.md`

## Global Constraints

- **Read `node_modules/next/dist/docs/` before writing Next-specific code.** This is Next.js 16; route handler signatures, `params`, and CSS layering differ from older versions.
- **`requireAdminAuth(request)` is the first statement of every route handler** — before `params` is awaited and before the body is read.
- **Route params are `{ params: Promise<{ id: string }> }`**, then `const { id } = await params`.
- **Guard `[id]` route params with `isUuid`** so a malformed id is a 404, not a Postgres `22P02` surfacing as a 500.
- **Wire format:** failures are `{ error: "MACHINE_CODE", message: "human text" }` via `apiError()`. Create returns the bare entity at 201, update the bare entity at 200, delete `{ ok: true }`, lists one named collection key.
- **Links and Notes are workspace-scoped. Documents and Settings are not.** Do not add `useWorkspace()` filtering to anything outside Links and Notes.
- **No data-fetching library. No `useEffect` state synchronisation** — derive from props each render. Optimistic updates use plain `useState` plus a rollback closure.
- **Tailwind v4 utilities beat `@layer base`** regardless of specificity.
- **Tailwind v4 `translate-*` sets the CSS `translate` property, not `transform`.** Transitions must name `translate` or nothing animates.
- **Verification gate for every task:** `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`. **Check exit codes directly** — `npx tsc --noEmit | tail -2 && echo OK` tests `tail`'s exit code and reports a false green.
- **Do not use em dashes in code identifiers or cloud resource names.**

---

# Track A — Performance

## Task 1: Module-level JWKS cache

`auth-js` caches JWKS on the **client instance** (`GoTrueClient.js:141`), and `createServerSupabaseClient()` builds a fresh client per request. Without this cache, `getClaims()` fetches `/.well-known/jwks.json` on every request and we would trade one network call for another. `fetchJwk` short-circuits when a matching key is supplied via `options.jwks` (`GoTrueClient.js:4683`), so a module-level cache removes the fetch entirely.

**Files:**
- Create: `lib/auth/jwks.ts`
- Create: `lib/auth/jwks.test.ts`

**Interfaces:**
- Consumes: `getSupabasePublicEnv()` from `lib/env.ts`
- Produces: `getCachedJwks(supabaseUrl: string, now?: number): Promise<{ keys: JWK[] } | null>`, `__resetJwksCacheForTests(): void`

- [ ] **Step 1: Write the failing test**

Create `lib/auth/jwks.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetJwksCacheForTests, getCachedJwks } from "./jwks";

const URL_BASE = "https://example.supabase.co";
const KEY = { kid: "abc", kty: "EC", alg: "ES256", key_ops: ["verify"] };

function mockFetchOnce(body: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    json: async () => body,
  });
}

describe("getCachedJwks", () => {
  beforeEach(() => {
    __resetJwksCacheForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches the key set on a cold cache", async () => {
    const fetchMock = mockFetchOnce({ keys: [KEY] });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getCachedJwks(URL_BASE, 0);

    expect(result).toEqual({ keys: [KEY] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `${URL_BASE}/auth/v1/.well-known/jwks.json`
    );
  });

  // The whole point of the module: a second request must not hit the network.
  it("serves a warm cache without fetching again", async () => {
    const fetchMock = mockFetchOnce({ keys: [KEY] });
    vi.stubGlobal("fetch", fetchMock);

    await getCachedJwks(URL_BASE, 0);
    const result = await getCachedJwks(URL_BASE, 60_000);

    expect(result).toEqual({ keys: [KEY] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refetches once the ten minute TTL has elapsed", async () => {
    const fetchMock = mockFetchOnce({ keys: [KEY] });
    vi.stubGlobal("fetch", fetchMock);

    await getCachedJwks(URL_BASE, 0);
    await getCachedJwks(URL_BASE, 10 * 60 * 1000 + 1);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // Degrading to a stale key beats logging every device out because one
  // JWKS fetch failed.
  it("serves the stale key set when a refetch fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ keys: [KEY] }) })
      .mockRejectedValueOnce(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    await getCachedJwks(URL_BASE, 0);
    const result = await getCachedJwks(URL_BASE, 10 * 60 * 1000 + 1);

    expect(result).toEqual({ keys: [KEY] });
  });

  // Returning null lets getClaims fall back to its own fetch, and ultimately
  // to getUser(). Slow and correct beats fast and unauthenticated.
  it("returns null on a cold cache when the fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("nope")));

    expect(await getCachedJwks(URL_BASE, 0)).toBeNull();
  });

  it("returns null when the endpoint answers with an empty key set", async () => {
    vi.stubGlobal("fetch", mockFetchOnce({ keys: [] }));

    expect(await getCachedJwks(URL_BASE, 0)).toBeNull();
  });

  it("returns null on a non-ok response", async () => {
    vi.stubGlobal("fetch", mockFetchOnce({ keys: [KEY] }, false));

    expect(await getCachedJwks(URL_BASE, 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/auth/jwks.test.ts`
Expected: FAIL — `Failed to resolve import "./jwks"`.

- [ ] **Step 3: Write the implementation**

Create `lib/auth/jwks.ts`:

```ts
import type { JWK } from "@supabase/supabase-js";

/**
 * A process-wide JWKS cache.
 *
 * `auth-js` already caches the key set, but on the *client instance*
 * (GoTrueClient.js:141), and `createServerSupabaseClient()` builds a fresh
 * client for every request. Without this module every `getClaims()` call would
 * fetch `/.well-known/jwks.json`, trading the `/auth/v1/user` round trip we are
 * removing for a different one.
 *
 * `fetchJwk` short-circuits before any network call when a matching key is
 * supplied through `options.jwks` (GoTrueClient.js:4683), so passing this cache
 * in makes verification fully local.
 *
 * On a warm serverless instance this survives across requests. On a cold one it
 * costs a single fetch, which is what the previous code paid on every request.
 */

const JWKS_PATH = "/auth/v1/.well-known/jwks.json";

/**
 * Matches `auth-js`'s own `JWKS_TTL` (lib/constants.js:27) and the endpoint's
 * `Cache-Control: public, max-age=600`. Verified against production on
 * 2026-07-22.
 */
const JWKS_TTL_MS = 10 * 60 * 1000;

let cachedKeys: { keys: JWK[] } | null = null;
let cachedAt = 0;

/** Test seam. Never called from application code. */
export function __resetJwksCacheForTests(): void {
  cachedKeys = null;
  cachedAt = 0;
}

/**
 * The cached key set, refreshing it when the TTL has elapsed.
 *
 * Returns null only when nothing is cached *and* the fetch failed. A null makes
 * `getClaims()` fall back to fetching the key set itself, and ultimately to a
 * network `getUser()` — slower, but never less correct. A failed *refresh* with
 * a populated cache serves the stale key rather than signing every device out.
 */
export async function getCachedJwks(
  supabaseUrl: string,
  now: number = Date.now()
): Promise<{ keys: JWK[] } | null> {
  if (cachedKeys && cachedAt + JWKS_TTL_MS > now) {
    return cachedKeys;
  }

  try {
    const response = await fetch(`${supabaseUrl}${JWKS_PATH}`);

    if (!response.ok) {
      return cachedKeys;
    }

    const body: unknown = await response.json();
    const keys =
      typeof body === "object" && body !== null
        ? (body as { keys?: unknown }).keys
        : undefined;

    if (!Array.isArray(keys) || keys.length === 0) {
      return cachedKeys;
    }

    cachedKeys = { keys: keys as JWK[] };
    cachedAt = now;

    return cachedKeys;
  } catch {
    return cachedKeys;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/auth/jwks.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/auth/jwks.ts lib/auth/jwks.test.ts
git commit -m "feat(auth): add a process-wide JWKS cache"
```

---

## Task 2: Verified-claims helper

**Files:**
- Create: `lib/auth/claims.ts`
- Create: `lib/auth/claims.test.ts`

**Interfaces:**
- Consumes: `getCachedJwks` (Task 1), `getSupabasePublicEnv` from `lib/env.ts`
- Produces: `verifyClaims(supabase: ClaimsCapableClient): Promise<VerifiedClaims | null>` where `VerifiedClaims = { id: string; email: string | null }`

**Why a wrapper:** `getClaims()` returns a **three-way** union — `{ data, error: null }`, `{ data: null, error: AuthError }`, and `{ data: null, error: null }` for "no session at all" (`GoTrueClient.d.ts:2373-2385`). Every call site would otherwise have to remember the third case.

**Why refresh still works:** `getClaims()` with no `jwt` argument calls `getSession()` internally (`GoTrueClient.js:4782`), which refreshes an expired access token and fires the `setAll` cookie callback. Replacing `getUser()` does **not** break indefinite sessions.

- [ ] **Step 1: Write the failing test**

Create `lib/auth/claims.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { verifyClaims } from "./claims";

vi.mock("@/lib/env", () => ({
  getSupabasePublicEnv: () => ({
    url: "https://example.supabase.co",
    anonKey: "anon",
  }),
}));

vi.mock("@/lib/auth/jwks", () => ({
  getCachedJwks: async () => ({ keys: [{ kid: "abc" }] }),
}));

function clientReturning(result: unknown) {
  const getClaims = vi.fn().mockResolvedValue(result);
  return { client: { auth: { getClaims } }, getClaims };
}

describe("verifyClaims", () => {
  it("returns id and email from verified claims", async () => {
    const { client } = clientReturning({
      data: { claims: { sub: "user-1", email: "Admin@Example.com" } },
      error: null,
    });

    expect(await verifyClaims(client as never)).toEqual({
      id: "user-1",
      email: "Admin@Example.com",
    });
  });

  it("passes the cached key set so verification stays local", async () => {
    const { client, getClaims } = clientReturning({
      data: { claims: { sub: "user-1", email: "a@b.c" } },
      error: null,
    });

    await verifyClaims(client as never);

    expect(getClaims).toHaveBeenCalledWith(undefined, {
      jwks: { keys: [{ kid: "abc" }] },
    });
  });

  it("returns null when verification errors", async () => {
    const { client } = clientReturning({
      data: null,
      error: new Error("bad signature"),
    });

    expect(await verifyClaims(client as never)).toBeNull();
  });

  // The third arm of the union: no session, and no error either.
  it("returns null when there is no session at all", async () => {
    const { client } = clientReturning({ data: null, error: null });

    expect(await verifyClaims(client as never)).toBeNull();
  });

  it("returns null when the token carries no subject", async () => {
    const { client } = clientReturning({
      data: { claims: { email: "a@b.c" } },
      error: null,
    });

    expect(await verifyClaims(client as never)).toBeNull();
  });

  it("tolerates a missing email claim", async () => {
    const { client } = clientReturning({
      data: { claims: { sub: "user-1" } },
      error: null,
    });

    expect(await verifyClaims(client as never)).toEqual({
      id: "user-1",
      email: null,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/auth/claims.test.ts`
Expected: FAIL — `Failed to resolve import "./claims"`.

- [ ] **Step 3: Write the implementation**

Create `lib/auth/claims.ts`:

```ts
import { getCachedJwks } from "@/lib/auth/jwks";
import { getSupabasePublicEnv } from "@/lib/env";

/** The identity fields the app actually reads off a verified token. */
export interface VerifiedClaims {
  id: string;
  email: string | null;
}

/**
 * The narrow slice of a Supabase client this module needs. Declared structurally
 * so both the server client and the middleware client satisfy it without either
 * importing the other.
 */
export interface ClaimsCapableClient {
  auth: {
    getClaims: (
      jwt?: string,
      options?: { jwks?: { keys: unknown[] } }
    ) => Promise<{ data: unknown; error: unknown }>;
  };
}

/**
 * Verifies the caller's JWT and returns its identity claims, or null when there
 * is no usable session.
 *
 * This is a real cryptographic signature check, not a decode: the project signs
 * with ES256 (verified against the live JWKS endpoint on 2026-07-22), so
 * `getClaims()` verifies locally through WebCrypto with no network call. It is
 * therefore a safe replacement for `getUser()`, unlike `getSession()`.
 *
 * Two behaviours worth not rediscovering:
 *
 *   - Passing the cached key set is what keeps this local. Without it
 *     `getClaims()` fetches the JWKS itself on every fresh client (see
 *     lib/auth/jwks.ts).
 *   - Session *refresh* is preserved. With no `jwt` argument `getClaims()` calls
 *     `getSession()` internally (GoTrueClient.js:4782), which refreshes an
 *     expiring token and fires the cookie `setAll` callback.
 *
 * If the project were ever switched back to a symmetric (HS*) signing key,
 * `getClaims()` falls back to a network `getUser()` on its own
 * (GoTrueClient.js:4800). That degrades speed, never correctness.
 */
export async function verifyClaims(
  supabase: ClaimsCapableClient
): Promise<VerifiedClaims | null> {
  const { url } = getSupabasePublicEnv();
  const jwks = await getCachedJwks(url);

  const { data, error } = await supabase.auth.getClaims(
    undefined,
    jwks ? { jwks } : undefined
  );

  // Three-way union: success, an explicit error, or no session at all.
  if (error || !data) {
    return null;
  }

  const { claims } = data as { claims?: Record<string, unknown> };

  if (!claims || typeof claims.sub !== "string" || !claims.sub) {
    return null;
  }

  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/auth/claims.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/auth/claims.ts lib/auth/claims.test.ts
git commit -m "feat(auth): add locally-verified claims helper"
```

---

## Task 3: Swap all three hot paths onto `getClaims`

Three call sites make a network `getUser()` today. The spec named two; `requireAdminAuth` is the third and matters most for Links, whose drag reorder is chatty.

**Files:**
- Modify: `lib/supabase/middleware.ts:32`
- Modify: `lib/auth/user-context.ts` (whole file)
- Modify: `lib/auth/admin-guard.ts:15-27`
- Modify: `proxy.ts:9-11`

**Interfaces:**
- Consumes: `verifyClaims` (Task 2)
- Produces: `getUserContext(): Promise<{ user: { id: string; email: string | null } | null; isAdmin: boolean }>` — `user` narrows from Supabase's `User` to just the two fields the two consumers read. Verified consumers: `app/dashboard/layout.tsx:20` (truthiness only) and `app/login/page.tsx:40` (truthiness only). `requireAdminAuth` keeps returning `{ user, supabase }` with `user.id` intact — `app/api/files/upload/route.ts:94` is the only route that reads it.

- [ ] **Step 1: Replace the middleware call**

In `lib/supabase/middleware.ts`, replace line 32:

```ts
  await supabase.auth.getUser();
```

with:

```ts
  // Verifies the JWT locally against the cached JWKS instead of calling
  // /auth/v1/user over the network. Session refresh is preserved: with no jwt
  // argument getClaims() calls getSession() internally, which refreshes an
  // expiring token and fires the setAll cookie callback above.
  await verifyClaims(supabase);
```

and add the import at the top:

```ts
import { verifyClaims } from "@/lib/auth/claims";
```

- [ ] **Step 2: Rewrite `lib/auth/user-context.ts`**

Replace the whole file:

```ts
import { cache } from "react";

import { isAdminEmail } from "@/lib/auth/admin";
import { verifyClaims } from "@/lib/auth/claims";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * `user` is deliberately narrower than Supabase's `User`: the only consumers
 * (app/dashboard/layout.tsx, app/login/page.tsx) test it for truthiness, and
 * fetching a full user object costs a network round trip that the JWT already
 * answers for free.
 */
export interface UserContext {
  user: { id: string; email: string | null } | null;
  isAdmin: boolean;
}

/**
 * Wrapped in React `cache()` so a layout and a page in the same render pass
 * share one verification rather than repeating it.
 */
export const getUserContext = cache(async function getUserContext(): Promise<UserContext> {
  const supabase = await createServerSupabaseClient();
  const claims = await verifyClaims(supabase);

  if (!claims) {
    return { user: null, isAdmin: false };
  }

  return {
    user: { id: claims.id, email: claims.email },
    isAdmin: isAdminEmail(claims.email),
  };
});
```

- [ ] **Step 3: Update `lib/auth/admin-guard.ts`**

Replace lines 15-36 (the `getUser()` call through the `isAdminEmail` check) with:

```ts
    const claims = await verifyClaims(supabase);

    if (!claims) {
      return {
        error: NextResponse.json(
          { error: "UNAUTHENTICATED", message: "No authenticated session." },
          { status: 401 }
        ),
      };
    }

    if (!isAdminEmail(claims.email)) {
      return {
        error: NextResponse.json(
          { error: "FORBIDDEN", message: "Admin access required." },
          { status: 403 }
        ),
      };
    }

    // `user` keeps its shape for app/api/files/upload/route.ts:94, which reads
    // `user.id` for the `uploaded_by` column.
    return { user: { id: claims.id, email: claims.email }, supabase };
```

and add to the imports:

```ts
import { verifyClaims } from "@/lib/auth/claims";
```

- [ ] **Step 4: Narrow the proxy matcher**

In `proxy.ts`, replace lines 9-11:

```ts
export const config = {
  // Only routes that need a session. The landing page is prerendered and
  // edge-cached (verified: X-Nextjs-Prerender: 1, X-Vercel-Cache: HIT), so
  // sending it through middleware bought nothing and cost a hop on every
  // request that carried an auth cookie.
  matcher: ["/dashboard/:path*", "/login", "/auth/:path*"],
};
```

- [ ] **Step 5: Run the full gate**

```bash
npm run lint; echo "lint=$?"
npx tsc --noEmit; echo "tsc=$?"
npm test; echo "test=$?"
npm run build; echo "build=$?"
```

Expected: every echoed code is `0`. **Read the four numbers.** Do not pipe these into anything.

- [ ] **Step 6: Verify auth still works end to end, locally**

Start the dev server, then confirm by hand:
1. Signed out, `/dashboard/links` redirects to `/login`.
2. Sign in with a password; you land on the dashboard.
3. Reload `/dashboard/links` — still signed in.
4. `/login` while signed in redirects away.
5. A non-admin session (if available) is rejected from `/dashboard`.

**A passing build is not evidence that auth works.** This step is manual and required.

- [ ] **Step 7: Commit**

```bash
git add lib/supabase/middleware.ts lib/auth/user-context.ts lib/auth/admin-guard.ts proxy.ts
git commit -m "perf(auth): verify JWTs locally instead of calling the auth server"
```

---

## Task 4: Measure the result

The hypothesis in this plan's spec was already wrong once — the anonymous measurement contradicted it. A claimed improvement without a measured pair is not acceptable.

**Files:**
- Modify: `docs/superpowers/specs/2026-07-22-dashboard-perf-notes-links-design.md` (append results)

- [ ] **Step 1: Capture the signed-in baseline before deploying**

Against **production, as it is now**, with a real session cookie. Copy the `sb-` cookies from a signed-in browser session into `COOKIE`:

```bash
COOKIE='paste-the-sb-cookies-here'
for i in 1 2 3 4 5; do
  curl -s -o /dev/null -H "Cookie: $COOKIE" \
    -w "  ttfb=%{time_starttransfer}s\n" \
    https://www.patrickbeasley.com/dashboard/links
done
```

Record all five numbers.

- [ ] **Step 2: Deploy and re-measure**

Run the identical loop against the deployed change. Record all five.

- [ ] **Step 3: Confirm anonymous TTFB did not regress**

```bash
for i in 1 2 3; do
  curl -s -o /dev/null -w "  ttfb=%{time_starttransfer}s\n" https://www.patrickbeasley.com/
done
curl -s -o /dev/null -D - https://www.patrickbeasley.com/ | grep -iE "x-vercel-cache|x-nextjs-prerender"
```

Expected: TTFB comparable to the 139/154/152 ms baseline, and **still** `X-Nextjs-Prerender: 1` with `X-Vercel-Cache: HIT`. The narrowed matcher must not have changed how the landing page is rendered or cached.

- [ ] **Step 4: Append the numbers to the spec and commit**

Add a "Measured result" section to the spec's performance chapter with both tables. If the improvement is smaller than expected, **say so** and investigate rather than shipping the claim.

```bash
git add docs/superpowers/specs/2026-07-22-dashboard-perf-notes-links-design.md
git commit -m "docs: record measured auth latency before and after"
```

---

# Track B — Notes rendering

## Task 5: Make bullet lists and headings visible

Both toolbar buttons already work and already persist: `lib/sanitize.ts:28` allows `ul`, `li` and `h3`, and `execCommand` writes them. Tailwind v4's preflight resets `ul` to `list-style: none; margin: 0; padding: 0` and `h3` to `font-size: inherit; font-weight: inherit`, so the result is indistinguishable from a paragraph. Bold and Italic survive because `<b>` and `<i>` carry UA styling preflight leaves alone.

**Files:**
- Modify: `app/globals.css` (inside the existing `@layer base` block, which ends at line 140)

**Do not modify** `lib/sanitize.ts`, the toolbar handlers, or `exec()`. They are correct.

- [ ] **Step 1: Add the editor content styles**

Inside the existing `@layer base { … }` block in `app/globals.css`, next to the `[contenteditable]:empty::before` rule, add:

```css
  /*
   * The note editor's own content styles.
   *
   * Tailwind v4's preflight resets `ul` to `list-style: none` with no padding
   * and `h3` to inherited size and weight, so `execCommand("insertUnorderedList")`
   * and `execCommand("formatBlock", "H3")` produced markup that was stored
   * correctly and rendered identically to a plain paragraph. The buttons were
   * never broken; the reset made them invisible.
   *
   * `@layer base` is safe here specifically because this markup is generated by
   * execCommand and carries no classes, so there is no Tailwind utility to lose
   * to. Anything that later adds utilities to these elements must revisit this.
   */
  [contenteditable] ul {
    list-style: disc;
    padding-left: 1.5rem;
    margin-block: 0.5rem;
  }

  [contenteditable] ol {
    list-style: decimal;
    padding-left: 1.5rem;
    margin-block: 0.5rem;
  }

  [contenteditable] li {
    margin-block: 0.125rem;
  }

  [contenteditable] h3 {
    font-family: var(--font-heading, inherit);
    font-size: 1.125rem;
    font-weight: 600;
    line-height: 1.4;
    margin-block: 0.75rem 0.375rem;
  }

  [contenteditable] p {
    margin-block: 0.5rem;
  }
```

Note: `ol` is styled even though the toolbar has no ordered-list button, because a paste can introduce one. `lib/sanitize.ts:28` does **not** currently allow `ol`, so a pasted one is stripped on save — the rule costs nothing and prevents an unstyled flash before that happens.

- [ ] **Step 2: Verify the font variable exists**

```bash
grep -n "font-heading" app/globals.css
```

If `--font-heading` is not defined in the `@theme` block (lines 61-81), drop the `font-family` declaration from the `h3` rule rather than inventing a variable.

- [ ] **Step 3: Verify by hand in the browser**

Start the dev server and open `/dashboard/notes`:
1. Create a note, type two lines, select them, click **•** — bullets must be visibly rendered with indentation.
2. Type a line, click **H** — it must render visibly larger and bolder.
3. **Reload the page.** Both must survive, proving the round trip through `sanitizeNoteHtml` was always intact.
4. Confirm the `aria-pressed` state on both buttons still toggles with the caret.

- [ ] **Step 4: Run the gate**

```bash
npm run lint; echo "lint=$?"
npx tsc --noEmit; echo "tsc=$?"
npm test; echo "test=$?"
npm run build; echo "build=$?"
```

- [ ] **Step 5: Commit**

```bash
git add app/globals.css
git commit -m "fix(notes): restore list and heading styling in the editor"
```

---

## Task 6: Soften the editor's heavy blue focus box

**Root cause confirmed from the owner's screenshot (2026-07-22), superseding the earlier card-height hypothesis.** The reported "not sized properly" is the editor's **focus outline**: the `contenteditable` at `components/dashboard/notes/notes-view.tsx:769` deliberately carries no `outline-none`, so a focused editor draws the browser's default focus ring — a thick, high-contrast blue box around the whole editable region. The existing code comment at `:766-768` states this was intentional ("the browser's focus ring is the sole indication a keyboard user is inside it"), but the result reads as a mis-sized heavy blue border.

The card's height, the empty space below a short note, and the two columns' heights are **not** part of this bug — the owner looked at the screenshot and selected only the blue border. Do **not** change the grid height, the `max-h` on the list pane, or the column `min-h`. This task is one className change.

**Files:**
- Modify: `components/dashboard/notes/notes-view.tsx` (the editor `<div>`, currently at `:755-770`, and its adjacent comment at `:766-768`)

**Design tokens available** (from `app/globals.css`): `--color-accent` is the solid accent blue (`#3d6bff` in work ctx); `--color-accent-soft` is a translucent accent (`rgba(61,107,255,0.16)`). Utilities `text-accent`, `bg-accent-soft` already resolve these.

- [ ] **Step 1: Replace the default focus ring with a subtle one**

The editor `<div>` currently ends with:

```tsx
                // No `outline-none`: this is the only focusable region with no
                // border of its own, so the browser's focus ring is the sole
                // indication a keyboard user is inside it.
                className="min-h-[200px] flex-1 overflow-auto px-[18px] py-[18px] text-[15px] leading-[1.7] text-text"
```

Replace the comment and className with:

```tsx
                // The editor is the only focusable region with no border of its
                // own, so it still needs a focus affordance — but the browser
                // default draws a heavy, high-contrast blue box that reads as a
                // mis-sized border. `outline-none` drops that; the soft inset
                // accent ring keeps a gentle, on-brand "you are here" cue for
                // both mouse and keyboard focus. `:focus-visible` alone will not
                // do here: a contenteditable matches it on mouse click too, so
                // the heavy box would survive a click. The style must sit on
                // `:focus` to be removed for the mouse case in the screenshot.
                className="min-h-[200px] flex-1 overflow-auto px-[18px] py-[18px] text-[15px] leading-[1.7] text-text outline-none focus:shadow-[inset_0_0_0_2px_var(--color-accent-soft)]"
```

Rationale for the value: a 2px inset ring in `accent-soft` (16% alpha) renders as a faint blue edge on the dark surface — clearly present as a focus cue but nothing like the solid `#3d6bff` box. If the owner still finds it too strong, the fallback is to drop to a 1px ring or `var(--color-border-2)`; if too weak for keyboard visibility, raise to `var(--color-accent)` at 1px. Note the tuning options in the report rather than trying several in one commit.

- [ ] **Step 2: Confirm no other rule reintroduces the box**

```bash
grep -rn "outline" app/globals.css components/dashboard/notes/notes-view.tsx
```

Expected: no editor-scoped `outline` rule in `globals.css` fighting the new `outline-none`. The Task 5 editor content rules (`[contenteditable] ul`, etc.) do not touch `outline`; confirm they were not disturbed.

- [ ] **Step 3: Run the gate**

```bash
npm run lint; echo "lint=$?"
npx tsc --noEmit; echo "tsc=$?"
npm test; echo "test=$?"
npm run build; echo "build=$?"
```

- [ ] **Step 4: Verify by hand — REQUIRED, this is a visual fix**

At desktop width on `/dashboard/notes`:
1. Click into the editor with the mouse: the heavy solid-blue box is gone; a faint accent edge shows instead. This is the exact case in the owner's screenshot.
2. Tab into the editor with the keyboard: a focus cue is still visible (accessibility — the editor must never focus with no indication at all).
3. Click out: the focus cue disappears.
4. Toggle the workspace to Home: the ring picks up the green home accent (it is driven by `--accent-soft`, which `[data-ctx="home"]` overrides), confirming it is token-driven, not hard-coded blue.

This cannot be proven by the build. If it cannot be run now, defer it to the owner explicitly and describe the exact checks — do not claim it passed.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/notes/notes-view.tsx
git commit -m "fix(notes): soften the editor focus ring from a heavy blue box"
```

---

# Track C — Links ordering

## Task 7: Schema — `pinned`, backfilled `sort_order`, index

**Files:**
- Create: `supabase/migrations/202607220001_links_pinned_and_manual_order.sql`
- Modify: `lib/dashboard/types.ts:34-44` (add `pinned` to `LinkItem`)
- Modify: `lib/dashboard/api.ts:46-47` (add `pinned` to `LINK_COLUMNS`)

**Interfaces:**
- Produces: `LinkItem` gains `pinned: boolean`. `LINK_COLUMNS` gains `pinned`. Every later task depends on both.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/202607220001_links_pinned_and_manual_order.sql`:

```sql
-- Manual ordering and pinning for dashboard links.
--
-- sort_order has existed since the dashboard schema but was never written: every
-- row holds 0 and the client always derived order at render time. It now carries
-- the user's manual order, so it needs a meaningful starting state.

alter table public.dashboard_links
  add column if not exists pinned boolean not null default false;

-- Backfill from created_at desc within each workspace, which reproduces exactly
-- what the default "Recent" view shows today. Without this every row would share
-- sort_order 0 and the first drag would scramble the list.
with ranked as (
  select id,
         row_number() over (partition by ctx order by created_at desc) as position
  from public.dashboard_links
)
update public.dashboard_links as l
set sort_order = ranked.position
from ranked
where l.id = ranked.id;

-- Serves the default view directly: workspace, then pinned band, then manual order.
create index if not exists dashboard_links_ctx_pinned_sort_idx
  on public.dashboard_links (ctx, pinned, sort_order);

comment on column public.dashboard_links.pinned is
  'Pinned links render in a band above all other links in the same workspace.';
```

- [ ] **Step 2: Apply the migration**

Apply it through the Supabase MCP `apply_migration` tool (write mode is configured). Do not hand-run SQL in the dashboard — the next deploy must be able to reproduce this one.

- [ ] **Step 3: Prove the backfill actually landed**

Do not trust a success response. Query the result:

```sql
select ctx, count(*), min(sort_order), max(sort_order),
       count(*) filter (where pinned) as pinned_count
from public.dashboard_links
group by ctx;
```

Expected: per `ctx`, `min = 1`, `max = count`, and `pinned_count = 0`. If `min` and `max` are both 0 the backfill did not run.

- [ ] **Step 4: Add `pinned` to the type**

In `lib/dashboard/types.ts`, add to `LinkItem` after `sort_order`:

```ts
  /**
   * Pinned links render in a band above every other link in the workspace,
   * independently of the active sort.
   */
  pinned: boolean;
```

- [ ] **Step 5: Add `pinned` to the selected columns**

In `lib/dashboard/api.ts`, replace line 46-47:

```ts
export const LINK_COLUMNS =
  "id, ctx, category_id, title, url, description, sort_order, pinned, created_at, updated_at";
```

- [ ] **Step 6: Fix the optimistic row**

`components/dashboard/links/links-view.tsx:166-176` builds an optimistic `LinkItem` and will now fail to typecheck. Add `pinned: false` to that literal, and set `sort_order: 0` — a new link sorts to the top of the manual order, matching the existing "prepend to the list" behaviour on line 178.

- [ ] **Step 7: Run the gate**

```bash
npm run lint; echo "lint=$?"
npx tsc --noEmit; echo "tsc=$?"
npm test; echo "test=$?"
npm run build; echo "build=$?"
```

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/202607220001_links_pinned_and_manual_order.sql lib/dashboard/types.ts lib/dashboard/api.ts components/dashboard/links/links-view.tsx
git commit -m "feat(links): add pinned column and backfill manual sort order"
```

---

## Task 8: Ordering functions

Pure functions, extracted so they can be unit tested without a DOM. The view imports them in Task 10.

**Files:**
- Create: `lib/dashboard/link-order.ts`
- Create: `lib/dashboard/link-order.test.ts`

**Interfaces:**
- Consumes: `LinkItem` (Task 7)
- Produces:
  - `type LinkSortKey = "manual" | "recent" | "alpha" | "category"`
  - `compareLinks(a: LinkItem, b: LinkItem, sort: LinkSortKey, categoryNames: Map<string, string>): number`
  - `partitionPinned(links: LinkItem[]): { pinned: LinkItem[]; rest: LinkItem[] }`
  - `groupByCategory(links: LinkItem[], categoryNames: Map<string, string>): LinkGroup[]`
  - `interface LinkGroup { key: string; label: string; links: LinkItem[] }`
  - `computeReorder(links: LinkItem[], fromIndex: number, toIndex: number): { id: string; sort_order: number }[]`

- [ ] **Step 1: Write the failing test**

Create `lib/dashboard/link-order.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { LinkItem } from "@/lib/dashboard/types";
import {
  compareLinks,
  computeReorder,
  groupByCategory,
  partitionPinned,
} from "./link-order";

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
    ...overrides,
  };
}

const NAMES = new Map([
  ["cat-a", "Alpha"],
  ["cat-b", "Beta"],
]);

describe("compareLinks", () => {
  it("orders by sort_order ascending in manual mode", () => {
    const a = link({ id: "a", sort_order: 2 });
    const b = link({ id: "b", sort_order: 1 });

    expect([a, b].sort((x, y) => compareLinks(x, y, "manual", NAMES))).toEqual([b, a]);
  });

  it("orders newest first for recent", () => {
    const older = link({ id: "a", created_at: "2026-01-01T00:00:00.000Z" });
    const newer = link({ id: "b", created_at: "2026-02-01T00:00:00.000Z" });

    expect([older, newer].sort((x, y) => compareLinks(x, y, "recent", NAMES))).toEqual([
      newer,
      older,
    ]);
  });

  it("orders by title for alpha", () => {
    const a = link({ id: "a", title: "Zebra" });
    const b = link({ id: "b", title: "Apple" });

    expect([a, b].sort((x, y) => compareLinks(x, y, "alpha", NAMES))).toEqual([b, a]);
  });

  it("orders by category name for category", () => {
    const a = link({ id: "a", category_id: "cat-b" });
    const b = link({ id: "b", category_id: "cat-a" });

    expect([a, b].sort((x, y) => compareLinks(x, y, "category", NAMES))).toEqual([b, a]);
  });

  // Without this, two links sharing a sort_order render in an order that can
  // change between renders, and a drag appears to "jump".
  it("breaks a manual tie deterministically by id", () => {
    const a = link({ id: "aaa", sort_order: 1 });
    const b = link({ id: "bbb", sort_order: 1 });

    expect(compareLinks(a, b, "manual", NAMES)).toBeLessThan(0);
    expect(compareLinks(b, a, "manual", NAMES)).toBeGreaterThan(0);
  });
});

describe("partitionPinned", () => {
  it("splits pinned from the rest, preserving order within each", () => {
    const a = link({ id: "a", pinned: true });
    const b = link({ id: "b" });
    const c = link({ id: "c", pinned: true });

    expect(partitionPinned([a, b, c])).toEqual({
      pinned: [a, c],
      rest: [b],
    });
  });

  it("returns an empty pinned band when nothing is pinned", () => {
    const a = link({ id: "a" });

    expect(partitionPinned([a])).toEqual({ pinned: [], rest: [a] });
  });
});

describe("groupByCategory", () => {
  it("groups links under their category name, preserving link order", () => {
    const a = link({ id: "a", category_id: "cat-a" });
    const b = link({ id: "b", category_id: "cat-b" });
    const c = link({ id: "c", category_id: "cat-a" });

    expect(groupByCategory([a, b, c], NAMES)).toEqual([
      { key: "cat-a", label: "Alpha", links: [a, c] },
      { key: "cat-b", label: "Beta", links: [b] },
    ]);
  });

  it("labels an unknown category rather than dropping the link", () => {
    const a = link({ id: "a", category_id: "gone" });

    expect(groupByCategory([a], NAMES)).toEqual([
      { key: "gone", label: "Uncategorized", links: [a] },
    ]);
  });

  it("returns no groups for no links", () => {
    expect(groupByCategory([], NAMES)).toEqual([]);
  });
});

describe("computeReorder", () => {
  it("moves a link down and renumbers from one", () => {
    const links = [link({ id: "a" }), link({ id: "b" }), link({ id: "c" })];

    expect(computeReorder(links, 0, 2)).toEqual([
      { id: "b", sort_order: 1 },
      { id: "c", sort_order: 2 },
      { id: "a", sort_order: 3 },
    ]);
  });

  it("moves a link up", () => {
    const links = [link({ id: "a" }), link({ id: "b" }), link({ id: "c" })];

    expect(computeReorder(links, 2, 0)).toEqual([
      { id: "c", sort_order: 1 },
      { id: "a", sort_order: 2 },
      { id: "b", sort_order: 3 },
    ]);
  });

  it("is a no-op when the indices match", () => {
    const links = [link({ id: "a" }), link({ id: "b" })];

    expect(computeReorder(links, 1, 1)).toEqual([
      { id: "a", sort_order: 1 },
      { id: "b", sort_order: 2 },
    ]);
  });

  it("returns an empty list for out-of-range indices", () => {
    const links = [link({ id: "a" })];

    expect(computeReorder(links, 5, 0)).toEqual([]);
    expect(computeReorder(links, 0, 9)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/dashboard/link-order.test.ts`
Expected: FAIL — `Failed to resolve import "./link-order"`.

- [ ] **Step 3: Write the implementation**

Create `lib/dashboard/link-order.ts`:

```ts
import type { LinkItem } from "@/lib/dashboard/types";

/**
 * Ordering rules for the Links card, kept out of the view so they can be tested
 * without a DOM.
 *
 * Three features share this file because they compete for the same thing —
 * what order rows appear in. Pinning wins over everything, grouping sections the
 * result, and the sort key orders within a section.
 */

export type LinkSortKey = "manual" | "recent" | "alpha" | "category";

/** A contiguous run of links rendered under one heading. */
export interface LinkGroup {
  key: string;
  label: string;
  links: LinkItem[];
}

/** Shown for a link whose category has been deleted out from under it. */
export const UNCATEGORIZED_LABEL = "Uncategorized";

/**
 * Comparator for the active sort key.
 *
 * Every branch falls through to an id tie-break. Without it, two links sharing a
 * `sort_order` (or a title, or a category) sort unstably, and a drag looks like
 * it jumped to a random position.
 */
export function compareLinks(
  a: LinkItem,
  b: LinkItem,
  sort: LinkSortKey,
  categoryNames: Map<string, string>
): number {
  if (sort === "manual") {
    return a.sort_order - b.sort_order || a.id.localeCompare(b.id);
  }

  if (sort === "alpha") {
    return a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
  }

  if (sort === "category") {
    const nameA = categoryNames.get(a.category_id) ?? "";
    const nameB = categoryNames.get(b.category_id) ?? "";

    return nameA.localeCompare(nameB) || a.id.localeCompare(b.id);
  }

  // "recent" — newest first.
  return b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id);
}

/**
 * Splits the pinned band off the top. Order within each half is preserved, so
 * the caller sorts first and partitions second.
 */
export function partitionPinned(links: LinkItem[]): {
  pinned: LinkItem[];
  rest: LinkItem[];
} {
  const pinned: LinkItem[] = [];
  const rest: LinkItem[] = [];

  for (const link of links) {
    if (link.pinned) {
      pinned.push(link);
    } else {
      rest.push(link);
    }
  }

  return { pinned, rest };
}

/**
 * Sections links by category, in order of first appearance, so the caller's sort
 * decides both the group order and the order inside each group.
 *
 * A link whose category no longer exists is grouped under its own id rather than
 * dropped — losing a row because a category was deleted would be worse than an
 * oddly-labelled group.
 */
export function groupByCategory(
  links: LinkItem[],
  categoryNames: Map<string, string>
): LinkGroup[] {
  const groups = new Map<string, LinkGroup>();

  for (const link of links) {
    const existing = groups.get(link.category_id);

    if (existing) {
      existing.links.push(link);
      continue;
    }

    groups.set(link.category_id, {
      key: link.category_id,
      label: categoryNames.get(link.category_id) ?? UNCATEGORIZED_LABEL,
      links: [link],
    });
  }

  return [...groups.values()];
}

/**
 * The new `sort_order` for every link after moving one from `fromIndex` to
 * `toIndex`.
 *
 * Renumbers the whole list from 1 rather than trying to slot a fractional value
 * between neighbours: the lists are short, one batch write is a single request,
 * and dense integers cannot drift into the precision problems a fractional
 * scheme eventually hits.
 *
 * Returns an empty array for out-of-range indices so a malformed drag writes
 * nothing at all.
 */
export function computeReorder(
  links: LinkItem[],
  fromIndex: number,
  toIndex: number
): { id: string; sort_order: number }[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= links.length ||
    toIndex >= links.length
  ) {
    return [];
  }

  const reordered = [...links];
  const [moved] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, moved);

  return reordered.map((link, index) => ({ id: link.id, sort_order: index + 1 }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/dashboard/link-order.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/dashboard/link-order.ts lib/dashboard/link-order.test.ts
git commit -m "feat(links): add ordering, grouping and reorder functions"
```

---

## Task 9: Reorder and pin APIs

**Files:**
- Create: `app/api/links/reorder/route.ts`
- Modify: `app/api/links/[id]/route.ts` (add `pinned` to `LinkUpdate` and its validation)

**Interfaces:**
- Consumes: `LINK_COLUMNS` with `pinned` (Task 7)
- Produces:
  - `PATCH /api/links/reorder` — body `{ order: [{ id, sort_order }] }`, responds `{ links }` at 200
  - `PATCH /api/links/[id]` — accepts `{ pinned: boolean }`, responds with the bare entity at 200

**Route placement note:** `app/api/links/reorder/route.ts` sits beside `app/api/links/[id]/route.ts`. Next matches the static segment `reorder` before the dynamic `[id]`, so this does not collide. Read `node_modules/next/dist/docs/` on route precedence if this behaves unexpectedly.

- [ ] **Step 1: Add `pinned` to the single-link PATCH**

In `app/api/links/[id]/route.ts`, add to the `LinkUpdate` interface (lines 15-21):

```ts
  pinned?: boolean;
```

and add this validation block after the `category_id` block (after line 117):

```ts
  if ("pinned" in body) {
    if (typeof body.pinned !== "boolean") {
      return apiError("INVALID_BODY", "pinned must be a boolean.", 400);
    }

    updates.pinned = body.pinned;
  }
```

- [ ] **Step 2: Write the reorder route**

Create `app/api/links/reorder/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";

import { requireAdminAuth } from "@/lib/auth/admin-guard";
import { LINK_COLUMNS, apiError, isUuid, readJsonObject } from "@/lib/dashboard/api";
import type { LinkItem } from "@/lib/dashboard/types";

/**
 * A drop rewrites every position in the affected list, so the cap is a sanity
 * bound on a hand-curated list, not a real limit anyone should reach.
 */
const MAX_REORDER_ROWS = 500;

/**
 * PATCH /api/links/reorder
 *
 * Applies a manual ordering as one batch: a drag writes every row's position in
 * a single request rather than one request per moved row.
 *
 * Responds with `{ links }` — the full list for the affected workspace, freshly
 * read — so the client replaces its optimistic state with what was actually
 * stored rather than assuming its own guess was right.
 */
export async function PATCH(request: NextRequest) {
  const authResult = await requireAdminAuth(request);
  if (authResult.error) {
    return authResult.error;
  }

  const { supabase } = authResult;
  const body = await readJsonObject(request);

  if (!body) {
    return apiError("INVALID_BODY", "Request body must be a JSON object.", 400);
  }

  const { order } = body;

  if (!Array.isArray(order) || order.length === 0) {
    return apiError("INVALID_BODY", "order must be a non-empty array.", 400);
  }

  if (order.length > MAX_REORDER_ROWS) {
    return apiError("INVALID_BODY", `order must hold at most ${MAX_REORDER_ROWS} rows.`, 400);
  }

  const positions = new Map<string, number>();

  for (const entry of order) {
    if (typeof entry !== "object" || entry === null) {
      return apiError("INVALID_BODY", "Each order entry must be an object.", 400);
    }

    const { id, sort_order: sortOrder } = entry as {
      id?: unknown;
      sort_order?: unknown;
    };

    // Guarding here keeps a malformed id from reaching Postgres as a 22P02 and
    // surfacing as a 500.
    if (typeof id !== "string" || !isUuid(id)) {
      return apiError("INVALID_BODY", "Each order entry needs a valid id.", 400);
    }

    if (typeof sortOrder !== "number" || !Number.isInteger(sortOrder)) {
      return apiError("INVALID_BODY", "Each order entry needs an integer sort_order.", 400);
    }

    if (positions.has(id)) {
      return apiError("INVALID_BODY", "order must not repeat an id.", 400);
    }

    positions.set(id, sortOrder);
  }

  const ids = [...positions.keys()];

  // Read first, for two reasons: it confirms every id is a row this caller can
  // see (RLS already restricts the read), and it gives us the ctx to scope the
  // response to without trusting a client-supplied workspace.
  const { data: existing, error: readError } = await supabase
    .from("dashboard_links")
    .select(LINK_COLUMNS)
    .in("id", ids);

  if (readError) {
    console.error("Link reorder read error:", readError);
    return apiError("SERVER_ERROR", "Could not load the links.", 500);
  }

  const rows: LinkItem[] = existing ?? [];

  if (rows.length !== ids.length) {
    return apiError("NOT_FOUND", "One or more links no longer exist.", 404);
  }

  // A reorder is meaningless across workspaces, and allowing it would let one
  // drag interleave two lists.
  const contexts = new Set(rows.map((row) => row.ctx));

  if (contexts.size > 1) {
    return apiError("INVALID_BODY", "order must not span workspaces.", 400);
  }

  const [ctx] = [...contexts];

  // Sequential rather than a single upsert: an upsert would need every non-null
  // column restated, which risks clobbering a title edit that landed between
  // this client's read and its drop.
  for (const row of rows) {
    const sortOrder = positions.get(row.id);

    if (sortOrder === undefined || sortOrder === row.sort_order) {
      continue;
    }

    const { error: updateError } = await supabase
      .from("dashboard_links")
      .update({ sort_order: sortOrder })
      .eq("id", row.id);

    if (updateError) {
      console.error("Link reorder write error:", updateError);
      return apiError("SERVER_ERROR", "Could not save the new order.", 500);
    }
  }

  const { data: refreshed, error: refreshError } = await supabase
    .from("dashboard_links")
    .select(LINK_COLUMNS)
    .eq("ctx", ctx)
    .order("sort_order", { ascending: true });

  if (refreshError) {
    console.error("Link reorder reload error:", refreshError);
    return apiError("SERVER_ERROR", "Could not reload the links.", 500);
  }

  const links: LinkItem[] = refreshed ?? [];

  return NextResponse.json({ links }, { status: 200 });
}
```

- [ ] **Step 3: Verify both endpoints against the real database**

Start the dev server, sign in, and from the browser console on `/dashboard/links`:

```js
// Pin the first link.
const all = await (await fetch("/api/links")).json();
const first = all.links[0];
console.log(await (await fetch(`/api/links/${first.id}`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ pinned: true }),
})).json());

// Reorder the first two.
const [a, b] = all.links;
console.log(await (await fetch("/api/links/reorder", {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ order: [
    { id: a.id, sort_order: 2 },
    { id: b.id, sort_order: 1 },
  ] }),
})).json());
```

Then **query the database directly** through the Supabase MCP to confirm the stored values match — a 200 is not proof:

```sql
select id, title, sort_order, pinned from public.dashboard_links order by ctx, sort_order;
```

- [ ] **Step 4: Verify the failure paths return the right codes**

Confirm each responds as stated, not as a 500:
- `{ order: [] }` → 400 `INVALID_BODY`
- `{ order: [{ id: "not-a-uuid", sort_order: 1 }] }` → 400 `INVALID_BODY`
- `{ order: [{ id: "<valid uuid, no such row>", sort_order: 1 }] }` → 404 `NOT_FOUND`
- `{ pinned: "yes" }` on `/api/links/[id]` → 400 `INVALID_BODY`
- Signed out → 401 `UNAUTHENTICATED`

- [ ] **Step 5: Run the gate**

```bash
npm run lint; echo "lint=$?"
npx tsc --noEmit; echo "tsc=$?"
npm test; echo "test=$?"
npm run build; echo "build=$?"
```

- [ ] **Step 6: Commit**

```bash
git add app/api/links/reorder/route.ts app/api/links/[id]/route.ts
git commit -m "feat(links): add reorder endpoint and pin field"
```

---

## Task 10: Render the pinned band, grouping, and manual sort

No drag yet — this task makes the ordering visible and pinning usable, so it is independently reviewable.

**Files:**
- Modify: `components/dashboard/links/links-view.tsx`
- Modify: `components/dashboard/icons.tsx` (add `PinIcon`, `GripIcon`)
- Modify: `app/dashboard/links/page.tsx:19-28` (order by the new index)

**Interfaces:**
- Consumes: `compareLinks`, `partitionPinned`, `groupByCategory`, `LinkSortKey`, `LinkGroup` (Task 8); `PATCH /api/links/[id]` with `pinned` (Task 9)
- Produces: a `LinkRow` sub-component used by Task 11's drag wiring

- [ ] **Step 1: Add the two icons**

In `components/dashboard/icons.tsx`, following the existing icon style (same `svg` props as `LinkIcon`), add:

```tsx
export function PinIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
    </svg>
  );
}

export function GripIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  );
}
```

- [ ] **Step 2: Order the server fetch by the new index**

In `app/dashboard/links/page.tsx`, replace the links query (lines 20-23):

```ts
    supabase
      .from("dashboard_links")
      .select(LINK_COLUMNS)
      .order("sort_order", { ascending: true }),
```

The client re-sorts anyway, but matching `dashboard_links_ctx_pinned_sort_idx` means the default view needs no sort step in Postgres.

- [ ] **Step 3: Replace the sort options and state in `links-view.tsx`**

Replace lines 10-16:

```tsx
import type { LinkSortKey } from "@/lib/dashboard/link-order";

const SORT_OPTIONS: { value: LinkSortKey; label: string }[] = [
  { value: "manual", label: "Manual" },
  { value: "recent", label: "Recent" },
  { value: "alpha", label: "A–Z" },
  { value: "category", label: "Category" },
];
```

Delete the local `type SortKey = …` declaration; `LinkSortKey` replaces it everywhere in this file.

Replace the sort state on line 84:

```tsx
  // Manual is the default: it is the only order the user controls, and the
  // migration backfilled it to match what "Recent" showed before.
  const [sort, setSort] = useState<LinkSortKey>("manual");
  const [grouped, setGrouped] = useState(false);
```

Add to the imports at the top:

```tsx
import {
  compareLinks,
  groupByCategory,
  partitionPinned,
  type LinkGroup,
} from "@/lib/dashboard/link-order";
import { GripIcon, LinkIcon, PinIcon, SearchIcon, TrashIcon } from "@/components/dashboard/icons";
```

- [ ] **Step 4: Replace `visibleLinks` with the banded, grouped derivation**

Replace the `visibleLinks` memo (lines 125-147):

```tsx
  const visibleLinks = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return links
      .filter((link) => link.ctx === workspace)
      .filter((link) => !needle || `${link.title}${link.url}`.toLowerCase().includes(needle))
      .filter((link) => activeFilter === "all" || link.category_id === activeFilter)
      .sort((a, b) => compareLinks(a, b, sort, categoryNames));
  }, [links, workspace, query, activeFilter, sort, categoryNames]);

  // Pinning wins over the active sort, so the band is split off after sorting.
  const { pinned, rest } = useMemo(() => partitionPinned(visibleLinks), [visibleLinks]);

  // Grouping is a view toggle, not a sort: it sections whatever `rest` already
  // holds, so the active sort still decides the order inside each section.
  const groups: LinkGroup[] = useMemo(
    () => (grouped ? groupByCategory(rest, categoryNames) : [{ key: "all", label: "", links: rest }]),
    [grouped, rest, categoryNames]
  );
```

- [ ] **Step 5: Add the pin handler**

Add beside `handleDelete`:

```tsx
  async function handleTogglePin(target: LinkItem) {
    const next = !target.pinned;
    // Optimistic, with the previous value captured for the rollback closure —
    // the same shape handleAdd and handleDelete already use.
    setLinks((previous) =>
      previous.map((link) => (link.id === target.id ? { ...link, pinned: next } : link))
    );

    try {
      const response = await fetch(`/api/links/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: next }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Could not update the link."));
      }
    } catch (error) {
      setLinks((previous) =>
        previous.map((link) =>
          link.id === target.id ? { ...link, pinned: target.pinned } : link
        )
      );
      showToast(error instanceof Error ? error.message : "Could not update the link.");
    }
  }
```

- [ ] **Step 6: Extract a `LinkRow` component**

Above `LinksView`, so Task 11 has one place to attach drag handlers:

```tsx
function LinkRow({
  link,
  categoryName,
  draggable,
  onTogglePin,
  onDelete,
  dragHandleProps,
}: {
  link: LinkItem;
  categoryName: string;
  draggable: boolean;
  onTogglePin: (link: LinkItem) => void;
  onDelete: (link: LinkItem) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
}) {
  const optimistic = link.id.startsWith(OPTIMISTIC_PREFIX);

  return (
    <li className="flex items-center gap-3 border-b border-border px-5 py-[13px] hover:bg-surface-2">
      {draggable ? (
        <button
          type="button"
          // `touch-action: none` is load-bearing: without it the browser claims
          // the gesture for scrolling before the pointer handlers ever see it.
          style={{ touchAction: "none" }}
          aria-label={`Reorder ${link.title}`}
          title="Drag to reorder"
          className="grid h-[30px] w-[22px] flex-none cursor-grab place-items-center rounded text-muted hover:text-text active:cursor-grabbing"
          {...dragHandleProps}
        >
          <GripIcon />
        </button>
      ) : null}

      <span
        aria-hidden="true"
        className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[9px] bg-accent-soft font-mono text-xs font-semibold text-accent"
      >
        {(link.title[0] ?? "?").toUpperCase()}
      </span>

      <div className="min-w-0 flex-1">
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-sm font-semibold text-text hover:text-accent"
        >
          {link.title}
        </a>
        <span className="block truncate font-mono text-[11px] text-muted">
          {hostLabel(link.url)}
        </span>
      </div>

      <span className="whitespace-nowrap rounded-[20px] border border-border bg-surface-2 px-[9px] py-[3px] text-[11px] text-text-2">
        {categoryName}
      </span>

      <button
        type="button"
        onClick={() => onTogglePin(link)}
        disabled={optimistic}
        aria-pressed={link.pinned}
        aria-label={link.pinned ? `Unpin ${link.title}` : `Pin ${link.title}`}
        title={link.pinned ? "Unpin" : "Pin to top"}
        className={[
          "grid h-[30px] w-[30px] flex-none cursor-pointer place-items-center rounded-lg border border-border bg-transparent disabled:cursor-not-allowed disabled:opacity-50",
          link.pinned ? "text-accent" : "text-muted hover:text-text",
        ].join(" ")}
      >
        <PinIcon />
      </button>

      <button
        type="button"
        onClick={() => onDelete(link)}
        disabled={optimistic}
        aria-label={`Delete ${link.title}`}
        title="Delete"
        className="grid h-[30px] w-[30px] flex-none cursor-pointer place-items-center rounded-lg border border-border bg-transparent text-muted hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
      >
        <TrashIcon />
      </button>
    </li>
  );
}
```

- [ ] **Step 7: Add the grouping toggle to the controls row**

After the sort `<select>` (line 367), add:

```tsx
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-[9px] border border-border-2 bg-surface-2 px-[10px] text-[13px] text-text">
          <input
            type="checkbox"
            checked={grouped}
            onChange={(event) => setGrouped(event.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--accent)]"
          />
          Group
        </label>
```

- [ ] **Step 8: Replace the list body**

Replace the `<ul>` block (lines 376-421):

```tsx
          <>
            {pinned.length > 0 ? (
              <div>
                <h3 className="flex items-center gap-1.5 border-b border-border bg-surface-2 px-5 py-2 font-mono text-[11px] uppercase tracking-wide text-muted">
                  <PinIcon />
                  Pinned
                </h3>
                <ul className="list-none">
                  {pinned.map((link) => (
                    <LinkRow
                      key={link.id}
                      link={link}
                      categoryName={categoryNames.get(link.category_id) ?? "Uncategorized"}
                      draggable={false}
                      onTogglePin={handleTogglePin}
                      onDelete={handleDelete}
                    />
                  ))}
                </ul>
              </div>
            ) : null}

            {groups.map((group) => (
              <div key={group.key}>
                {grouped ? (
                  <h3 className="flex items-center justify-between border-b border-border bg-surface-2 px-5 py-2 font-mono text-[11px] uppercase tracking-wide text-muted">
                    {group.label}
                    <span>{group.links.length}</span>
                  </h3>
                ) : null}
                <ul className="list-none">
                  {group.links.map((link) => (
                    <LinkRow
                      key={link.id}
                      link={link}
                      categoryName={categoryNames.get(link.category_id) ?? "Uncategorized"}
                      draggable={sort === "manual"}
                      onTogglePin={handleTogglePin}
                      onDelete={handleDelete}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </>
```

Note: pinned rows are `draggable={false}`. The pinned band has its own order and dragging within it is deferred — the grip would otherwise imply a reorder that Task 11 does not implement.

- [ ] **Step 9: Update the count in the header**

Line 243 reads `visibleLinks.length`, which still holds both bands. Leave it — it is the honest total.

- [ ] **Step 10: Verify by hand**

1. Manual is the default sort; the order matches what Recent showed before the migration.
2. Pin a link — it moves to the Pinned band. Reload; it is still pinned.
3. Unpin it — it returns to the main list.
4. Toggle Group — sections appear with per-category counts; toggling off restores the flat list.
5. Switch to A–Z — grip handles disappear.
6. Search and category filter still narrow both bands.
7. Switch workspace — pins and order are per-workspace.

- [ ] **Step 11: Run the gate**

```bash
npm run lint; echo "lint=$?"
npx tsc --noEmit; echo "tsc=$?"
npm test; echo "test=$?"
npm run build; echo "build=$?"
```

- [ ] **Step 12: Commit**

```bash
git add components/dashboard/links/links-view.tsx components/dashboard/icons.tsx app/dashboard/links/page.tsx
git commit -m "feat(links): add pinned band, category grouping and manual sort"
```

---

## Task 11: Pointer Events drag reorder

**Files:**
- Create: `components/dashboard/links/use-drag-reorder.ts`
- Modify: `components/dashboard/links/links-view.tsx`

**Interfaces:**
- Consumes: `computeReorder` (Task 8), `LinkRow`'s `dragHandleProps` (Task 10), `PATCH /api/links/reorder` (Task 9)
- Produces: `useDragReorder({ count, enabled, onCommit }: DragReorderOptions)` returning `{ dragIndex, overIndex, getHandleProps(index), getRowProps(index) }`

**Why Pointer Events:** they unify mouse, touch and pen in one code path. The HTML5 drag-and-drop API does not fire on mobile at all, so it cannot satisfy "left click on PC and drag-drop on mobile" with a single mechanism.

- [ ] **Step 1: Write the hook**

Create `components/dashboard/links/use-drag-reorder.ts`:

```ts
"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Pointer-driven list reordering, plus a keyboard equivalent.
 *
 * Pointer Events rather than HTML5 drag-and-drop: the latter does not fire on
 * touch devices at all, so it cannot serve both the desktop and mobile
 * requirement from one implementation.
 *
 * Two things that are easy to get wrong and expensive to rediscover:
 *
 *   - The handle needs `touch-action: none` in CSS. Without it the browser
 *     resolves the gesture as a scroll and cancels the pointer stream before
 *     these handlers run. This is set on the button in `LinkRow`.
 *   - `setPointerCapture` keeps events flowing to the handle even when the
 *     pointer leaves it, which it always does — the row moves out from under
 *     the finger as the list reorders.
 */
export interface DragReorderOptions {
  /** Number of rows currently rendered in the draggable list. */
  count: number;
  /** Reordering is only meaningful in manual sort. */
  enabled: boolean;
  /** Called once on drop, with the source and destination indices. */
  onCommit: (fromIndex: number, toIndex: number) => void;
}

export function useDragReorder({ count, enabled, onCommit }: DragReorderOptions) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  /**
   * The same two values as refs.
   *
   * `onCommit` must not be called from inside a state updater: React invokes
   * updaters twice in StrictMode, which would fire two reorder requests for one
   * drop. Refs give `finish` the current indices synchronously with no updater.
   */
  const dragIndexRef = useRef<number | null>(null);
  const overIndexRef = useRef<number | null>(null);
  /** Live row elements, so a move can hit-test against their boxes. */
  const rowsRef = useRef<HTMLElement[]>([]);

  const registerRow = useCallback((index: number, element: HTMLElement | null) => {
    if (element) {
      rowsRef.current[index] = element;
    }
  }, []);

  const finish = useCallback(() => {
    const from = dragIndexRef.current;
    const to = overIndexRef.current;

    dragIndexRef.current = null;
    overIndexRef.current = null;
    setDragIndex(null);
    setOverIndex(null);

    if (from !== null && to !== null && from !== to) {
      onCommit(from, to);
    }
  }, [onCommit]);

  const getHandleProps = useCallback(
    (index: number) => {
      if (!enabled) {
        return {};
      }

      return {
        onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
          // Ignore secondary buttons; a right-click must not start a drag.
          if (event.button !== 0) {
            return;
          }

          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          dragIndexRef.current = index;
          overIndexRef.current = index;
          setDragIndex(index);
          setOverIndex(index);
        },

        onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => {
          if (dragIndexRef.current === null) {
            return;
          }

          const y = event.clientY;

          // The destination is the first row whose midpoint is still below the
          // pointer; past every midpoint means the end of the list. Comparing
          // against midpoints rather than row bounds is what makes the drop
          // indicator flip at the halfway point instead of at the edge, and it
          // gives a defined answer when the pointer is in the gap between rows.
          let next = count - 1;

          for (let i = 0; i < count; i += 1) {
            const row = rowsRef.current[i];

            if (!row) {
              continue;
            }

            const box = row.getBoundingClientRect();

            if (y < box.top + box.height / 2) {
              next = i;
              break;
            }
          }

          overIndexRef.current = next;
          setOverIndex(next);
        },

        onPointerUp: finish,
        onPointerCancel: finish,

        onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
          // Keyboard equivalent: drag alone is unusable without a pointer, and
          // every row here is already keyboard-reachable.
          if (event.key === "ArrowUp" && index > 0) {
            event.preventDefault();
            onCommit(index, index - 1);
          }

          if (event.key === "ArrowDown" && index < count - 1) {
            event.preventDefault();
            onCommit(index, index + 1);
          }
        },
      };
    },
    [count, enabled, finish, onCommit]
  );

  const getRowProps = useCallback(
    (index: number) => ({
      ref: (element: HTMLElement | null) => registerRow(index, element),
      "data-dragging": dragIndex === index ? "true" : undefined,
      "data-drop-target": overIndex === index && dragIndex !== index ? "true" : undefined,
    }),
    [dragIndex, overIndex, registerRow]
  );

  return { dragIndex, overIndex, getHandleProps, getRowProps };
}
```

- [ ] **Step 2: Wire the hook into `LinksView`**

Add the commit handler beside `handleTogglePin`. It reorders **within the ungrouped, unpinned list only** — dragging while grouped is disabled in Step 3, so indices always address a single flat list:

```tsx
  async function handleReorder(fromIndex: number, toIndex: number) {
    const order = computeReorder(rest, fromIndex, toIndex);

    if (order.length === 0) {
      return;
    }

    const previousLinks = links;
    const byId = new Map(order.map((entry) => [entry.id, entry.sort_order]));

    setLinks((current) =>
      current.map((link) =>
        byId.has(link.id) ? { ...link, sort_order: byId.get(link.id)! } : link
      )
    );

    try {
      const response = await fetch("/api/links/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Could not save the new order."));
      }

      // Replace optimistic positions with what was actually stored.
      const { links: saved }: { links: LinkItem[] } = await response.json();
      const savedById = new Map(saved.map((link) => [link.id, link]));

      setLinks((current) => current.map((link) => savedById.get(link.id) ?? link));
    } catch (error) {
      setLinks(previousLinks);
      showToast(error instanceof Error ? error.message : "Could not save the new order.");
    }
  }

  const dragEnabled = sort === "manual" && !grouped && !query.trim();

  const { getHandleProps, getRowProps } = useDragReorder({
    count: rest.length,
    enabled: dragEnabled,
    onCommit: handleReorder,
  });
```

Add the imports:

```tsx
import { computeReorder } from "@/lib/dashboard/link-order";
import { useDragReorder } from "@/components/dashboard/links/use-drag-reorder";
```

- [ ] **Step 3: Understand why dragging is disabled when grouped or searching**

`computeReorder` renumbers positions by array index. When the list is grouped or filtered by a search, the rendered rows are a *subset* in a *different* order than the stored one, so an index from the view does not address the same row in the stored list — a drop would scramble rows the user cannot see. Disabling drag in those modes is the honest fix; supporting it needs a different algorithm and is out of scope.

Pass `draggable={dragEnabled}` to `LinkRow` in the groups loop (replacing `draggable={sort === "manual"}` from Task 10), and thread the hook's props through:

```tsx
                  {group.links.map((link, index) => (
                    <LinkRow
                      key={link.id}
                      link={link}
                      categoryName={categoryNames.get(link.category_id) ?? "Uncategorized"}
                      draggable={dragEnabled}
                      onTogglePin={handleTogglePin}
                      onDelete={handleDelete}
                      dragHandleProps={getHandleProps(index)}
                      rowProps={getRowProps(index)}
                    />
                  ))}
```

- [ ] **Step 4: Accept `rowProps` in `LinkRow`**

Add to `LinkRow`'s props and spread onto the `<li>`:

```tsx
  // `React.HTMLAttributes` does not admit `data-*` keys, so the index signature
  // is what lets the hook's data-dragging / data-drop-target flags typecheck.
  rowProps?: React.HTMLAttributes<HTMLLIElement> & {
    ref?: (element: HTMLElement | null) => void;
    [key: `data-${string}`]: string | undefined;
  };
```

```tsx
    <li
      {...rowProps}
      className="flex items-center gap-3 border-b border-border px-5 py-[13px] hover:bg-surface-2 data-[dragging=true]:opacity-40 data-[drop-target=true]:border-t-2 data-[drop-target=true]:border-t-accent"
    >
```

- [ ] **Step 5: Verify with a mouse**

1. Manual sort, ungrouped, no search: grips are visible.
2. Drag a row to a new position — a drop indicator follows, and the row lands where dropped.
3. Reload — the new order persisted.
4. Confirm in the database, not just the UI:
   `select id, title, sort_order from public.dashboard_links order by ctx, sort_order;`
5. Turn on Group, or type in search, or switch to A–Z: grips disappear.
6. Tab to a grip and press Arrow Up/Down — the row moves and saves.

- [ ] **Step 6: Verify on a real phone — REQUIRED, NOT OPTIONAL**

Open the deployed preview on an actual phone and drag a row.

Per AGENTS.md this cannot be substituted with a synthetic-event test: **synthetic events bypass the browser's gesture arbitration, which is the exact mechanism that breaks touch drag.** A prior swipe handler in this project passed twelve synthetic cases and did nothing on real hardware.

Check specifically:
- The drag starts without the page scrolling (this is what `touch-action: none` buys).
- The row follows the finger and drops where released.
- The list scrolls normally when dragging *outside* the handle.

**If this cannot be run now, record it in the spec as deferred. Do not mark this task complete and do not describe touch drag as working.**

- [ ] **Step 7: Run the gate**

```bash
npm run lint; echo "lint=$?"
npx tsc --noEmit; echo "tsc=$?"
npm test; echo "test=$?"
npm run build; echo "build=$?"
```

- [ ] **Step 8: Commit**

```bash
git add components/dashboard/links/use-drag-reorder.ts components/dashboard/links/links-view.tsx
git commit -m "feat(links): add pointer-driven drag reordering with keyboard fallback"
```

---

## Task 12: Quick-add category from the Links page

`POST /api/categories` already validates, rejects case-insensitive duplicates, and appends `sort_order`. It needs **no change**. The only obstacle is that `categories` arrives as a static prop and is never mutated, so a new one cannot appear without a reload.

**Files:**
- Modify: `components/dashboard/links/links-view.tsx`

**Interfaces:**
- Consumes: `POST /api/categories` (unchanged), `CATEGORY_NAME_MAX_LENGTH` from `lib/dashboard/api.ts`

- [ ] **Step 1: Lift categories into state**

Replace the prop destructure so the prop seeds state:

```tsx
export default function LinksView({
  initialLinks,
  categories: initialCategories,
}: {
  initialLinks: LinkItem[];
  categories: Category[];
}) {
```

and add beside the other state:

```tsx
  // Seeded from the server prop, then owned locally so a category created from
  // this page appears without a reload.
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [addingCategory, setAddingCategory] = useState(false);
  const [draftCategoryName, setDraftCategoryName] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);
```

- [ ] **Step 2: Add the create handler**

```tsx
  async function handleAddCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = draftCategoryName.trim();

    if (!name || savingCategory) {
      return;
    }

    setSavingCategory(true);

    try {
      const response = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ctx: workspace, kind: "link", name }),
      });

      if (!response.ok) {
        // A 409 already carries a usable message ("X already exists in this
        // list"), so it is surfaced verbatim rather than replaced.
        throw new Error(await readApiError(response, "Could not add the category."));
      }

      const created: Category = await response.json();

      // Not optimistic: the server assigns sort_order and rejects duplicates,
      // so there is nothing useful to guess.
      setCategories((previous) => [...previous, created]);
      setDraftCategoryId(created.id);
      setDraftCategoryName("");
      setAddingCategory(false);
      showToast(`Added “${created.name}”`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not add the category.");
    } finally {
      setSavingCategory(false);
    }
  }
```

- [ ] **Step 3: Add the entry point to the add-link form**

The category `<select>` in the add form (lines 292-303) gains a sentinel option, and a conditional inline input follows it:

```tsx
          <select
            id={draftCategoryFieldId}
            value={activeDraftCategoryId}
            onChange={(event) => {
              if (event.target.value === NEW_CATEGORY_VALUE) {
                setAddingCategory(true);
                return;
              }

              setDraftCategoryId(event.target.value);
            }}
            className={INPUT_CLASS}
          >
            {workspaceCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
            <option value={NEW_CATEGORY_VALUE}>+ New category…</option>
          </select>
```

Add the sentinel beside the other module constants:

```tsx
/** Sentinel `<option>` value; never a real category id, which is always a uuid. */
const NEW_CATEGORY_VALUE = "__new__";
```

- [ ] **Step 4: Render the inline creation form**

Immediately after the add-link `<form>` (after line 313). It is a **sibling**, not a nested form — nested forms are invalid HTML and the inner one silently will not submit:

```tsx
      {addingCategory ? (
        <form
          onSubmit={handleAddCategory}
          className="flex items-center gap-[10px] border-b border-border bg-surface-2 px-5 py-3"
        >
          <label htmlFor={newCategoryFieldId} className="sr-only">
            New category name
          </label>
          <input
            id={newCategoryFieldId}
            value={draftCategoryName}
            onChange={(event) => setDraftCategoryName(event.target.value)}
            placeholder="Category name"
            maxLength={CATEGORY_NAME_MAX_LENGTH}
            autoFocus
            required
            className={`${INPUT_CLASS} min-w-0 flex-1`}
          />
          <button
            type="submit"
            disabled={savingCategory}
            className="h-[38px] cursor-pointer rounded-[9px] bg-accent px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => {
              setAddingCategory(false);
              setDraftCategoryName("");
            }}
            className="h-[38px] cursor-pointer rounded-[9px] border border-border bg-transparent px-4 text-sm text-text-2"
          >
            Cancel
          </button>
        </form>
      ) : null}
```

Add `const newCategoryFieldId = useId();` beside the other id hooks, and import `CATEGORY_NAME_MAX_LENGTH` from `@/lib/dashboard/api`.

- [ ] **Step 5: Confirm the derived selection still holds**

`activeDraftCategoryId` (lines 119-123) falls back when the selected id is not in `workspaceCategories`. Because `workspaceCategories` derives from the `categories` **state** now, a newly created category is a valid choice on the very next render and `setDraftCategoryId(created.id)` sticks. Re-read those lines and confirm no `useEffect` was added — the fallback must stay derived.

- [ ] **Step 6: Verify by hand**

1. Open the add-link form, choose "+ New category…", type a name, Add. It appears in the select and is selected.
2. Save a link into it — the link carries the new category.
3. Reload — the category and the link's assignment persisted.
4. Add a category whose name differs only in case from an existing one — the 409's message appears in a toast and nothing is created.
5. Switch workspace, add a category — it belongs to that workspace only.
6. Confirm in the database:
   `select ctx, kind, name, sort_order from public.dashboard_categories order by ctx, kind, sort_order;`
7. Cancel leaves state untouched.

- [ ] **Step 7: Run the gate**

```bash
npm run lint; echo "lint=$?"
npx tsc --noEmit; echo "tsc=$?"
npm test; echo "test=$?"
npm run build; echo "build=$?"
```

- [ ] **Step 8: Commit**

```bash
git add components/dashboard/links/links-view.tsx
git commit -m "feat(links): add inline category creation"
```

---

## Task 13: Whole-branch verification

- [ ] **Step 1: Full gate from a clean install**

```bash
rm -rf .next
npm ci
npm run lint; echo "lint=$?"
npx tsc --noEmit; echo "tsc=$?"
npm test; echo "test=$?"
npm run build; echo "build=$?"
```

All four must be `0`. Read the numbers.

- [ ] **Step 2: Confirm no `getUser()` call survives in a hot path**

```bash
grep -rn "auth.getUser()" app lib components --include=*.ts --include=*.tsx
```

Expected: no matches. If one appears, it is a per-request network round-trip and needs justifying.

- [ ] **Step 3: Confirm the workspace-scoping rule was not violated**

```bash
grep -rn "useWorkspace" components/dashboard --include=*.tsx
```

Expected: Links and Notes only. **Documents and Settings must not appear.**

- [ ] **Step 4: Record deferred items**

Append to the spec anything that could not be verified — touch drag on real hardware above all — as **deferred, with the reason**. Per AGENTS.md a truthful deferral beats a fallback path that makes something look done.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: record verification results and deferred items"
```
