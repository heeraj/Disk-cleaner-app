import { useEffect, useMemo, useState } from 'react';
import { fetchLargeRoots, listDirectory, runLargeScan } from '../api/client';
import {
  browseForFolder,
  canBrowseFolders,
  canRevealInExplorer,
} from '../desktop/api';
import type { DirChild, LargeFindResult, LargeItem } from '../types';
import { formatBytes } from '../utils';
import { PathActions } from './PathActions';

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

type SortKey = 'size' | 'name' | 'path' | 'oldest';
type KindFilter = 'all' | 'file' | 'dir';

function formatAge(mtimeMs?: number): string {
  if (!mtimeMs) return '';
  const days = Math.floor((Date.now() - mtimeMs) / 86400000);
  if (days < 1) return 'today';
  if (days === 1) return '1 day old';
  if (days < 60) return `${days} days old`;
  const months = Math.floor(days / 30);
  if (months < 24) return `${months} mo old`;
  return `${Math.floor(months / 12)} yr old`;
}

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
  const [sortKey, setSortKey] = useState<SortKey>('size');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [drillPath, setDrillPath] = useState<string | null>(null);
  const [drillChildren, setDrillChildren] = useState<DirChild[] | null>(null);
  const [drillTruncated, setDrillTruncated] = useState(false);
  const [drilling, setDrilling] = useState(false);
  const hasBrowse = canBrowseFolders();
  const hasReveal = canRevealInExplorer();

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

  const duplicateNames = useMemo(() => {
    if (!result) return new Set<string>();
    const counts = new Map<string, number>();
    for (const item of result.items) {
      const key = item.name.toLowerCase();
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k));
  }, [result]);

  const filteredSorted = useMemo(() => {
    if (!result) return [];
    let items = result.items.slice();
    if (kindFilter !== 'all') {
      items = items.filter((i) => i.kind === kindFilter);
    }
    items.sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'path':
          return a.path.localeCompare(b.path);
        case 'oldest': {
          const am = a.mtimeMs ?? Number.POSITIVE_INFINITY;
          const bm = b.mtimeMs ?? Number.POSITIVE_INFINITY;
          if (am !== bm) return am - bm;
          return b.sizeBytes - a.sizeBytes;
        }
        case 'size':
        default:
          return b.sizeBytes - a.sizeBytes;
      }
    });
    return items;
  }, [result, sortKey, kindFilter]);

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

  function removeRoot(root: string) {
    setRoots((r) => r.filter((x) => x !== root));
    setChosen((prev) => {
      const next = new Set(prev);
      next.delete(root);
      return next;
    });
  }

  function addRootPath(pathStr: string) {
    const trimmed = pathStr.trim();
    if (!trimmed) return;
    if (!roots.includes(trimmed)) setRoots((r) => [...r, trimmed]);
    setChosen((prev) => new Set(prev).add(trimmed));
    setCustomRoot('');
  }

  function addCustomRoot() {
    addRootPath(customRoot);
  }

  async function handleBrowse() {
    onError(null);
    const picked = await browseForFolder();
    if (picked) addRootPath(picked);
  }

  async function handleScan() {
    onError(null);
    setScanning(true);
    onResult(null);
    setDrillPath(null);
    setDrillChildren(null);
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

  async function openDrill(folderPath: string) {
    onError(null);
    setDrilling(true);
    setDrillPath(folderPath);
    try {
      const data = await listDirectory(folderPath);
      setDrillChildren(data.children);
      setDrillTruncated(data.truncated);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not open folder');
      setDrillPath(null);
      setDrillChildren(null);
    } finally {
      setDrilling(false);
    }
  }

  function closeDrill() {
    setDrillPath(null);
    setDrillChildren(null);
    setDrillTruncated(false);
  }

  useEffect(() => {
    if (!drillPath) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrill();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drillPath]);

  const allSelected =
    filteredSorted.length > 0 &&
    filteredSorted.every((i) => selected.has(i.cleanId));

  const dupCount = duplicateNames.size;

  return (
    <section className="panel" aria-labelledby="large-title">
      <div className="results-header">
        <h2 id="large-title">Large files &amp; folders</h2>
        {result && (
          <div className="reclaim">{formatBytes(result.totalBytes)} found</div>
        )}
      </div>
      <p className="panel-lead">
        Find the biggest items under chosen folders. Use Browse to pick roots, then
        Open / Show in Explorer before deleting anything large.
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
          <div key={root} className="root-chip">
            <label className="root-chip-label">
              <input
                type="checkbox"
                className="check"
                checked={chosen.has(root)}
                onChange={() => toggleRoot(root)}
                disabled={scanning}
              />
              <span title={root}>{root}</span>
            </label>
            <button
              type="button"
              className="btn-row"
              title="Remove root"
              aria-label={`Remove ${root}`}
              disabled={scanning}
              onClick={() => removeRoot(root)}
            >
              ✕
            </button>
          </div>
        ))}
        {roots.length === 0 && (
          <p className="note">No roots yet — browse or type a folder path.</p>
        )}
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
        {hasBrowse && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleBrowse}
            disabled={scanning}
          >
            Browse…
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost"
          onClick={addCustomRoot}
          disabled={scanning || !customRoot.trim()}
        >
          Add
        </button>
      </div>
      {!hasBrowse && (
        <p className="note">
          Folder Browse is available in the Electron desktop app. In the browser,
          type a path.
        </p>
      )}

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

      {!scanning && !result && (
        <div className="empty-state" role="status">
          <p>No scan yet. Pick roots and click Find large items.</p>
        </div>
      )}

      {result && (
        <div className="large-results">
          {result.truncated && (
            <p className="note warn-note" role="status">
              Partial scan — hit a depth, time, or count limit. Results may be incomplete.
            </p>
          )}
          {dupCount > 0 && (
            <p className="note hint-note" role="status">
              {dupCount} duplicate file name{dupCount === 1 ? '' : 's'} found (same
              basename in different folders) — marked below.
            </p>
          )}

          {result.items.length === 0 ? (
            <div className="empty-state" role="status">
              <p>No items at or above {formatBytes(result.minBytes)} under the selected roots.</p>
              <p className="note">Try a lower minimum size or different folders.</p>
            </div>
          ) : (
            <>
              <div className="toolbar-row">
                <label className="field inline">
                  <span>Sort</span>
                  <select
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value as SortKey)}
                  >
                    <option value="size">Size (largest)</option>
                    <option value="oldest">Oldest first</option>
                    <option value="name">Name</option>
                    <option value="path">Path</option>
                  </select>
                </label>
                <label className="field inline">
                  <span>Show</span>
                  <select
                    value={kindFilter}
                    onChange={(e) => setKindFilter(e.target.value as KindFilter)}
                  >
                    <option value="all">Files &amp; folders</option>
                    <option value="file">Files only</option>
                    <option value="dir">Folders only</option>
                  </select>
                </label>
              </div>

              <div className="group-tools" style={{ padding: '0.5rem 0 0.25rem' }}>
                <span>
                  {
                    filteredSorted.filter((i) => selected.has(i.cleanId)).length
                  }
                  /{filteredSorted.length} selected · {formatBytes(selectedBytes)}
                </span>
                <button
                  type="button"
                  className="linkish"
                  onClick={() => onToggleAll(filteredSorted, !allSelected)}
                >
                  {allSelected ? 'Deselect all' : 'Select all'}
                </button>
              </div>

              {filteredSorted.length === 0 ? (
                <div className="empty-state">
                  <p>Nothing matches this filter.</p>
                </div>
              ) : (
                <div className="large-list" role="list">
                  {filteredSorted.map((item) => {
                    const isDup = duplicateNames.has(item.name.toLowerCase());
                    return (
                      <div key={item.cleanId} className="item item-row" role="listitem">
                        <label className="item-main">
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
                              {isDup && (
                                <span className="chip dup" title="Same name appears more than once">
                                  Dup name
                                </span>
                              )}
                            </strong>
                            <span title={item.path}>
                              {item.path}
                              {item.mtimeMs != null && (
                                <> · {formatAge(item.mtimeMs)}</>
                              )}
                            </span>
                          </div>
                          <div className="item-size">{formatBytes(item.sizeBytes)}</div>
                        </label>
                        <div className="item-actions">
                          {item.kind === 'dir' && (
                            <button
                              type="button"
                              className="btn-row"
                              onClick={() => void openDrill(item.path)}
                            >
                              Open folder
                            </button>
                          )}
                          {hasReveal && <PathActions path={item.path} compact />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="presets-hint">
                Deleting requires Clear confirmation — large items are always Review.
                Prefer Open / Show in Explorer before removing big folders.
              </p>
            </>
          )}
        </div>
      )}

      {drillPath && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeDrill();
          }}
        >
          <div
            className="modal modal-wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="drill-title"
          >
            <div className="results-header">
              <h3 id="drill-title">Folder contents</h3>
              <button type="button" className="btn btn-ghost" onClick={closeDrill}>
                Close
              </button>
            </div>
            <p className="panel-lead mono" title={drillPath}>
              {drillPath}
            </p>
            {drilling && (
              <div className="inline-scan">
                <div className="pulse sm" />
                <span>Listing…</span>
              </div>
            )}
            {drillTruncated && (
              <p className="note warn-note">Listing truncated (time or count limit).</p>
            )}
            {drillChildren && drillChildren.length === 0 && !drilling && (
              <p className="note">This folder is empty (or unreadable).</p>
            )}
            {drillChildren && drillChildren.length > 0 && (
              <div className="large-list drill-list" role="list">
                {drillChildren.map((child) => (
                  <div key={child.path} className="item item-row" role="listitem">
                    <div className="item-main">
                      <div className="item-text">
                        <strong>
                          {child.name}{' '}
                          <span className={`chip kind ${child.kind}`}>
                            {child.kind === 'dir' ? 'Folder' : 'File'}
                          </span>
                        </strong>
                        <span title={child.path}>
                          {child.path}
                          {child.mtimeMs != null && <> · {formatAge(child.mtimeMs)}</>}
                        </span>
                      </div>
                      <div className="item-size">{formatBytes(child.sizeBytes)}</div>
                    </div>
                    <div className="item-actions">
                      {child.kind === 'dir' && (
                        <button
                          type="button"
                          className="btn-row"
                          onClick={() => void openDrill(child.path)}
                        >
                          Open folder
                        </button>
                      )}
                      {hasReveal && <PathActions path={child.path} compact />}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="presets-hint">Browse only — nothing here is selected for delete.</p>
          </div>
        </div>
      )}
    </section>
  );
}
