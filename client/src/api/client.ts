import type {
  AppPrefs,
  ClearResult,
  DiskUsage,
  LargeFindResult,
  ListDirResult,
  ScanResult,
} from '../types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || res.statusText);
  }
  return data as T;
}

export function fetchDisk(): Promise<DiskUsage> {
  return request('/api/disk');
}

export function runScan(): Promise<ScanResult> {
  return request('/api/scan', { method: 'POST', body: '{}' });
}

export function runLargeScan(body: {
  roots?: string[];
  minBytes?: number;
  maxDepth?: number;
  maxItems?: number;
}): Promise<LargeFindResult> {
  return request('/api/large-scan', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function fetchLargeRoots(): Promise<{ roots: string[]; demo: boolean }> {
  return request('/api/large-roots');
}

export function listDirectory(dirPath: string): Promise<ListDirResult> {
  return request('/api/list-dir', {
    method: 'POST',
    body: JSON.stringify({ path: dirPath }),
  });
}

export function clearSelected(ids: string[]): Promise<ClearResult> {
  return request('/api/clear', {
    method: 'POST',
    body: JSON.stringify({ ids, confirm: true }),
  });
}

export function fetchPrefs(): Promise<AppPrefs> {
  return request('/api/prefs');
}

export function savePrefs(partial: Partial<AppPrefs>): Promise<AppPrefs> {
  return request('/api/prefs', {
    method: 'PUT',
    body: JSON.stringify(partial),
  });
}
