import { useState } from 'react';
import {
  canEmptyRecycleBin,
  emptyRecycleBin,
} from '../desktop/api';
import type { AppPrefs, ScheduleMode } from '../types';
import { formatWhen, nextReminderIso } from '../utils';

interface Props {
  prefs: AppPrefs;
  onSchedule: (schedule: ScheduleMode) => void;
  reminderBanner?: boolean;
  onDismissReminder?: () => void;
  onError?: (msg: string | null) => void;
}

export function PrefsPanel({
  prefs,
  onSchedule,
  reminderBanner,
  onDismissReminder,
  onError,
}: Props) {
  const next = nextReminderIso(prefs.schedule, prefs.lastScanAt, prefs.lastReminderAt);
  const showRecycle = canEmptyRecycleBin();
  const [confirmRecycle, setConfirmRecycle] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recycleMsg, setRecycleMsg] = useState<string | null>(null);

  async function handleEmptyRecycle() {
    setBusy(true);
    setRecycleMsg(null);
    onError?.(null);
    try {
      const result = await emptyRecycleBin();
      if (result.ok) {
        setRecycleMsg('Recycle Bin emptied.');
        setConfirmRecycle(false);
      } else {
        const msg = result.error || 'Could not empty Recycle Bin';
        setRecycleMsg(msg);
        onError?.(msg);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not empty Recycle Bin';
      setRecycleMsg(msg);
      onError?.(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="prefs-title">
      <h2 id="prefs-title" className="section-title">
        Preferences
      </h2>

      {reminderBanner && (
        <div className="reminder-banner" role="status">
          <div>
            <strong>Scan reminder</strong>
            <p>It’s time for a recurring cleanup scan.</p>
          </div>
          {onDismissReminder && (
            <button type="button" className="btn btn-ghost" onClick={onDismissReminder}>
              Dismiss
            </button>
          )}
        </div>
      )}

      <div className="pref-block">
        <label className="field">
          <span>Recurring scan reminder</span>
          <select
            value={prefs.schedule}
            onChange={(e) => onSchedule(e.target.value as ScheduleMode)}
            aria-describedby="schedule-help"
          >
            <option value="off">Off</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </label>
        <p id="schedule-help" className="presets-hint">
          Reminders are checked while the app is open. True OS background scheduling
          is future work.
        </p>
      </div>

      <dl className="pref-stats">
        <div>
          <dt>Last scan</dt>
          <dd>{formatWhen(prefs.lastScanAt)}</dd>
        </div>
        <div>
          <dt>Next reminder</dt>
          <dd>{prefs.schedule === 'off' ? '—' : formatWhen(next)}</dd>
        </div>
      </dl>

      {showRecycle && (
        <div className="pref-block recycle-block">
          <h3 className="subsection-title">Windows Recycle Bin</h3>
          <p className="presets-hint">
            Empties the system Recycle Bin via PowerShell. Requires confirmation.
          </p>
          {!confirmRecycle ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setConfirmRecycle(true)}
            >
              Empty Recycle Bin…
            </button>
          ) : (
            <div className="confirm-inline">
              <p className="warn-note">
                Permanently delete everything in the Recycle Bin? This cannot be undone.
              </p>
              <div className="actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => setConfirmRecycle(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={busy}
                  onClick={() => void handleEmptyRecycle()}
                >
                  {busy ? 'Emptying…' : 'Yes, empty'}
                </button>
              </div>
            </div>
          )}
          {recycleMsg && (
            <p className="note" role="status">
              {recycleMsg}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
