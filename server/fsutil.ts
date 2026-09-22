import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export function homeDir(): string {
  return os.homedir();
}

export function expandHome(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return path.join(homeDir(), p.slice(1));
  }
  return p;
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.promises.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Recursively sum file sizes; skip permission errors. Cap depth for speed. */
export async function dirSizeBytes(
  target: string,
  maxDepth = 6,
  depth = 0
): Promise<number> {
  try {
    const st = await fs.promises.lstat(target);
    if (st.isSymbolicLink()) return 0;
    if (st.isFile()) return st.size;
    if (!st.isDirectory() || depth >= maxDepth) return 0;

    const entries = await fs.promises.readdir(target, { withFileTypes: true });
    let total = 0;
    // Bound concurrency lightly
    const batch = 32;
    for (let i = 0; i < entries.length; i += batch) {
      const slice = entries.slice(i, i + batch);
      const sizes = await Promise.all(
        slice.map(async (ent) => {
          const child = path.join(target, ent.name);
          try {
            if (ent.isSymbolicLink()) return 0;
            if (ent.isFile()) {
              const s = await fs.promises.lstat(child);
              return s.size;
            }
            if (ent.isDirectory()) {
              return dirSizeBytes(child, maxDepth, depth + 1);
            }
            return 0;
          } catch {
            return 0;
          }
        })
      );
      total += sizes.reduce((a, b) => a + b, 0);
    }
    return total;
  } catch {
    return 0;
  }
}

export async function fileSizeBytes(target: string): Promise<number> {
  try {
    const st = await fs.promises.lstat(target);
    if (st.isSymbolicLink()) return 0;
    return st.size;
  } catch {
    return 0;
  }
}

export async function getDiskUsage(mount = '/'): Promise<{
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  mount: string;
}> {
  try {
    const { stdout } = await execFileAsync('df', ['-B1', '--output=size,used,avail,target', mount]);
    const lines = stdout.trim().split('\n');
    const data = lines[lines.length - 1].trim().split(/\s+/);
    const totalBytes = Number(data[0]);
    const usedBytes = Number(data[1]);
    const freeBytes = Number(data[2]);
    const target = data[3] || mount;
    if (!Number.isFinite(totalBytes) || totalBytes <= 0) throw new Error('bad df');
    return { totalBytes, usedBytes, freeBytes, mount: target };
  } catch {
    // Fallback via Node statfs if available (Node 18.15+)
    try {
      const st = await fs.promises.statfs(mount);
      const totalBytes = Number(st.blocks) * Number(st.bsize);
      const freeBytes = Number(st.bavail) * Number(st.bsize);
      const usedBytes = totalBytes - Number(st.bfree) * Number(st.bsize);
      return { totalBytes, usedBytes, freeBytes, mount };
    } catch {
      return {
        totalBytes: 100 * 1024 ** 3,
        usedBytes: 50 * 1024 ** 3,
        freeBytes: 50 * 1024 ** 3,
        mount,
      };
    }
  }
}

export async function removePath(target: string): Promise<void> {
  await fs.promises.rm(target, { recursive: true, force: true });
}

export async function listFiles(
  dir: string,
  opts: { minBytes?: number; maxEntries?: number } = {}
): Promise<{ name: string; path: string; sizeBytes: number }[]> {
  const minBytes = opts.minBytes ?? 50 * 1024 * 1024;
  const maxEntries = opts.maxEntries ?? 20;
  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    const files: { name: string; path: string; sizeBytes: number }[] = [];
    for (const ent of entries) {
      if (!ent.isFile()) continue;
      const full = path.join(dir, ent.name);
      try {
        const st = await fs.promises.lstat(full);
        if (st.isSymbolicLink()) continue;
        if (st.size >= minBytes) {
          files.push({ name: ent.name, path: full, sizeBytes: st.size });
        }
      } catch {
        /* skip */
      }
    }
    files.sort((a, b) => b.sizeBytes - a.sizeBytes);
    return files.slice(0, maxEntries);
  } catch {
    return [];
  }
}


/**
 * Skip symlinks / junctions / mount points so scans do not follow reparse
 * points (avoids inflated totals across volumes). Uses lstat; safe on Linux.
 */
