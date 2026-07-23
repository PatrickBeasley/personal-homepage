# Backlog — personal-homepage

Deferred work that is understood but not yet scheduled. Each item is written so a
future session can pick it up cold. Remove an item when it ships (record the
commit in `lessons-learned.md` or a plan if it warranted one).

---

## Tasks page: stream the GSD list instead of blocking navigation

**Date added:** 2026-07-23
**Priority:** Medium (perf / UX)
**Origin:** Diagnosing intermittent page-switch lag. The dashboard-wide part
(dynamic pages, no loading UI) was fixed by adding `app/dashboard/loading.tsx`.
This item is the Tasks-specific remainder.

**Problem.** `app/dashboard/tasks/page.tsx` awaits **two external calls** to
`project-gsd.com` (`getLists()` + `getAllTasks()`, each up to a 10s timeout in
`lib/gsd/client.ts`) *before* the page renders. Navigating to Tasks blocks on
GSD's responsiveness. `loading.tsx` now shows an instant skeleton for the whole
segment, which masks it — but the Tasks content still can't appear until both GSD
round-trips finish, so Tasks stays the slowest section and its skeleton lingers
longest.

**Proposed approach (confirm against Next 16 docs at implementation time — the
App Router streaming API is a flagged breaking-change area in AGENTS.md).**
- Render the Tasks page shell immediately and move the GSD fetch into a child
  Server Component wrapped in its own `<Suspense>` with a list-shaped fallback,
  so navigation completes instantly and only the list area streams in. See
  `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md`
  (Streaming with Suspense) and the `instant-navigation` guide.
- Consider a short server-side cache on the GSD list/tasks response (e.g. a few
  seconds) so back-to-back visits to Tasks don't re-hit the API. Must not cache
  across the key being changed/removed — key it so a `NOT_CONFIGURED` or a
  rotation is reflected promptly. GSD is the source of truth, so keep any cache
  short and refresh-on-demand (the existing refresh button must bypass it).
- Consider trimming the 10s `TIMEOUT_MS` for the *page-load* path so a slow/hung
  GSD caps the skeleton wait sooner (the write paths can keep the longer timeout).
- Optional: evaluate `unstable_instant` (per the Next 16 `loading.js` doc's agent
  hint) for guaranteed-instant navigation — but it is `unstable_`, so treat as a
  separate spike, not a dependency.

**Acceptance (deferred, live — needs the real GSD key):** navigating to Tasks is
visually instant (shell + skeleton), the list streams in a beat later, and a
slow GSD no longer freezes the click. Prove by observing the RSC/navigation
timing in DevTools, not by trusting a green render.

**Files likely touched:** `app/dashboard/tasks/page.tsx` (split shell + suspended
list), a new list Server Component, possibly `lib/gsd/client.ts` (a cached
read + a page-path timeout).
