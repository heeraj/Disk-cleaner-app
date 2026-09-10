import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Response } from 'express';
import { demoDiskUsage, demoScan } from './demo.js';
import { getDiskUsage, expandHome, pathExists } from './fsutil.js';
import {
  forgetItems,
  getRememberedItems,
  liveScan,
  rememberCleanItems,
  rememberScan,
  seedRemembered,
} from './scanner.js';
import { clearItems } from './cleaner.js';
import {
  defaultLargeRoots,
  demoLargeFind,
  findLargeItems,
  largeItemsToCleanItems,
  listDirChildren,
} from './largeScan.js';
import { readPrefs, writePrefs } from './prefs.js';
import { ScanAbortedError, type ScanProgress } from './progress.js';
import type { AppPrefs, LargeFindResult, ScanResult } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8787;
const DEMO_MODE =
  process.env.DEMO_MODE === '1' ||
  process.env.DEMO_MODE === 'true' ||
  process.env.DEMO_MODE === 'yes';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, demo: DEMO_MODE });
});

app.get('/api/disk', async (_req, res) => {
  try {
    if (DEMO_MODE) {
      res.json(demoDiskUsage());
      return;
    }
    const usage = await getDiskUsage('/');
    res.json({ ...usage, demo: false });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to read disk usage',
    });
  }
});

function wantsSSE(req: express.Request): boolean {
  const accept = String(req.headers.accept || '');
  return accept.includes('text/event-stream');
}

function initSSE(res: Response): void {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  // Flush headers if available
  (res as Response & { flushHeaders?: () => void }).flushHeaders?.();
}

