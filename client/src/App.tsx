import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  clearSelected,
  fetchDisk,
  fetchPrefs,
  runScan,
  savePrefs,
} from './api/client';
import { ConfirmModal } from './components/ConfirmModal';
import { DiskOverview } from './components/DiskOverview';
import { GroupList } from './components/GroupList';
import { LargeFilesPanel } from './components/LargeFilesPanel';
import { PrefsPanel } from './components/PrefsPanel';
import { PresetsBar } from './components/PresetsBar';
import { useTheme } from './hooks/useTheme';
import type {
  AppPrefs,
  CleanGroup,
  DiskUsage,
  LargeFindResult,
  LargeItem,
  PresetId,
  ScanResult,
  ScheduleMode,
} from './types';
import { formatBytes, idsForPreset, isReminderDue } from './utils';

type Phase = 'idle' | 'scanning' | 'results' | 'success';
type Tab = 'clean' | 'large' | 'prefs';

const DEFAULT_PREFS: AppPrefs = {
  theme: 'light',
  schedule: 'off',
  lastScanAt: null,
  lastReminderAt: null,
};

export default function App() {
  const [disk, setDisk] = useState<DiskUsage | null>(null);
  const [diskLoading, setDiskLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>('idle');
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [freedBytes, setFreedBytes] = useState(0);
  const [tab, setTab] = useState<Tab>('clean');
  const [activePreset, setActivePreset] = useState<PresetId | null>(null);
  const [largeResult, setLargeResult] = useState<LargeFindResult | null>(null);
  const [prefs, setPrefs] = useState<AppPrefs>(DEFAULT_PREFS);
  const [showReminder, setShowReminder] = useState(false);

  const { theme, setTheme, toggle } = useTheme();

  const loadDisk = useCallback(async () => {
    setDiskLoading(true);
    try {
      const d = await fetchDisk();
      setDisk(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read disk');
    } finally {
      setDiskLoading(false);
    }
  }, []);

  const loadPrefs = useCallback(async () => {
    try {
      const p = await fetchPrefs();
      setPrefs(p);
      if (p.theme === 'light' || p.theme === 'dark') setTheme(p.theme);
      // Mirror schedule to localStorage for Electron interval / offline
      try {
        localStorage.setItem('disk-cleaner-schedule', p.schedule);
        if (p.lastScanAt) localStorage.setItem('disk-cleaner-last-scan', p.lastScanAt);
      } catch {
        /* ignore */
      }
      setShowReminder(isReminderDue(p.schedule, p.lastScanAt, p.lastReminderAt));
    } catch {
      // Fall back to localStorage-only
      try {
        const schedule = (localStorage.getItem('disk-cleaner-schedule') ||
          'off') as ScheduleMode;
        const lastScanAt = localStorage.getItem('disk-cleaner-last-scan');
        setPrefs((prev) => ({
          ...prev,
          schedule:
            schedule === 'daily' || schedule === 'weekly' || schedule === 'off'
              ? schedule
              : 'off',
          lastScanAt,
        }));
      } catch {
        /* ignore */
      }
    }
  }, [setTheme]);

  useEffect(() => {
    void loadDisk();
    void loadPrefs();
  }, [loadDisk, loadPrefs]);

  // In-app schedule check (web + Electron while open)
  useEffect(() => {
    const tick = () => {
      setShowReminder(
        isReminderDue(prefs.schedule, prefs.lastScanAt, prefs.lastReminderAt)
      );
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [prefs.schedule, prefs.lastScanAt, prefs.lastReminderAt]);

  // Persist theme to server prefs (best-effort)
  useEffect(() => {
    if (prefs.theme === theme) return;
    setPrefs((p) => ({ ...p, theme }));
    void savePrefs({ theme }).catch(() => undefined);
  }, [theme]); // eslint-disable-line react-hooks/exhaustive-deps

  const itemMap = useMemo(() => {
    const m = new Map<string, { sizeBytes: number; safety: string }>();
    scan?.groups.forEach((g) =>
      g.items.forEach((i) => m.set(i.id, { sizeBytes: i.sizeBytes, safety: i.safety }))
    );
    largeResult?.items.forEach((i) =>
      m.set(i.cleanId, { sizeBytes: i.sizeBytes, safety: 'review' })
    );
    return m;
  }, [scan, largeResult]);

  const selectedBytes = useMemo(() => {
    let total = 0;
    selected.forEach((id) => {
      total += itemMap.get(id)?.sizeBytes ?? 0;
    });
    return total;
  }, [selected, itemMap]);

  const hasReview = useMemo(() => {
    for (const id of selected) {
      if (itemMap.get(id)?.safety === 'review') return true;
    }
    return false;
  }, [selected, itemMap]);

  const markScanned = useCallback(async (scannedAt: string) => {
    setPrefs((p) => ({ ...p, lastScanAt: scannedAt }));
    try {
      localStorage.setItem('disk-cleaner-last-scan', scannedAt);
    } catch {
      /* ignore */
    }
    try {
      await savePrefs({ lastScanAt: scannedAt });
    } catch {
      /* ignore */
    }
    setShowReminder(false);
  }, []);

  async function handleScan() {
    setError(null);
    setPhase('scanning');
    setSelected(new Set());
    setScan(null);
    setActivePreset(null);
    try {
      const result = await runScan();
      setScan(result);
      const safeIds = result.groups
        .filter((g) => g.safety === 'safe')
        .flatMap((g) => g.items.map((i) => i.id));
      setSelected(new Set(safeIds));
      setPhase('results');
      await markScanned(result.scannedAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed');
      setPhase('idle');
    }
  }

  function toggleItem(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(group: CleanGroup, select: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const item of group.items) {
        if (select) next.add(item.id);
        else next.delete(item.id);
      }
      return next;
    });
  }

  async function applyPreset(id: PresetId) {
    setActivePreset(id);
    setError(null);
    setTab('clean');

    let groups = scan?.groups;
    if (!groups || phase !== 'results') {
      setPhase('scanning');
      try {
        const result = await runScan();
        setScan(result);
        groups = result.groups;
        setPhase('results');
        await markScanned(result.scannedAt);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Scan failed');
        setPhase('idle');
        return;
      }
    }

    const ids = idsForPreset(groups, id);
    setSelected(new Set(ids));
    if (ids.length === 0) {
      setError(
        'No matching items for that preset. Try a full scan or another preset.'
      );
    }
  }

  function toggleLargeAll(items: LargeItem[], select: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const item of items) {
        if (select) next.add(item.cleanId);
        else next.delete(item.cleanId);
      }
      return next;
    });
  }

  async function handleClear() {
    setClearing(true);
    setError(null);
    try {
      const ids = Array.from(selected);
      const result = await clearSelected(ids);
      setFreedBytes(result.freedBytes);
      setConfirmOpen(false);
      setPhase('success');
      setSelected(new Set());
      setScan(null);
      setLargeResult(null);
      setActivePreset(null);
      await loadDisk();
      if (result.errors.length) {
        setError(
          `Cleared with ${result.errors.length} issue(s): ${result.errors[0].message}`
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Clear failed');
    } finally {
      setClearing(false);
    }
  }

  function resetToIdle() {
    setPhase('idle');
    setScan(null);
    setSelected(new Set());
    setFreedBytes(0);
    setError(null);
    setActivePreset(null);
  }

  async function handleSchedule(schedule: ScheduleMode) {
    setPrefs((p) => ({ ...p, schedule }));
    try {
      localStorage.setItem('disk-cleaner-schedule', schedule);
    } catch {
      /* ignore */
    }
    try {
      const next = await savePrefs({ schedule });
      setPrefs(next);
    } catch {
      /* ignore */
    }
    setShowReminder(
      isReminderDue(schedule, prefs.lastScanAt, prefs.lastReminderAt)
    );
  }

  async function dismissReminder() {
    const now = new Date().toISOString();
    setPrefs((p) => ({ ...p, lastReminderAt: now }));
    setShowReminder(false);
    try {
      await savePrefs({ lastReminderAt: now });
    } catch {
      /* ignore */
    }
  }

  const demo = disk?.demo || scan?.demo || largeResult?.demo;
  const showClearBar = selected.size > 0 && (tab === 'clean' || tab === 'large');

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <h1>Disk Cleaner</h1>
          <p>Scan, review, free space — calmly, in under a minute.</p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="icon-btn"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          {demo ? (
            <span className="badge demo" title="Using sample data">
              Demo mode
            </span>
          ) : (
            <span className="badge">Local</span>
          )}
        </div>
      </header>

      <nav className="tabs" aria-label="Main">
        {(
          [
            ['clean', 'Clean'],
            ['large', 'Large files'],
            ['prefs', 'Preferences'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`tab ${tab === id ? 'active' : ''}`}
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <DiskOverview disk={disk} loading={diskLoading} />

      {showReminder && tab !== 'prefs' && (
        <div className="reminder-banner card-flush" role="status">
          <div>
            <strong>Time for a scan</strong>
            <p>Your recurring reminder is due.</p>
          </div>
          <div className="actions" style={{ margin: 0 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setTab('clean');
                void handleScan();
              }}
            >
              Scan now
            </button>
            <button type="button" className="btn btn-ghost" onClick={dismissReminder}>
              Later
            </button>
          </div>
        </div>
      )}

      {tab === 'clean' && (
        <>
          <PresetsBar
            disabled={phase === 'scanning'}
            onPreset={applyPreset}
            active={activePreset}
          />

          {phase === 'idle' && (
            <section className="card state-panel" aria-labelledby="idle-title">
              <h2 id="idle-title">Ready when you are</h2>
              <p>
                We’ll look for caches, temp files, trash, and large downloads. Safe
                items are selected by default; anything marked “Review” stays
                unchecked. Or use a Quick clean preset above.
              </p>
              <div className="actions" style={{ justifyContent: 'center' }}>
                <button type="button" className="btn btn-primary" onClick={handleScan}>
                  Scan for cleanups
                </button>
              </div>
            </section>
          )}

          {phase === 'scanning' && (
            <section className="card state-panel" aria-live="polite" aria-busy="true">
              <div className="pulse" aria-hidden="true" />
              <h2>Scanning…</h2>
              <p>Looking through common safe targets. This stays on your machine.</p>
            </section>
          )}

          {phase === 'results' && scan && (
            <section className="card" aria-labelledby="results-title">
              <div className="results-header">
                <h2 id="results-title">Findings</h2>
                <div className="reclaim">
                  {formatBytes(scan.totalReclaimableBytes)} reclaimable
                </div>
              </div>
              {scan.groups.length === 0 ? (
                <div className="state-panel" style={{ padding: '1.5rem 0' }}>
                  <h2>All clear</h2>
                  <p>No notable cleanup targets turned up. You’re in good shape.</p>
                  <button type="button" className="btn btn-ghost" onClick={resetToIdle}>
                    Back
                  </button>
                </div>
              ) : (
                <GroupList
                  groups={scan.groups}
                  selected={selected}
                  onToggleItem={toggleItem}
                  onToggleGroup={toggleGroup}
                />
              )}
              <div className="actions" style={{ marginTop: '1rem' }}>
                <button type="button" className="btn btn-ghost" onClick={handleScan}>
                  Scan again
                </button>
              </div>
            </section>
          )}

          {phase === 'success' && (
            <section className="card state-panel" aria-live="polite">
              <div className="success-icon" aria-hidden="true">
                ✓
              </div>
              <h2>Space freed</h2>
              <p>
                About <strong>{formatBytes(freedBytes)}</strong> was cleared. Take a
                breath — you’re done.
              </p>
              <div className="actions" style={{ justifyContent: 'center' }}>
                <button type="button" className="btn btn-primary" onClick={resetToIdle}>
                  Done
                </button>
                <button type="button" className="btn btn-ghost" onClick={handleScan}>
                  Scan again
                </button>
              </div>
            </section>
          )}
        </>
      )}

      {tab === 'large' && (
        <LargeFilesPanel
          onError={setError}
          selected={selected}
          onToggle={toggleItem}
          onToggleAll={toggleLargeAll}
          result={largeResult}
          onResult={(r) => {
            setLargeResult(r);
            if (r) void markScanned(r.scannedAt);
          }}
        />
      )}

      {tab === 'prefs' && (
        <PrefsPanel
          prefs={{ ...prefs, theme }}
          onSchedule={handleSchedule}
          reminderBanner={showReminder}
          onDismissReminder={dismissReminder}
        />
      )}

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      <div
        className={`footer-bar ${showClearBar ? 'visible' : ''}`}
        aria-hidden={!showClearBar}
      >
        <div className="sel">
          {selected.size} selected · {formatBytes(selectedBytes)}
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={selected.size === 0}
          onClick={() => setConfirmOpen(true)}
        >
          Clear selected
        </button>
      </div>

      {confirmOpen && (
        <ConfirmModal
          count={selected.size}
          bytes={selectedBytes}
          hasReview={hasReview}
          busy={clearing}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={handleClear}
        />
      )}
    </div>
  );
}
