import fs from 'node:fs';
import path from 'node:path';
import type { CleanItem, LargeFindResult, LargeItem } from './types.js';
import {
  dirSizeBytes,
  homeDir,
  itemId,
  pathExists,
} from './fsutil.js';

export interface LargeScanOptions {
  roots?: string[];
  minBytes?: number;
  maxDepth?: number;
  maxItems?: number;
  maxMs?: number;
}

function displayPath(abs: string): string {
  const home = homeDir();
  if (abs.startsWith(home)) return '~' + abs.slice(home.length);
  return abs;
}

export async function defaultLargeRoots(): Promise<string[]> {
  const home = homeDir();
  const candidates = [
    home,
    path.join(home, 'Downloads'),
    path.join(home, 'Desktop'),
  ];
  const roots: string[] = [];
  for (const c of candidates) {
    if (await pathExists(c)) roots.push(c);
  }
  // Prefer unique existing roots; if only home, that's fine
  return [...new Set(roots.map((r) => path.resolve(r)))];
}

/**
 * Bounded scan for large files and folders under chosen roots.
 * Depth / time / count caps keep it usable on big disks.
 */
export async function findLargeItems(
  opts: LargeScanOptions = {}
): Promise<LargeFindResult> {
  const minBytes = opts.minBytes ?? 50 * 1024 * 1024;
  const maxDepth = opts.maxDepth ?? 4;
  const maxItems = opts.maxItems ?? 80;
  const maxMs = opts.maxMs ?? 12_000;
  const roots =
    opts.roots && opts.roots.length > 0
      ? opts.roots.map((r) => path.resolve(r))
      : await defaultLargeRoots();

  const started = Date.now();
  const found: LargeItem[] = [];
  let truncated = false;

  const skipNames = new Set([
    'node_modules',
    '.git',
    '.cache',
    'proc',
    'sys',
    'dev',
    '.Trash',
    'Trash',
  ]);

  async function walk(dir: string, depth: number): Promise<void> {
    if (Date.now() - started > maxMs) {
      truncated = true;
      return;
    }
    if (depth > maxDepth) return;

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const ent of entries) {
      if (Date.now() - started > maxMs) {
        truncated = true;
        return;
      }
      if (ent.name.startsWith('.') && depth === 0 && ent.name !== '.local') {
        // Still allow walking home children; skip dotfiles at deeper levels for speed
      }
      if (skipNames.has(ent.name)) continue;
      if (ent.name.startsWith('.') && depth > 0) continue;

      const full = path.join(dir, ent.name);
      try {
        if (ent.isSymbolicLink()) continue;

        if (ent.isFile()) {
          const st = await fs.promises.lstat(full);
          if (st.size >= minBytes) {
            const cleanId = itemId('large', full);
            found.push({
              id: cleanId,
              cleanId,
              name: ent.name,
              path: full,
              sizeBytes: st.size,
              kind: 'file',
              mtimeMs: st.mtimeMs,
            });
          }
        } else if (ent.isDirectory()) {
          // Size this directory with a tight depth budget
          const size = await dirSizeBytes(full, Math.min(5, maxDepth - depth + 2));
          if (size >= minBytes) {
            const cleanId = itemId('large', full);
            let mtimeMs: number | undefined;
            try {
              mtimeMs = (await fs.promises.lstat(full)).mtimeMs;
            } catch {
              mtimeMs = undefined;
            }
            found.push({
              id: cleanId,
              cleanId,
              name: ent.name,
              path: full,
              sizeBytes: size,
              kind: 'dir',
              mtimeMs,
            });
          }
          if (depth < maxDepth) {
            await walk(full, depth + 1);
          }
        }
      } catch {
        /* skip unreadable */
      }
    }
  }

  for (const root of roots) {
    if (!(await pathExists(root))) continue;
    // Don't add the root itself as a hit; walk its children
    const st = await fs.promises.lstat(root).catch(() => null);
    if (!st) continue;
    if (st.isDirectory()) {
      await walk(root, 0);
    } else if (st.isFile() && st.size >= minBytes) {
      const cleanId = itemId('large', root);
      found.push({
        id: cleanId,
        cleanId,
        name: path.basename(root),
        path: root,
        sizeBytes: st.size,
        kind: 'file',
        mtimeMs: st.mtimeMs,
      });
    }
    if (truncated) break;
  }

  // Deduplicate by path (a large dir and its parent may both appear — keep larger unique paths)
  const byPath = new Map<string, LargeItem>();
  for (const item of found) {
    const prev = byPath.get(item.path);
    if (!prev || item.sizeBytes > prev.sizeBytes) byPath.set(item.path, item);
  }

  const items = [...byPath.values()]
    .sort((a, b) => b.sizeBytes - a.sizeBytes)
    .slice(0, maxItems);

  if (byPath.size > maxItems) truncated = true;

  return {
    scannedAt: new Date().toISOString(),
    demo: false,
    roots,
    minBytes,
    truncated,
    items,
    totalBytes: items.reduce((s, i) => s + i.sizeBytes, 0),
  };
}

