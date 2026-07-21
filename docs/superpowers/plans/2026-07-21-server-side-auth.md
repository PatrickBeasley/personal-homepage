# Server-Side Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move sign-in off the Supabase browser SDK and onto Server Actions, so the login page works with no client JavaScript at all.

**Architecture:** The login form becomes a Server Component with no `"use client"`. Two Server Actions handle password sign-in and magic-link sending; both run entirely on the server using the existing `createServerSupabaseClient`, which already writes session cookies. Failures redirect back to `/login` with a generic flag. `lib/supabase/browser.ts` is deleted, which stops any Supabase SDK — and the anon key — from shipping to browsers.

**Tech Stack:** Next.js 16.2.1 (App Router, Server Actions), React 19, `@supabase/ssr` 0.10 (server client only), TypeScript, vitest.

**Spec:** `docs/superpowers/specs/2026-07-21-server-side-auth-design.md`

## Global Constraints

- **This is NOT the Next.js you know.** Read the relevant guide in `node_modules/next/dist/docs/` before writing framework-shaped code. Do not write Server Action or `params` signatures from memory.
- **Never wrap `redirect()` in a `try`/`catch`.** Next implements it by throwing a control-flow error; catching it silently breaks the redirect. Every `redirect()` in this plan sits outside any try block, deliberately.
- **Enumeration safety is a hard requirement.** Every credential failure — wrong password, unknown address, empty input — must produce a byte-identical redirect. Any branch that varies by whether an account exists is a defect, not a nicety.
- **Never derive a redirect origin from request headers.** Magic-link targets come from configured `NEXT_PUBLIC_SITE_URL` only. Trusting `Host` or `x-forwarded-host` is how link poisoning happens.
- **Check gate exit codes directly.** `npx tsc --noEmit | tail -2 && echo OK` tests `tail`'s exit code, not tsc's. This has produced a false green in this repo before.
- Gates for every task: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`.

## File Structure

| File | Responsibility |
|---|---|
| `lib/auth/actions.ts` | **New.** The two Server Actions. The only place auth is performed. |
| `lib/auth/actions.test.ts` | **New.** Proves redirect uniformity across failure modes. |
| `lib/env.ts` | **Modify.** Add `getSiteUrl()`. |
| `components/auth/login-form.tsx` | **Modify.** Server Component; plain form. |
| `app/login/page.tsx` | **Modify.** Read `?error` and `?sent`. |
| `lib/supabase/browser.ts` | **Delete.** |

---

### Task 1: `getSiteUrl()` and the password sign-in action

**Files:**
- Modify: `lib/env.ts`
- Create: `lib/auth/actions.ts`
- Create: `lib/auth/actions.test.ts`

**Interfaces:**
- Consumes: `createServerSupabaseClient()` from `lib/supabase/server.ts`; `normalizeNextPath(input: string | null, fallback?: string): string` from `lib/auth/redirects.ts`
- Produces: `getSiteUrl(): string` from `lib/env.ts`; `signInWithPasswordAction(formData: FormData): Promise<void>` from `lib/auth/actions.ts`

- [ ] **Step 1: Add `getSiteUrl()` to `lib/env.ts`**

Append to the end of the file:

```ts
/**
 * The canonical public origin, for anything that must not trust request
 * headers. Magic-link redirect targets in particular: deriving an origin from
 * `Host` or `x-forwarded-host` is how link poisoning happens.
 *
 * Defaults to the www host because that is canonical — the apex 307-redirects
 * to it. (Note `app/layout.tsx`, `app/robots.ts` and `app/sitemap.ts` still
 * default to the apex. Harmless, since the redirect resolves it, but worth
 * unifying separately.)
 */
export function getSiteUrl() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.patrickbeasley.com";
  return raw.replace(/\/+$/, "");
}
```

- [ ] **Step 2: Write the failing test**

Create `lib/auth/actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * `vi.hoisted` is required, not stylistic. vitest hoists `vi.mock` calls above
 * everything else in the file, so a factory that closes over an ordinary
 * top-level `const` throws "Cannot access before initialization". Anything a
 * mock factory references must be created inside `vi.hoisted`.
 */
