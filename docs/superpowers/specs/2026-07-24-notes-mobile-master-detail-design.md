# Notes: mobile master–detail view

**Date:** 2026-07-24
**Status:** Approved (design), pending implementation plan
**Scope:** `components/dashboard/notes/notes-view.tsx` only. No API, data-model, or desktop change.

## Problem

On the dashboard Notes section the list pane and editor pane form a two-pane
master–detail grid (`notes-view.tsx:558`). On desktop the panes sit side by side.
At ≤560px the grid collapses to a single column, so the panes **stack**: the whole
note list first, then the editor *below every row*. With several notes, opening or
creating one drops the user into an editor pushed far down the page — a long scroll
to reach the note they just chose. Focusing the title on create (`focusTitleRef`,
`notes-view.tsx:112,214`) does not reliably bring the editor into view on a phone.

Root cause: on a narrow screen, showing the full list and the editor at once means
the editor is never where the user's thumb is.

## Relationship to the behavioural spec

`design/patrick-beasley.dc.html:303-354` defines the list+editor grid via dynamic
columns (`notesCols`) and the editor header as title + category + delete
(lines 332-337) with **no back control** and no mobile master–detail treatment — it
simply stacks. This design is a deliberate *extension* of the spec for narrow
screens, not a behaviour the spec already prescribes. Desktop behaviour is unchanged
and continues to match the spec.

## Design

At ≤560px the Notes card shows **one pane at a time**, chosen by whether a note is
active. Desktop (≥561px) is unaffected — both panes remain side by side and the
back bar never appears.

- **No active note → list view.** Section header (`Notes · count · + New note`),
  search/filter/sort, and the rows. Identical to today's list.
- **Active note → editor view.** A compact **back bar** replaces the section header:
  `← Notes` on the left, save status on the right. Below it, the existing
  title/category/delete row, formatting toolbar, and body. The list is hidden, so
  the editor sits at the top of the card — no rows to scroll past.

Transitions between views are driven entirely by the existing `selectedId` state:

- `+ New note` and tapping a row set `selectedId` → editor view (unchanged handlers).
- The back button and deleting the active note clear `selectedId` → list view.

### Which pane shows — mechanism

A `data-pane` attribute on the card's `<section>`, valued `"editor"` when a note is
active and `"list"` otherwise, derived each render from `activeNote`
(`notes-view.tsx:159`). CSS media queries consume it: at ≤560px `data-pane` toggles
which pane is visible and whether the section header or the back bar is shown; at
≥561px the attribute is ignored and both panes render as today.

Chosen over a JS `matchMedia`/`isMobile` approach because it needs no new state, no
effect, and no client/server branch — so there is no hydration flash, and it composes
with the project's "derive from props each render" rule (AGENTS.md, Pages). `activeNote`
already exists; nothing new is introduced to state.

### Back control

New mobile-only button, `aria-label="Back to notes list"`. On activate it calls
`flushPending()` (so the outgoing edit is saved, matching `handleOpenNote`,
`notes-view.tsx:449`) then `setSelectedId(null)`. The save status indicator
(`saveLabel`, `notes-view.tsx:532`) moves into the back bar so it stays visible in
editor view. The back button sits apart from the destructive delete button (which
stays in the title row) so leaving a note is never a mis-tap.

### Deliberately excluded

- **No `position: fixed` full-screen overlay.** "Takes over the screen" means the
  editor becomes the card's sole content, not a viewport overlay — a real overlay
  would fight the fixed mobile tab bar.
- **No transform/slide transition.** AGENTS.md's transform gotcha (a transformed
  ancestor re-anchors the fixed mobile drawer + tab bar) makes a slide-in a known
  trap here. The swap is an instant show/hide, at most a bare opacity fade guarded by
  `prefers-reduced-motion`.

## Breakpoint

Reuses the section's existing ≤560px / ≥561px boundary
(`max-[560px]` / `min-[561px]`, `notes-view.tsx:558`). No new breakpoint.

## Accessibility

- Back button is a real `<button>` with an explicit `aria-label`.
- Save status keeps its `role="status" aria-live="polite"` when relocated to the
  back bar.
- New-note title focus (`focusTitleRef`) is retained; opening an existing note on
  mobile should leave focus reachable in the now-visible editor.

## Out of scope

API routes, the data model, workspace scoping, desktop layout, and the formatting
toolbar behaviour. This is a presentation change to one client component.

## Verification

Per AGENTS.md: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`, each
checked by its own exit code. The touch behaviour (that the editor is immediately
visible on open/create, and back returns to the list) **needs a real phone** —
synthetic events cannot validate it — so it is a deferred manual check, recorded, not
skipped.