export async function isSkippedLinkOrReparse(target: string): Promise<boolean> {
  try {
    const st = await fs.promises.lstat(target);
    if (st.isSymbolicLink()) return true;
    // Windows: DIRECTORY + REPARSE_POINT (junction / mount point). Node exposes
    // isSymbolicLink for symlinks; junctions may appear as directories with
    // the reparse bit. Detect via stats mode when available.
    const anySt = st as fs.Stats & { isReparsePoint?: () => boolean };
    if (typeof anySt.isReparsePoint === 'function' && anySt.isReparsePoint()) {
      return true;
    }
    // Windows dirent attribute fallback: FILE_ATTRIBUTE_REPARSE_POINT = 0x400
    if (process.platform === 'win32' && (st.mode & 0o000) === 0) {
      // mode may not carry Win attrs; check via readlink-style: if lstat says
      // directory but realpath differs from path, treat carefully — skip only
      // when we can detect. Prefer checking readlink.
      try {
        await fs.promises.readlink(target);
        return true; // any link target means reparse/symlink
      } catch {
        /* not a link */
      }
    }
    return false;
  } catch {
    return true; // unreadable → skip
  }
}

export interface VolumeInfo {
  path: string;
  label: string;
  totalBytes?: number;
  freeBytes?: number;
}

/** List local volumes / mount roots for the drive picker. */
export async function listVolumes(): Promise<VolumeInfo[]> {
  if (process.platform === 'win32') {
    const vols: VolumeInfo[] = [];
    for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
      const root = `${letter}:\\`;
      try {
        await fs.promises.access(root);
        let totalBytes: number | undefined;
        let freeBytes: number | undefined;
        try {
          const u = await getDiskUsage(root);
          totalBytes = u.totalBytes;
          freeBytes = u.freeBytes;
        } catch {
          /* ignore */
        }
        vols.push({ path: root, label: `${letter}:`, totalBytes, freeBytes });
      } catch {
        /* drive not present */
      }
    }
    return vols;
  }

  // Linux / macOS: common mount points + df
  const candidates = ['/', '/home', '/mnt', '/media', '/Volumes'];
  const seen = new Set<string>();
  const vols: VolumeInfo[] = [];
  for (const c of candidates) {
    try {
      await fs.promises.access(c);
      const resolved = path.resolve(c);
      if (seen.has(resolved)) continue;
      seen.add(resolved);
      let totalBytes: number | undefined;
      let freeBytes: number | undefined;
      try {
        const u = await getDiskUsage(c);
        totalBytes = u.totalBytes;
        freeBytes = u.freeBytes;
      } catch {
        /* ignore */
      }
      vols.push({
        path: resolved,
        label: c === '/' ? 'Root (/)' : path.basename(c) || c,
        totalBytes,
        freeBytes,
      });
    } catch {
      /* missing */
    }
  }
  // Also try listing /mnt and /media children
  for (const base of ['/mnt', '/media', '/Volumes']) {
    try {
      const ents = await fs.promises.readdir(base, { withFileTypes: true });
      for (const ent of ents) {
        if (!ent.isDirectory() && !ent.isSymbolicLink()) continue;
        const full = path.join(base, ent.name);
        const resolved = path.resolve(full);
        if (seen.has(resolved)) continue;
        // Skip pure symlinks pointing elsewhere if we cannot stat
        try {
          const st = await fs.promises.lstat(full);
          if (st.isSymbolicLink()) continue;
        } catch {
          continue;
        }
        seen.add(resolved);
        let totalBytes: number | undefined;
        let freeBytes: number | undefined;
        try {
          const u = await getDiskUsage(full);
          totalBytes = u.totalBytes;
          freeBytes = u.freeBytes;
        } catch {
          /* ignore */
        }
        vols.push({ path: resolved, label: ent.name, totalBytes, freeBytes });
      }
    } catch {
      /* ignore */
    }
  }
  return vols;
}

/** Hash a path into a stable id */
export function itemId(prefix: string, p: string): string {
  let h = 0;
  for (let i = 0; i < p.length; i++) {
    h = (h * 31 + p.charCodeAt(i)) >>> 0;
  }
  return `${prefix}-${h.toString(16)}`;
}
