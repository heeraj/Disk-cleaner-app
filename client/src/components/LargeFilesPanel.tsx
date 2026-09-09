import { useEffect, useMemo, useState } from 'react';
import { fetchLargeRoots, runLargeScan } from '../api/client';
import type { LargeFindResult, LargeItem } from '../types';
import { formatBytes } from '../utils';

interface Props {
  onError: (msg: string | null) => void;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (items: LargeItem[], select: boolean) => void;
  onResult: (result: LargeFindResult | null) => void;
  result: LargeFindResult | null;
}

const MIN_OPTIONS = [
  { label: '20 MB', value: 20 * 1024 * 1024 },
  { label: '50 MB', value: 50 * 1024 * 1024 },
  { label: '100 MB', value: 100 * 1024 * 1024 },
  { label: '500 MB', value: 500 * 1024 * 1024 },
  { label: '1 GB', value: 1024 * 1024 * 1024 },
];

export function LargeFilesPanel({
  onError,
  selected,
  onToggle,
  onToggleAll,
  onResult,
  result,
}: Props) {
  const [roots, setRoots] = useState<string[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [minBytes, setMinBytes] = useState(50 * 1024 * 1024);
  const [scanning, setScanning] = useState(false);
  const [customRoot, setCustomRoot] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const data = await fetchLargeRoots();
        setRoots(data.roots);
        setChosen(new Set(data.roots));
      } catch (e) {
        onError(e instanceof Error ? e.message : 'Could not load roots');
      }
    })();
  }, [onError]);

  const selectedBytes = useMemo(() => {
    if (!result) return 0;
    return result.items
      .filter((i) => selected.has(i.cleanId))
      .reduce((s, i) => s + i.sizeBytes, 0);
  }, [result, selected]);

  function toggleRoot(root: string) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(root)) next.delete(root);
      else next.add(root);
      return next;
    });
  }

  function addCustomRoot() {
    const trimmed = customRoot.trim();
    if (!trimmed) return;
    if (!roots.includes(trimmed)) setRoots((r) => [...r, trimmed]);
    setChosen((prev) => new Set(prev).add(trimmed));
    setCustomRoot('');
  }

  async function handleScan() {
    onError(null);
    setScanning(true);
    onResult(null);
    try {
      const data = await runLargeScan({
        roots: Array.from(chosen),
        minBytes,
        maxDepth: 4,
        maxItems: 80,
      });
      onResult(data);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Large scan failed');
    } finally {
      setScanning(false);
    }
  }

  const allSelected =
    !!result &&
    result.items.length > 0 &&
    result.items.every((i) => selected.has(i.cleanId));

  return (
    <section className="card" aria-labelledby="large-title">
      <div className="results-header">
        <h2 id="large-title">Large files &amp; folders</h2>
        {result && (
          <div className="reclaim">{formatBytes(result.totalBytes)} found</div>
        )}
      </div>
      <p className="panel-lead">
        Find the biggest items under home, Downloads, and Desktop. Scans are
        depth- and time-bounded so they stay responsive.
      </p>

      <div className="field-row">
        <label className="field">
          <span>Minimum size</span>
          <select
            value={minBytes}
            onChange={(e) => setMinBytes(Number(e.target.value))}
            disabled={scanning}
          >
            {MIN_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="roots-list" role="group" aria-label="Scan roots">
        {roots.map((root) => (
          <label key={root} className="root-chip">
            <input
              type="checkbox"
              className="check"
              checked={chosen.has(root)}
              onChange={() => toggleRoot(root)}
              disabled={scanning}
            />
            <span title={root}>{root}</span>
          </label>
        ))}
      </div>

      <div className="add-root">
        <input
          type="text"
          placeholder="Add another root path…"
          value={customRoot}
          onChange={(e) => setCustomRoot(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addCustomRoot();
          }}
          disabled={scanning}
          aria-label="Custom root path"
        />
        <button
          type="button"
          className="btn btn-ghost"
          onClick={addCustomRoot}
          disabled={scanning || !customRoot.trim()}
        >
          Add
        </button>
      </div>

      <div className="actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleScan}
          disabled={scanning || chosen.size === 0}
        >
          {scanning ? 'Scanning…' : 'Find large items'}
        </button>
      </div>

      {scanning && (
        <div className="inline-scan" aria-live="polite" aria-busy="true">
          <div className="pulse sm" aria-hidden="true" />
          <span>Walking selected roots (bounded)…</span>
        </div>
      )}

      {result && (
        <div className="large-results">
          {result.truncated && (
            <p className="note warn-note" role="status">
              Scan hit a limit (depth, time, or count) — results may be partial.
            </p>
          )}
          {result.items.length === 0 ? (
            <p className="note">No items at or above the minimum size.</p>
          ) : (
            <>
              <div className="group-tools" style={{ padding: '0.75rem 0 0.35rem' }}>
                <span>
                  {Array.from(selected).filter((id) =>
                    result.items.some((i) => i.cleanId === id)
                  ).length}
                  /{result.items.length} selected · {formatBytes(selectedBytes)}
                </span>
                <button
                  type="button"
                  className="linkish"
                  onClick={() => onToggleAll(result.items, !allSelected)}
                >
                  {allSelected ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              <div className="large-list" role="list">
                {result.items.map((item) => (
                  <label key={item.cleanId} className="item" role="listitem">
                    <input
                      className="check"
                      type="checkbox"
                      checked={selected.has(item.cleanId)}
                      onChange={() => onToggle(item.cleanId)}
                      aria-label={`Select ${item.name}`}
                    />
                    <div className="item-text">
                      <strong>
                        {item.name}{' '}
                        <span className={`chip kind ${item.kind}`}>
                          {item.kind === 'dir' ? 'Folder' : 'File'}
                        </span>
                      </strong>
                      <span title={item.path}>{item.path}</span>
                    </div>
                    <div className="item-size">{formatBytes(item.sizeBytes)}</div>
                  </label>
                ))}
              </div>
              <p className="presets-hint">
                Deleting requires the Clear confirmation — large items are always
                “Review”.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
