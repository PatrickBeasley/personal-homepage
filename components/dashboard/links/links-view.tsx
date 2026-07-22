"use client";

import { useId, useMemo, useState } from "react";

import {
  GripIcon,
  LinkIcon,
  PinIcon,
  SearchIcon,
  TrashIcon,
} from "@/components/dashboard/icons";
import { useToast } from "@/components/dashboard/toast";
import { useWorkspace } from "@/components/dashboard/workspace-context";
import {
  compareLinks,
  groupByCategory,
  partitionPinned,
  type LinkGroup,
  type LinkSortKey,
} from "@/lib/dashboard/link-order";
import type { Category, LinkItem } from "@/lib/dashboard/types";

const SORT_OPTIONS: { value: LinkSortKey; label: string }[] = [
  { value: "manual", label: "Manual" },
  { value: "recent", label: "Recent" },
  { value: "alpha", label: "A–Z" },
  { value: "category", label: "Category" },
];

const INPUT_CLASS =
  "h-[38px] rounded-[9px] border border-border-2 bg-surface px-3 text-sm text-text";

const CONTROL_CLASS =
  "h-9 rounded-[9px] border border-border-2 bg-surface-2 px-[10px] text-[13px] text-text";

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

function LinkRow({
  link,
  categoryName,
  draggable,
  onTogglePin,
  onDelete,
  dragHandleProps,
}: {
  link: LinkItem;
  categoryName: string;
  draggable: boolean;
  onTogglePin: (link: LinkItem) => void;
  onDelete: (link: LinkItem) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
}) {
  const optimistic = link.id.startsWith(OPTIMISTIC_PREFIX);

  return (
    <li className="flex items-center gap-3 border-b border-border px-5 py-[13px] hover:bg-surface-2">
      {draggable ? (
        <button
          type="button"
          // `touch-action: none` is load-bearing: without it the browser claims
          // the gesture for scrolling before the pointer handlers ever see it.
          style={{ touchAction: "none" }}
          aria-label={`Reorder ${link.title}`}
          title="Drag to reorder"
          className="grid h-[30px] w-[22px] flex-none cursor-grab place-items-center rounded text-muted hover:text-text active:cursor-grabbing"
          {...dragHandleProps}
        >
          <GripIcon />
        </button>
      ) : null}

      <span
        aria-hidden="true"
        className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[9px] bg-accent-soft font-mono text-xs font-semibold text-accent"
      >
        {(link.title[0] ?? "?").toUpperCase()}
      </span>

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

      <button
        type="button"
        onClick={() => onTogglePin(link)}
        disabled={optimistic}
        aria-pressed={link.pinned}
        aria-label={link.pinned ? `Unpin ${link.title}` : `Pin ${link.title}`}
        title={link.pinned ? "Unpin" : "Pin to top"}
        className={[
          "grid h-[30px] w-[30px] flex-none cursor-pointer place-items-center rounded-lg border border-border bg-transparent disabled:cursor-not-allowed disabled:opacity-50",
          link.pinned ? "text-accent" : "text-muted hover:text-text",
        ].join(" ")}
      >
        <PinIcon />
      </button>

      <button
        type="button"
        onClick={() => onDelete(link)}
        disabled={optimistic}
        aria-label={`Delete ${link.title}`}
        title="Delete"
        className="grid h-[30px] w-[30px] flex-none cursor-pointer place-items-center rounded-lg border border-border bg-transparent text-muted hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
      >
        <TrashIcon />
      </button>
    </li>
  );
}

export default function LinksView({
  initialLinks,
  categories,
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
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  // Manual is the default: it is the only order the user controls, and the
  // migration backfilled it to match what "Recent" showed before.
  const [sort, setSort] = useState<LinkSortKey>("manual");
  const [grouped, setGrouped] = useState(false);

  const formId = useId();
  const searchId = useId();
  const filterId = useId();
  const sortId = useId();
  const titleId = useId();
  const urlId = useId();
  const draftCategoryFieldId = useId();

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
  const groups: LinkGroup[] = useMemo(
    () => (grouped ? groupByCategory(rest, categoryNames) : [{ key: "all", label: "", links: rest }]),
    [grouped, rest, categoryNames]
  );

  async function handleAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

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

  async function handleDelete(target: LinkItem) {
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
          onClick={() => setFormOpen((open) => !open)}
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
          onSubmit={handleAdd}
          className="grid animate-[pbPop_0.2s_ease_both] grid-cols-[1fr_1fr_auto_auto] gap-[10px] border-b border-border bg-surface-2 px-5 py-4 motion-reduce:animate-none max-[560px]:grid-cols-1"
        >
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
            onChange={(event) => setDraftCategoryId(event.target.value)}
            className={INPUT_CLASS}
          >
            {workspaceCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>

          <button
            type="submit"
            disabled={saving || workspaceCategories.length === 0}
            className="h-[38px] cursor-pointer rounded-[9px] px-4 text-sm font-semibold text-white bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save
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
          onChange={(event) => setCategoryFilter(event.target.value)}
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
          onChange={(event) => setSort(event.target.value as LinkSortKey)}
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
            onChange={(event) => setGrouped(event.target.checked)}
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
                  {group.links.map((link) => (
                    <LinkRow
                      key={link.id}
                      link={link}
                      categoryName={categoryNames.get(link.category_id) ?? "Uncategorized"}
                      draggable={sort === "manual"}
                      onTogglePin={handleTogglePin}
                      onDelete={handleDelete}
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
