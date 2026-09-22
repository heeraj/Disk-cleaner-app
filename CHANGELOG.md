# Changelog

All notable changes to DiskCleaner are documented here.

## [1.4.0] — 2026-09-22

### Fixed
- **No more double-counted large-scan totals.** Parent folder sizes are inclusive (TreeSize / WinDirStat / WizTree style). Result and selection totals now use **unique bytes** — if Steam and a game folder inside it are both listed, only the parent counts toward “found” / “selected” reclaimable space. A 1 TB disk no longer reports 2 TB+.
- Selecting a parent **auto-deselects nested children**; covered children show as greyed (“Covered”) and are skipped on delete (one parent delete is enough). Confirm-before-delete unchanged.
- Scans **skip symlinks / junctions / reparse points** by default so mount points cannot inflate totals past disk capacity.

### Added
- Large results default to **top-level / non-nested** list; toggle **Show nested items** for the full hierarchical list with indent.
- Unique total label in the UI (e.g. “591 GB unique · … raw sum”).
- **Drive picker** (volumes C:, D:, … / mount roots) alongside folder Browse.
- Remembers last large-scan roots and minimum size in prefs.
- Slightly higher scan caps for large drives (depth / item / time), still with SSE progress and cancel.
- Unit check: `npm run test:unique-bytes`.

### Changed
- Sticky denser results toolbar; clearer empty / partial-scan messaging.
- API remains bound to `127.0.0.1` only.

## [1.3.0] — 2026-09-10

### Added
- Premium frameless title bar with Mac-style traffic-light window controls
- Official app icon (window, installer, favicon)
- Live scan progress (SSE) for Clean and Large files, with cancel
- Large files settings panel auto-collapses on Find (smooth animation; unfold anytime)
- Privacy Policy, Disclaimer, and contact details for releases

### Fixed
- API binds to `127.0.0.1` only to reduce Windows Firewall prompts on local use
- Double title-bar chrome in Electron (frameless single chrome)

## [1.2.0] — 2026-09-09

### Added
- Native sidebar navigation and denser Windows-utility UI
- Browse folder picker (Electron)
- Open / Show in Explorer on items
- Large files sort, filter, drill-in, duplicate-name hints
- Empty Recycle Bin (Windows, confirmed)

## [1.1.1] — 2026-09-09

### Fixed
- Packaged desktop app startup on Windows (embedded API, no broken spawn)

## [1.1.0] — 2026-09-09

### Added
- Large files finder, quick clean presets, scheduled scan prefs, dark mode
- Electron packaging (portable + NSIS)

## [1.0.0] — 2026-09-09

### Added
- Initial calm disk cleaner (scan → review → clear) with safety confirmations
