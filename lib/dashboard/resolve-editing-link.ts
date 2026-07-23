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
