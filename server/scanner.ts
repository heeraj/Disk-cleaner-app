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
import {
  makeAbortGate,
  throttleProgress,
  type ProgressReporter,
  type ScanProgress,
} from './progress.js';

const CATEGORY_META: Record<
  Exclude<CategoryId, 'large-files'>,
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

export interface LiveScanOptions {
  onProgress?: ProgressReporter;
  signal?: AbortSignal;
}

export async function liveScan(opts: LiveScanOptions = {}): Promise<ScanResult> {
  const report = throttleProgress(opts.onProgress);
  const gate = makeAbortGate(opts.signal);
  const items: CleanItem[] = [];
  const home = homeDir();
  let filesSeen = 0;
  let bytesSeen = 0;

  const phases: { id: string; label: string; weight: number }[] = [
    { id: 'caches', label: 'Scanning caches…', weight: 30 },
    { id: 'temp', label: 'Scanning temporary files…', weight: 15 },
    { id: 'trash', label: 'Checking trash…', weight: 10 },
    { id: 'downloads', label: 'Scanning downloads…', weight: 20 },
    { id: 'build', label: 'Looking for build artifacts…', weight: 20 },
    { id: 'finalize', label: 'Finishing…', weight: 5 },
  ];
  const totalWeight = phases.reduce((s, p) => s + p.weight, 0);
  let completedWeight = 0;

  function emit(
    phaseId: string,
    label: string,
    extra: Partial<ScanProgress> = {}
  ) {
    gate.throwIfAborted();
    const phaseMeta = phases.find((p) => p.id === phaseId);
    const within = Math.min(1, (extra.percent ?? 0) / 100);
    const base = completedWeight;
    const slice = phaseMeta?.weight ?? 0;
    const percent = Math.min(
      99,
      Math.round(((base + slice * within) / totalWeight) * 100)
    );
    report({
      phase: phaseId,
      percent: extra.percent === 100 && phaseId === 'finalize' ? 100 : percent,
      filesSeen,
      bytesSeen,
      message: label,
      ...extra,
      currentPath: extra.currentPath,
    });
  }

  function note(pathStr: string, size: number) {
    filesSeen += 1;
    bytesSeen += size;
  }

  // --- caches ---
  emit('caches', 'Scanning caches…', { percent: 0, currentPath: path.join(home, '.cache') });
  const cacheRoot = path.join(home, '.cache');
  if (await pathExists(cacheRoot)) {
    try {
      const entries = await fs.promises.readdir(cacheRoot, { withFileTypes: true });
      let i = 0;
      for (const ent of entries) {
        gate.throwIfAborted();
        if (!ent.isDirectory() || ent.name.startsWith('.')) continue;
        if (['keyrings', 'ms-playwright', 'puppeteer'].includes(ent.name)) continue;
        const full = path.join(cacheRoot, ent.name);
        emit('caches', `Cache: ${ent.name}`, {
          percent: Math.round((i / Math.max(1, entries.length)) * 70),
          currentPath: full,
        });
        const size = await dirSizeBytes(full, 5);
        note(full, size);
        if (size < 5 * 1024 * 1024) {
          i++;
          continue;
        }
        items.push({
          id: itemId('cache', full),
          name: `Cache: ${ent.name}`,
          path: full,
          sizeBytes: size,
          category: 'caches',
          safety: 'safe',
          description: displayPath(full),
        });
        i++;
      }
    } catch {
      /* ignore */
    }
  }

  const browserCacheHints = [
    path.join(home, '.cache', 'google-chrome'),
    path.join(home, '.cache', 'chromium'),
    path.join(home, '.cache', 'mozilla'),
    path.join(home, '.mozilla', 'firefox'),
  ];
  for (const full of browserCacheHints) {
    gate.throwIfAborted();
    if (!(await pathExists(full))) continue;
    if (items.some((it) => it.path === full)) continue;
    emit('caches', 'Browser caches…', { percent: 80, currentPath: full });
    const size = await dirSizeBytes(full, 4);
    note(full, size);
    if (size < 5 * 1024 * 1024) continue;
    items.push({
      id: itemId('cache', full),
      name: `Browser cache: ${path.basename(full)}`,
      path: full,
      sizeBytes: size,
      category: 'caches',
      safety: 'safe',
      description: displayPath(full),
    });
  }

  const npmCache = path.join(home, '.npm');
  if (await pathExists(npmCache)) {
    gate.throwIfAborted();
    emit('caches', 'npm cache…', { percent: 90, currentPath: npmCache });
    const size = await dirSizeBytes(npmCache, 5);
    note(npmCache, size);
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

  const pipCache = path.join(home, '.cache', 'pip');
  if (await pathExists(pipCache) && !items.some((it) => it.path === pipCache)) {
    gate.throwIfAborted();
    emit('caches', 'pip cache…', { percent: 95, currentPath: pipCache });
    const size = await dirSizeBytes(pipCache, 4);
    note(pipCache, size);
    if (size >= 5 * 1024 * 1024) {
      items.push({
        id: itemId('cache', pipCache),
        name: 'pip cache',
        path: pipCache,
        sizeBytes: size,
        category: 'caches',
        safety: 'safe',
        description: displayPath(pipCache),
      });
    }
  }
  completedWeight += 30;

  // --- temp ---
  emit('temp', 'Scanning temporary files…', { percent: 0, currentPath: '/tmp' });
  if (await pathExists('/tmp')) {
    try {
      const entries = await fs.promises.readdir('/tmp', { withFileTypes: true });
      let i = 0;
      for (const ent of entries) {
        gate.throwIfAborted();
        if (!matchesSafeTmp(ent.name)) continue;
        const full = path.join('/tmp', ent.name);
        emit('temp', ent.name, {
          percent: Math.round((i / Math.max(1, entries.length)) * 100),
          currentPath: full,
        });
        let size = 0;
        if (ent.isDirectory()) size = await dirSizeBytes(full, 4);
        else if (ent.isFile()) size = await fileSizeBytes(full);
        note(full, size);
        if (size < 256 * 1024) {
          i++;
          continue;
        }
        items.push({
          id: itemId('temp', full),
          name: ent.name,
          path: full,
          sizeBytes: size,
          category: 'temp',
          safety: 'safe',
          description: 'Temporary leftover',
        });
        i++;
      }
    } catch {
      /* ignore */
    }
  }
  completedWeight += 15;

  // --- trash ---
  emit('trash', 'Checking trash…', { percent: 0 });
  const trashFiles = path.join(home, '.local', 'share', 'Trash', 'files');
  if (await pathExists(trashFiles)) {
    gate.throwIfAborted();
    emit('trash', 'Trash contents…', { percent: 40, currentPath: trashFiles });
    const size = await dirSizeBytes(trashFiles, 6);
    note(trashFiles, size);
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
  completedWeight += 10;

  // --- downloads ---
  emit('downloads', 'Scanning downloads…', { percent: 0 });
  const downloads = path.join(home, 'Downloads');
  if (await pathExists(downloads)) {
    gate.throwIfAborted();
    emit('downloads', 'Large downloads…', { percent: 20, currentPath: downloads });
    const large = await listFiles(downloads, {
      minBytes: 20 * 1024 * 1024,
      maxEntries: 15,
    });
    for (const f of large) {
      gate.throwIfAborted();
      note(f.path, f.sizeBytes);
      emit('downloads', f.name, { percent: 60, currentPath: f.path });
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
  completedWeight += 20;

  // --- build artifacts ---
  emit('build', 'Looking for build artifacts…', { percent: 0 });
  const workspaceCandidates = [
    '/workspace',
    path.join(home, 'Projects'),
    path.join(home, 'projects'),
  ];
  for (const root of workspaceCandidates) {
    gate.throwIfAborted();
    if (!(await pathExists(root))) continue;
    try {
      emit('build', root, { percent: 10, currentPath: root });
      const top = await fs.promises.readdir(root, { withFileTypes: true });
      let i = 0;
      for (const ent of top) {
        gate.throwIfAborted();
        if (!ent.isDirectory()) continue;
        const nm = path.join(root, ent.name, 'node_modules');
        if (!(await pathExists(nm))) continue;
        emit('build', `${ent.name}/node_modules`, {
          percent: Math.round((i / Math.max(1, top.length)) * 100),
          currentPath: nm,
        });
        const size = await dirSizeBytes(nm, 4);
        note(nm, size);
        if (size < 10 * 1024 * 1024) {
          i++;
          continue;
        }
        items.push({
          id: itemId('build', nm),
          name: `${ent.name}/node_modules`,
          path: nm,
          sizeBytes: size,
          category: 'build-artifacts',
          safety: 'review',
          description: displayPath(nm),
        });
        i++;
      }
    } catch {
      /* ignore */
    }
  }
  completedWeight += 20;

  emit('finalize', 'Grouping results…', { percent: 50 });
  gate.throwIfAborted();

  const byCat = new Map<CategoryId, CleanItem[]>();
  for (const item of items) {
    const list = byCat.get(item.category) ?? [];
    list.push(item);
    byCat.set(item.category, list);
  }

  const order: Exclude<CategoryId, 'large-files'>[] = [
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

  completedWeight += 5;
  report({
    phase: 'done',
    percent: 100,
    filesSeen,
    bytesSeen,
    message: 'Scan complete',
  });

  return {
    scannedAt: new Date().toISOString(),
    demo: false,
    groups,
    totalReclaimableBytes: groups.reduce((s, g) => s + g.totalBytes, 0),
  };
}

let lastScanItems = new Map<string, CleanItem>();

/** Merge scan results into the remember map (keeps large-file finds across rescans). */
export function rememberScan(result: ScanResult): void {
  // Drop previous non-large items so stale safe/review ids cannot be cleared
  for (const [id, item] of [...lastScanItems.entries()]) {
    if (item.category !== 'large-files') lastScanItems.delete(id);
  }
  for (const g of result.groups) {
    for (const item of g.items) {
      lastScanItems.set(item.id, item);
    }
  }
}

export function rememberCleanItems(items: CleanItem[]): void {
  for (const item of items) lastScanItems.set(item.id, item);
}

export function forgetItems(ids: string[]): void {
  for (const id of ids) lastScanItems.delete(id);
}

export function getRememberedItems(ids: string[]): CleanItem[] {
  return ids
    .map((id) => lastScanItems.get(id))
    .filter((x): x is CleanItem => Boolean(x));
}

export function seedRemembered(items: CleanItem[]): void {
  for (const item of items) lastScanItems.set(item.id, item);
}

// silence unused type import warning in some tsc configs
