# Changelog

## 0.8.2 - 2026-05-28

- Added `docs/v1-launch-audit.md` as the requirement-by-requirement v1.0 release decision record.
- Release readiness now checks that the launch audit and validation report guide exist and that bug reports request validation reports plus bundle audit output.
- Added `relay-baton release check --v1` as a strict v1.0 evidence gate for online publication, real case-study evidence, visual demo media, cross-platform host reports, and stable CLI documentation.
- Expanded the bug report template so support issues collect host validation, recovery bundle audit output, and monitor logs.

## 0.8.1 - 2026-05-28

- Changed `relay-baton validate host` so host health and source-release readiness are separated.
- Release gate failures are advisory for host validation unless `--online` or `--strict-release` is used.
- This keeps installed npm/GitHub tarballs from failing host validation merely because repository-only files such as `.github/` or `package-lock.json` are absent.

## 0.8.0 - 2026-05-28

- Added `relay-baton validate host` to generate machine-readable and human-readable host validation reports.
- Host validation reports include doctor checks, monitor status, release gate results, activity state, recovery state, platform details, and next actions.
- Added validation report tests and documentation for real-host Linux/Windows/macOS evidence collection.

## 0.7.0 - 2026-05-28

- Added a manual `Publish npm` GitHub Actions workflow for authenticated registry publication with npm provenance.
- CI now runs `npm publish --dry-run --json` so publish-time package warnings are caught before release.
- Fixed package `bin` paths to npm-normalized values so global CLI shims are preserved during publication.
- Release readiness now checks publish workflow presence, publish dry-run coverage, and npm-safe bin paths.

## 0.6.0 - 2026-05-28

- Added `relay-baton release check` as a v1.0 readiness gate.
- Release checks now verify package metadata, package-lock sync, changelog entry, built CLI, README install paths, v1 docs, competitive analysis, cross-platform CI, and clean git state.
- `relay-baton release check --online` also checks the matching GitHub Release, latest GitHub CI, npm authentication, and npm package publication.
- CI now runs the offline release readiness gate after build.

## 0.5.0 - 2026-05-28

- Added a Linux, macOS, and Windows CI matrix for tests, build, package dry-run, and packed CLI smoke tests.
- Made the test script shell-independent by relying on Node's test discovery.
- Desktop remote-control startup now uses the resolved Codex binary, including `GUARDIAN_CODEX_BIN`, instead of assuming `codex` is on the service PATH.
- Recovery bundle project-file discovery now uses Node filesystem traversal instead of platform-specific shell `find`.

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
