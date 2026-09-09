import type { ClearResult, DiskUsage, ScanResult } from '../types';

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

export function clearSelected(ids: string[]): Promise<ClearResult> {
  return request('/api/clear', {
    method: 'POST',
    body: JSON.stringify({ ids, confirm: true }),
  });
}