function sseSend(res: Response, event: string, data: unknown): void {
  if (res.writableEnded) return;
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function attachAbort(req: express.Request, res: Response): AbortController {
  const ac = new AbortController();
  // IMPORTANT: do not use req "close" on POST — it fires when the body is consumed,
  // which would cancel the scan immediately. Abort only if the client drops the response.
  const onClientGone = () => {
    if (!res.writableFinished && !ac.signal.aborted) ac.abort();
  };
  res.on('close', onClientGone);
  req.socket?.on('error', onClientGone);
  return ac;
}

async function simulateDemoProgress(
  report: (p: ScanProgress) => void,
  signal: AbortSignal,
  kind: 'clean' | 'large'
): Promise<void> {
  const steps =
    kind === 'clean'
      ? [
          { phase: 'caches', message: 'Scanning caches…', path: '~/.cache', pct: 15 },
          { phase: 'temp', message: 'Scanning temporary files…', path: '/tmp', pct: 35 },
          { phase: 'trash', message: 'Checking trash…', path: '~/.local/share/Trash', pct: 50 },
          { phase: 'downloads', message: 'Scanning downloads…', path: '~/Downloads', pct: 70 },
          { phase: 'build', message: 'Looking for build artifacts…', path: '~/Projects', pct: 88 },
          { phase: 'finalize', message: 'Grouping results…', pct: 96 },
        ]
      : [
          { phase: 'start', message: 'Starting large-item scan…', path: '~', pct: 5 },
          { phase: 'walk', message: 'Walking Downloads…', path: '~/Downloads', pct: 30 },
          { phase: 'found', message: 'Found ubuntu.iso', path: '~/Downloads/ubuntu.iso', pct: 55 },
          { phase: 'walk', message: 'Walking Videos…', path: '~/Videos', pct: 75 },
          { phase: 'finalize', message: 'Sorting results…', pct: 95 },
        ];
  for (const step of steps) {
    if (signal.aborted) throw new ScanAbortedError();
    report({
      phase: step.phase,
      percent: step.pct,
      currentPath: step.path,
      filesSeen: Math.round(step.pct * 3),
      bytesSeen: step.pct * 12_000_000,
      message: step.message,
    });
    await new Promise((r) => setTimeout(r, DEMO_MODE ? 180 : 120));
  }
}

async function runCleanScan(
  report: ((p: ScanProgress) => void) | undefined,
  signal: AbortSignal
): Promise<ScanResult> {
  if (DEMO_MODE) {
    if (report) await simulateDemoProgress(report, signal, 'clean');
    else await new Promise((r) => setTimeout(r, 900));
    if (signal.aborted) throw new ScanAbortedError();
    return demoScan();
  }
  return liveScan({ onProgress: report, signal });
}

async function runLargeFind(
  body: Record<string, unknown>,
  report: ((p: ScanProgress) => void) | undefined,
  signal: AbortSignal
): Promise<LargeFindResult> {
  const minBytes =
    typeof body.minBytes === 'number' && body.minBytes > 0
      ? body.minBytes
      : 50 * 1024 * 1024;
  const maxDepth =
    typeof body.maxDepth === 'number' ? Math.min(8, Math.max(1, body.maxDepth)) : 4;
  const maxItems =
    typeof body.maxItems === 'number' ? Math.min(200, Math.max(1, body.maxItems)) : 80;
  const maxMs =
    typeof body.maxMs === 'number' ? Math.min(60_000, Math.max(1000, body.maxMs)) : 12_000;

  let roots: string[] | undefined;
  if (Array.isArray(body.roots) && body.roots.length > 0) {
    roots = [];
    for (const r of body.roots) {
      if (typeof r !== 'string') continue;
      const expanded = path.resolve(expandHome(r));
      if (await pathExists(expanded)) roots.push(expanded);
    }
    if (roots.length === 0) {
      throw Object.assign(new Error('None of the provided roots exist'), { status: 400 });
    }
  }

  if (DEMO_MODE) {
    if (report) await simulateDemoProgress(report, signal, 'large');
    else await new Promise((r) => setTimeout(r, 600));
    if (signal.aborted) throw new ScanAbortedError();
    return demoLargeFind();
  }
  return findLargeItems({
    roots,
    minBytes,
    maxDepth,
    maxItems,
    maxMs,
    onProgress: report,
    signal,
  });
}

app.post('/api/scan', async (req, res) => {
  const ac = attachAbort(req, res);
  try {
    if (wantsSSE(req)) {
      initSSE(res);
      const report = (p: ScanProgress) => sseSend(res, 'progress', p);
      const result = await runCleanScan(report, ac.signal);
      rememberScan(result);
      if (DEMO_MODE) seedRemembered(result.groups.flatMap((g) => g.items));
      await writePrefs({ lastScanAt: result.scannedAt });
      sseSend(res, 'result', result);
      res.end();
      return;
    }
    const result = await runCleanScan(undefined, ac.signal);
    rememberScan(result);
    if (DEMO_MODE) seedRemembered(result.groups.flatMap((g) => g.items));
    await writePrefs({ lastScanAt: result.scannedAt });
    res.json(result);
  } catch (err) {
    if (err instanceof ScanAbortedError) {
      if (wantsSSE(req) && !res.headersSent) initSSE(res);
      if (wantsSSE(req) && !res.writableEnded) {
        sseSend(res, 'cancelled', { message: 'Scan cancelled' });
        res.end();
        return;
      }
      if (!res.headersSent) res.status(499).json({ error: 'Scan cancelled' });
      return;
    }
    const msg = err instanceof Error ? err.message : 'Scan failed';
    if (wantsSSE(req)) {
      if (!res.headersSent) initSSE(res);
      if (!res.writableEnded) {
        sseSend(res, 'error', { error: msg });
        res.end();
      }
      return;
    }
    res.status(500).json({ error: msg });
  }
});

app.post('/api/scan/stream', async (req, res) => {
  req.headers.accept = 'text/event-stream';
  // Reuse handler logic via direct call pattern — duplicate thin wrapper
  const ac = attachAbort(req, res);
  try {
    initSSE(res);
    const report = (p: ScanProgress) => sseSend(res, 'progress', p);
    const result = await runCleanScan(report, ac.signal);
    rememberScan(result);
    if (DEMO_MODE) seedRemembered(result.groups.flatMap((g) => g.items));
    await writePrefs({ lastScanAt: result.scannedAt });
    sseSend(res, 'result', result);
    res.end();
  } catch (err) {
    if (err instanceof ScanAbortedError) {
      if (!res.writableEnded) {
        sseSend(res, 'cancelled', { message: 'Scan cancelled' });
        res.end();
      }
      return;
    }
    const msg = err instanceof Error ? err.message : 'Scan failed';
    if (!res.headersSent) initSSE(res);
    if (!res.writableEnded) {
      sseSend(res, 'error', { error: msg });
      res.end();
    }
  }
});

app.post('/api/large-scan', async (req, res) => {
  const ac = attachAbort(req, res);
  const body = (req.body ?? {}) as Record<string, unknown>;
  try {
    if (wantsSSE(req)) {
      initSSE(res);
      const report = (p: ScanProgress) => sseSend(res, 'progress', p);
      const result = await runLargeFind(body, report, ac.signal);
      rememberCleanItems(largeItemsToCleanItems(result.items));
      await writePrefs({ lastScanAt: result.scannedAt });
      sseSend(res, 'result', result);
      res.end();
      return;
    }
    const result = await runLargeFind(body, undefined, ac.signal);
    rememberCleanItems(largeItemsToCleanItems(result.items));
    await writePrefs({ lastScanAt: result.scannedAt });
    res.json(result);
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (err instanceof ScanAbortedError) {
      if (wantsSSE(req) && !res.headersSent) initSSE(res);
      if (wantsSSE(req) && !res.writableEnded) {
        sseSend(res, 'cancelled', { message: 'Scan cancelled' });
        res.end();
        return;
      }
      if (!res.headersSent) res.status(499).json({ error: 'Scan cancelled' });
      return;
    }
    const msg = err instanceof Error ? err.message : 'Large scan failed';
    if (wantsSSE(req)) {
      if (!res.headersSent) initSSE(res);
      if (!res.writableEnded) {
        sseSend(res, 'error', { error: msg });
        res.end();
      }
      return;
    }
    res.status(status && status >= 400 ? status : 500).json({ error: msg });
  }
});

app.post('/api/large-scan/stream', async (req, res) => {
  const ac = attachAbort(req, res);
  const body = (req.body ?? {}) as Record<string, unknown>;
  try {
    initSSE(res);
    const report = (p: ScanProgress) => sseSend(res, 'progress', p);
    const result = await runLargeFind(body, report, ac.signal);
    rememberCleanItems(largeItemsToCleanItems(result.items));
    await writePrefs({ lastScanAt: result.scannedAt });
    sseSend(res, 'result', result);
    res.end();
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (err instanceof ScanAbortedError) {
      if (!res.writableEnded) {
        sseSend(res, 'cancelled', { message: 'Scan cancelled' });
        res.end();
      }
      return;
    }
    const msg = err instanceof Error ? err.message : 'Large scan failed';
    if (status === 400) {
      if (!res.writableEnded) {
        sseSend(res, 'error', { error: msg });
        res.end();
      }
      return;
    }
    if (!res.headersSent) initSSE(res);
    if (!res.writableEnded) {
      sseSend(res, 'error', { error: msg });
      res.end();
    }
  }
});

app.post('/api/list-dir', async (req, res) => {
  try {
    const body = req.body ?? {};
    const dirPath = typeof body.path === 'string' ? body.path.trim() : '';
    if (!dirPath) {
      res.status(400).json({ error: 'Provide a folder path' });
      return;
    }
    if (DEMO_MODE) {
      const home = (await import('./fsutil.js')).homeDir();
      res.json({
        path: path.resolve(expandHome(dirPath)),
        truncated: false,
        demo: true,
        children: [
          {
            name: 'sample-large.bin',
            path: path.join(home, 'sample-large.bin'),
            sizeBytes: 900_000_000,
            kind: 'file',
            mtimeMs: Date.now() - 10 * 86400000,
          },
          {
            name: 'old-backup',
            path: path.join(home, 'old-backup'),
            sizeBytes: 3_200_000_000,
            kind: 'dir',
            mtimeMs: Date.now() - 400 * 86400000,
          },
        ],
      });
      return;
    }
    const expanded = path.resolve(expandHome(dirPath));
    if (!(await pathExists(expanded))) {
      res.status(404).json({ error: 'Folder not found' });
      return;
    }
    const result = await listDirChildren(expanded);
    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to list folder',
    });
  }
});

