# Disk Cleaner

A simple, calm, fluid disk cleaner — scan → review → free space in under a minute.

## Quick start

```bash
cd Disk-cleaner-app
npm install
npm run dev
```

Then open **http://localhost:5173** (UI). The API runs on **http://localhost:8787** and is proxied through Vite.

| Script | What it does |
|--------|----------------|
| `npm run dev` | Starts Express API + Vite UI together |
| `npm run build` | Builds the client for production |
| `npm start` | Serves API + built client (set `NODE_ENV=production`) |

## What gets cleaned

The scanner looks at common **safe** and **review** targets on this machine:

| Category | Safety | Typical targets |
|----------|--------|-----------------|
| Caches | Safe | Top-level dirs under `~/.cache`, `~/.npm` |
| Temporary files | Safe | Named leftovers in `/tmp` (`npm-*`, `vite-*`, `*.tmp`, `*.log`, …) — never the whole `/tmp` |
| Trash | Safe | Contents of `~/.local/share/Trash` |
| Old logs | Safe | When present as separate findings |
| Large downloads | Review carefully | Files ≥ ~20 MB in `~/Downloads` |
| Build artifacts | Review carefully | `node_modules` under `/workspace` or `~/Projects` |

Safe groups are **pre-selected** after a scan. Review groups stay unchecked.

## Safety model

- **No deletion without an explicit POST** to `/api/clear` with `{ ids: string[], confirm: true }`.
- Unknown ids are rejected — you must scan first so the server knows the paths.
- Protected paths (home root, `/tmp` itself, system roots, anything outside home/`/tmp`/`/workspace`) cannot be removed.
- Trash clearing empties trash contents; it does not remove the trash directory structure.
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
| `POST` | `/api/clear` | `{ ids, confirm: true }` | Deletes only confirmed ids |

## Stack

- Vite + React + TypeScript (soft light theme, one accent, CSS transitions)
- Express API on Node (Linux `df` + filesystem scans)

## Accessibility

- Labeled controls and dialogs
- Focus styles and Escape-to-dismiss on the confirm modal
- Live regions for scanning / success / errors
- Progressbar semantics on the disk usage bar
