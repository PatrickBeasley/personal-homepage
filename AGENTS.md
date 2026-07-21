<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

The repo runs **Next.js 16** and **Tailwind CSS v4**. Both differ from what you likely remember. Route handler signatures, `params`, and CSS layering are the usual places this bites.

## Architecture

Public one-pager at `/`, private dashboard at `/dashboard`. Supabase provides Postgres, auth and storage. See `README.md` for the data model and auth design.

**`design/patrick-beasley.dc.html` is the behavioural spec.** Cite its line numbers; do not paraphrase it from memory.

## Binding conventions

`components/dashboard/links/` and `app/api/links/` are the reference implementation. Mirror them rather than inventing a new shape.

**Wire format.** Failures are `{ error: "MACHINE_CODE", message: "human text" }` via `apiError()`. Successes return the bare entity for create (201) and update (200), `{ ok: true }` for delete, and one named collection key for lists (`{ links }`, `{ notes }`).

**Handlers.** `requireAdminAuth(request)` is the *first* statement of every route handler — before `params` is awaited and before the body is read. Params are `{ params: Promise<{ id: string }> }`, then `const { id } = await params`. Guard `[id]` with `isUuid` so a malformed id is a 404, not a Postgres `22P02` surfacing as a 500.

**Pages.** Server page fetches, then hands plain arrays to a `"use client"` view. No data-fetching library. No `useEffect` state synchronisation — derive from props each render. Optimistic updates use plain `useState` plus a rollback closure.

**Workspace scoping.** Links and Notes filter by the active workspace. **Documents and Settings do not.** This is the single most common mistake here: an agent pattern-matching on Links adds `useWorkspace()` filtering and silently builds the wrong thing.

## Gotchas that have already cost time

**`NEXT_PUBLIC_*` must be read statically.** Next inlines them into the client bundle by literal text replacement. `process.env[name]` is never inlined and is `undefined` in the browser — while working perfectly on the server, so API routes keep returning correct responses and mislead you. Write `process.env.NEXT_PUBLIC_FOO` literally.

**Tailwind v4 utilities beat `@layer base`** regardless of specificity. A `text-*` utility overrides a base `a:hover` rule.

**Tailwind v4 `translate-*` sets the CSS `translate` property, not `transform`.** Transitions must name `translate` or nothing animates.

**`animation-fill-mode: both` leaves a transform applied forever**, and a transformed ancestor becomes the containing block for every `position: fixed` descendant. This silently re-anchored the mobile drawer and tab bar to the document instead of the viewport, and only showed up on pages taller than the viewport. Keep entry animations off any element that wraps fixed-position children.

**The dev CSP needs `'unsafe-eval'`; production must not have it.** React uses `eval()` in development. `next.config.ts` gates it on `NODE_ENV`.

**Never revoke `EXECUTE` on `public.is_admin()`.** RLS policy expressions run in the *querying* role's security context, so revoking breaks every admin query. The `PUBLIC` grant also hides behind a bare `=X` in `proacl`, so a `has_function_privilege` check filtered over `pg_roles` will not see it.

**Storage objects need their own policy.** RLS on `storage.objects` is separate from the `files_metadata` table. `createSignedUrl()` requires `select`, so an insert/delete-only policy breaks downloads.

**Browser-reported MIME is unreliable.** Windows registers no content type for `.sql` or `.md`, so Chrome sends `application/octet-stream` and a MIME allowlist rejects files whose extension is explicitly permitted.

## Verification

Gate every change on `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`.

**Check exit codes directly.** `npx tsc --noEmit | tail -2 && echo OK` tests `tail`'s exit code, not tsc's, and will report a false green. This has happened.

**A server that answers is not necessarily your server.** Confirm a port is free and that the ready line came from your own process before trusting a probe — a stale process on the same port has produced misleading passes twice.

**Synthetic events cannot validate touch gestures.** A swipe handler passed twelve synthetic-pointer-event cases and did nothing on a real phone, because synthetic events bypass the browser's gesture arbitration — the exact mechanism that broke it. Touch behaviour needs real hardware.

**Prefer proving a claim to asserting it.** Query the database rather than trusting a 200; fetch the signed URL rather than trusting its shape; read the value that was *stored*, not the one that was returned. Several confidently-stated claims in this project's history were wrong, and one check each would have caught them.

Anything needing a live session or real data is **deferred, not skipped** — record it. Mock data or a fallback path that makes something look done is worse than a truthful deferral.