const { signInWithPassword, redirect } = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  redirect: vi.fn((url: string) => {
    // The real redirect() signals by throwing; mirroring that keeps the action
    // under test on its true control-flow path.
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect }));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: { signInWithPassword },
  }),
}));

async function callAndCaptureRedirect(action: () => Promise<void>) {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("REDIRECT:")) {
      return message.slice("REDIRECT:".length);
    }
    throw error;
  }
  throw new Error("action did not redirect");
}

function form(fields: Record<string, string>) {
  const data = new FormData();
  Object.entries(fields).forEach(([key, value]) => data.append(key, value));
  return data;
}

describe("signInWithPasswordAction", () => {
  beforeEach(() => {
    signInWithPassword.mockReset();
    redirect.mockClear();
  });

  it("redirects to the requested path on success", async () => {
    signInWithPassword.mockResolvedValue({ error: null });

    const { signInWithPasswordAction } = await import("./actions");
    const target = await callAndCaptureRedirect(() =>
      signInWithPasswordAction(form({ email: "a@b.com", password: "pw", next: "/dashboard" })),
    );

    expect(target).toBe("/dashboard");
  });

  // The enumeration-safety property. These three failures must be
  // indistinguishable to the caller, so the redirect target must be identical.
  it("redirects identically for every credential failure", async () => {
    const { signInWithPasswordAction } = await import("./actions");

    signInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    const wrongPassword = await callAndCaptureRedirect(() =>
      signInWithPasswordAction(form({ email: "known@b.com", password: "bad", next: "/dashboard" })),
    );

    signInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    const unknownUser = await callAndCaptureRedirect(() =>
      signInWithPasswordAction(form({ email: "nobody@b.com", password: "pw", next: "/dashboard" })),
    );

    signInWithPassword.mockResolvedValue({ error: { message: "Email not confirmed" } });
    const unconfirmed = await callAndCaptureRedirect(() =>
      signInWithPasswordAction(form({ email: "known@b.com", password: "pw", next: "/dashboard" })),
    );

    expect(wrongPassword).toBe(unknownUser);
    expect(unknownUser).toBe(unconfirmed);
    expect(wrongPassword).toContain("error=1");
  });

  it("refuses an off-site next target", async () => {
    signInWithPassword.mockResolvedValue({ error: null });

    const { signInWithPasswordAction } = await import("./actions");
    const target = await callAndCaptureRedirect(() =>
      signInWithPasswordAction(form({ email: "a@b.com", password: "pw", next: "https://evil.example" })),
    );

    expect(target).toBe("/dashboard");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run lib/auth/actions.test.ts`
Expected: FAIL — cannot resolve `./actions`.

- [ ] **Step 4: Create `lib/auth/actions.ts`**

```ts
"use server";

import { redirect } from "next/navigation";

import { normalizeNextPath } from "@/lib/auth/redirects";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function readField(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Password sign-in. Runs entirely on the server, so no Supabase SDK reaches
 * the browser and a native form POST is the intended path rather than a
 * failure mode.
 *
 * Every failure redirects to exactly one target. Supabase already returns a
 * single generic error for "no such user" and "wrong password"; this must not
 * widen that, so no branch below may depend on the kind of failure.
 */
export async function signInWithPasswordAction(formData: FormData) {
  const email = readField(formData, "email");
  const password = readField(formData, "password");
  const next = normalizeNextPath(readField(formData, "next") || null, "/dashboard");

  const supabase = await createServerSupabaseClient();

  let failed = false;

  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    failed = Boolean(error);
  } catch {
    // A thrown transport or service failure collapses into the same outcome as
    // a rejected credential. It cannot reveal whether an account exists, so
    // enumeration safety is preserved.
    failed = true;
  }

  // Outside the try on purpose: redirect() signals by throwing, and catching
  // it would swallow the navigation.
  if (failed) {
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }

  redirect(next);
}
```

> **Revised during execution.** The first draft of this task handled Supabase
> *returning* `{ error }` but not *throwing* — a network or service failure
> would escape to Next's error boundary instead of reaching the login page.
> The client code being replaced did handle that, so the original draft was a
> robustness regression in a refactor justified by robustness. Add a matching
> test asserting the thrown path redirects to a target **equal to** the
> returned-error path rather than to a hardcoded string, so that giving the
> two paths different messages later fails the test.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run lib/auth/actions.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Run all gates**

```bash
npm run lint; echo "lint=$?"
npx tsc --noEmit; echo "tsc=$?"
npm test; echo "test=$?"
```
Expected: all three print `=0`.

- [ ] **Step 7: Commit**

```bash
git add lib/env.ts lib/auth/actions.ts lib/auth/actions.test.ts
git commit -m "feat(auth): add server-side password sign-in action"
```

---

### Task 2: Magic-link action

**Files:**
- Modify: `lib/auth/actions.ts`
- Modify: `lib/auth/actions.test.ts`

**Interfaces:**
- Consumes: `getSiteUrl()` from `lib/env.ts` (Task 1)
- Produces: `sendMagicLinkAction(formData: FormData): Promise<void>`

- [ ] **Step 1: Write the failing test**

Add to `lib/auth/actions.test.ts`. First extend the hoisted block and the server mock — `signInWithOtp` must be created inside `vi.hoisted` for the same reason as the others:

```ts
const { signInWithPassword, signInWithOtp, redirect } = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signInWithOtp: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: { signInWithPassword, signInWithOtp },
  }),
}));
```

Then append this describe block:

```ts
describe("sendMagicLinkAction", () => {
  beforeEach(() => {
    signInWithOtp.mockReset();
    redirect.mockClear();
  });

  it("uses the configured site origin, never a request header", async () => {
    signInWithOtp.mockResolvedValue({ error: null });

    const { sendMagicLinkAction } = await import("./actions");
    await callAndCaptureRedirect(() =>
      sendMagicLinkAction(form({ email: "a@b.com", next: "/dashboard" })),
    );

    const options = signInWithOtp.mock.calls[0][0].options;
    expect(options.emailRedirectTo).toMatch(/^https:\/\//);
    expect(options.emailRedirectTo).toContain("/auth/confirm");
    expect(options.shouldCreateUser).toBe(false);
  });

  // Enumeration safety, thrown path: a transport failure must not change what
  // the user sees. (See the sibling test below for the path that actually
  // occurs in production.)
  it("confirms identically when the client throws", async () => {
    const { sendMagicLinkAction } = await import("./actions");

    signInWithOtp.mockResolvedValue({ error: null });
    const known = await callAndCaptureRedirect(() =>
      sendMagicLinkAction(form({ email: "known@b.com", next: "/dashboard" })),
    );

    signInWithOtp.mockRejectedValue(new Error("User not found"));
    const unknown = await callAndCaptureRedirect(() =>
      sendMagicLinkAction(form({ email: "nobody@b.com", next: "/dashboard" })),
    );

    expect(known).toBe(unknown);
    expect(known).toContain("sent=1");
  });

  // Enumeration safety, resolved path — the one production actually takes.
  // @supabase/auth-js catches AuthApiError internally and RESOLVES with
  // { data, error } rather than rejecting, so a rejection-only test would pass
  // against an implementation that reads `error` and branches on it.
  it("confirms identically when the client resolves with an error", async () => {
    const { sendMagicLinkAction } = await import("./actions");

    signInWithOtp.mockResolvedValue({ data: {}, error: null });
    const known = await callAndCaptureRedirect(() =>
      sendMagicLinkAction(form({ email: "known@b.com", next: "/dashboard" })),
    );

    signInWithOtp.mockResolvedValue({
      data: {},
      error: { message: "Signups not allowed for otp" },
    });
    const unknown = await callAndCaptureRedirect(() =>
      sendMagicLinkAction(form({ email: "nobody@b.com", next: "/dashboard" })),
    );

    expect(unknown).toBe(known);
  });
});
```

> **Revised during execution.** The first draft asserted that `signInWithOtp`
> *rejects* for unknown addresses under `shouldCreateUser: false`. That is
> false — verified against `node_modules/@supabase/auth-js/src/GoTrueClient.ts`,
> which catches `AuthApiError` internally and resolves with `{ error }`. A
> rejection-only test therefore guarded the wrong path: it would still pass
> against an implementation that destructured `error` and redirected
> differently. Both shapes are now covered. The shipped implementation was
> safe regardless, because it never reads the resolved value — but the test
> existed to lock that in, and it did not.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/auth/actions.test.ts`
Expected: FAIL — `sendMagicLinkAction` is not exported.

- [ ] **Step 3: Implement the action**

Add the `getSiteUrl` import to `lib/auth/actions.ts`:

```ts
import { getSiteUrl } from "@/lib/env";
```

and append:

```ts
/**
 * Magic link, as a sign-in backup. `shouldCreateUser: false` means this is
 * never a registration path.
 *
 * The outcome is deliberately swallowed and the confirmation is identical
 * either way: an unknown address errors here, and surfacing that would reveal
 * whether an account exists.
 *
 * `emailRedirectTo` is built from the configured site origin, never from
 * request headers — a Host header we echo into an emailed link is a
 * link-poisoning vector.
 */
export async function sendMagicLinkAction(formData: FormData) {
  const email = readField(formData, "email").trim();
  const next = normalizeNextPath(readField(formData, "next") || null, "/dashboard");

  if (email) {
    const supabase = await createServerSupabaseClient();

    try {
      await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${getSiteUrl()}/auth/confirm?next=${encodeURIComponent(next)}`,
          shouldCreateUser: false,
        },
      });
    } catch {
      // Intentional. See the note above about identical outcomes.
    }
  }

  redirect(`/login?sent=1&next=${encodeURIComponent(next)}`);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/auth/actions.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Run all gates**

