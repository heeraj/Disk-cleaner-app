import type { CleanGroup, CleanItem, PresetId, ScheduleMode } from './types';

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${value < 10 && i > 0 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

export function percent(used: number, total: number): number {
  if (!total) return 0;
  return Math.min(100, Math.max(0, (used / total) * 100));
}

const BROWSER_RE = /browser|chrome|chromium|firefox|mozilla|msedge|brave|opera|webkit|thumbnails?/i;
const PACKAGE_RE = /npm|pip|yarn|pnpm|cargo|composer|nuget|gradle|maven|go-build|bun/i;

export function idsForPreset(groups: CleanGroup[], preset: PresetId): string[] {
  const allItems = groups.flatMap((g) => g.items);

  const pick = (pred: (item: CleanItem, group: CleanGroup) => boolean) =>
    groups.flatMap((g) => g.items.filter((i) => pred(i, g)).map((i) => i.id));

  switch (preset) {
    case 'browser-caches':
      return pick(
        (i, g) =>
          g.id === 'caches' &&
          (BROWSER_RE.test(i.name) || BROWSER_RE.test(i.path) || BROWSER_RE.test(i.description))
      );
    case 'package-caches':
      return pick(
        (i, g) =>
          g.id === 'caches' &&
          (PACKAGE_RE.test(i.name) || PACKAGE_RE.test(i.path) || PACKAGE_RE.test(i.description))
      );
    case 'temp':
      return pick((_i, g) => g.id === 'temp');
    case 'trash':
      return pick((_i, g) => g.id === 'trash');
    case 'safe-all':
      return allItems.filter((i) => i.safety === 'safe').map((i) => i.id);
    default:
      return [];
  }
}

export function nextReminderIso(
  schedule: ScheduleMode,
  lastScanAt: string | null,
  lastReminderAt: string | null
): string | null {
  if (schedule === 'off') return null;
  const ms = schedule === 'daily' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  const base = lastScanAt || lastReminderAt;
  if (!base) return new Date().toISOString();
  return new Date(new Date(base).getTime() + ms).toISOString();
}

export function formatWhen(iso: string | null): string {
  if (!iso) return 'Never';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export function isReminderDue(
  schedule: ScheduleMode,
  lastScanAt: string | null,
  lastReminderAt: string | null
): boolean {
  const next = nextReminderIso(schedule, lastScanAt, lastReminderAt);
  if (!next) return false;
  return Date.now() >= new Date(next).getTime();
}
