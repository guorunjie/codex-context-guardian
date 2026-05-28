# Changelog

## 0.5.0 - 2026-05-28

- Added a Linux, macOS, and Windows CI matrix for tests, build, package dry-run, and packed CLI smoke tests.
- Made the test script shell-independent by relying on Node's test discovery.
- Desktop remote-control startup now uses the resolved Codex binary, including `GUARDIAN_CODEX_BIN`, instead of assuming `codex` is on the service PATH.

## 0.4.0 - 2026-05-28

- Added Linux systemd user service generation for the background monitor.
- `monitor install` now routes to macOS LaunchAgent, Linux systemd user service, or Windows Task Scheduler based on platform.
- Documented Linux monitor location in README and v1 roadmap.

## 0.3.0 - 2026-05-28

- Added schema validation to `relay-baton audit`.
- `relay-baton audit` now exits non-zero when memory is invalid or blocked, so it can be used as a CI or release gate.
- Added `relay-baton demo` to generate a sample recovery bundle without requiring a real stuck Codex thread.
- Added architecture and case-study documentation for the v1.0 launch path.

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
