# Relay Baton v1.0 Launch Audit

This audit is the source of truth for deciding whether Relay Baton is ready to call itself v1.0.

Date: 2026-05-28
Current package version: 0.8.2
Target package version: 1.0.0

## Launch Definition

Relay Baton v1.0 means a new Codex user can install it, turn on following, survive a real compact failure, and audit why exactly one continuation was created from the latest real task state.

## Requirement Matrix

| Area | v1.0 requirement | Current evidence | Status | Evidence still required |
| --- | --- | --- | --- | --- |
| GitHub distribution | Public repository, release assets, checksums, install docs, CI badge. | Repository `guorunjie/codex-relay-baton-guardian`, GitHub Release `v0.8.1`, tarball asset, README install commands, CI matrix. | Mostly ready | Cut final `v1.0.0` release after all other rows are complete. |
| npm distribution | `npm install -g codex-relay-baton-guardian` works on a clean machine. | Publish workflow exists; CI runs `npm publish --dry-run --json`; package name and bin paths are npm-safe. | Not complete | Maintainer must configure `NPM_TOKEN` or run `npm adduser`, publish, then verify `npm view codex-relay-baton-guardian version`. |
| Local install from GitHub | GitHub install path works without TypeScript source stripping issues. | Package uses built `dist/` output, `files` whitelist, and packed CLI smoke tests. | Ready | Re-run smoke test from the final GitHub release tarball. |
| macOS monitor | LaunchAgent install/start/status works and monitor can see Codex. | This Mac reports `com.relay-baton.monitor` loaded and running; `relay-baton status` is `ok`. | Ready | Attach a final `relay-baton validate host --output` report to the v1.0 release notes. |
| Linux monitor | systemd user service can be installed, started, inspected, stopped, and repaired. | systemd service generation exists; Linux CI covers CLI/build/package smoke. | Not complete | Run `follow install/start/status/stop` and `validate host` on a real Linux host. |
| Windows monitor | Task Scheduler script can install, start, inspect, stop, and repair monitoring. | Task Scheduler script generation exists; Windows CI covers CLI/build/package smoke. | Not complete | Run generated scheduled task lifecycle and `validate host` on a real Windows host. |
| Recovery correctness | Compact failures use two fallback attempts, then one best relay with duplicate protection. | Tests cover fallback, fork, CLI fallback, duplicate source recovery, bundle quality, and turn-aborted handling. | Mostly ready | Run one end-to-end real compact-failure drill and preserve redacted evidence. |
| Handoff fidelity | New continuation prefers latest goal, latest user intent, recent assistant/tool progress, current worktree, and superseded directions. | `HANDOFF_MEMORY.json`, `RECENT_THREAD_CONTEXT.md`, `RECOVERY.md`, git diff/status, audit command, and quality tests exist. | Ready | Include a real audited bundle excerpt in the public case study. |
| Fork-first strategy | `codex fork` is preferred when the source session is readable; Desktop is explicit or fallback. | README, recovery strategy, tests, and local `codex fork --help` confirm fork path availability. | Ready | Keep Desktop path documented as less-lossless and experimental. |
| Duplicate prevention | One source thread must not create parallel fork/Desktop relays unless forced. | Recovery state tracks `forkHandoffCreated` and `desktopHandoffCreated`; tests cover duplicate source recovery. | Ready | Document operator response when a duplicate is blocked. |
| Operability | `doctor`, `status`, `follow repair`, `release check`, and `validate host` provide actionable output. | Commands exist and are covered by tests; release gate passes offline. | Mostly ready | Improve public troubleshooting with real failure examples. |
| Support intake | Bug reports collect host validation, bundle audit, commands, environment, and logs. | Bug template requests `VALIDATION_REPORT.json`, `relay-baton audit`, command output, environment, and monitor logs. | Ready | Keep `docs/validation-report-guide.md` linked from support docs. |
| Public trust assets | README shows the failure, relay, and audit workflow visually. | README has install/architecture text and comparison links. | Not complete | Add screenshots or GIF and a real case study from an actual compact failure. |
| API stability | v1.0 command names and primary options are frozen. | Stable CLI surface and experimental Desktop boundary are documented below. | Ready | Only add new flags after v1.0 unless a breaking change is documented with a deprecation window. |

## v1.0 Blockers

1. npm package is not published.
2. Linux and Windows background monitor lifecycle are not real-host validated.
3. No real compact-failure case study with redacted evidence is published.
4. Public demo media is missing.
5. Final `relay-baton release check --v1 --online` has not passed.

## v1.0 Release Gate

Before tagging `v1.0.0`, all commands must pass on the release commit:

```bash
npm test
npm run build
npm run release:check
npm pack --dry-run --json
npm publish --dry-run --json
relay-baton validate host --strict-release --output ./relay-baton-validation
relay-baton release check --online
relay-baton release check --v1 --online
```

The final `--online` check must pass, including npm authentication and the npm registry package version.

## Stable CLI Surface

These commands are the v1.0 compatibility surface:

- `relay-baton doctor [--json] [--home <CODEX_HOME>]`
- `relay-baton status [--json] [--home <CODEX_HOME>]`
- `relay-baton follow install|repair|status|start|stop [--dry-run] [--home <CODEX_HOME>]`
- `relay-baton monitor install|uninstall|status|start|stop [--dry-run] [--home <CODEX_HOME>]`
- `relay-baton activity status [--json] [--home <CODEX_HOME>]`
- `relay-baton recover --thread <id>|--last [--strategy auto|fallback-model|fork|new-session] [--dry-run]`
- `relay-baton handoff --thread <id>|--last [--desktop] [--plan-mode] [--goal-mode] [--no-start-turn] [--force] [--json]`
- `relay-baton pack --thread <id>|--last`
- `relay-baton audit <bundle-dir|HANDOFF_MEMORY.json> [--json]`
- `relay-baton demo [--output <dir>] [--json]`
- `relay-baton release check [--online] [--v1] [--json] [--root <repo>]`
- `relay-baton validate host [--online] [--strict-release] [--json] [--output <dir>] [--root <repo>] [--home <CODEX_HOME>]`

Compatibility policy:

- v1.x may add commands, flags, fields, and report sections.
- v1.x should not remove or rename the stable commands above without at least one minor release of deprecation notice.
- JSON outputs keep `schemaVersion` where a schema is already present; new fields are additive.
- `--desktop`, Codex app-server, and remote-control behavior remain experimental because they depend on upstream Desktop internals.

## Evidence Pack For Release Notes

Attach or link these artifacts in the v1.0 release:

- macOS `VALIDATION_REPORT.md` and redacted `VALIDATION_REPORT.json`;
- Linux `VALIDATION_REPORT.md` and redacted `VALIDATION_REPORT.json`;
- Windows `VALIDATION_REPORT.md` and redacted `VALIDATION_REPORT.json`;
- one redacted real recovery bundle audit;
- CI run URL for the `v1.0.0` commit;
- npm package URL and provenance status;
- GitHub Release tarball checksum.
