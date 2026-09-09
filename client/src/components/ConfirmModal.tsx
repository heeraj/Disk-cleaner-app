import { useEffect, useRef } from 'react';
import { formatBytes } from '../utils';

interface Props {
  count: number;
  bytes: number;
  hasReview: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title?: string;
  confirmLabel?: string;
}

export function ConfirmModal({
  count,
  bytes,
  hasReview,
  busy,
  onCancel,
  onConfirm,
  title = 'Clear selected items?',
  confirmLabel = 'Yes, clear',
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault();
        onCancel();
      }
      if (e.key === 'Enter' && !busy && document.activeElement === confirmRef.current) {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel, onConfirm]);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <h3 id="confirm-title">{title}</h3>
        <p>
          This will free about <strong>{formatBytes(bytes)}</strong> across{' '}
          <strong>{count}</strong> item{count === 1 ? '' : 's'}.
          {hasReview
            ? ' Some items are marked “Review carefully” — make sure you no longer need them.'
            : ' Only items you selected will be removed.'}{' '}
          This cannot be undone.
        </p>
        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            ref={confirmRef}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Clearing…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
