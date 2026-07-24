# Notes Mobile Master–Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the dashboard Notes section, show the list and editor one pane at a time on phones (≤560px) so opening or creating a note lands directly on the editor instead of below a long scroll.

**Architecture:** Add a pure `resolveNotePane(activeNote)` helper that returns `"editor"` or `"list"`; render its result as a `data-pane` attribute on the Notes `<section>`. An unlayered `@media (max-width: 560px)` block in `app/globals.css` — keyed on `data-pane` plus marker `data-*` attributes on the header, list column, editor column, and a new back bar — toggles which pane is visible. A back button clears the selection. Desktop (≥561px) ignores `data-pane` entirely and is unchanged.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS v4, Vitest 4 (logic tests only — the project has no component/DOM test harness).

## Global Constraints

- **Runtime:** Next.js 16.2.1, React 19.2.4, Tailwind CSS v4. Read the relevant guide in `node_modules/next/dist/docs/` before writing Next-specific code (AGENTS.md).
- **Reference implementation:** `components/dashboard/links/` and `app/api/links/`; mirror existing shapes rather than inventing new ones (AGENTS.md).
- **Logic tests live in `lib/`.** The project tests pure functions only (see `lib/dashboard/*.test.ts`); there is no jsdom or Testing Library. Do **not** add a component-test harness. Presentation/touch behaviour is a deferred manual check on real hardware (AGENTS.md: "Synthetic events cannot validate touch gestures").
- **Tailwind v4 cascade:** unlayered author CSS beats layered utilities; the mobile override block must be unlayered and use `!important` to beat the `flex`/`hidden` utilities on the toggled elements, matching the existing `.pb-pad` block in `app/globals.css:220-225`.
- **No transforms on the pane swap.** A transformed ancestor re-anchors the fixed mobile tab bar/drawer (AGENTS.md). Instant show/hide only.
- **Breakpoint:** reuse the existing ≤560px / ≥561px boundary (`max-[560px]` / `min-[561px]`); introduce no new breakpoint.
- **Verification gate (every task):** `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`, each judged by its **own** exit code (AGENTS.md: do not pipe through `tail`).

---

### Task 1: `resolveNotePane` pure helper

Derives which Notes pane is active from the currently-selected note. Mirrors `lib/dashboard/resolve-editing-link.ts` / `.test.ts` exactly in shape.

**Files:**
- Create: `lib/dashboard/resolve-note-pane.ts`
- Test: `lib/dashboard/resolve-note-pane.test.ts`

**Interfaces:**
- Consumes: `NoteItem` from `@/lib/dashboard/types` (existing).
- Produces: `type NotePane = "list" | "editor"` and `resolveNotePane(activeNote: NoteItem | null): NotePane`. Task 2 imports both.

- [ ] **Step 1: Write the failing test**

Create `lib/dashboard/resolve-note-pane.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { NoteItem } from "@/lib/dashboard/types";
import { resolveNotePane } from "./resolve-note-pane";

function note(overrides: Partial<NoteItem> & { id: string }): NoteItem {
  return {
    ctx: "work",
    category_id: "cat-a",
    title: "Title",
    content_html: "<p>body</p>",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("resolveNotePane", () => {
  it("is the list when no note is active", () => {
    expect(resolveNotePane(null)).toBe("list");
  });

  it("is the editor when a note is active", () => {
    expect(resolveNotePane(note({ id: "a" }))).toBe("editor");
  });
});
```

> Before running, confirm the `NoteItem` field names in `lib/dashboard/types.ts` (at minimum `ctx`, `category_id`, `title`, `content_html`, `created_at`, `updated_at`). If any differ, fix the `note()` factory to match — the factory must construct a valid `NoteItem` with no `as` casts.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/dashboard/resolve-note-pane.test.ts`
Expected: FAIL — cannot resolve `./resolve-note-pane` (module does not exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `lib/dashboard/resolve-note-pane.ts`:

```ts
import type { NoteItem } from "@/lib/dashboard/types";

export type NotePane = "list" | "editor";

/**
 * Which Notes pane is active, derived from the selected note.
 *
 * On phones (≤560px) the card shows one pane at a time; this value becomes the
 * `data-pane` attribute the mobile CSS switches on. Returns "list" when no note
 * is active (including when the selected note belongs to the other workspace and
 * has stopped resolving), so the view falls back to the list by derivation rather
 * than via a separate effect.
 */
