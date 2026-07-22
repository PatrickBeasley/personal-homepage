# Dashboard performance, Notes fixes, and Links ordering — design

**Date:** 2026-07-22
**Status:** approved, pending implementation plan

Three bug fixes and four Links features. The pieces are independent apart from the
two Links ordering features, which interlock and are specified together.

---

## 1. Performance: authenticated page loads

### Diagnosis

Measured against production (`www.patrickbeasley.com`) on 2026-07-22.

The initial hypothesis — that `proxy.ts` running `auth.getUser()` on every request
was the cost — was **half wrong, and the measurement said so**:

| Path | TTFB (3 samples) |
| --- | --- |
| `/` (through proxy) | 139 / 154 / 152 ms |
| `/favicon.ico` (matcher excludes it) | 119 / 103 / 122 ms |
| `/login` (through proxy) | 170 / 157 / 182 ms |

Only ~30–50 ms of proxy overhead. The reason: an **anonymous** request carries no
auth cookie, so `getUser()` returns immediately without contacting Supabase. There
is no session to verify. The landing page is also already `X-Nextjs-Prerender: 1`
and `X-Vercel-Cache: HIT` at 5.8 KB — it is served optimally for anonymous
visitors and is not the problem.

The cost is real **only for authenticated requests**, which is every request the
site owner makes. For a signed-in user each page load runs two sequential network
`getUser()` calls before any data query begins:

1. `lib/supabase/middleware.ts:32` — via `proxy.ts`, on every matched request
2. `lib/auth/user-context.ts:16` — via `app/dashboard/layout.tsx:20`

Supabase auth endpoint latency measured at 125–260 ms per call. These are
sequential (middleware, then layout, then page), so ~250–500 ms of pure auth
overhead precedes every navigation. This explains why *all* the reported surfaces
feel slow — dashboard pages, section navigation, login, and the landing page —
since the proxy matcher covers all of them.

### The unlock

The project's JWKS endpoint returns an **ES256 / `kty: EC`** key:

```
GET https://<project>.supabase.co/auth/v1/.well-known/jwks.json
{"keys":[{"alg":"ES256","kty":"EC","use":"sig",...}]}
```

Asymmetric signing keys are enabled, so `supabase.auth.getClaims()` verifies the
JWT **locally against a cached public key with no network call**. This is a
cryptographic signature verification, not a bare decode — it is not a weakening of
the security posture, which is why it is preferred over `getSession()`.

### Changes

1. **`lib/supabase/middleware.ts`** — replace `getUser()` with `getClaims()`.
2. **`lib/auth/user-context.ts`** — replace `getUser()` with `getClaims()`, deriving
   `email` from the verified claims for `isAdminEmail()`.
3. **`proxy.ts:10`** — narrow the matcher to `/dashboard`, `/login`, `/auth` only.
   The landing page is prerendered and edge-cached and must never enter middleware.
4. **`lib/auth/user-context.ts`** — wrap `getUserContext()` in React `cache()` so the
   layout and any page in the same render pass share one call.

### Verification

Re-measure signed-in TTFB before and after with a real session cookie and record
both numbers. A claimed improvement without a measured pair is not acceptable —
the initial hypothesis in this document was already wrong once.

Anonymous TTFB must not regress; re-run the table above.

---

## 2. Notes toolbar: bullet-list and heading buttons

### Diagnosis

Confirmed by reading, not guessed. Both buttons already work and already persist
correctly:

- `lib/sanitize.ts:28` — `ALLOWED_TAGS` includes `ul`, `li`, and `h3`, so the server
  stores them.
- `document.execCommand("insertUnorderedList")` and `execCommand("formatBlock", "H3")`
  do modify the editor DOM.

The failure is **purely visual**. `app/globals.css` styles nothing inside the
editor, so Tailwind v4's preflight reset applies: `ul` gets
`list-style: none; margin: 0; padding: 0` and `h3` gets
`font-size: inherit; font-weight: inherit`. The result is indistinguishable from a
plain paragraph. Bold and Italic appear to work because `<b>` and `<i>` carry their
own UA styling that preflight leaves alone.

### Change

Add editor-scoped content styles to `app/globals.css`: restore `list-style: disc`
and left padding on `ul`, and font size and weight on `h3`.

**No change to `lib/sanitize.ts`, the toolbar handlers, or `exec()`.** They are
correct.

Per AGENTS.md, Tailwind v4 utilities beat `@layer base` regardless of specificity;
these rules must be scoped to the editor container so a utility class elsewhere does
not silently defeat them.

### Verification

Type a bullet list and a heading, reload the page, and confirm both survive the
round trip and render visibly. The persistence half is expected to already pass.

---

## 3. Notes card sizing on desktop

### Diagnosis

The reporting screenshot was never available. Diagnosed instead against the
behavioural spec, `design/patrick-beasley.dc.html`.

The design's Notes card (line 303) is `display:grid; min-height:360px` with
`grid-template-columns` resolving to `minmax(180px,240px) 1fr` (line 810). Both
panes are `flex:1` with `overflow:auto`. The design sets **no `max-height`
anywhere** in the card.

The implementation added `max-h-[460px]` to the list pane
(`components/dashboard/notes/notes-view.tsx:601`), which has no counterpart in the
design. The editor pane (line 769) is `min-h-[200px] flex-1` and unbounded. So as a
note's body grows, the editor column stretches the card without limit while the list
column hard-stops at 460 px — the two columns desynchronize and leave dead space
beside a card that grows unboundedly tall.

