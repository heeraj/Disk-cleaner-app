import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppPrefs } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PREFS_PATH = path.resolve(__dirname, '../data/prefs.json');

const DEFAULTS: AppPrefs = {
  theme: 'light',
  schedule: 'off',
  lastScanAt: null,
  lastReminderAt: null,
};

export async function readPrefs(): Promise<AppPrefs> {
  try {
    const raw = await fs.promises.readFile(PREFS_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<AppPrefs>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function writePrefs(partial: Partial<AppPrefs>): Promise<AppPrefs> {
  const current = await readPrefs();
  const next: AppPrefs = { ...current, ...partial };
  await fs.promises.mkdir(path.dirname(PREFS_PATH), { recursive: true });
  await fs.promises.writeFile(PREFS_PATH, JSON.stringify(next, null, 2), 'utf8');
  return next;
}
