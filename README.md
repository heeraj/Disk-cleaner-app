# Disk Cleaner

A calm, Windows-style disk cleaner — scan → review → free space in under a minute.

Works as a **web app** (Vite + Express) and as a **standalone Electron desktop app** with native folder Browse and Open / Show in Explorer.

## Quick start (web)

```bash
cd disk-cleaner-app
npm install
npm run dev
```

Then open **http://localhost:5173** (UI). The API runs on **http://localhost:8787** and is proxied through Vite.

| Script | What it does |
|--------|----------------|
| `npm run dev` | Starts Express API + Vite UI together |
| `npm run build` | Builds the client + compiles the server |
| `npm start` | Serves API + built client (`NODE_ENV=production`) |
| `npm run typecheck` | Typechecks client and server |

### Windows (web)

```bat
cd disk-cleaner-app
npm install
npm run dev
```

Open `http://localhost:5173` in your browser. Use PowerShell or cmd; Node.js 18+ required.

## Desktop (Electron)

| Script | What it does |
|--------|----------------|
| `npm run electron:dev` | API + Vite + Electron window (hot reload UI) |
| `npm run electron:start` | Production build, then open Electron against local API |
| `npm run electron:build` | Build Windows **portable** + **NSIS** installer into `release/` |
| `npm run electron:build:dir` | Unpackaged dir build (any OS; good smoke test) |

### Electron architecture

- Main process (`electron/main.cjs`) starts the Express API (spawn in dev, in-process bundle in prod), waits for `/api/health`, then loads:
  - **Dev:** `http://localhost:5173` (Vite)
  - **Prod:** `http://127.0.0.1:${API_PORT}` (Express serves `client/dist`)
- Application menu is minimal (About / Quit only) — no File/Edit/View browser chrome.
- Secure preload (`electron/preload.cjs`) exposes `window.diskCleaner` via `contextBridge` (no `nodeIntegration`):
  - **Browse…** — `dialog.showOpenDialog({ properties: ['openDirectory'] })` to pick scan roots
  - **Open** / **Show** — `shell.openPath` / `shell.showItemInFolder` on clean items and large-file results
  - **Empty Recycle Bin** (Windows) — PowerShell `Clear-RecycleBin` with an in-app confirm
- In browser / `npm run dev` without Electron, typed path input remains; Browse / Explorer actions hide when `window.diskCleaner` is unavailable.
- Recurring scan reminders use an **in-app interval while the window is open**. True OS background scheduling is **future work**.

### Windows desktop build

On a Windows machine (or CI with Windows runners):

```bat
cd disk-cleaner-app
npm install
npm run electron:build
```

Artifacts land in `release/`:

- Portable `.exe` (no install)
- NSIS installer `.exe`

> Building Windows targets from Linux/macOS may need extra Wine/tooling. Prefer building on Windows, or use `npm run electron:build:dir` for a local unpackaged smoke test.

## Features

### Clean scan
Scans common **Safe** and **Review** targets (caches, temp, trash, downloads, build artifacts). Safe groups are pre-selected.

### Quick clean presets
One click selects matching groups after a scan (or triggers a scan first):

- Browser caches
- Package manager caches
- Temp files
- Empty Trash
- Safe all

**Presets never delete** — they only select. You must confirm Clear.

### Large files & folders
Separate sidebar view to find the largest files/folders under user-chosen roots (defaults: home, Downloads, Desktop). Configurable minimum size (e.g. 50 MB). **Browse…** picks folders in Electron; typed paths still work in the browser. Sort by size / oldest / name / path; filter files vs folders; duplicate-name hints; drill into a folder (list children without deleting). Each row has **Open** / **Show in Explorer** when running under Electron. Scans are bounded by depth, time, and count. Select + delete uses the same confirm-required clear path; items are always **Review**.

### Scheduled / recurring scans
Preferences: off / daily / weekly. Stored in `data/prefs.json` on the server and mirrored in `localStorage`. UI shows last scan time and next reminder. Electron checks on an interval while open.

### Dark mode
Soft dark + light themes, one accent color, fluid CSS transitions, preference persisted (`localStorage` + server prefs).

## What gets cleaned

| Category | Safety | Typical targets |
|----------|--------|-----------------|
| Caches | Safe | Top-level dirs under `~/.cache`, `~/.npm`, browser/package caches |
| Temporary files | Safe | Named leftovers in `/tmp` (`npm-*`, `vite-*`, `*.tmp`, `*.log`, …) — never the whole `/tmp` |
| Trash | Safe | Contents of `~/.local/share/Trash` |
| Old logs | Safe | When present as separate findings |
| Large downloads | Review carefully | Files ≥ ~20 MB in `~/Downloads` |
| Build artifacts | Review carefully | `node_modules` under `/workspace` or `~/Projects` |
| Large files finder | Review carefully | User-driven scan under chosen roots |

## Safety model

- **No deletion without an explicit POST** to `/api/clear` with `{ ids: string[], confirm: true }`.
- Unknown ids are rejected — you must scan (or large-scan) first so the server knows the paths.
- Protected paths (home root, `/tmp` itself, system roots, anything outside home/`/tmp`/`/workspace`) cannot be removed.
- Trash clearing empties trash contents; it does not remove the trash directory structure.
- Large-file deletes always require confirmation and are marked Review.
- No accounts, ads, telemetry, or aggressive system-file deletion.

## DEMO_MODE

When real paths are limited or you want a predictable demo:

```bash
DEMO_MODE=1 npm run dev
```

Or copy `.env.example` and export `DEMO_MODE=1`.

In demo mode the API returns realistic sample disk usage and findings. Clear requests simulate freeing space and **do not touch the filesystem**.

## API

| Method | Path | Body | Notes |
|--------|------|------|-------|
| `GET` | `/api/health` | — | Liveness |
| `GET` | `/api/disk` | — | Used / free / total |
| `POST` | `/api/scan` | `{}` | Grouped findings |
| `POST` | `/api/large-scan` | `{ roots?, minBytes?, maxDepth?, maxItems? }` | Largest files/folders |
| `GET` | `/api/large-roots` | — | Default roots that exist |
| `POST` | `/api/list-dir` | `{ path }` | List children of one folder (drill-in) |
| `POST` | `/api/clear` | `{ ids, confirm: true }` | Deletes only confirmed ids |
| `GET` | `/api/prefs` | — | Theme / schedule / last scan |
| `PUT` | `/api/prefs` | partial prefs | Persist preferences |

## Stack

- Vite + React + TypeScript (light/dark themes, one accent, CSS transitions)
- Express API on Node (Linux `df` + filesystem scans)
- Electron + electron-builder for desktop packaging

## Accessibility

- Labeled controls and dialogs
- Focus styles; Escape closes modals; Enter activates the focused primary action
- Live regions for scanning / success / errors
- Progressbar semantics on the disk usage bar
- Theme toggle with accessible label
