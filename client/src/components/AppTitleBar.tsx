import { useEffect, useState, type MouseEvent } from 'react';
import {
  getDesktopAPI,
  isFramelessChrome,
  isElectronShell,
} from '../desktop/api';
import type { DiskUsage } from '../types';
import { DiskOverview } from './DiskOverview';

interface Props {
  disk: DiskUsage | null;
  diskLoading: boolean;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  demo?: boolean;
}

export function AppTitleBar({
  disk,
  diskLoading,
  theme,
  onToggleTheme,
  demo,
}: Props) {
  const frameless = isFramelessChrome();
  const electron = isElectronShell();
  const [maximized, setMaximized] = useState(false);
  const controls = getDesktopAPI()?.windowControls;

  useEffect(() => {
    if (!controls) return;
    let unsub: (() => void) | undefined;
    void controls.isMaximized().then((r) => setMaximized(Boolean(r?.maximized)));
    if (controls.onMaximizedChange) {
      unsub = controls.onMaximizedChange((m) => setMaximized(m));
    }
    return () => unsub?.();
  }, [controls]);

  function onTitlebarDoubleClick(e: MouseEvent) {
    if (!frameless || !controls) return;
    const t = e.target as HTMLElement;
    if (t.closest('button, a, input, select, label, .no-drag')) return;
    void controls.maximizeToggle().then((r) => setMaximized(Boolean(r?.maximized)));
  }

  return (
    <header
      className={`titlebar ${electron ? 'electron' : ''} ${frameless ? 'frameless' : ''}`}
      onDoubleClick={onTitlebarDoubleClick}
    >
      {frameless && controls && (
        <div className="traffic-lights no-drag" role="toolbar" aria-label="Window">
          <button
            type="button"
            className="traffic close"
            title="Close"
            aria-label="Close"
            onClick={() => void controls.close()}
          />
          <button
            type="button"
            className="traffic min"
            title="Minimize"
            aria-label="Minimize"
            onClick={() => void controls.minimize()}
          />
          <button
            type="button"
            className="traffic max"
            title={maximized ? 'Restore' : 'Maximize'}
            aria-label={maximized ? 'Restore' : 'Maximize'}
            onClick={() =>
              void controls.maximizeToggle().then((r) =>
                setMaximized(Boolean(r?.maximized))
              )
            }
          />
        </div>
      )}

      <div className="titlebar-brand">
        <img
          className="app-icon-img"
          src="/icon.png"
          width={22}
          height={22}
          alt=""
          aria-hidden="true"
        />
        <div className="brand-text">
          <div className="app-name">Disk Cleaner</div>
          {!frameless && <div className="app-sub">Local utility</div>}
        </div>
      </div>

      <DiskOverview disk={disk} loading={diskLoading} compact />

      <div className="titlebar-actions no-drag">
        <button
          type="button"
          className="icon-btn"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>
        {demo ? (
          <span className="badge demo" title="Using sample data">
            Demo
          </span>
        ) : (
          <span className="badge">Local</span>
        )}
      </div>
    </header>
  );
}
