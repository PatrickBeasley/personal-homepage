import type { LinkItem } from "@/lib/dashboard/types";

/**
 * Ordering rules for the Links card, kept out of the view so they can be tested
 * without a DOM.
 *
 * Three features share this file because they compete for the same thing —
 * what order rows appear in. Pinning wins over everything, grouping sections the
 * result, and the sort key orders within a section.
 */

export type LinkSortKey = "manual" | "recent" | "alpha" | "category";

/** A contiguous run of links rendered under one heading. */
export interface LinkGroup {
  key: string;
  label: string;
  links: LinkItem[];
}

/** Shown for a link whose category has been deleted out from under it. */
export const UNCATEGORIZED_LABEL = "Uncategorized";

/**
 * Comparator for the active sort key.
 *
 * Every branch falls through to an id tie-break. Without it, two links sharing a
 * `sort_order` (or a title, or a category) sort unstably, and a drag looks like
 * it jumped to a random position.
 */
export function compareLinks(
  a: LinkItem,
  b: LinkItem,
  sort: LinkSortKey,
  categoryNames: Map<string, string>
): number {
  if (sort === "manual") {
    return a.sort_order - b.sort_order || a.id.localeCompare(b.id);
  }

  if (sort === "alpha") {
    return a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
  }

  if (sort === "category") {
    const nameA = categoryNames.get(a.category_id) ?? "";
    const nameB = categoryNames.get(b.category_id) ?? "";

    return nameA.localeCompare(nameB) || a.id.localeCompare(b.id);
  }

  // "recent" — newest first.
  return b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id);
}

/**
 * Splits the pinned band off the top. Order within each half is preserved, so
 * the caller sorts first and partitions second.
 */
export function partitionPinned(links: LinkItem[]): {
  pinned: LinkItem[];
  rest: LinkItem[];
} {
  const pinned: LinkItem[] = [];
  const rest: LinkItem[] = [];

  for (const link of links) {
    if (link.pinned) {
      pinned.push(link);
    } else {
      rest.push(link);
    }
  }

  return { pinned, rest };
}

/**
 * Sections links by category, in order of first appearance, so the caller's sort
 * decides both the group order and the order inside each group.
 *
 * A link whose category no longer exists is grouped under its own id rather than
 * dropped — losing a row because a category was deleted would be worse than an
 * oddly-labelled group.
 */
export function groupByCategory(
  links: LinkItem[],
  categoryNames: Map<string, string>
): LinkGroup[] {
  const groups = new Map<string, LinkGroup>();

  for (const link of links) {
    const existing = groups.get(link.category_id);

    if (existing) {
      existing.links.push(link);
      continue;
    }

    groups.set(link.category_id, {
      key: link.category_id,
      label: categoryNames.get(link.category_id) ?? UNCATEGORIZED_LABEL,
      links: [link],
    });
  }

  return [...groups.values()];
}

/**
 * The new `sort_order` for every link after moving one from `fromIndex` to
 * `toIndex`.
 *
 * Renumbers the whole list from 1 rather than trying to slot a fractional value
 * between neighbours: the lists are short, one batch write is a single request,
 * and dense integers cannot drift into the precision problems a fractional
 * scheme eventually hits.
 *
 * Returns an empty array for out-of-range indices so a malformed drag writes
 * nothing at all.
 */
export function computeReorder(
  links: LinkItem[],
  fromIndex: number,
  toIndex: number
): { id: string; sort_order: number }[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= links.length ||
    toIndex >= links.length
  ) {
    return [];
  }

  const reordered = [...links];
  const [moved] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, moved);

  return reordered.map((link, index) => ({ id: link.id, sort_order: index + 1 }));
}
