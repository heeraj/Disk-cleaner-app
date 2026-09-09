import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
} from './largeScan.js';
import { readPrefs, writePrefs } from './prefs.js';
import type { AppPrefs } from './types.js';

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

app.post('/api/scan', async (_req, res) => {
  try {
    await new Promise((r) => setTimeout(r, DEMO_MODE ? 900 : 400));
    const result = DEMO_MODE ? demoScan() : await liveScan();
    rememberScan(result);
    if (DEMO_MODE) {
      seedRemembered(result.groups.flatMap((g) => g.items));
    }
    await writePrefs({ lastScanAt: result.scannedAt });
    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Scan failed',
    });
  }
});

app.post('/api/large-scan', async (req, res) => {
  try {
    const body = req.body ?? {};
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
        res.status(400).json({ error: 'None of the provided roots exist' });
        return;
      }
    }

    await new Promise((r) => setTimeout(r, DEMO_MODE ? 600 : 200));
    const result = DEMO_MODE
      ? demoLargeFind()
      : await findLargeItems({ roots, minBytes, maxDepth, maxItems, maxMs });

    rememberCleanItems(largeItemsToCleanItems(result.items));
    await writePrefs({ lastScanAt: result.scannedAt });
    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Large scan failed',
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
