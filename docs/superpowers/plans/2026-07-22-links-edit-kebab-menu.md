# Links Edit + Kebab Row Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin edit an existing link's title, URL, and category, and fold the per-row Pin and Delete actions plus the new Edit action into a single kebab (`⋮`) menu.

**Architecture:** Front-end only. Editing reuses the existing top Add-link form in a dual mode keyed on a new `editingId` state, saving through the already-existing `PATCH /api/links/[id]`. A new `LinkRowMenu` component replaces the two trailing icon buttons in `LinkRow` with a portal-rendered dropdown. One pure helper, `resolveEditingLink`, is extracted to `lib/dashboard/` and unit-tested.

**Tech Stack:** Next.js 16, React (client component), Tailwind CSS v4, Vitest (node env — no jsdom/RTL).

## Global Constraints

- **No backend change.** `PATCH /api/links/[id]` (`app/api/links/[id]/route.ts:33`) already validates and persists `title`, `url`, `category_id`. Do not add or modify any route.
- **Wire format (already met by the existing route):** failures are `{ error, message }`; update returns the bare entity (200).
- **Client failure messages** go through the existing `readApiError(response, fallback)` helper in `links-view.tsx`.
- **Optimistic mutations** must capture the prior value and roll back on failure — the established shape in `handleAdd`/`handleDelete`/`handleTogglePin`.
- **No `useEffect` state-from-props sync.** Derive edit target from `links` each render (that is what `resolveEditingLink` is for).
- **Tailwind v4 gotchas:** `translate-*` sets the `translate` property; utilities beat `@layer base`. Not directly exercised here but keep in mind for any positioning.
- **Verification gates, exit codes checked directly** (never pipe into `tail && echo OK`): `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`.
- **Real-DOM behaviors** (menu dismissal, focus return, portal anchoring, the optimistic edit round-trip) are confirmed in a browser. If a live check is not possible this session, record it as **deferred, not skipped** — never assert it from synthetic events.
- **No new design tokens.** The theme has no danger/red token; the destructive Delete item uses Tailwind's built-in `text-red-500` utility, which is self-contained.

---

### Task 1: `resolveEditingLink` pure helper

Extract the edit-target resolution as a pure, node-testable function, mirroring `lib/dashboard/link-order.ts` + its test.

**Files:**
- Create: `lib/dashboard/resolve-editing-link.ts`
- Test: `lib/dashboard/resolve-editing-link.test.ts`

**Interfaces:**
- Consumes: `LinkItem` from `@/lib/dashboard/types`.
- Produces: `resolveEditingLink(links: LinkItem[], editingId: string | null): LinkItem | null` — returns the link whose `id === editingId`, or `null` when `editingId` is `null` or no link matches (e.g. it was deleted elsewhere).

- [ ] **Step 1: Write the failing test**

Create `lib/dashboard/resolve-editing-link.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { LinkItem } from "@/lib/dashboard/types";
import { resolveEditingLink } from "./resolve-editing-link";

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

describe("resolveEditingLink", () => {
  it("returns null when nothing is being edited", () => {
    expect(resolveEditingLink([link({ id: "a" })], null)).toBeNull();
  });

  it("returns the matching link by id", () => {
    const a = link({ id: "a" });
    const b = link({ id: "b" });

    expect(resolveEditingLink([a, b], "b")).toBe(b);
  });

  it("returns null when the id is no longer present", () => {
    expect(resolveEditingLink([link({ id: "a" })], "gone")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/dashboard/resolve-editing-link.test.ts`
Expected: FAIL — cannot resolve import `./resolve-editing-link`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/dashboard/resolve-editing-link.ts`:

```ts
import type { LinkItem } from "@/lib/dashboard/types";

/**
 * Resolves the link currently being edited from the live list by id.
 *
 * Returns null when nothing is being edited (`editingId` is null) or when the id
 * no longer matches a link — e.g. it was deleted elsewhere — so edit mode falls
 * back to closed by derivation, without a separate effect keeping state in sync.
 */
