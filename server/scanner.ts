import path from 'node:path';
import fs from 'node:fs';
import type { CleanGroup, CleanItem, CategoryId, Safety, ScanResult } from './types.js';
import {
  dirSizeBytes,
  fileSizeBytes,
  homeDir,
  itemId,
  listFiles,
  pathExists,
} from './fsutil.js';

const CATEGORY_META: Record<
  CategoryId,
  { label: string; description: string; safety: Safety }
> = {
  caches: {
    label: 'Caches',
    description: 'App and package caches that rebuild automatically',
    safety: 'safe',
  },
  temp: {
    label: 'Temporary files',
    description: 'Leftover temp data under /tmp and home',
    safety: 'safe',
  },
  trash: {
    label: 'Trash',
    description: 'Items already in the trash',
    safety: 'safe',
  },
  logs: {
    label: 'Old logs',
    description: 'Rotated and leftover log files',
    safety: 'safe',
  },
  'large-downloads': {
    label: 'Large downloads',
    description: 'Review carefully — large files in Downloads',
    safety: 'review',
  },
  'build-artifacts': {
    label: 'Build artifacts',
    description: 'Review carefully — may break projects if removed',
    safety: 'review',
  },
};

function displayPath(abs: string): string {
  const home = homeDir();
  if (abs.startsWith(home)) return '~' + abs.slice(home.length);
  return abs;
}

function matchesSafeTmp(name: string): boolean {
  if (name.startsWith('.')) return false;
  return (
    name.startsWith('npm-') ||
    name.startsWith('vite-') ||
    name.startsWith('tmp.') ||
    name.endsWith('.tmp') ||
    name.endsWith('.log')
  );
}

export async function liveScan(): Promise<ScanResult> {
  const items: CleanItem[] = [];
  const home = homeDir();

  const cacheRoot = path.join(home, '.cache');
  if (await pathExists(cacheRoot)) {
    try {
      const entries = await fs.promises.readdir(cacheRoot, { withFileTypes: true });
      for (const ent of entries) {
        if (!ent.isDirectory() || ent.name.startsWith('.')) continue;
        if (['keyrings', 'ms-playwright', 'puppeteer'].includes(ent.name)) continue;
        const full = path.join(cacheRoot, ent.name);
        const size = await dirSizeBytes(full, 5);
        if (size < 5 * 1024 * 1024) continue;
        items.push({
          id: itemId('cache', full),
          name: `Cache: ${ent.name}`,
          path: full,
          sizeBytes: size,
          category: 'caches',
          safety: 'safe',
          description: displayPath(full),
        });
      }
    } catch {
      /* ignore */
    }
  }

  const npmCache = path.join(home, '.npm');
  if (await pathExists(npmCache)) {
    const size = await dirSizeBytes(npmCache, 5);
    if (size >= 5 * 1024 * 1024) {
      items.push({
        id: itemId('cache', npmCache),
        name: 'npm cache',
        path: npmCache,
        sizeBytes: size,
        category: 'caches',
        safety: 'safe',
        description: displayPath(npmCache),
      });
    }
  }

  if (await pathExists('/tmp')) {
    try {
      const entries = await fs.promises.readdir('/tmp', { withFileTypes: true });
      for (const ent of entries) {
        if (!matchesSafeTmp(ent.name)) continue;
        const full = path.join('/tmp', ent.name);
        let size = 0;
        if (ent.isDirectory()) size = await dirSizeBytes(full, 4);
        else if (ent.isFile()) size = await fileSizeBytes(full);
        if (size < 256 * 1024) continue;
        items.push({
          id: itemId('temp', full),
          name: ent.name,
          path: full,
          sizeBytes: size,
          category: 'temp',
          safety: 'safe',
          description: 'Temporary leftover',
        });
      }
    } catch {
      /* ignore */
    }
  }

  const trashFiles = path.join(home, '.local', 'share', 'Trash', 'files');
  if (await pathExists(trashFiles)) {
    const size = await dirSizeBytes(trashFiles, 6);
    if (size > 0) {
      items.push({
        id: itemId('trash', trashFiles),
        name: 'Trash contents',
        path: trashFiles,
        sizeBytes: size,
        category: 'trash',
        safety: 'safe',
        description: displayPath(trashFiles),
      });
    }
  }

  const downloads = path.join(home, 'Downloads');
  if (await pathExists(downloads)) {
    const large = await listFiles(downloads, {
      minBytes: 20 * 1024 * 1024,
      maxEntries: 15,
    });
    for (const f of large) {
      items.push({
        id: itemId('dl', f.path),
        name: f.name,
        path: f.path,
        sizeBytes: f.sizeBytes,
        category: 'large-downloads',
        safety: 'review',
        description: displayPath(f.path),
      });
    }
  }

  const workspaceCandidates = [
    '/workspace',
    path.join(home, 'Projects'),
    path.join(home, 'projects'),
  ];
  for (const root of workspaceCandidates) {
    if (!(await pathExists(root))) continue;
    try {
      const top = await fs.promises.readdir(root, { withFileTypes: true });
      for (const ent of top) {
        if (!ent.isDirectory()) continue;
        const nm = path.join(root, ent.name, 'node_modules');
        if (!(await pathExists(nm))) continue;
        const size = await dirSizeBytes(nm, 4);
        if (size < 10 * 1024 * 1024) continue;
        items.push({
          id: itemId('build', nm),
          name: `${ent.name}/node_modules`,
          path: nm,
          sizeBytes: size,
          category: 'build-artifacts',
          safety: 'review',
          description: displayPath(nm),
        });
      }
    } catch {
      /* ignore */
    }
  }

  const byCat = new Map<CategoryId, CleanItem[]>();
  for (const item of items) {
    const list = byCat.get(item.category) ?? [];
    list.push(item);
    byCat.set(item.category, list);
  }

  const order: CategoryId[] = [
    'caches',
    'temp',
    'trash',
    'logs',
    'large-downloads',
    'build-artifacts',
  ];

  const groups: CleanGroup[] = [];
  for (const id of order) {
    const list = byCat.get(id);
    if (!list || list.length === 0) continue;
    list.sort((a, b) => b.sizeBytes - a.sizeBytes);
    const meta = CATEGORY_META[id];
    groups.push({
      id,
      label: meta.label,
      description: meta.description,
      safety: meta.safety,
      totalBytes: list.reduce((s, i) => s + i.sizeBytes, 0),
      items: list,
    });
  }

  return {
    scannedAt: new Date().toISOString(),
    demo: false,
    groups,
    totalReclaimableBytes: groups.reduce((s, g) => s + g.totalBytes, 0),
  };
}

let lastScanItems = new Map<string, CleanItem>();

export function rememberScan(result: ScanResult): void {
  lastScanItems = new Map();
  for (const g of result.groups) {
    for (const item of g.items) {
      lastScanItems.set(item.id, item);
    }
  }
}

export function getRememberedItems(ids: string[]): CleanItem[] {
  return ids
    .map((id) => lastScanItems.get(id))
    .filter((x): x is CleanItem => Boolean(x));
}

export function seedRemembered(items: CleanItem[]): void {
  for (const item of items) lastScanItems.set(item.id, item);
}
