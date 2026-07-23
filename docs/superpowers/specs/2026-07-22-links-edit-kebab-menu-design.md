# Links: edit + kebab row menu

**Date:** 2026-07-22
**Status:** Approved, ready for planning
**Scope:** Front-end only. No API, migration, or DB change.

## Problem

On the Links page (`components/dashboard/links/links-view.tsx`) each row exposes
two trailing icon buttons — Pin and Trash. There is no way to edit an existing
link (fix a typo in the title, correct a URL, move it to another category); the
only recourse is delete-and-re-add. The two always-visible buttons also crowd
the row.

## Goal

1. Add the ability to **edit** an existing link's title, URL, and category.
2. **Fold** the existing Pin and Delete actions, plus the new Edit action, into a
   single per-row **kebab (`⋮`) menu**.

## Non-goals (YAGNI)

- Editing `description` — the Add form does not expose it, so Edit will not either.
- Moving a link between workspaces (`ctx`) from the edit UI.
- A delete confirmation step — delete stays immediate (user decision).
- Any change to the reorder / drag, pin-band, grouping, or filter behavior.

## Backend: already supported

`PATCH /api/links/[id]` (`app/api/links/[id]/route.ts:33`) already validates and
persists `title`, `url`, `category_id` (and `pinned`, `description`, `ctx`) as
optional partial updates, with the same normalization rules as POST. **No route
change is required.** Edit and Pin both go through this one endpoint.

## Design

### 1. New icons

Add two icons to `components/dashboard/icons.tsx`, in the existing verbatim-SVG
style (decorative, `aria-hidden`, `currentColor` stroke, `size` prop):

- `EllipsisIcon` — three vertical dots, the kebab trigger glyph.
- `EditIcon` — a pencil, the Edit menu-item glyph.

### 2. `LinkRowMenu` — new focused component (same file)

The current two trailing `<button>`s in `LinkRow` are replaced by a single kebab
trigger that opens a dropdown. Factored into its own small component so `LinkRow`
stays readable — consistent with the file's existing habit of focused units.

**Trigger**: a `⋮` button where the Pin/Trash buttons are today. Reuses the same
`30px` bordered icon-button styling. Carries `aria-haspopup="menu"`,
`aria-expanded`, and an `aria-label` ("Actions for {title}"). Disabled when the
row is optimistic (in-flight POST — no server id yet), mirroring the current
`disabled={optimistic}` guard.

**Menu items** (in order):
- **Edit** (`EditIcon`) → calls `onEdit(link)`.
- **Pin** / **Unpin** (`PinIcon`, label toggles on `link.pinned`) → calls
  `onTogglePin(link)`.
- **Delete** (`TrashIcon`, destructive red text) → calls `onDelete(link)`
  immediately. No confirm.

**Dismissal & a11y**:
- Click-outside closes (pointerdown listener on `document`, ignoring the menu
  root).
- `Escape` closes and returns focus to the trigger.
- Selecting any item closes the menu, then runs the action.
- Menu container uses `role="menu"`; items use `role="menuitem"`, are real
  `<button>`s, and are reachable by Tab/Shift-Tab while open.
- Menu is absolutely positioned relative to the row's trailing cell, right-aligned
  under the trigger. It must not be clipped by the list's `overflow-auto`
  container; if clipping is observed, the anchor cell gets the positioning context
  and the menu renders above/below as space allows. (Verify in-browser.)

### 3. Edit via the existing top form (dual-mode)

The Add-link form region (`links-view.tsx:615-678`) becomes dual-mode rather than
gaining a second form.

**New state** in `LinksView`:
- `editingId: string | null` — the link currently being edited, or `null`.

**Mode derivation**: the form is in *edit* mode when `editingId !== null`, else
*add* mode. A helper resolves the link being edited from `links` by id; if that
id is no longer present (deleted elsewhere), edit mode falls back to closed —
derived, not synced via effect, matching the file's "derive from props each
render" rule.

**Entering edit**: `onEdit(link)` sets `editingId`, seeds `draftTitle`,
`draftUrl`, `draftCategoryId` from the link, opens the form region, and closes any
in-progress add (`formOpen`/add draft and edit are mutually exclusive — one form,
one mode).

