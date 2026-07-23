"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  EditIcon,
  EllipsisIcon,
  LinkIcon,
  PinIcon,
  SearchIcon,
  TrashIcon,
} from "@/components/dashboard/icons";
import { useToast } from "@/components/dashboard/toast";
import { useDragReorder } from "@/components/dashboard/links/use-drag-reorder";
import { useWorkspace } from "@/components/dashboard/workspace-context";
import { CATEGORY_NAME_MAX_LENGTH } from "@/lib/dashboard/api";
import {
  compareLinks,
  computeReorder,
  groupByCategory,
  partitionPinned,
  type LinkGroup,
  type LinkSortKey,
} from "@/lib/dashboard/link-order";
import { resolveEditingLink } from "@/lib/dashboard/resolve-editing-link";
import type { Category, LinkItem } from "@/lib/dashboard/types";

const SORT_OPTIONS: { value: LinkSortKey; label: string }[] = [
  { value: "manual", label: "Manual" },
  { value: "recent", label: "Recent" },
  { value: "alpha", label: "A–Z" },
  { value: "category", label: "Category" },
];

/** localStorage key for the remembered Links view (sort, grouping, filter). */
const LINKS_PREFS_KEY = "pb-links-prefs";

/** The remembered view. Every field optional so a partial/older payload still applies. */
interface LinksPrefs {
  sort?: LinkSortKey;
  grouped?: boolean;
  filter?: string;
}

/**
 * Reads the remembered view from localStorage, validating each field so a
 * corrupt or stale payload can never push an invalid sort key (or a non-boolean
 * `grouped`) into state. Returns null when there is nothing usable to restore.
 */
function readLinksPrefs(): LinksPrefs | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(LINKS_PREFS_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const prefs: LinksPrefs = {};

    if (typeof parsed.sort === "string" && SORT_OPTIONS.some((option) => option.value === parsed.sort)) {
      prefs.sort = parsed.sort as LinkSortKey;
    }

    if (typeof parsed.grouped === "boolean") {
      prefs.grouped = parsed.grouped;
    }

    if (typeof parsed.filter === "string") {
      prefs.filter = parsed.filter;
    }

    return prefs;
  } catch {
    return null;
  }
}

const INPUT_CLASS =
  "h-[38px] rounded-[9px] border border-border-2 bg-surface px-3 text-sm text-text";

const CONTROL_CLASS =
  "h-9 rounded-[9px] border border-border-2 bg-surface-2 px-[10px] text-[13px] text-text";

/** Sentinel `<option>` value; never a real category id, which is always a uuid. */
const NEW_CATEGORY_VALUE = "__new__";

/**
 * Marks a row that exists only in local state while its POST is in flight.
 * Such a row has no server id yet, so it cannot be deleted through the API.
 */
const OPTIMISTIC_PREFIX = "optimistic-";

/** `new URL(...).hostname` minus the `www.` prefix, per the design's `host()`. */
function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Pulls a human-readable message off a failed API response. Dashboard routes
 * answer with `{ error, message }`; `requireAdminAuth` answers with `{ error }`
 * alone, so both shapes are handled before falling back.
 */
