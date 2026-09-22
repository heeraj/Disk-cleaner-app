/**
 * Hierarchy-aware size helpers for large-scan results.
 *
 * Folder sizeBytes are inclusive of descendants (TreeSize / WinDirStat style).
 * Unique / reclaimable totals must not double-count nested paths.
 */

export interface PathSized {
  path: string;
  sizeBytes: number;
}

export function normalizePathKey(p: string): string {
  let n = p.replace(/\\/g, '/');
  // Collapse duplicate slashes (except leading // for UNC)
  n = n.replace(/\/+/g, '/');
  if (n.length > 1 && n.endsWith('/')) n = n.slice(0, -1);
  // Windows drive letters are case-insensitive
  if (/^[a-zA-Z]:/.test(n)) n = n[0].toLowerCase() + n.slice(1);
  return n;
}

/** True if `child` is strictly inside `parent` (not equal). */
export function isPathInside(child: string, parent: string): boolean {
  const c = normalizePathKey(child);
  const p = normalizePathKey(parent);
  if (c === p) return false;
  // Exact prefix with separator — avoids /foo matching /foobar
  return c.startsWith(p.endsWith(':') ? p : p + '/');
}

export function pathDepth(p: string): number {
  const n = normalizePathKey(p);
  const trimmed = n.replace(/^[a-z]:/i, '').replace(/^\/+/, '');
  if (!trimmed) return 0;
  return trimmed.split('/').filter(Boolean).length;
}

export interface HierarchyAnnotation {
  /** Inclusive size (same as measured sizeBytes for dirs). */
  inclusiveBytes: number;
  /** Bytes that count toward unique totals (0 if covered by a listed ancestor). */
  uniqueBytes: number;
  /** Another result item is nested under this path. */
  hasListedDescendants: boolean;
  /** A listed ancestor covers this path — exclude from unique totals. */
  coveredByAncestor: boolean;
  depth: number;
}

/**
 * Annotate each item with hierarchy metadata relative to the full result set.
 */
export function annotateHierarchy<T extends PathSized>(
  items: T[]
): Array<T & HierarchyAnnotation> {
  return items.map((item) => {
    const hasListedDescendants = items.some((other) =>
      isPathInside(other.path, item.path)
    );
    const coveredByAncestor = items.some((other) =>
      isPathInside(item.path, other.path)
    );
    const inclusiveBytes = item.sizeBytes;
    return {
      ...item,
      inclusiveBytes,
      uniqueBytes: coveredByAncestor ? 0 : inclusiveBytes,
      hasListedDescendants,
      coveredByAncestor,
      depth: pathDepth(item.path),
    };
  });
}

/**
 * Sum of non-overlapping sizes: if a parent is in the set, nested children
 * are not added again.
 */
export function uniqueBytesTotal(items: PathSized[]): number {
  if (items.length === 0) return 0;
  let total = 0;
  for (const item of items) {
    const covered = items.some((other) => isPathInside(item.path, other.path));
    if (!covered) total += item.sizeBytes;
  }
  return total;
}

/** Keep only items that are not nested under another item in the list. */
export function filterTopLevelItems<T extends PathSized>(items: T[]): T[] {
  return items.filter(
    (item) => !items.some((other) => isPathInside(item.path, other.path))
  );
}

/**
 * Given selected ids and the item list, return ids that should actually be
 * deleted: drop any path nested under another selected path.
 */
export function filterDeletableIds<T extends { id: string; path: string; sizeBytes: number }>(
  selectedIds: string[],
  items: T[]
): string[] {
  const selected = items.filter((i) => selectedIds.includes(i.id));
  const keep = filterTopLevelItems(selected);
  return keep.map((i) => i.id);
}

/**
 * When selecting a parent, remove nested children from the selection.
 * When deselecting, only remove that id.
 * When selecting a child while an ancestor is selected: leave ancestor selected
 * (child stays covered / greied) — caller should no-op selecting covered items.
 */
export function applyHierarchicalSelection(
  current: Set<string>,
  toggledId: string,
  items: { id: string; path: string }[],
  wantSelected: boolean
): Set<string> {
  const byId = new Map(items.map((i) => [i.id, i]));
  const target = byId.get(toggledId);
  if (!target) {
    const next = new Set(current);
    if (wantSelected) next.add(toggledId);
    else next.delete(toggledId);
    return next;
  }

  const next = new Set(current);

  if (!wantSelected) {
    next.delete(toggledId);
    return next;
  }

  // Selecting: add self, drop any selected descendants
  next.add(toggledId);
  for (const item of items) {
    if (item.id === toggledId) continue;
    if (isPathInside(item.path, target.path)) {
      next.delete(item.id);
    }
  }
  return next;
}

/**
 * Ids that are covered by a currently selected ancestor (should appear greyed).
 */
export function coveredBySelection(
  selectedIds: Set<string>,
  items: { id: string; path: string }[]
): Set<string> {
  const selectedItems = items.filter((i) => selectedIds.has(i.id));
  const covered = new Set<string>();
  for (const item of items) {
    if (selectedIds.has(item.id)) continue;
    if (selectedItems.some((sel) => isPathInside(item.path, sel.path))) {
      covered.add(item.id);
    }
  }
  return covered;
}
