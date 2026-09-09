/// <reference types="vite/client" />

import type { DiskCleanerDesktopAPI } from './desktop/api';

declare global {
  interface Window {
    diskCleaner?: DiskCleanerDesktopAPI;
  }
}

export {};
