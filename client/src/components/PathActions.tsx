import {
  canRevealInExplorer,
  openInExplorer,
  showInExplorer,
} from '../desktop/api';

interface Props {
  path: string;
  /** Compact icon-style buttons for dense rows */
  compact?: boolean;
}

export function PathActions({ path, compact }: Props) {
  if (!canRevealInExplorer()) return null;

  return (
    <div className={`path-actions ${compact ? 'compact' : ''}`}>
      <button
        type="button"
        className="btn-row"
        title="Open folder"
        aria-label={`Open ${path}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void openInExplorer(path);
        }}
      >
        Open
      </button>
      <button
        type="button"
        className="btn-row"
        title="Show in Explorer"
        aria-label={`Show in Explorer: ${path}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void showInExplorer(path);
        }}
      >
        Show
      </button>
    </div>
  );
}
