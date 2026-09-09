import { useCallback, useEffect, useMemo, useState } from 'react';
import { clearSelected, fetchDisk, runScan } from './api/client';
import { ConfirmModal } from './components/ConfirmModal';
import { DiskOverview } from './components/DiskOverview';
import { GroupList } from './components/GroupList';
import type { CleanGroup, DiskUsage, ScanResult } from './types';
import { formatBytes } from './utils';

type Phase = 'idle' | 'scanning' | 'results' | 'success';

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

  useEffect(() => {
    void loadDisk();
  }, [loadDisk]);

  const itemMap = useMemo(() => {
    const m = new Map<string, { sizeBytes: number; safety: string }>();
    scan?.groups.forEach((g) =>
      g.items.forEach((i) => m.set(i.id, { sizeBytes: i.sizeBytes, safety: i.safety }))
    );
    return m;
  }, [scan]);

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

  async function handleScan() {
    setError(null);
    setPhase('scanning');
    setSelected(new Set());
    setScan(null);
    try {
      const result = await runScan();
      setScan(result);
      // Pre-select all safe items for a fast happy path
      const safeIds = result.groups
        .filter((g) => g.safety === 'safe')
        .flatMap((g) => g.items.map((i) => i.id));
      setSelected(new Set(safeIds));
      setPhase('results');
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
  }

  const demo = disk?.demo || scan?.demo;

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <h1>Disk Cleaner</h1>
          <p>Scan, review, free space — calmly, in under a minute.</p>
        </div>
        {demo ? (
          <span className="badge demo" title="Using sample data">
            Demo mode
          </span>
        ) : (
          <span className="badge">Local</span>
        )}
      </header>

      <DiskOverview disk={disk} loading={diskLoading} />

      {phase === 'idle' && (
        <section className="card state-panel" aria-labelledby="idle-title">
          <h2 id="idle-title">Ready when you are</h2>
          <p>
            We’ll look for caches, temp files, trash, and large downloads. Safe
            items are selected by default; anything marked “Review” stays
            unchecked.
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

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      <div
        className={`footer-bar ${phase === 'results' && selected.size > 0 ? 'visible' : ''}`}
        aria-hidden={!(phase === 'results' && selected.size > 0)}
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
