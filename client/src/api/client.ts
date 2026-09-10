import type {
  AppPrefs,
  ClearResult,
  DiskUsage,
  LargeFindResult,
  ListDirResult,
  ScanProgress,
  ScanResult,
} from '../types';

export class ScanCancelledError extends Error {
  constructor(message = 'Scan cancelled') {
    super(message);
    this.name = 'ScanCancelledError';
  }
}

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

interface StreamHandlers {
  onProgress?: (p: ScanProgress) => void;
  signal?: AbortSignal;
}

async function postSse<T>(
  url: string,
  body: unknown,
  handlers: StreamHandlers = {}
): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(body ?? {}),
    signal: handlers.signal,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || res.statusText);
  }

  if (!res.body) {
    throw new Error('No response body for scan stream');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: T | undefined;
  let streamError: string | undefined;
  let cancelled = false;

  const consumeBlock = (block: string) => {
    let event = 'message';
    const dataLines: string[] = [];
    for (const rawLine of block.split('\n')) {
      const line = rawLine.replace(/\r$/, '');
      if (!line || line.startsWith(':')) continue;
      if (line.startsWith('event:')) {
        event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart());
      }
    }
    if (!dataLines.length) return;
    let payload: unknown;
    try {
      payload = JSON.parse(dataLines.join('\n'));
    } catch {
      return;
    }
    if (event === 'progress') {
      handlers.onProgress?.(payload as ScanProgress);
    } else if (event === 'result') {
      result = payload as T;
    } else if (event === 'error') {
      streamError = (payload as { error?: string }).error || 'Scan failed';
    } else if (event === 'cancelled') {
      cancelled = true;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      if (block.trim()) consumeBlock(block);
    }
  }
  if (buffer.trim()) consumeBlock(buffer);

  if (cancelled || handlers.signal?.aborted) {
    throw new ScanCancelledError();
  }
  if (streamError) throw new Error(streamError);
  if (result === undefined) throw new Error('Scan ended without a result');
  return result;
}

/** Clean scan with SSE progress. Falls back to JSON POST if stream fails hard. */
export function runScanWithProgress(
  onProgress?: (p: ScanProgress) => void,
  signal?: AbortSignal
): Promise<ScanResult> {
  return postSse<ScanResult>('/api/scan/stream', {}, { onProgress, signal });
}

export function runLargeScanWithProgress(
  body: {
    roots?: string[];
    minBytes?: number;
    maxDepth?: number;
    maxItems?: number;
  },
  onProgress?: (p: ScanProgress) => void,
  signal?: AbortSignal
): Promise<LargeFindResult> {
  return postSse<LargeFindResult>('/api/large-scan/stream', body, {
    onProgress,
    signal,
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