### Change

Bound the **card**, not the pane:

- Replace `min-h-[360px]` on the grid (`notes-view.tsx:544`) with a fixed
  `h-[520px]`, matching the 520 px scroll cap the Links card already uses so the two
  cards agree on desktop.
- Drop `max-h-[460px]` from the list pane (`notes-view.tsx:601`).
- Give both columns `min-h-0` with `overflow: auto` so they scroll independently
  inside a stable container — which is what the design's `flex:1` + `overflow:auto`
  intends.

`min-h-0` is load-bearing: a grid child defaults to `min-height: auto` and will
refuse to shrink below its content, which would reintroduce the unbounded growth
this change exists to remove.

### Verification

**This one is a hypothesis, not a confirmed root cause**, because the visual report
was never seen. Confirm against the running app at desktop width before and after,
with both a short note and a long one. If the observed symptom is something else,
revisit rather than shipping this change on its own reasoning.

---

## 4. Links: ordering model

The three ordering features interlock. Settled model:

- **`Manual` becomes a fourth sort option and the default.** `sort_order` — which
  exists on `dashboard_links` today but is always `0` and never read — becomes the
  manual order.
- **Pinned links render in a separate band at the top**, above everything else.
- **"Group by category" is a toggle**, not a sort mode. It sections the list; manual
  order applies within each section.
- **Drag handles appear only in Manual mode.** Reordering an A–Z or Recent list
  produces no order that can be meaningfully saved.

### Schema

One migration:

```sql
alter table public.dashboard_links
  add column if not exists pinned boolean not null default false;

-- sort_order is 0 for every existing row, so manual order has no starting state.
-- Backfill from created_at desc within each ctx, matching today's default view,
-- so the first render in Manual mode is identical to what the user sees now.
with ranked as (
  select id,
         row_number() over (partition by ctx order by created_at desc) as position
  from public.dashboard_links
)
update public.dashboard_links as l
set sort_order = ranked.position
from ranked
where l.id = ranked.id;

create index if not exists dashboard_links_ctx_pinned_sort_idx
  on public.dashboard_links (ctx, pinned, sort_order);
```

### API

Follows the `app/api/links/` reference shape and the AGENTS.md wire format.

- **`PATCH /api/links/reorder`** — accepts a batch `[{ id, sort_order }]`, one request
  per drop rather than one per moved row. Returns `{ links }` (a named collection
  key, per the list convention).
- **`PATCH /api/links/[id]`** with `{ pinned }` — returns the bare entity at 200,
  matching the existing update convention. Extends the existing handler.

Both re-verify `requireAdminAuth(request)` as the first statement, guard `[id]` with
`isUuid`, and validate that every id in a reorder batch belongs to the caller's rows
before writing.

### Client

`components/dashboard/links/links-view.tsx`:

- Add `"manual"` to `SortKey`; make it the default.
- Partition into a pinned band and the remainder; section by category when grouping
  is on.
- Optimistic reorder with a rollback closure, matching the existing `handleAdd` and
  `handleDelete` pattern. No data-fetching library, no `useEffect` state sync.

---

## 5. Links: drag and drop

Hand-rolled **Pointer Events**, keeping the repo's zero-UI-dependency house style.
Pointer Events unify mouse, touch, and pen in one code path, which the HTML5
drag-and-drop API cannot do — it does not fire on mobile at all.

- `onPointerDown` captures the pointer and records the source index.
- `onPointerMove` hit-tests rows and renders a drop indicator.
- `onPointerUp` commits and issues the batch PATCH.
- The handle must carry `touch-action: none`, or the browser claims the gesture for
  scrolling before the handler ever sees it.
- **Keyboard fallback**: Space grabs, arrows move, Space drops. Drag alone is
  unusable without a pointer, and every row is already keyboard-reachable.

### Verification

Unit-testable in vitest: the ordering comparator, the reorder index computation, and
the pinned-band partitioning. These are pure functions and should be extracted as
such.

**Touch drag is explicitly deferred to real hardware.** Per AGENTS.md, synthetic
events bypass the browser's gesture arbitration — the exact mechanism that breaks
touch drag — so a passing synthetic test proves nothing. This is recorded as
deferred, not skipped, and must not be claimed as working until exercised on a real
phone.

---

## 6. Links: quick-add category

Reuses `POST /api/categories` **unchanged**. It already validates, rejects
case-insensitive duplicates, and appends `sort_order` correctly.

The only change is client-side: `categories` currently arrives as a static prop from
`app/dashboard/links/page.tsx` and is never mutated, so a newly created category
cannot appear without a page reload. It moves into `useState` in `LinksView`, seeded
from the prop, so a created category can be appended and immediately selected.

Entry point: an option in the category select that opens a small inline input,
rather than a separate route or modal.

---

## Out of scope

- Workspace scoping is unchanged. Links remain workspace-scoped; **Documents and
  Settings remain unscoped**, per AGENTS.md.
- No changes to auth flows, the login form, or `normalizeNextPath`.
- Notes ordering is untouched — manual sort is a Links feature only.

---

## Verification gate

Every change is gated on `npm run lint`, `npx tsc --noEmit`, `npm test`, and
`npm run build`, with exit codes checked directly rather than through a pipe.
