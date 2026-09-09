export interface DiskCleanerDesktopAPI {
  isElectron: boolean;
  platform: string;
  pickDirectory: () => Promise<string | null>;
  openPath: (target: string) => Promise<string>;
  showItemInFolder: (target: string) => Promise<void>;
  emptyRecycleBin?: () => Promise<{ ok: boolean; error?: string }>;
}

declare global {
  interface Window {
    diskCleaner?: DiskCleanerDesktopAPI;
  }
}

/** Feature-detect Electron bridge (absent in browser / npm run dev). */
export function getDesktopAPI(): DiskCleanerDesktopAPI | null {
  const api = window.diskCleaner;
  if (api && api.isElectron) return api;
  return null;
}

export function canBrowseFolders(): boolean {
  return typeof getDesktopAPI()?.pickDirectory === 'function';
}

export function canRevealInExplorer(): boolean {
  const api = getDesktopAPI();
  return Boolean(api?.openPath && api?.showItemInFolder);
}

export function canEmptyRecycleBin(): boolean {
  const api = getDesktopAPI();
  return Boolean(api?.emptyRecycleBin && api.platform === 'win32');
}

export async function browseForFolder(): Promise<string | null> {
  const api = getDesktopAPI();
  if (!api?.pickDirectory) return null;
  try {
    return await api.pickDirectory();
  } catch {
    return null;
  }
}

export async function openInExplorer(target: string): Promise<void> {
  const api = getDesktopAPI();
  if (!api) return;
  try {
    await api.openPath(target);
  } catch {
    /* ignore */
  }
}

export async function showInExplorer(target: string): Promise<void> {
  const api = getDesktopAPI();
  if (!api) return;
  try {
    await api.showItemInFolder(target);
  } catch {
    /* ignore */
  }
}

export async function emptyRecycleBin(): Promise<{ ok: boolean; error?: string }> {
  const api = getDesktopAPI();
  if (!api?.emptyRecycleBin) {
    return { ok: false, error: 'Not available outside Electron on Windows' };
  }
  return api.emptyRecycleBin();
}