```bash
npm run lint; echo "lint=$?"
npx tsc --noEmit; echo "tsc=$?"
npm test; echo "test=$?"
```
Expected: all `=0`.

- [ ] **Step 6: Commit**

```bash
git add lib/auth/actions.ts lib/auth/actions.test.ts
git commit -m "feat(auth): add server-side magic-link action"
```

---

### Task 3: Convert the login form and page to server-rendered

**Files:**
- Modify: `components/auth/login-form.tsx` (full rewrite)
- Modify: `app/login/page.tsx`

**Interfaces:**
- Consumes: `signInWithPasswordAction`, `sendMagicLinkAction` (Tasks 1-2)
- Produces: `LoginForm` accepting `{ next: string; error: string | null; magicLinkSent: boolean }`

- [ ] **Step 1: Replace `components/auth/login-form.tsx` entirely**

```tsx
import Link from "next/link";

import { sendMagicLinkAction, signInWithPasswordAction } from "@/lib/auth/actions";

const INPUT_CLASS =
  "h-[46px] w-full rounded-[11px] border border-border-2 bg-surface-2 px-[15px] text-[15px] text-text placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/*
 * A Server Component on purpose. It carries no "use client", no state, and no
 * Supabase SDK, so it works with no client JavaScript at all — which is the
 * entire point. Next's docs guarantee progressive enhancement for forms
 * calling Server Actions from Server Components
 * (node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md).
 *
 * Errors arrive as a query flag rather than component state. The documented
 * way to render action state inline requires a Client Component with
 * useActionState — exactly the shape whose no-JS behaviour is not guaranteed.
 * The cost is retyping the email after a failed sign-in; that is deliberate.
 *
 * Only `email` is `required`. Marking the password required too would block
 * the magic-link button, which submits the same form and needs no password.
 * An empty password simply fails authentication and takes the normal error
 * path, so nothing is lost.
 */
export default function LoginForm({
  next,
  error,
  magicLinkSent,
}: {
  next: string;
  error: string | null;
  magicLinkSent: boolean;
}) {
  return (
    <div className="w-full max-w-[380px] rounded-[20px] border border-border bg-surface p-8 shadow-lg animate-[pbPop_0.25s_ease_both] motion-reduce:animate-none">
      <div className="mb-[18px] grid h-[46px] w-[46px] place-items-center rounded-[12px] bg-accent font-mono text-[17px] font-semibold text-white">
        PB
      </div>
      <h1 className="m-0 mb-1.5 font-heading text-[22px] font-semibold tracking-[-0.02em]">
        Private dashboard
      </h1>

      {magicLinkSent ? (
        <>
          <p className="m-0 mb-5 text-[13px] text-muted" role="status">
            Check your email for a sign-in link.
          </p>
          <Link
            href="/"
            className="flex h-10 items-center justify-center rounded-[11px] text-[13px] text-muted hover:text-text"
          >
            ← Back to site
          </Link>
        </>
      ) : (
        <>
          <p className="m-0 mb-5 text-[13px] text-muted">Sign in to continue.</p>

          <form action={signInWithPasswordAction} className="flex flex-col gap-[11px]">
            <input type="hidden" name="next" value={next} />

            <label htmlFor="login-email" className="sr-only">
              Email
            </label>
            <input
              id="login-email"
              name="email"
              type="email"
              required
              autoComplete="username"
              placeholder="Email"
              className={INPUT_CLASS}
            />

            <label htmlFor="login-password" className="sr-only">
              Password
            </label>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              className={INPUT_CLASS}
            />

            {error ? (
              <p
                role="alert"
                className="m-0 rounded-[11px] border border-border-2 bg-surface-2 px-[15px] py-3 text-[13px] font-medium text-text"
              >
                {error}
              </p>
            ) : null}

            {/* Default action signs in, so pressing Enter does the expected thing. */}
            <button
              type="submit"
              className="mt-1 h-12 cursor-pointer rounded-[12px] bg-accent text-[15px] font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Sign in →
            </button>

            <button
              type="submit"
              formAction={sendMagicLinkAction}
              className="h-10 cursor-pointer rounded-[11px] bg-transparent text-[13px] text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Email me a magic link
            </button>

            <Link
              href="/"
              className="flex h-10 items-center justify-center rounded-[11px] text-[13px] text-muted hover:text-text"
            >
              ← Back to site
            </Link>
          </form>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update `app/login/page.tsx`**

Replace the `LINK_ERROR_MESSAGE` constant block and the component body's error handling. The full file becomes:

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import LoginForm from "@/components/auth/login-form";
import { normalizeNextPath } from "@/lib/auth/redirects";
import { getUserContext } from "@/lib/auth/user-context";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

// Two error channels, each generic within its class. Neither ever varies by
// whether the address has an account.
const LINK_ERROR_MESSAGE = "That sign-in link is no longer valid. Please sign in again.";
const CREDENTIALS_ERROR = "Invalid email or password.";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const next = normalizeNextPath(firstValue(params.next), "/dashboard");

  const hasCredentialError = firstValue(params.error) !== null;
  const hasLinkError = firstValue(params.auth_error) !== null;
  const magicLinkSent = firstValue(params.sent) !== null;

  const { user, isAdmin } = await getUserContext();

  if (user) {
    redirect(isAdmin ? next : "/");
  }

  const error = hasCredentialError
    ? CREDENTIALS_ERROR
    : hasLinkError
      ? LINK_ERROR_MESSAGE
      : null;

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-16">
      <LoginForm next={next} error={error} magicLinkSent={magicLinkSent} />
    </main>
  );
}
```