app.get('/api/large-roots', async (_req, res) => {
  try {
    if (DEMO_MODE) {
      const home = (await import('./fsutil.js')).homeDir();
      res.json({
        roots: [home, path.join(home, 'Downloads'), path.join(home, 'Desktop')],
        demo: true,
      });
      return;
    }
    res.json({ roots: await defaultLargeRoots(), demo: false });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to list roots',
    });
  }
});

app.post('/api/clear', async (req, res) => {
  try {
    const { ids, confirm } = req.body ?? {};
    if (!confirm) {
      res.status(400).json({
        error: 'Clear requires confirm: true — nothing was deleted',
      });
      return;
    }
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'Provide a non-empty ids array' });
      return;
    }
    if (!ids.every((id: unknown) => typeof id === 'string')) {
      res.status(400).json({ error: 'All ids must be strings' });
      return;
    }

    let items = getRememberedItems(ids as string[]);
    if (DEMO_MODE && items.length === 0) {
      const scan = demoScan();
      seedRemembered(scan.groups.flatMap((g) => g.items));
      const large = demoLargeFind();
      rememberCleanItems(largeItemsToCleanItems(large.items));
      items = getRememberedItems(ids as string[]);
    }

    const missing = (ids as string[]).filter(
      (id) => !items.find((i) => i.id === id)
    );
    if (missing.length) {
      res.status(400).json({
        error: 'Unknown item ids — run a scan first',
        missing,
      });
      return;
    }

    const result = await clearItems(items, DEMO_MODE);
    forgetItems(result.clearedIds);
    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Clear failed',
    });
  }
});

app.get('/api/prefs', async (_req, res) => {
  try {
    const prefs = await readPrefs();
    res.json(prefs);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to read prefs',
    });
  }
});

app.put('/api/prefs', async (req, res) => {
  try {
    const body = (req.body ?? {}) as Partial<AppPrefs>;
    const allowed: Partial<AppPrefs> = {};
    if (body.theme === 'light' || body.theme === 'dark') allowed.theme = body.theme;
    if (body.schedule === 'off' || body.schedule === 'daily' || body.schedule === 'weekly') {
      allowed.schedule = body.schedule;
    }
    if (body.lastScanAt === null || typeof body.lastScanAt === 'string') {
      allowed.lastScanAt = body.lastScanAt ?? null;
    }
    if (body.lastReminderAt === null || typeof body.lastReminderAt === 'string') {
      allowed.lastReminderAt = body.lastReminderAt ?? null;
    }
    const prefs = await writePrefs(allowed);
    res.json(prefs);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to save prefs',
    });
  }
});

// Production: serve built client
const clientDist = process.env.CLIENT_DIST
  ? path.resolve(process.env.CLIENT_DIST)
  : path.resolve(__dirname, '../client/dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) next();
  });
});

app.listen(PORT, () => {
  console.log(
    `[disk-cleaner] API on http://localhost:${PORT}  DEMO_MODE=${DEMO_MODE}`
  );
});
