import path from 'node:path';
import os from 'node:os';
import type { CleanItem, ClearResult } from './types.js';
import { pathExists, removePath } from './fsutil.js';

const HOME = os.homedir();

/** Absolute paths we refuse to delete even if somehow requested */
const FORBIDDEN_PREFIXES = [
  '/',
  '/home',
  '/usr',
  '/bin',
  '/sbin',
  '/etc',
  '/var',
  '/lib',
  '/boot',
  '/dev',
  '/proc',
  '/sys',
  '/root',
];

function isForbidden(target: string): boolean {
  const resolved = path.resolve(target);
  // Exact forbidden roots
  if (FORBIDDEN_PREFIXES.includes(resolved)) return true;
  // Never delete home itself
  if (resolved === path.resolve(HOME)) return true;
  // Never delete whole /tmp
  if (resolved === '/tmp') return true;
  // Must be under home, /tmp, or /workspace
  const allowedRoots = [
    path.resolve(HOME),
    '/tmp',
    '/workspace',
  ];
  const underAllowed = allowedRoots.some(
    (root) => resolved === root || resolved.startsWith(root + path.sep)
  );
  if (!underAllowed) return true;
  // For /tmp, only allow leaf leftovers (not nested system paths)
  if (resolved.startsWith('/tmp' + path.sep)) {
    const rel = resolved.slice('/tmp/'.length);
    if (!rel || rel.includes('..')) return true;
  }
  return false;
}

export async function clearItems(
  items: CleanItem[],
  demo: boolean
): Promise<ClearResult> {
  if (demo) {
    const freedBytes = items.reduce((s, i) => s + i.sizeBytes, 0);
    return {
      freedBytes,
      clearedIds: items.map((i) => i.id),
      errors: [],
      demo: true,
    };
  }

  const clearedIds: string[] = [];
  const errors: { id: string; message: string }[] = [];
  let freedBytes = 0;

  for (const item of items) {
    try {
      if (isForbidden(item.path)) {
        errors.push({ id: item.id, message: 'Path is protected and cannot be deleted' });
        continue;
      }
      if (!(await pathExists(item.path))) {
        // Already gone — count as success with 0 extra
        clearedIds.push(item.id);
        continue;
      }
      // For trash: clear children rather than removing the trash folder itself
      if (item.category === 'trash') {
        const { default: fs } = await import('node:fs');
        const entries = await fs.promises.readdir(item.path);
        for (const name of entries) {
          await removePath(path.join(item.path, name));
        }
        // Also clear trash info if sibling exists
        const infoDir = path.join(path.dirname(item.path), 'info');
        if (await pathExists(infoDir)) {
          const infos = await fs.promises.readdir(infoDir);
          for (const name of infos) {
            await removePath(path.join(infoDir, name));
          }
        }
      } else {
        await removePath(item.path);
      }
      freedBytes += item.sizeBytes;
      clearedIds.push(item.id);
    } catch (err) {
      errors.push({
        id: item.id,
        message: err instanceof Error ? err.message : 'Failed to remove',
      });
    }
  }

  return { freedBytes, clearedIds, errors, demo: false };
}
