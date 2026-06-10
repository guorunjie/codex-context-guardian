# Relay Baton v1.x Launch Audit

This audit is the source of truth for deciding whether the current Relay Baton v1 release line is complete.

Date: 2026-06-10
Current package version: 1.1.3
Target package version: 1.1.3

## Launch Definition

Relay Baton v1.0 means a new Codex user can install it, turn on following, survive a real compact failure, and audit why exactly one continuation was created from the latest real task state.

## Requirement Matrix

| Area | v1.0 requirement | Current evidence | Status | Evidence still required |
| --- | --- | --- | --- | --- |
| GitHub distribution | Public repository, release assets, checksums, install docs, CI badge. | Repository `guorunjie/codex-relay-baton-guardian`, `v1.1.3` GitHub Release, tarball and `SHA256SUMS` assets, README install commands, CI matrix, manual host-validation workflow. | Ready | Keep the `v1.1.3` release target aligned to the current release commit. |
| npm distribution | `npm install -g codex-relay-baton-guardian` works on a clean machine for the current package version. | `1.1.2` is published to npm; `1.1.3` is not yet published. Publish workflow exists, CI runs `npm publish --dry-run --json`, and package name/bin paths are npm-safe. | Blocked | Log in as the `guorunjie` npm maintainer or replace `NPM_TOKEN`, publish `1.1.3`, then verify `npm view codex-relay-baton-guardian@1.1.3 version`. |
| Local install from GitHub | GitHub install path works without TypeScript source stripping issues. | README points to `npm install -g github:guorunjie/codex-relay-baton-guardian#v1.1.3`; package uses built `dist/` output, `files` whitelist, and packed CLI smoke tests. | Ready | Keep GitHub install as the primary latest install route until npm catches up. |
| macOS monitor | LaunchAgent install/start/status works and monitor can see Codex. | This Mac reports `com.relay-baton.monitor` loaded and running; `docs/validation-reports/macos/VALIDATION_REPORT.json` is attached and redacted. | Ready | Keep validation current for the active release line. |
| Linux monitor | systemd user service can be installed, started, inspected, stopped, and repaired. | Linux CI covers CLI/build/package smoke; `docs/validation-reports/linux/VALIDATION_REPORT.json` proves a packed global CLI installed and loaded the systemd user service in the Host Validation workflow. | Ready | Keep validation current for the active release line. |
| Windows monitor | Task Scheduler script can install, start, inspect, stop, and repair monitoring. | Windows CI covers CLI/build/package smoke; `docs/validation-reports/windows/VALIDATION_REPORT.json` proves a packed global CLI installed and loaded the Task Scheduler task in the Host Validation workflow. | Ready | Keep validation current for the active release line. |
| Recovery correctness | Compact failures use two fallback attempts, then one best relay with duplicate protection. | Tests cover fallback, fork, CLI fallback, duplicate source recovery, bundle quality, turn-aborted handling, and `docs/case-study-codex-compact-failure.md` contains a redacted local recovery record. | Mostly ready | Repeat the drill on the final v1.0 tag. |
| Handoff fidelity | New continuation prefers latest goal, latest user intent, recent assistant/tool progress, current worktree, and superseded directions. | `HANDOFF_MEMORY.json`, `RECENT_THREAD_CONTEXT.md`, `RECOVERY.md`, git diff/status, audit command, quality tests, and case-study audit excerpt exist. | Ready | Keep future case studies redacted before publication. |
| Fork-first strategy | `codex fork` is preferred when the source session is readable; Desktop is explicit or fallback. | README, recovery strategy, tests, and local `codex fork --help` confirm fork path availability. | Ready | Keep Desktop path documented as less-lossless and experimental. |
| Duplicate prevention | One source thread must not create parallel fork/Desktop relays unless forced. | Recovery state tracks `forkHandoffCreated` and `desktopHandoffCreated`; tests cover duplicate source recovery. | Ready | Document operator response when a duplicate is blocked. |
| Operability | `doctor`, `status`, `follow repair`, `release check`, and `validate host` provide actionable output. | Commands exist and are covered by tests; release gate passes offline. | Mostly ready | Improve public troubleshooting with real failure examples. |
| Support intake | Bug reports collect host validation, bundle audit, commands, environment, and logs. | Bug template requests `VALIDATION_REPORT.json`, `relay-baton audit`, command output, environment, and monitor logs. | Ready | Keep `docs/validation-report-guide.md` linked from support docs. |
| Public trust assets | README shows the failure, relay, and audit workflow visually. | README includes `docs/assets/relay-baton-demo.png`; case study includes a redacted recovery record and audit excerpt. | Mostly ready | Replace the static visual with a real GIF/video before broad launch if possible. |
| API stability | v1.0 command names and primary options are frozen. | Stable CLI surface and experimental Desktop boundary are documented below. | Ready | Only add new flags after v1.0 unless a breaking change is documented with a deprecation window. |

## v1.0 Blockers

1. Publish `codex-relay-baton-guardian@1.1.3` to npm.
2. Confirm `npm view codex-relay-baton-guardian@1.1.3 version` returns `1.1.3`.
3. Run final `relay-baton release check --v1 --online` and confirm it passes.

## v1.0 Release Gate

Before declaring the current release line complete, all commands must pass on the release commit:

```bash
npm test
npm run build
npm run release:check
npm pack --dry-run --json
npm publish --dry-run --json
relay-baton validate host --strict-release --output ./relay-baton-validation
gh workflow run host-validation.yml
relay-baton release check --online
relay-baton release check --v1 --online
```

The final `--online` check must pass, including npm authentication, the npm registry package version, and strict validation of healthy macOS, Linux, and Windows host reports.

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

Attach or link these artifacts in the current release:

- macOS `VALIDATION_REPORT.md` and redacted `VALIDATION_REPORT.json`;
- Linux `VALIDATION_REPORT.md` and redacted `VALIDATION_REPORT.json`;
- Windows `VALIDATION_REPORT.md` and redacted `VALIDATION_REPORT.json`;
- one redacted real recovery bundle audit;
- CI run URL for the `v1.0.0` commit;
- npm package URL and provenance status;
- GitHub Release tarball checksum.