**Form presentation in edit mode**:
- The panel header button / form still lives in the same place. In edit mode the
  submit button reads **Save**; a **Cancel** control clears `editingId` and resets
  the drafts. (Add mode is unchanged.)
- The category `+ New category…` sentinel path continues to work in both modes.

**Submit** (`handleSubmit` branches on `editingId`):
- *Add* mode: unchanged — the current `handleAdd` POST + optimistic-insert path.
- *Edit* mode: optimistic PATCH, following the **exact rollback shape of
  `handleTogglePin` (`links-view.tsx:511`)**:
  1. Capture the current link (for rollback).
  2. Apply `{ title, url, category_id }` (URL normalized the same way `handleAdd`
     does before display) to the row in local state; close the form; clear
     `editingId`.
  3. `PATCH /api/links/{id}` with the three fields.
  4. On success, replace the row with the server entity from the 200 response
     (authoritative `url`/`updated_at`); toast "Link updated".
  5. On failure, restore the captured link, re-open the form in edit mode with the
     typed values preserved (mirroring `handleAdd`'s draft-giveback), and toast the
     API message via `readApiError`.

**Guards**: empty title/URL or no category → no-op submit (same as `handleAdd`).
Editing is blocked for optimistic rows because the kebab is disabled there.

### 4. Wiring

`LinkRow` gains an `onEdit` prop and renders `LinkRowMenu` in place of the two
buttons. Both call sites (the pinned band at `links-view.tsx:797` and the grouped
list at `:820`) pass `onEdit={handleEditStart}` alongside the existing
`onTogglePin` / `onDelete`.

## Data flow

```
kebab ⋮  ──Edit──▶  handleEditStart(link)
                      → editingId=link.id, seed drafts, open form
   top form (edit mode) ──Save──▶ handleSubmit
                      → optimistic patch → PATCH /api/links/[id]
                      → success: replace row w/ server entity + toast
                      → failure: rollback + reopen form + toast
kebab ⋮  ──Pin/Unpin──▶ handleTogglePin(link)   (unchanged)
kebab ⋮  ──Delete────▶  handleDelete(link)       (unchanged, immediate)
```

## Error handling

- Reuses `readApiError` for all failure messages.
- Every optimistic mutation has a captured-value rollback closure, the established
  pattern in this file (`handleAdd`, `handleDelete`, `handleTogglePin`).
- Malformed / stale id → the PATCH route already answers 404; the rollback path
  surfaces it as a toast.

## Testing / verification

Gate every change on, checking exit codes directly (per AGENTS.md):
- `npm run lint`
- `npx tsc --noEmit`
- `npm test`
- `npm run build`

**Test harness reality**: the project has no jsdom / React Testing Library setup —
`vitest.config.ts` runs node-only, and every existing test (`lib/**/*.test.ts`) is
a pure-logic unit. So component internals are not directly testable, and this
change adds no jsdom harness (out of scope).

Therefore:
- Any logic worth asserting is **extracted as a pure helper into
  `lib/dashboard/`** and unit-tested there, mirroring `link-order.test.ts`. The
  clear candidate is edit-target resolution:
  `resolveEditingLink(links, editingId) → LinkItem | null`. The Pin/Unpin label is
  a trivial ternary and does not warrant extraction.
- Menu dismissal (click-outside, Escape, focus return), overflow anchoring, and the
  optimistic-edit round trip are real-DOM / live behaviors — confirm in a browser
  against the running app. If a live check is not possible in this session, record
  it as **deferred, not skipped** (per AGENTS.md); never assert it from synthetic
  events.

## Files touched

- `components/dashboard/icons.tsx` — add `EllipsisIcon`, `EditIcon`.
- `components/dashboard/links/links-view.tsx` — add `LinkRowMenu`, dual-mode form,
  `editingId` state, `handleEditStart` + edit branch in submit, rewire `LinkRow`.
- `lib/dashboard/` — a small pure `resolveEditingLink` helper (imported by the
  view) plus its `*.test.ts`, mirroring `lib/dashboard/link-order.test.ts`.