export function largeItemsToCleanItems(items: LargeItem[]): CleanItem[] {
  return items.map((item) => ({
    id: item.cleanId,
    name: item.name,
    path: item.path,
    sizeBytes: item.sizeBytes,
    category: 'large-files' as const,
    safety: 'review' as const,
    description: `${item.kind === 'dir' ? 'Folder' : 'File'} · ${displayPath(item.path)}`,
  }));
}



/** List immediate children of a folder (bounded) for drill-in without delete. */
export async function listDirChildren(
  dirPath: string,
  opts: { maxItems?: number; maxMs?: number } = {}
): Promise<import('./types.js').ListDirResult> {
  const maxItems = opts.maxItems ?? 120;
  const maxMs = opts.maxMs ?? 8_000;
  const started = Date.now();
  const abs = path.resolve(dirPath);
  const children: import('./types.js').DirChild[] = [];
  let truncated = false;

  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(abs, { withFileTypes: true });
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : 'Could not read folder'
    );
  }

  for (const ent of entries) {
    if (Date.now() - started > maxMs || children.length >= maxItems) {
      truncated = true;
      break;
    }
    if (ent.name === '.' || ent.name === '..') continue;
    const full = path.join(abs, ent.name);
    try {
      if (ent.isSymbolicLink()) continue;
      if (ent.isFile()) {
        const st = await fs.promises.lstat(full);
        children.push({
          name: ent.name,
          path: full,
          sizeBytes: st.size,
          kind: 'file',
          mtimeMs: st.mtimeMs,
        });
      } else if (ent.isDirectory()) {
        const size = await dirSizeBytes(full, 3);
        let mtimeMs: number | undefined;
        try {
          mtimeMs = (await fs.promises.lstat(full)).mtimeMs;
        } catch {
          mtimeMs = undefined;
        }
        children.push({
          name: ent.name,
          path: full,
          sizeBytes: size,
          kind: 'dir',
          mtimeMs,
        });
      }
    } catch {
      /* skip */
    }
  }

  children.sort((a, b) => b.sizeBytes - a.sizeBytes);

  return {
    path: abs,
    truncated,
    children,
    demo: false,
  };
}

export function demoLargeFind(): LargeFindResult {
  const home = homeDir();
  const items: LargeItem[] = [
    {
      id: itemId('large', path.join(home, 'Downloads', 'ubuntu.iso')),
      cleanId: itemId('large', path.join(home, 'Downloads', 'ubuntu.iso')),
      name: 'ubuntu.iso',
      path: path.join(home, 'Downloads', 'ubuntu.iso'),
      sizeBytes: 5_800_000_000,
      kind: 'file',
      mtimeMs: Date.now() - 90 * 86400000,
    },
    {
      id: itemId('large', path.join(home, 'Videos')),
      cleanId: itemId('large', path.join(home, 'Videos')),
      name: 'Videos',
      path: path.join(home, 'Videos'),
      sizeBytes: 12_400_000_000,
      kind: 'dir',
      mtimeMs: Date.now() - 200 * 86400000,
    },
    {
      id: itemId('large', path.join(home, 'Downloads', 'dataset.zip')),
      cleanId: itemId('large', path.join(home, 'Downloads', 'dataset.zip')),
      name: 'dataset.zip',
      path: path.join(home, 'Downloads', 'dataset.zip'),
      sizeBytes: 2_100_000_000,
      kind: 'file',
      mtimeMs: Date.now() - 30 * 86400000,
    },
    {
      id: itemId('large', path.join(home, 'Projects', 'old-ml', 'checkpoints')),
      cleanId: itemId('large', path.join(home, 'Projects', 'old-ml', 'checkpoints')),
      name: 'checkpoints',
      path: path.join(home, 'Projects', 'old-ml', 'checkpoints'),
      sizeBytes: 8_200_000_000,
      kind: 'dir',
      mtimeMs: Date.now() - 400 * 86400000,
    },
  ];
  return {
    scannedAt: new Date().toISOString(),
    demo: true,
    roots: [home, path.join(home, 'Downloads'), path.join(home, 'Desktop')],
    minBytes: 50 * 1024 * 1024,
    truncated: false,
    items: items.sort((a, b) => b.sizeBytes - a.sizeBytes),
    totalBytes: items.reduce((s, i) => s + i.sizeBytes, 0),
  };
}