- [ ] **Step 3: Run all gates**

```bash
npm run lint; echo "lint=$?"
npx tsc --noEmit; echo "tsc=$?"
npm test; echo "test=$?"
npm run build; echo "build=$?"
```
Expected: all `=0`.

- [ ] **Step 4: Verify the rendered HTML has no client dependency on the form**

```bash
npx next start -p 3210 > /tmp/s.log 2>&1 &
for i in $(seq 1 40); do grep -q "Ready" /tmp/s.log && break; sleep 1; done
grep -i "ready\|local:" /tmp/s.log | head -2
curl -s http://localhost:3210/login | grep -o 'name="email"\|name="password"\|name="next"\|<form' | sort | uniq -c
kill %1
```
Expected: `<form` present, and all three named fields present.

- [ ] **Step 5: Commit**

```bash
git add components/auth/login-form.tsx app/login/page.tsx
git commit -m "feat(auth): render the login form server-side with Server Actions"
```

---

### Task 4: Delete the browser Supabase client

**Files:**
- Delete: `lib/supabase/browser.ts`
- Modify: `lib/env.ts` (comment only)

- [ ] **Step 1: Confirm nothing imports it**

```bash
grep -rn "createBrowserSupabaseClient\|supabase/browser" --include="*.ts" --include="*.tsx" app lib components
```
Expected: no output. If anything matches, stop — Task 3 is incomplete.

