import type { AppPrefs, ScheduleMode } from '../types';
import { formatWhen, nextReminderIso } from '../utils';

interface Props {
  prefs: AppPrefs;
  onSchedule: (schedule: ScheduleMode) => void;
  reminderBanner?: boolean;
  onDismissReminder?: () => void;
}

export function PrefsPanel({
  prefs,
  onSchedule,
  reminderBanner,
  onDismissReminder,
}: Props) {
  const next = nextReminderIso(prefs.schedule, prefs.lastScanAt, prefs.lastReminderAt);

  return (
    <section className="card" aria-labelledby="prefs-title">
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
          Reminders are checked while the app is open (web localStorage + server
          prefs). In Electron, a simple interval runs in-process. True OS
          background scheduling is future work.
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
    </section>
  );
}
