import type { DiskUsage } from '../types';
import { formatBytes, percent } from '../utils';

interface Props {
  disk: DiskUsage | null;
  loading?: boolean;
}

export function DiskOverview({ disk, loading }: Props) {
  const pct = disk ? percent(disk.usedBytes, disk.totalBytes) : 0;

  return (
    <section className="card disk-card" aria-labelledby="disk-heading">
      <div className="disk-meta">
        <h2 id="disk-heading">Disk overview</h2>
        <div className="stats" aria-live="polite">
          {loading || !disk
            ? 'Reading…'
            : `${formatBytes(disk.usedBytes)} used · ${formatBytes(disk.freeBytes)} free`}
        </div>
      </div>
      <div
        className="bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-label="Disk used"
      >
        <div className="bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="bar-label">
        <span>{disk ? disk.mount : '/'}</span>
        <span>{disk ? `${Math.round(pct)}% used of ${formatBytes(disk.totalBytes)}` : '—'}</span>
      </div>
    </section>
  );
}