- [ ] **Step 2: Delete the file**

```bash
git rm lib/supabase/browser.ts
```

- [ ] **Step 3: Update the `getSupabasePublicEnv` doc comment in `lib/env.ts`**

Replace the sentence "which threw inside `createBrowserSupabaseClient()` and surfaced as a generic 'Something went wrong' on the login form." with:

```
 * which is undefined in the browser. No client code reads these any more —
 * the browser Supabase client was removed — but the rule still applies to any
 * future client use, so the static form is kept.
```

- [ ] **Step 4: Rebuild and prove the anon key stopped shipping**

```bash
rm -rf .next/static
npm run build; echo "build=$?"
grep -rl "ncurnrvnfjqvzxivqnad" .next/static/chunks/ | wc -l
```
Expected: `build=0`, and the count is **0**. It was 1 before this change. A non-zero count means something client-side still references the Supabase env.

- [ ] **Step 5: Run remaining gates**

```bash
npm run lint; echo "lint=$?"
npx tsc --noEmit; echo "tsc=$?"
npm test; echo "test=$?"
```
Expected: all `=0`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(auth): remove the browser Supabase client"
```

---

### Task 5: Owner acceptance — REQUIRES THE SITE OWNER

**This task cannot be completed by an implementer.** It is the merge gate. Do not merge to `main` until every box is ticked by the owner.

The deliverable of this task is a filled-in result for each row, not code.

- [ ] **Step 1: With JavaScript ENABLED**

| Check | Expected |
|---|---|
| Correct credentials | lands on `/dashboard` |
| Wrong password | back at `/login`, "Invalid email or password." |
| Unknown address | **identical** to wrong password |
| Magic link, known address | "Check your email", email arrives |
| Magic link, unknown address | **identical** confirmation, no email |
| Magic link, click the emailed link | lands signed in on `next` |

The last row is the actual completion of the magic-link sign-in — the PKCE code verifier this exchange needs is now written by the server client (not the browser client), so this row is what exercises that handoff. It must pass here **and** again under Step 2 with JavaScript disabled; do not consider magic link accepted until both runs land signed in.

- [ ] **Step 2: With JavaScript DISABLED — the acceptance criterion**

Disable JS in the browser (DevTools → Settings → Debugger → Disable JavaScript, or `about:config` in Firefox), then repeat every row above. All must behave identically.

If any row fails here, the change has failed regardless of gates.

- [ ] **Step 3: Second device, no existing session**

Sign in on a device that was not already signed in. This is the lockout check — the prior session masking a broken flow is the exact failure this catches.

- [ ] **Step 4: Confirm no credentials in any URL**

After a failed sign-in, inspect the address bar. Expected: `/login?error=1&next=%2Fdashboard`. There must be no `email` or `password` parameter under any circumstance.

- [ ] **Step 5: Merge**

Only after Steps 1-4 pass:

```bash
git checkout main
git merge --ff-only feat/server-side-auth
git push origin main
```

If the merge is not a fast-forward, `main` moved underneath the branch — rebase and re-run Steps 1-4 rather than forcing it. The verification above is only meaningful against the exact code being merged.

---

## Notes for the implementer

**`lib/supabase/middleware.ts` and `app/auth/confirm/route.ts` are out of scope.** Both already run server-side. `confirm/route.ts` uses `getRequestOrigin` for its own redirect, which is a different concern from the emailed link target and is not changed here.

**The `f383003` mitigations disappear naturally.** `method="post"` and the hydration-gated `disabled` state existed because a native submit was a failure mode. With a Server Action it becomes the intended mechanism, so Task 3's rewrite drops them. That is correct, not an oversight — do not carry them forward.

**If `useSyncExternalStore` or `useState` appears anywhere in the new `login-form.tsx`, something has gone wrong.** The file should have no React hooks at all.
