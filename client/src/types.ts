export type Safety = 'safe' | 'review';

export type CategoryId =
  | 'caches'
  | 'temp'
  | 'trash'
  | 'large-downloads'
  | 'logs'
  | 'build-artifacts'
  | 'large-files';

export interface CleanItem {
  id: string;
  name: string;
  path: string;
  sizeBytes: number;
  category: CategoryId;
  safety: Safety;
  description: string;
}

export interface CleanGroup {
  id: CategoryId;
  label: string;
  description: string;
  safety: Safety;
  totalBytes: number;
  items: CleanItem[];
}

export interface DiskUsage {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  mount: string;
  demo: boolean;
}

export interface ScanResult {
  scannedAt: string;
  demo: boolean;
  groups: CleanGroup[];
  totalReclaimableBytes: number;
}

export interface ClearResult {
  freedBytes: number;
  clearedIds: string[];
  errors: { id: string; message: string }[];
  demo: boolean;
}

export type LargeItemKind = 'file' | 'dir';

export interface LargeItem {
  id: string;
  name: string;
  path: string;
  sizeBytes: number;
  kind: LargeItemKind;
  cleanId: string;
  /** Modification time (ms since epoch), when available */
  mtimeMs?: number;
}

export interface LargeFindResult {
  scannedAt: string;
  demo: boolean;
  roots: string[];
  minBytes: number;
  truncated: boolean;
  items: LargeItem[];
  totalBytes: number;
}

export interface DirChild {
  name: string;
  path: string;
  sizeBytes: number;
  kind: LargeItemKind;
  mtimeMs?: number;
}

export interface ListDirResult {
  path: string;
  truncated: boolean;
  children: DirChild[];
  demo: boolean;
}

export type ScheduleMode = 'off' | 'daily' | 'weekly';
export type ThemeMode = 'light' | 'dark';

export interface AppPrefs {
  theme: ThemeMode;
  schedule: ScheduleMode;
  lastScanAt: string | null;
  lastReminderAt: string | null;
}

export type PresetId =
  | 'browser-caches'
  | 'package-caches'
  | 'temp'
  | 'trash'
  | 'safe-all';

export interface PresetDef {
  id: PresetId;
  label: string;
  description: string;
}

export interface LastScanSummary {
  at: string;
  reclaimableBytes: number;
  groupCount: number;
  itemCount: number;
}


export interface ScanProgress {
  phase: string;
  percent?: number;
  currentPath?: string;
  filesSeen?: number;
  bytesSeen?: number;
  message?: string;
}
