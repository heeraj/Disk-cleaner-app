# Changelog

All notable changes to DiskCleaner are documented here.

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
