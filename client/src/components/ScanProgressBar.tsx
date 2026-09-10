import type { ScanProgress } from '../types';

interface Props {
  progress: ScanProgress | null;
  onCancel?: () => void;
  cancelling?: boolean;
  compact?: boolean;
}

function truncatePath(path: string, max = 56): string {
  if (path.length <= max) return path;
  const keep = max - 1;
  const head = Math.ceil(keep * 0.35);
  const tail = keep - head;
  return `${path.slice(0, head)}…${path.slice(-tail)}`;
}

export function ScanProgressBar({
  progress,
  onCancel,
  cancelling,
  compact,
}: Props) {
  const percent =
    typeof progress?.percent === 'number' && Number.isFinite(progress.percent)
      ? Math.max(0, Math.min(100, progress.percent))
      : null;
  const determinate = percent != null;
  const label =
    progress?.message ||
    (progress?.phase ? `Scanning (${progress.phase})…` : 'Scanning…');
  const path = progress?.currentPath ? truncatePath(progress.currentPath) : null;

  return (
    <div
      className={`scan-progress ${compact ? 'compact' : ''}`}
      aria-live="polite"
      aria-busy="true"
    >
      <div className="scan-progress-top">
        <div className="scan-progress-label">
          <strong>{label}</strong>
          {determinate && (
            <span className="scan-progress-pct">{Math.round(percent)}%</span>
          )}
        </div>
        {onCancel && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onCancel}
            disabled={cancelling}
          >
            {cancelling ? 'Cancelling…' : 'Cancel'}
          </button>
        )}
      </div>
      <div
        className={`scan-progress-bar ${determinate ? '' : 'indeterminate'}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={determinate ? Math.round(percent) : undefined}
        aria-label="Scan progress"
      >
        <div
          className="scan-progress-fill"
          style={determinate ? { width: `${percent}%` } : undefined}
        />
      </div>
      {path && (
        <div className="scan-progress-path" title={progress?.currentPath}>
          {path}
        </div>
      )}
      {(progress?.filesSeen != null || progress?.bytesSeen != null) && (
        <div className="scan-progress-meta">
          {progress.filesSeen != null && (
            <span>{progress.filesSeen.toLocaleString()} seen</span>
          )}
        </div>
      )}
    </div>
  );
}
