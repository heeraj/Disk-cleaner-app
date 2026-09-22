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
  /** Inclusive size (same as sizeBytes; folders include descendants). */
  inclusiveBytes: number;
  /** Non-overlapping contribution when this item is in the result set. */
  uniqueBytes: number;
  /** Another listed result is nested under this path. */
  hasListedDescendants: boolean;
  /** A listed ancestor covers this path — excluded from unique totals. */
  coveredByAncestor: boolean;
  /** Path depth under the filesystem root (for indent / tree view). */
  depth: number;
}

export interface LargeFindResult {
  scannedAt: string;
  demo: boolean;
  roots: string[];
  minBytes: number;
  truncated: boolean;
  items: LargeItem[];
  /** Raw sum of inclusive sizes (may double-count nested paths). */
  totalBytes: number;
  /** Non-overlapping reclaimable total (nested overlap removed). */
  uniqueTotalBytes: number;
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
  /** Last large-scan roots (remembered between sessions). */
  lastLargeRoots: string[] | null;
  /** Last large-scan minimum size in bytes. */
  lastLargeMinBytes: number | null;
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


export interface VolumeInfo {
  path: string;
  label: string;
  totalBytes?: number;
  freeBytes?: number;
}