export function resolveEditingLink(
  links: LinkItem[],
  editingId: string | null
): LinkItem | null {
  if (editingId === null) {
    return null;
  }

  return links.find((link) => link.id === editingId) ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/dashboard/resolve-editing-link.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/dashboard/resolve-editing-link.ts lib/dashboard/resolve-editing-link.test.ts
git commit -m "feat(links): add resolveEditingLink helper"
```

---

### Task 2: Kebab menu icons

Add the two SVG icons the menu needs, in the existing verbatim-SVG style of the file (decorative, `aria-hidden`, `currentColor` stroke, `size` prop). Folded here rather than into Task 3 because they are trivial, have no test of their own, and only exist to serve the menu.

**Files:**
- Modify: `components/dashboard/icons.tsx` (append two exports)

**Interfaces:**
- Produces: `EllipsisIcon({ size? }: { size?: number })` and `EditIcon({ size? }: { size?: number })`, both returning `JSX.Element`, consumed by `LinkRowMenu` in Task 3.

- [ ] **Step 1: Add the icons**

Append to `components/dashboard/icons.tsx` (after `PinIcon`, before end of file). `EllipsisIcon` follows the same filled-circle style `FeedIcon` already uses (`fill="currentColor" stroke="none"`):

```tsx
export function EllipsisIcon({ size = 18 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size}>
      <circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function EditIcon({ size = 15 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size} strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: exit 0, no errors. (The icons are unused until Task 3; that is fine — they are exports, not locals.)

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/icons.tsx
git commit -m "feat(links): add EllipsisIcon and EditIcon"
```

---

### Task 3: Kebab menu + edit flow in the Links view

Replace the two trailing buttons in `LinkRow` with a portal-rendered `LinkRowMenu`, and make the top Add-link form dual-mode so Edit reuses it and saves via `PATCH`. This is one coherent reviewable deliverable: the menu is the only trigger for edit, so the trigger and the flow ship together. Pin and Delete keep their existing handlers unchanged; they are just relocated into the menu.

**Files:**
- Modify: `components/dashboard/links/links-view.tsx`

**Interfaces:**
- Consumes: `resolveEditingLink` (Task 1); `EllipsisIcon`, `EditIcon` (Task 2); existing `PinIcon`, `TrashIcon`; existing `readApiError`, `handleTogglePin`, `handleDelete`, `activeDraftCategoryId`, `OPTIMISTIC_PREFIX`.
- Produces: no exports beyond the default `LinksView`. New internal component `LinkRowMenu` and handlers `handleEditStart`, `handleEditCancel`, `handleToggleAddForm`; `handleAdd` is renamed to `handleSubmit` and branches on `editingId`.

- [ ] **Step 1: Update imports**

At the top of `components/dashboard/links/links-view.tsx`:

Change the React import (add `useRef`):

```tsx
import { useEffect, useId, useMemo, useRef, useState } from "react";
```

Add, immediately below it, the portal import:

```tsx
import { createPortal } from "react-dom";
```

Extend the icons import to include the two new icons:

```tsx
import {
  EditIcon,
  EllipsisIcon,
  LinkIcon,
  PinIcon,
  SearchIcon,
  TrashIcon,
} from "@/components/dashboard/icons";
```

Add the helper import alongside the other `@/lib/dashboard/...` imports:

```tsx
import { resolveEditingLink } from "@/lib/dashboard/resolve-editing-link";
```

- [ ] **Step 2: Add the `LinkRowMenu` component**

Insert this component in the file **above** `LinkRow` (so `LinkRow` can reference it). It renders the dropdown into `document.body` via a portal and positions it `fixed` from the trigger's rect, so the list's `overflow-auto` container cannot clip it. It closes on outside pointerdown, `Escape` (returning focus to the trigger), and any scroll/resize (the fixed menu would otherwise detach from a trigger that scrolled away):

```tsx
function LinkRowMenu({
  link,
  disabled,
  onEdit,
  onTogglePin,
  onDelete,
}: {
  link: LinkItem;
  disabled: boolean;
  onEdit: (link: LinkItem) => void;
  onTogglePin: (link: LinkItem) => void;
  onDelete: (link: LinkItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function openMenu() {
    const rect = triggerRef.current?.getBoundingClientRect();

    if (!rect) {
      return;
    }

    // right is measured from the viewport's right edge so the menu hangs under
    // the trigger's right corner regardless of horizontal scroll.
    setCoords({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    // Move focus into the menu so keyboard users land on the first item; the
    // portal sits at the end of <body>, so Tab would not otherwise reach it.
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;

      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    function handleDismiss() {
      setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    // Capture phase so a scroll inside the list container (not just the window)
    // also dismisses.
    window.addEventListener("scroll", handleDismiss, true);
    window.addEventListener("resize", handleDismiss);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleDismiss, true);
      window.removeEventListener("resize", handleDismiss);
    };
  }, [open]);

  function runAndClose(action: () => void) {
    setOpen(false);
    action();
  }

  const itemClass =
    "flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-surface-2";

  return (
    <div className="flex-none">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${link.title}`}
        title="Actions"
        className="grid h-[30px] w-[30px] cursor-pointer place-items-center rounded-lg border border-border bg-transparent text-muted hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
      >
        <EllipsisIcon size={16} />
      </button>

      {open && coords
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label={`Actions for ${link.title}`}
              style={{ position: "fixed", top: coords.top, right: coords.right }}
              className="z-50 min-w-[168px] overflow-hidden rounded-[10px] border border-border-2 bg-elevated py-1 shadow-lg"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => runAndClose(() => onEdit(link))}
                className={`${itemClass} text-text`}
              >
                <EditIcon size={15} />
                Edit
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => runAndClose(() => onTogglePin(link))}
                className={`${itemClass} text-text`}
              >
                <PinIcon />
                {link.pinned ? "Unpin" : "Pin to top"}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => runAndClose(() => onDelete(link))}
                className={`${itemClass} text-red-500`}
              >
                <TrashIcon />
                Delete
              </button>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
```

- [ ] **Step 3: Swap the two buttons in `LinkRow` for the menu**

In `LinkRow`, add `onEdit` to the prop list and its type. Change the destructured props to include `onEdit`:

```tsx
function LinkRow({
  link,
  categoryName,
  draggable,
  onEdit,
  onTogglePin,
  onDelete,
  dragHandleProps,
  rowProps,
}: {
  link: LinkItem;
  categoryName: string;
  draggable: boolean;
  onEdit: (link: LinkItem) => void;
  onTogglePin: (link: LinkItem) => void;
  onDelete: (link: LinkItem) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLElement>;
  rowProps?: React.HTMLAttributes<HTMLLIElement> & {
    ref?: (element: HTMLElement | null) => void;
    [key: `data-${string}`]: string | undefined;
  };
}) {
```

Then replace the two trailing `<button>` elements (the Pin button and the Delete button — the block from `<button ... onTogglePin ...>` through the closing `</button>` of the Delete button) with a single menu:

```tsx
      <LinkRowMenu
        link={link}
        disabled={optimistic}
        onEdit={onEdit}
        onTogglePin={onTogglePin}
        onDelete={onDelete}
      />
```

- [ ] **Step 4: Add edit state and handlers in `LinksView`**

Add the `editingId` state next to the other draft state (near `const [saving, setSaving] = useState(false);`):

```tsx
  const [editingId, setEditingId] = useState<string | null>(null);
```

Derive the edit target and mode (place after `visibleLinks`/near the other derived values, before the return; must be after `links` exists):

```tsx
  const editingLink = resolveEditingLink(links, editingId);
  const editing = editingLink !== null;
```

Add these handlers alongside the existing ones (after `handleAddCategory`, before `handleDelete`):

```tsx
  function handleEditStart(target: LinkItem) {
    setEditingId(target.id);
    setDraftTitle(target.title);
    setDraftUrl(target.url);
    setDraftCategoryId(target.category_id);
    setAddingCategory(false);
    setFormOpen(true);
  }

  function handleEditCancel() {
    setEditingId(null);
    setDraftTitle("");
    setDraftUrl("");
    setFormOpen(false);
  }

  // The "+ Add link" button starts a fresh add even while editing: leave edit
  // mode and clear the drafts it seeded, then open an empty add form.
  function handleToggleAddForm() {
    if (editing) {
      setEditingId(null);
      setDraftTitle("");
      setDraftUrl("");
      setFormOpen(true);
      return;
    }

    setFormOpen((formIsOpen) => !formIsOpen);
  }
```

- [ ] **Step 5: Branch the submit handler**

Rename `handleAdd` to `handleSubmit` and, right after `event.preventDefault();`, branch to the edit path. The rest of the existing add body stays exactly as-is under the branch:

```tsx
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (editingId !== null) {
      await handleEditSave();
      return;
    }

    const title = draftTitle.trim();
    const rawUrl = draftUrl.trim();
    // ...unchanged existing add logic through the end of the function...
  }
```

Add `handleEditSave` immediately after `handleSubmit`. It follows the optimistic-with-rollback shape of `handleTogglePin`:

```tsx
  async function handleEditSave() {
    const target = resolveEditingLink(links, editingId);

    // The row vanished (deleted elsewhere) between opening the editor and saving.
    if (!target) {
      handleEditCancel();
      return;
    }

    const title = draftTitle.trim();
    const rawUrl = draftUrl.trim();
    const categoryId = activeDraftCategoryId;

    if (!title || !rawUrl || !categoryId || saving) {
      return;
    }

    // Mirror handleSubmit's normalization so the optimistic row shows the href
    // the database will store.
    const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;

    setLinks((previous) =>
      previous.map((link) =>
        link.id === target.id ? { ...link, title, url, category_id: categoryId } : link
      )
    );
    setEditingId(null);
    setDraftTitle("");
    setDraftUrl("");
    setFormOpen(false);
    setSaving(true);

    try {
      const response = await fetch(`/api/links/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, url, category_id: categoryId }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Could not update the link."));
      }

      // The 200 carries the authoritative row (normalized url, new updated_at).
      const saved: LinkItem = await response.json();

      setLinks((previous) => previous.map((link) => (link.id === target.id ? saved : link)));
      showToast("Link updated");
    } catch (error) {
      // Restore the row and reopen the editor with the typed values preserved.
      setLinks((previous) => previous.map((link) => (link.id === target.id ? target : link)));
      setEditingId(target.id);
      setDraftTitle((current) => current || title);
      setDraftUrl((current) => current || rawUrl);
      setDraftCategoryId(categoryId);
      setFormOpen(true);
      showToast(error instanceof Error ? error.message : "Could not update the link.");
    } finally {
      setSaving(false);
    }
  }
```

- [ ] **Step 6: Cancel edit when the edited row is deleted**

At the very top of `handleDelete`, drop out of edit mode if the row being deleted is the one open in the editor (prevents a stale editor over a gone row):

```tsx
  async function handleDelete(target: LinkItem) {
    if (target.id === editingId) {
      handleEditCancel();
    }

    setLinks((previous) => previous.filter((link) => link.id !== target.id));
    // ...unchanged...
  }
```

- [ ] **Step 7: Wire the form UI to dual mode**

(a) Change the header "+ Add link" button's `onClick` to the new handler (leave its label and the `aria-expanded={formOpen}` / `aria-controls` as they are):

```tsx
          onClick={handleToggleAddForm}
```

(b) Change the form's `onSubmit` from `handleAdd` to `handleSubmit`:

```tsx
        <form
          id={formId}
          onSubmit={handleSubmit}
```

(c) Add an "Edit link" legend as the first child inside the `<form>` (before the title `<label>`), spanning the full grid width, shown only in edit mode:

```tsx
          {editing ? (
            <p className="col-span-full font-mono text-[11px] uppercase tracking-wide text-muted">
              Edit link
            </p>
          ) : null}
```

(d) After the Save `<button type="submit">`, add a Cancel button shown only in edit mode (it flows into the next grid cell; on mobile the grid is a single column so it stacks):

```tsx
          {editing ? (
            <button
              type="button"
              onClick={handleEditCancel}
              className="h-[38px] cursor-pointer rounded-[9px] border border-border bg-transparent px-4 text-sm text-text-2"
            >
              Cancel
            </button>
          ) : null}
```

- [ ] **Step 8: Pass `onEdit` at both `LinkRow` call sites**

In the pinned band map and the grouped-list map, add `onEdit={handleEditStart}` to each `<LinkRow ... />`:

Pinned band (near `onTogglePin={handleTogglePin}` / `onDelete={handleDelete}`):

```tsx
                    <LinkRow
                      key={link.id}
                      link={link}
                      categoryName={categoryNames.get(link.category_id) ?? "Uncategorized"}
                      draggable={false}
                      onEdit={handleEditStart}
                      onTogglePin={handleTogglePin}
                      onDelete={handleDelete}
                    />
```

Grouped list:

```tsx
                    <LinkRow
                      key={link.id}
                      link={link}
                      categoryName={categoryNames.get(link.category_id) ?? "Uncategorized"}
                      draggable={dragEnabled}
                      onEdit={handleEditStart}
                      onTogglePin={handleTogglePin}
                      onDelete={handleDelete}
                      dragHandleProps={getHandleProps(index)}
                      rowProps={getRowProps(index)}
                    />
```

- [ ] **Step 9: Run the full gate (check exit codes directly)**

Run each and read its own exit status — do not chain with `&& echo OK`:

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

Expected: all exit 0. Common failures to fix in place: an unused `handleAdd` reference (must be renamed at the `onSubmit` too), a missing `onEdit` at either call site (tsc error), or `react-dom`/`useRef` not imported.

- [ ] **Step 10: Browser verification (real DOM — deferred if no live session)**

With the app running (`npm run dev`, admin signed in, `/dashboard` Links), confirm and record results for:
1. Kebab opens; Edit pre-fills the top form ("Edit link" legend, Cancel visible); Save persists and the row updates; reload shows the change persisted (prove via DB or a fresh GET, not just the 200).
2. Pin/Unpin and Delete still work from the menu; Delete is immediate.
3. Menu dismisses on outside click, on `Escape` (focus returns to the `⋮`), and on scrolling the list.
4. A menu opened on the **bottom-most** row is not clipped by the list's scroll container (the portal fix).
5. Editing a link, then deleting a *different* link, leaves the editor intact; deleting the *edited* link closes the editor.

If no live session is available, mark this step **deferred, not skipped** in the commit body and the task report — do not claim it passed.

- [ ] **Step 11: Commit**

```bash
git add components/dashboard/links/links-view.tsx
git commit -m "feat(links): edit link via kebab row menu, fold in pin and delete"
```

---

## Self-Review

**Spec coverage** (against `docs/superpowers/specs/2026-07-22-links-edit-kebab-menu-design.md`):
- New icons (`EllipsisIcon`, `EditIcon`) → Task 2. ✓
- `LinkRowMenu` with Edit / Pin-Unpin / Delete, dismissal, a11y, disabled-when-optimistic → Task 3 Steps 2–3. ✓
- Overflow anchoring (portal + fixed) → Task 3 Step 2; verified Step 10.4. ✓
- Dual-mode top form, `editingId`, mode derivation via `resolveEditingLink` → Tasks 1 + 3 Steps 4–7. ✓
- Optimistic PATCH with `handleTogglePin`-shaped rollback → Task 3 Step 5. ✓
- Delete immediate, no confirm → Task 3 Step 2 (Delete item calls `onDelete` directly). ✓
- Edit blocked for optimistic rows → menu trigger `disabled={optimistic}`, Task 3 Steps 2–3. ✓
- One-form / mutually-exclusive add vs edit → `handleEditStart` clears add, `handleToggleAddForm` clears edit, Task 3 Step 4. ✓
- Wire `onEdit` through both call sites → Task 3 Step 8. ✓
- Pure helper unit-tested; no jsdom harness added → Task 1; Step 10 defers real-DOM. ✓
- Verification gates with direct exit codes → Task 3 Step 9. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. The only "…unchanged…" markers (Task 3 Steps 5–6) explicitly point at existing code in `links-view.tsx` that must be preserved verbatim, not written anew.

**Type consistency:** `resolveEditingLink(links, editingId)` signature identical in Task 1, imports, and both call sites in Task 3 (`handleEditSave`, `editingLink`). `onEdit: (link: LinkItem) => void` matches between `LinkRow` props, `LinkRowMenu` props, and `handleEditStart`. `handleAdd`→`handleSubmit` rename is applied at the definition (Step 5) and the `onSubmit` (Step 7b). Icon signatures `{ size?: number }` match their usage.
