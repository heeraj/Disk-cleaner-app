import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { demoDiskUsage, demoScan } from './demo.js';
import { getDiskUsage } from './fsutil.js';
import {
  getRememberedItems,
  liveScan,
  rememberScan,
  seedRemembered,
} from './scanner.js';
import { clearItems } from './cleaner.js';

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
    // Artificial calm delay so UI can show scanning state nicely
    await new Promise((r) => setTimeout(r, DEMO_MODE ? 900 : 400));
    const result = DEMO_MODE ? demoScan() : await liveScan();
    rememberScan(result);
    if (DEMO_MODE) {
      seedRemembered(result.groups.flatMap((g) => g.items));
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Scan failed',
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
      // Allow clear after server restart in demo by re-seeding from demo catalog
      const scan = demoScan();
      seedRemembered(scan.groups.flatMap((g) => g.items));
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
    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Clear failed',
    });
  }
});

// Production: serve built client
const clientDist = path.resolve(__dirname, '../client/dist');
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