export function resolveNotePane(activeNote: NoteItem | null): NotePane {
  return activeNote ? "editor" : "list";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/dashboard/resolve-note-pane.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Full gate + commit**

Run each and check its own exit code:
```bash
npm run lint
npx tsc --noEmit
npm test
```
Then commit:
```bash
git add lib/dashboard/resolve-note-pane.ts lib/dashboard/resolve-note-pane.test.ts
git commit -m "feat(notes): resolveNotePane helper for mobile pane selection"
```

---

### Task 2: Wire the mobile master–detail into the view

Adds the back-chevron icon, the `data-pane` attribute and marker attributes, the back bar with its handler, and the mobile CSS block. This is a presentation change — the project has no component test harness, so it is gated on the existing suite staying green (`resolveNotePane` from Task 1 is the unit-tested seam) plus a deferred real-device check.

**Files:**
- Modify: `components/dashboard/icons.tsx` (add `ChevronLeftIcon`)
- Modify: `components/dashboard/notes/notes-view.tsx`
- Modify: `app/globals.css` (add one unlayered mobile block)

**Interfaces:**
- Consumes: `resolveNotePane`, `NotePane` from `@/lib/dashboard/resolve-note-pane` (Task 1); existing `flushPending`, `setSelectedId`, `activeNote`.
- Produces: no new exported interface. `data-pane` / `data-notes-*` attributes are the contract between the view and the CSS.

- [ ] **Step 1: Add the back-chevron icon**

In `components/dashboard/icons.tsx`, add after `MenuIcon` (line 109), following the file's `base` convention:

```tsx
export function ChevronLeftIcon({ size = 18 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size} strokeLinejoin="round">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}
```

- [ ] **Step 2: Import the helper and icon in the view**

In `components/dashboard/notes/notes-view.tsx`, update the icons import (line 5) to add `ChevronLeftIcon`:

```tsx
import { ChevronLeftIcon, NoteIcon, SearchIcon, TrashIcon } from "@/components/dashboard/icons";
```

Add a new import alongside the other `@/lib` imports (near line 9):

```tsx
import { resolveNotePane } from "@/lib/dashboard/resolve-note-pane";
```

- [ ] **Step 3: Derive the pane value**

In `notes-view.tsx`, immediately after the `activeNote` memo (ends line 162), add:

```tsx
const pane = resolveNotePane(activeNote);
```

- [ ] **Step 4: Add `handleBack`**

Add this function next to `handleOpenNote` (after it ends, line 457):

```tsx
function handleBack() {
  // Save the outgoing edit before returning to the list, mirroring handleOpenNote.
  flushPending();
  setSelectedId(null);
}
```

- [ ] **Step 5: Put `data-pane` on the section and marker attributes on the regions**

In `notes-view.tsx`:

Add `data-pane={pane}` to the opening `<section>` tag (line 536). It becomes:

```tsx
<section
  data-pane={pane}
  className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow min-[561px]:min-h-0 min-[561px]:flex-1"
>
```

Add `data-notes-header=""` to the section-header `<div>` (line 537):

```tsx
<div
  data-notes-header=""
  className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-[18px]"
>
```

Add `data-notes-list=""` to the list-column `<div>` (line 559):

```tsx
<div
  data-notes-list=""
  className="flex flex-col border-r border-border max-[560px]:border-r-0 max-[560px]:border-b min-[561px]:min-h-0"
>
```

Add `data-notes-editor=""` to the editor-column `<div>` (line 658):

```tsx
<div data-notes-editor="" className="flex min-w-0 flex-col min-[561px]:min-h-0">
```

- [ ] **Step 6: Add the back bar to the editor view**

In `notes-view.tsx`, inside the `activeNote ? (` branch, as the **first** child of `<div className="flex min-h-0 flex-1 flex-col">` (line 660) — before the title row `<div>` at line 661 — insert:

```tsx
<div
  data-notes-back=""
  className="hidden items-center border-b border-border px-2 py-2"
>
  <button
    type="button"
    onClick={handleBack}
    aria-label="Back to notes list"
    className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-lg px-2 pr-3 text-sm font-semibold text-accent hover:bg-accent-soft"
  >
    <ChevronLeftIcon />
    Notes
  </button>
</div>
```

Base class `hidden` keeps it out of the desktop layout and the mobile list view; the CSS in Step 7 reveals it at ≤560px, where it is only ever on-screen inside the (shown) editor column. No save status is placed here — the toolbar below already carries it (`notes-view.tsx:757-763`); a second `aria-live` region would double-announce saves.

- [ ] **Step 7: Add the unlayered mobile CSS block**

In `app/globals.css`, extend the existing `@media (max-width: 560px)` block (currently `app/globals.css:220-225`, holding the `.pb-pad` rule) by adding the Notes rules inside the **same** media query, and prepend the explaining comment. The block becomes:

```css
@media (max-width: 560px) {
  .pb-pad {
    padding-left: 20px !important;
    padding-right: 20px !important;
  }

  /*
   * Notes section, mobile master–detail. The card shows one pane at a time,
   * chosen by [data-pane] on the <section> (set from resolveNotePane in
   * notes-view.tsx). Desktop (≥561px) is unaffected — both panes stay side by
   * side, matching design/patrick-beasley.dc.html:303-354.
   *
   * Unlayered + !important on purpose: these must beat the Tailwind `flex` and
   * `hidden` utilities on the same elements, and (per the .pb-pad note) an
   * unlayered author rule is how we win that in Tailwind v4. No transform is
   * used — a transformed ancestor would re-anchor the fixed mobile tab bar.
   */
  [data-pane="editor"] [data-notes-header],
  [data-pane="editor"] [data-notes-list] {
    display: none !important;
  }

  [data-pane="list"] [data-notes-editor] {
    display: none !important;
  }

  [data-notes-back] {
    display: flex !important;
  }
}
```

- [ ] **Step 8: Manual verification in the browser**

Run the dev server and confirm — a real check, not an assertion:
```bash
npm run dev
```
Then, following AGENTS.md ("A server that answers is not necessarily your server" — confirm the ready line is from this process and the port was free):

- At a narrow width (≤560px; DevTools device toolbar is acceptable for the visual states, but see Step 10 for the true touch check):
  - No note selected → list view: section header, filters, rows; no back bar.
  - Tap a row → editor view: back bar (`← Notes`) on top, list gone, editor at the top of the card. Save status is visible once (in the toolbar).
  - Tap `← Notes` → back to list view.
  - `+ New note` → editor view with the title focused.
  - Delete the active note → returns to list view.
- At ≥561px: both panes side by side, no back bar, unchanged from before.
- Toggle light/dark and both workspaces (work/home) — no regressions.

- [ ] **Step 9: Full gate + commit**

Run each and check its own exit code:
```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```
Then commit:
```bash
git add components/dashboard/icons.tsx components/dashboard/notes/notes-view.tsx app/globals.css
git commit -m "feat(notes): single-pane list/editor swap on mobile"
```

- [ ] **Step 10: Record the deferred real-device check**

The pane swap on real touch hardware (open lands on the editor with no scroll; back returns to the list; no layout jump; the fixed mobile tab bar stays anchored while scrolling a long note) **cannot** be validated by synthetic events or the DevTools emulator (AGENTS.md). Record it as a deferred manual check in the branch's PR description / the project ledger — deferred, not skipped. Do not claim it as verified from the emulator alone.

---

## Self-Review

**1. Spec coverage:**
- Single pane at a time, chosen by active note → Task 1 (`resolveNotePane`) + Task 2 Step 5 (`data-pane`) + Step 7 (CSS). ✓
- List view / editor view contents → unchanged existing markup; Step 6 adds the back bar. ✓
- Transitions driven by `selectedId` → existing handlers unchanged; `handleBack` (Step 4) clears it; `+ New note`/row-tap set it. ✓
- `data-pane` mechanism over `matchMedia` → Task 1 + Step 5/7. ✓
- Back control: `aria-label`, `flushPending()` then `setSelectedId(null)`, kept away from delete → Step 4 + Step 6. ✓
- No save-status duplication (single live region in toolbar) → Step 6 note; matches revised spec. ✓
- No `position: fixed` overlay, no transform/slide → Step 7 comment; CSS uses `display` only. ✓
- Breakpoint reuse ≤560px/≥561px → Step 7 uses the existing media query. ✓
- Verification incl. deferred real-device check → Steps 8–10. ✓

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N". Every code step shows complete code. ✓

**3. Type consistency:** `resolveNotePane(activeNote: NoteItem | null): NotePane` defined in Task 1 and consumed verbatim in Task 2 Steps 2–3. `NotePane = "list" | "editor"` matches the `data-pane` values used in the CSS selectors. `ChevronLeftIcon` defined in Step 1, imported in Step 2, used in Step 6. `data-notes-header/list/editor/back` marker names match one-to-one between Steps 5–6 (JSX) and Step 7 (CSS). ✓
