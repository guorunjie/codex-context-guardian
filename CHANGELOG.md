# Changelog

## 0.2.0 - 2026-05-28

- Added `relay-baton status` for a single doctor, monitor, activity, and recovery-state view.
- Added `relay-baton follow repair` to rewrite hooks and monitor service settings, then restart the monitor.
- Added `relay-baton audit <bundle>` to score existing handoff memory without creating a new continuation.
- Fixed macOS LaunchAgent PATH handling by writing a service PATH and `GUARDIAN_CODEX_BIN`.
- Recovery plans now honor `GUARDIAN_CODEX_BIN` and use the resolved Codex binary.
- Added v1.0 roadmap, competitive analysis, open-source templates, and README release links.

## 0.1.0 - 2026-05-28

- Initial productized release.
- Added structured recovery bundles, fork-first recovery, fallback model attempts, Desktop handoff quality gates, macOS monitor, lifecycle hooks, CI, and GitHub release packaging.
