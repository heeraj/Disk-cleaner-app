export type Safety = 'safe' | 'review';

export type CategoryId =
  | 'caches'
  | 'temp'
  | 'trash'
  | 'large-downloads'
  | 'logs'
  | 'build-artifacts';

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
