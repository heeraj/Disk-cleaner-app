export interface ScanProgress {
  phase: string;
  percent?: number;
  currentPath?: string;
  filesSeen?: number;
  bytesSeen?: number;
  message?: string;
}

export type ProgressReporter = (p: ScanProgress) => void;

export class ScanAbortedError extends Error {
  constructor(message = 'Scan cancelled') {
    super(message);
    this.name = 'ScanAbortedError';
  }
}

export interface Abortable {
  aborted: boolean;
  throwIfAborted(): void;
}

export function makeAbortGate(signal?: AbortSignal): Abortable {
  const gate = {
    get aborted() {
      return Boolean(signal?.aborted);
    },
    throwIfAborted() {
      if (signal?.aborted) throw new ScanAbortedError();
    },
  };
  return gate;
}

/** Throttle progress updates so SSE doesn't flood the client. */
export function throttleProgress(
  report: ProgressReporter | undefined,
  minMs = 80
): ProgressReporter {
  if (!report) return () => undefined;
  let last = 0;
  let pending: ScanProgress | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    if (pending) {
      last = Date.now();
      report(pending);
      pending = null;
    }
  };

  return (p: ScanProgress) => {
    const now = Date.now();
    // Always send phase changes / 100% immediately
    if (
      p.percent === 100 ||
      p.phase === 'done' ||
      p.phase === 'error' ||
      p.phase === 'cancelled' ||
      now - last >= minMs
    ) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      pending = null;
      last = now;
      report(p);
      return;
    }
    pending = p;
    if (!timer) timer = setTimeout(flush, minMs - (now - last));
  };
}