async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await response.json();

    if (typeof body === "object" && body !== null) {
      const { message, error } = body as { message?: unknown; error?: unknown };

      if (typeof message === "string" && message) {
        return message;
      }

      if (typeof error === "string" && error) {
        return error;
      }
    }
  } catch {
    // Non-JSON error responses fall through to the generic message.
  }

  return fallback;
}

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
  // Element-general (not <button>-specific) because the handle is now the
  // leading letter avatar, a <span>, not a separate grip button.
  dragHandleProps?: React.HTMLAttributes<HTMLElement>;
  // `React.HTMLAttributes` does not admit `data-*` keys, so the index signature
  // is what lets the hook's data-dragging / data-drop-target flags typecheck.
  rowProps?: React.HTMLAttributes<HTMLLIElement> & {
    ref?: (element: HTMLElement | null) => void;
    [key: `data-${string}`]: string | undefined;
  };
}) {
  const optimistic = link.id.startsWith(OPTIMISTIC_PREFIX);
  const initial = (link.title[0] ?? "?").toUpperCase();

  return (
    <li
      {...rowProps}
      className="flex items-center gap-3 border-b border-border px-5 py-[13px] hover:bg-surface-2 data-[dragging=true]:opacity-40 data-[drop-target=true]:border-t-2 data-[drop-target=true]:border-t-accent"
    >
      {draggable ? (
        // The letter avatar doubles as the drag handle when reordering is live.
        // `touch-action: none` is load-bearing: without it the browser claims the
        // gesture for scrolling before the pointer handlers ever see it. It is
        // focusable with role="button" so the hook's Arrow-key reorder still works.
        <span
          {...dragHandleProps}
          role="button"
          tabIndex={0}
          aria-label={`Reorder ${link.title}`}
          title="Drag to reorder"
          style={{ touchAction: "none" }}
          className="grid h-[34px] w-[34px] flex-none cursor-grab select-none place-items-center rounded-[9px] bg-accent-soft font-mono text-xs font-semibold text-accent active:cursor-grabbing"
        >
          {initial}
        </span>
      ) : (
        <span
          aria-hidden="true"
          className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[9px] bg-accent-soft font-mono text-xs font-semibold text-accent"
        >
          {initial}
        </span>
      )}

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

      <LinkRowMenu
        link={link}
        disabled={optimistic}
        onEdit={onEdit}
        onTogglePin={onTogglePin}
        onDelete={onDelete}
      />
    </li>
  );
}

