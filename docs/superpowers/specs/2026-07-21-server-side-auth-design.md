# Server-side authentication — design

**Date:** 2026-07-21
**Status:** Approved for planning; not yet scheduled
**Supersedes:** the client-side auth path shipped in Phase 3a

## Problem

Sign-in is the only place in the application where the browser reaches past our own API layer and talks to a vendor SDK directly. Every dashboard section calls `/api/*`; only `components/auth/login-form.tsx` imports `createBrowserSupabaseClient`.

That makes login the one page whose failure is *total* rather than degraded. If the client bundle does not execute, no other page loses more than interactivity — but login becomes impossible. On 2026-07-21 this happened in production: a corporate web filter blocked the JS chunks, the form fell back to a native GET submit, and credentials were serialised into the query string. Commit `f383003` contained that (`method="post"`, controls disabled until hydration), but the underlying fragility is untouched.

The set of causes is much larger than corporate filters: script blockers, a single dropped chunk on a poor connection, an extension throwing before hydration, an older browser failing to parse the bundle, a CDN edge failing for one asset. All produce the same outcome.

## Goals

1. Sign-in works with **no client JavaScript at all**.
2. Credentials can never reach a URL, by construction rather than by convention.
3. `lib/supabase/browser.ts` is deleted; no Supabase SDK ships to the browser.
4. Enumeration safety is preserved exactly as it is today.
5. Auth becomes a single server-side module, replaceable without touching client code.

## Non-goals

- **Making the dashboard usable without JS.** Sections would remain read-only and pinned to the Work workspace. That is a separate question, deliberately out of scope.
- Adding rate limiting or auth analytics. Both become *possible* after this change; neither is part of it.
- Renaming `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Unnecessary — Next inlines public vars only where client code references them, so deleting `browser.ts` stops it shipping regardless of name. Renaming would add a Vercel env-coordination step for no benefit.
- Migrating off Supabase. This change makes that easier; it does not begin it.

## Architecture

**Server Actions, not route handlers.** Two reasons, both decisive:

- Server Actions have **CSRF origin-checking built in**. A bare route handler that establishes a session is a textbook CSRF target, and we would have to implement `Origin`/`Referer` validation ourselves. This is a new security property we would be taking on; the framework already solves it.
- The installed docs state plainly: *"Server Components support progressive enhancement by default, meaning forms that call Server Actions will be submitted even if JavaScript hasn't loaded yet or is disabled"* (`01-app/01-getting-started/07-mutating-data.md:131`).

**The login form becomes a Server Component.** It currently carries `"use client"` solely to run the Supabase SDK and manage form state. Neither survives.

### The error-display decision

The docs create a genuine tension. Progressive enhancement is guaranteed for **Server** Components, but the documented way to display validation errors is to *"turn the component that defines the `<form>` into a Client Component and use `useActionState`"* (`02-guides/forms.md:192`) — exactly the shape whose no-JS behaviour is not guaranteed.

**Decision: Server Component, errors via redirect.** On failure the action redirects to `/login?error=1` — a generic flag carrying no credentials and no account information.

To be unambiguous about the two error channels, since they must not be conflated:

| Param | Set by | Message |
|---|---|---|
| `auth_error` | a failed magic-link landing at `/auth/confirm` | existing `LINK_ERROR_MESSAGE` |
| `error=1` | **new** — any failed credential sign-in | existing `CREDENTIALS_ERROR` |

Each is generic *within its class*, which is what enumeration safety requires. Neither ever varies by whether the address has an account.

**Cost, stated plainly:** the email must be retyped after a failed sign-in. That is a real UX regression, accepted because the whole purpose is a login page that works when client JS does not, and choosing the pattern whose no-JS behaviour is documented rather than assumed is worth more than saving a retype on the unhappy path.

A client-enhanced variant using `useActionState` could be layered on later, but only after its no-JS behaviour is verified empirically rather than inferred.

## Components

| File | Change |
|---|---|
| `lib/auth/actions.ts` | **New.** `signInWithPassword` and `sendMagicLink` server actions. |
| `components/auth/login-form.tsx` | Drops `"use client"`, all `useState`, the hydration guard, and both SDK calls. Becomes a plain form with two submit buttons. |
| `app/login/page.tsx` | Reads `?error=1` alongside the existing `auth_error`. |
| `lib/supabase/browser.ts` | **Deleted.** |
| `lib/env.ts` | `getSupabasePublicEnv` becomes server-only. Keep the static-reference comment — the trap it documents still applies to any future client use. |

Two actions on one form via `formAction` on each submit button. This works natively without JS: the browser posts to whichever button was used.

## Data flow

```
form POST (native or enhanced)
  → server action
    → createServerSupabaseClient()          [already exists, already writes cookies]
      → supabase.auth.signInWithPassword()
    → success: redirect(next)                [cookie already set; no race]
    → failure: redirect(/login?error=1)      [generic; no credentials, no account info]
