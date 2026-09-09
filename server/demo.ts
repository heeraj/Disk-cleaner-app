import type { CleanGroup, DiskUsage, ScanResult } from './types.js';

export function demoDiskUsage(): DiskUsage {
  const totalBytes = 512 * 1024 ** 3; // 512 GB
  const usedBytes = Math.round(totalBytes * 0.68);
  return {
    totalBytes,
    usedBytes,
    freeBytes: totalBytes - usedBytes,
    mount: '/',
    demo: true,
  };
}

export function demoScan(): ScanResult {
  const groups: CleanGroup[] = [
    {
      id: 'caches',
      label: 'Caches',
      description: 'App and browser caches that rebuild automatically',
      safety: 'safe',
      totalBytes: 0,
      items: [
        {
          id: 'demo-cache-npm',
          name: 'npm cache',
          path: '~/.npm/_cacache',
          sizeBytes: 1_240_000_000,
          category: 'caches',
          safety: 'safe',
          description: 'Downloaded package tarballs',
        },
        {
          id: 'demo-cache-browser',
          name: 'Browser cache',
          path: '~/.cache/browser',
          sizeBytes: 890_000_000,
          category: 'caches',
          safety: 'safe',
          description: 'Cached web assets',
        },
        {
          id: 'demo-cache-thumb',
          name: 'Thumbnail cache',
          path: '~/.cache/thumbnails',
          sizeBytes: 120_000_000,
          category: 'caches',
          safety: 'safe',
          description: 'Generated preview thumbnails',
        },
      ],
    },
    {
      id: 'temp',
      label: 'Temporary files',
      description: 'Leftover temp files from installs and apps',
      safety: 'safe',
      totalBytes: 0,
      items: [
        {
          id: 'demo-tmp-installers',
          name: 'Installer leftovers',
          path: '/tmp/installers',
          sizeBytes: 340_000_000,
          category: 'temp',
          safety: 'safe',
          description: 'Old installer extracts',
        },
        {
          id: 'demo-tmp-scratch',
          name: 'Scratch files',
          path: '/tmp/scratch',
          sizeBytes: 85_000_000,
          category: 'temp',
          safety: 'safe',
          description: 'Temporary scratch data',
        },
      ],
    },
    {
      id: 'trash',
      label: 'Trash',
      description: 'Items already moved to trash',
      safety: 'safe',
      totalBytes: 0,
      items: [
        {
          id: 'demo-trash-main',
          name: 'User trash',
          path: '~/.local/share/Trash',
          sizeBytes: 2_100_000_000,
          category: 'trash',
          safety: 'safe',
          description: 'Deleted files awaiting empty',
        },
      ],
    },
    {
      id: 'logs',
      label: 'Old logs',
      description: 'Rotated and leftover log files',
      safety: 'safe',
      totalBytes: 0,
      items: [
        {
          id: 'demo-logs-app',
          name: 'Application logs',
          path: '~/.cache/logs',
          sizeBytes: 210_000_000,
          category: 'logs',
          safety: 'safe',
          description: 'Older rotated logs',
        },
      ],
    },
    {
      id: 'large-downloads',
      label: 'Large downloads',
      description: 'Review carefully — may still be needed',
      safety: 'review',
      totalBytes: 0,
      items: [
        {
          id: 'demo-dl-iso',
          name: 'ubuntu-24.04.iso',
          path: '~/Downloads/ubuntu-24.04.iso',
          sizeBytes: 5_800_000_000,
          category: 'large-downloads',
          safety: 'review',
          description: 'ISO image (5.8 GB)',
        },
        {
          id: 'demo-dl-zip',
          name: 'dataset-archive.zip',
          path: '~/Downloads/dataset-archive.zip',
          sizeBytes: 1_450_000_000,
          category: 'large-downloads',
          safety: 'review',
          description: 'Large zip archive',
        },
      ],
    },
    {
      id: 'build-artifacts',
      label: 'Build artifacts',
      description: 'node_modules and build outputs — review before clearing',
      safety: 'review',
      totalBytes: 0,
      items: [
        {
          id: 'demo-build-nm',
          name: 'old-project/node_modules',
          path: '~/Projects/old-project/node_modules',
          sizeBytes: 420_000_000,
          category: 'build-artifacts',
          safety: 'review',
          description: 'Dependencies for an inactive project',
        },
      ],
    },
  ];

  for (const g of groups) {
    g.totalBytes = g.items.reduce((s, i) => s + i.sizeBytes, 0);
  }

  return {
    scannedAt: new Date().toISOString(),
    demo: true,
    groups: groups.filter((g) => g.items.length > 0),
    totalReclaimableBytes: groups.reduce((s, g) => s + g.totalBytes, 0),
  };
}