export default function LinksView({
  initialLinks,
  categories: initialCategories,
}: {
  initialLinks: LinkItem[];
  categories: Category[];
}) {
  const { workspace } = useWorkspace();
  const showToast = useToast();

  const [links, setLinks] = useState<LinkItem[]>(initialLinks);
  const [formOpen, setFormOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftUrl, setDraftUrl] = useState("");
  const [draftCategoryId, setDraftCategoryId] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  // Manual is the default: it is the only order the user controls, and the
  // migration backfilled it to match what "Recent" showed before.
  const [sort, setSort] = useState<LinkSortKey>("manual");
  const [grouped, setGrouped] = useState(false);

  // Seeded from the server prop, then owned locally so a category created from
  // this page appears without a reload.
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [addingCategory, setAddingCategory] = useState(false);
  const [draftCategoryName, setDraftCategoryName] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);

  // Restore the last-used view once on mount. This is a genuine external-store
  // read, not the state-from-props sync this view otherwise avoids: localStorage
  // is a side channel the server render cannot see, so reading it in an effect
  // (rather than a lazy `useState` initializer) is what keeps the server and the
  // first client render identical and avoids a hydration mismatch. The cost is a
  // brief flash of the default view before the saved prefs apply.
  useEffect(() => {
    const prefs = readLinksPrefs();

    if (!prefs) {
      return;
    }

    if (prefs.sort !== undefined) {
      setSort(prefs.sort);
    }

    if (prefs.grouped !== undefined) {
      setGrouped(prefs.grouped);
    }

    if (prefs.filter !== undefined) {
      setCategoryFilter(prefs.filter);
    }
  }, []);

  // Persist the view prefs. Written from the change handlers rather than an
  // effect on [sort, grouped, categoryFilter], so the mount restore above can
  // never race a write of the default values before it applies the saved ones.
  // Closes over the current render's values and overrides the one field that
  // changed, so a single-field update still writes the whole object correctly.
  function persistPrefs(next: LinksPrefs) {
    try {
      window.localStorage.setItem(
        LINKS_PREFS_KEY,
        JSON.stringify({ sort, grouped, filter: categoryFilter, ...next })
      );
    } catch {
      // Private mode or a full quota just means the view is not remembered.
    }
  }

  function handleSortChange(value: LinkSortKey) {
    setSort(value);
    persistPrefs({ sort: value });
  }

  function handleGroupedChange(value: boolean) {
    setGrouped(value);
    persistPrefs({ grouped: value });
  }

  function handleFilterChange(value: string) {
    setCategoryFilter(value);
    persistPrefs({ filter: value });
  }

  const formId = useId();
  const searchId = useId();
  const filterId = useId();
  const sortId = useId();
  const titleId = useId();
  const urlId = useId();
  const draftCategoryFieldId = useId();
  const newCategoryFieldId = useId();

  // Both workspaces are already in memory, so switching is a re-filter — no refetch.
  const workspaceCategories = useMemo(
    () =>
      categories
        .filter((category) => category.ctx === workspace && category.kind === "link")
        .sort((a, b) => a.sort_order - b.sort_order),
    [categories, workspace]
  );

  const categoryNames = useMemo(() => {
    const names = new Map<string, string>();

    for (const category of categories) {
      names.set(category.id, category.name);
    }

    return names;
  }, [categories]);

  // The selections are derived rather than reset in an effect: a category id
  // from the other workspace simply stops being a valid choice when the
  // workspace changes, and falls back on the next render.
  const activeFilter = workspaceCategories.some((category) => category.id === categoryFilter)
    ? categoryFilter
    : "all";
  const activeDraftCategoryId = workspaceCategories.some(
    (category) => category.id === draftCategoryId
  )
    ? draftCategoryId
    : (workspaceCategories[0]?.id ?? "");

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
  const groups: LinkGroup[] = useMemo(() => {
    if (!grouped) {
      return [{ key: "all", label: "", links: rest }];
    }

    // Sections are ordered by category name so a grouped view reads predictably
    // top to bottom, independent of the active within-section sort. `compareLinks`
    // still decides the order of links inside each section, so Group + A–Z gives
    // category name, then link name.
    return groupByCategory(rest, categoryNames).sort((a, b) => a.label.localeCompare(b.label));
  }, [grouped, rest, categoryNames]);

  const editingLink = resolveEditingLink(links, editingId);
  const editing = editingLink !== null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (editingId !== null) {
      await handleEditSave();
      return;
    }

    const title = draftTitle.trim();
    const rawUrl = draftUrl.trim();

    if (!title || !rawUrl || !activeDraftCategoryId || saving) {
      return;
    }

    // Mirrors the server's normalization so the optimistic row shows the same
    // href the database will end up holding.
    const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    // Purely local, never sent anywhere: it only has to be distinct from every
    // real uuid until the server's row replaces it.
    const temporaryId = `${OPTIMISTIC_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const now = new Date().toISOString();
    const optimistic: LinkItem = {
      id: temporaryId,
      ctx: workspace,
      category_id: activeDraftCategoryId,
      title,
      url,
      description: null,
      sort_order: 0,
      pinned: false,
      created_at: now,
      updated_at: now,
    };

    setLinks((previous) => [optimistic, ...previous]);
    setDraftTitle("");
    setDraftUrl("");
    setFormOpen(false);
    setSaving(true);

    try {
      const response = await fetch("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ctx: workspace,
          title,
          url,
          category_id: activeDraftCategoryId,
        }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Could not save the link."));
      }

      const saved: LinkItem = await response.json();

      setLinks((previous) => previous.map((link) => (link.id === temporaryId ? saved : link)));
      showToast("Link added");
    } catch (error) {
      setLinks((previous) => previous.filter((link) => link.id !== temporaryId));
      // Give the draft back, but never over the top of something typed since.
      setDraftTitle((current) => current || title);
      setDraftUrl((current) => current || rawUrl);
      setFormOpen(true);
      showToast(error instanceof Error ? error.message : "Could not save the link.");
    } finally {
      setSaving(false);
    }
  }

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
      showToast(`Added "${created.name}"`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not add the category.");
    } finally {
      setSavingCategory(false);
    }
  }

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

  async function handleDelete(target: LinkItem) {
    if (target.id === editingId) {
      handleEditCancel();
    }

    setLinks((previous) => previous.filter((link) => link.id !== target.id));

    try {
      const response = await fetch(`/api/links/${target.id}`, { method: "DELETE" });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Could not delete the link."));
      }
    } catch (error) {
      // Sort order is derived at render time, so re-appending restores the row
      // to exactly the position it came from.
      setLinks((previous) =>
        previous.some((link) => link.id === target.id) ? previous : [...previous, target]
      );
      showToast(error instanceof Error ? error.message : "Could not delete the link.");
    }
  }

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

  // `rest` is narrowed by the category filter (`activeFilter`) before drag ever
  // sees it, same as grouping and search narrow it. If a specific category is
  // selected, `computeReorder` would only renumber that subset to sort_order
  // 1..N and the PATCH would persist just those ids, leaving every link
  // outside the filter with a stale sort_order — the corrupted-order hazard
  // this guard exists to prevent. Only "all" (no category filter) keeps
  // `rest`'s indices mapped 1:1 onto the full manual order.
  const dragEnabled = sort === "manual" && !grouped && !query.trim() && activeFilter === "all";

  const { getHandleProps, getRowProps } = useDragReorder({
    count: rest.length,
    enabled: dragEnabled,
    onCommit: handleReorder,
  });

  return (
    <section className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-[18px]">
        <div className="flex min-w-[160px] flex-1 items-center gap-[10px]">
          <span className="flex text-accent">
            <LinkIcon />
          </span>
          <h2 className="font-heading text-[17px] font-semibold">Links</h2>
          <span className="font-mono text-xs text-muted">{visibleLinks.length}</span>
        </div>
        <button
          type="button"
          onClick={handleToggleAddForm}
          aria-expanded={formOpen}
          // The form is unmounted when collapsed, so the reference only points
          // at a real element while it is open.
          aria-controls={formOpen ? formId : undefined}
          className="inline-flex h-[34px] cursor-pointer items-center gap-1.5 rounded-[9px] px-[14px] text-[13px] font-semibold text-white bg-accent"
        >
          + Add link
        </button>
      </div>

      {formOpen ? (
        <form
          id={formId}
          onSubmit={handleSubmit}
          className="grid animate-[pbPop_0.2s_ease_both] grid-cols-[1fr_1fr_auto_auto] gap-[10px] border-b border-border bg-surface-2 px-5 py-4 motion-reduce:animate-none max-[560px]:grid-cols-1"
        >
          {editing ? (
            <p className="col-span-full font-mono text-[11px] uppercase tracking-wide text-muted">
              Edit link
            </p>
          ) : null}

          <label htmlFor={titleId} className="sr-only">
            Link title
          </label>
          <input
            id={titleId}
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            placeholder="Title"
            required
            className={`${INPUT_CLASS} col-span-2 max-[560px]:col-span-1`}
          />

          <label htmlFor={urlId} className="sr-only">
            Link URL
          </label>
          <input
            id={urlId}
            value={draftUrl}
            onChange={(event) => setDraftUrl(event.target.value)}
            placeholder="https://…"
            required
            inputMode="url"
            className={`${INPUT_CLASS} col-span-2 max-[560px]:col-span-1`}
          />

          <label htmlFor={draftCategoryFieldId} className="sr-only">
            Link category
          </label>
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

          <button
            type="submit"
            disabled={saving || workspaceCategories.length === 0}
            className="h-[38px] cursor-pointer rounded-[9px] px-4 text-sm font-semibold text-white bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save
          </button>

          {editing ? (
            <button
              type="button"
              onClick={handleEditCancel}
              className="h-[38px] cursor-pointer rounded-[9px] border border-border bg-transparent px-4 text-sm text-text-2"
            >
              Cancel
            </button>
          ) : null}
        </form>
      ) : null}

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

      <div className="flex flex-wrap items-center gap-[10px] border-b border-border px-5 py-3">
        <div className="relative min-w-[150px] flex-1">
          <label htmlFor={searchId} className="sr-only">
            Search links
          </label>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-[11px] top-1/2 -translate-y-1/2 text-muted"
          >
            <SearchIcon />
          </span>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search links…"
            className={`${CONTROL_CLASS} w-full pl-[34px]`}
          />
        </div>

        <label htmlFor={filterId} className="sr-only">
          Filter by category
        </label>
        <select
          id={filterId}
          value={activeFilter}
          onChange={(event) => handleFilterChange(event.target.value)}
          className={CONTROL_CLASS}
        >
          <option value="all">All categories</option>
          {workspaceCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>

        <label htmlFor={sortId} className="sr-only">
          Sort links
        </label>
        <select
          id={sortId}
          value={sort}
          onChange={(event) => handleSortChange(event.target.value as LinkSortKey)}
          className={CONTROL_CLASS}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-[9px] border border-border-2 bg-surface-2 px-[10px] text-[13px] text-text">
          <input
            type="checkbox"
            checked={grouped}
            onChange={(event) => handleGroupedChange(event.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--accent)]"
          />
          Group
        </label>
      </div>

      <div className="max-h-[520px] flex-1 overflow-auto">
        {visibleLinks.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted">
            No links yet. Add your first one ↑
          </p>
        ) : (
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
                      onEdit={handleEditStart}
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
                  {group.links.map((link, index) => (
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
                  ))}
                </ul>
              </div>
            ))}
          </>
        )}
      </div>
    </section>
  );
}