```

This removes the documented race in the current implementation:

```js
// push() then refresh(): the server components on the destination have
// to re-read the session cookie the sign-in just wrote.
```

A server-set cookie followed by a server redirect means the browser's next request carries it by construction.

## Security decisions

**`emailRedirectTo` is pinned to `NEXT_PUBLIC_SITE_URL`.** It currently derives from `window.location.origin`, which has no server equivalent that is safe to trust — deriving it from the `Host` header is how magic-link poisoning happens. Configured value only; never request headers.

**Enumeration safety is unchanged and must be re-verified, not assumed.** One generic message for every credential failure. The magic-link path confirms "check your email" for every outcome, including unknown addresses. In the new shape the redirect target is the leak channel: **every failure must redirect identically.** A distinct code or path for "no such user" would reintroduce exactly what the current design avoids.

**CSRF** is handled by Server Actions' built-in origin checking. Do not bypass it.

**The `f383003` mitigations are superseded and should be removed.** `method="post"` and the hydration guard exist because a native submit was a *failure* mode. It becomes the intended mechanism, so the defensive code is dead weight — and dead defensive code invites someone to "restore" the pattern it was guarding against.

## Testing

Unit-testable: `normalizeNextPath` behaviour under the new flow, and the redirect-target uniformity across failure types (the enumeration-safety property).

Not unit-testable and therefore explicit manual gates:

1. Sign in with correct credentials → lands on `next`
2. Sign in with wrong password → `/login?error=1`, generic message
3. Sign in with an unknown address → **identical** response to (2)
4. Magic link for a known address → email arrives
5. Magic link for an unknown address → identical confirmation, no email
6. **All of the above with JavaScript disabled in the browser**

(6) is the acceptance criterion for the whole change. If it does not pass, the change has failed regardless of everything else.

## Verification criteria

**Objective, measurable:**

- `grep -rl "ncurnrvnfjqvzxivqnad" .next/static/chunks/ | wc -l` returns **0**. It returns 1 today. This proves the SDK and the anon key stopped shipping to browsers. (The project ref is not a secret — it is already in the committed `.mcp.json` and in every public Supabase URL.)
- `lib/supabase/browser.ts` does not exist.
- No file under `components/` or `app/` imports `@supabase/ssr`'s browser client.
- Gates: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build` — **exit codes read directly**, not through a pipe.

## Rollout and rollback

Auth is the one change that can lock the owner out of their own site. Therefore:

- Merge only after the owner has personally signed in through the new path on **more than one device**, including at least one where the previous session was not already active.
- Supabase Studio remains an out-of-band way back in; the admin user can always be repaired there.
- Rollback is `git revert` and redeploy. There is no feature flag, and adding one is not worth the complexity for a single-admin site.

## Risks

| Risk | Mitigation |
|---|---|
| Lockout | Multi-device verification before merge; Studio as out-of-band recovery |
| Enumeration leak via differing redirect targets | Explicit test that all failure modes redirect identically |
| Host-header trust in magic link | Pinned to configured `NEXT_PUBLIC_SITE_URL` |
| `useActionState` assumed to degrade | Avoided entirely — Server Component + redirect |
| Email retype on failure | Accepted, documented above |

## What this does not solve

The dashboard still requires client JS to be interactive. On a network that blocks the bundle, a signed-in user gets a read-only Work workspace. Whether that is worth addressing is a separate decision, and should not be bundled into this change.
