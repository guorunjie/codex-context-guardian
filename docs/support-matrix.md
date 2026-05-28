# Support Matrix

Relay Baton is a local Codex companion. Support depends on Node.js, Codex CLI, SQLite, and each platform's background service manager.

## Current Support

| Area | macOS | Linux | Windows |
| --- | --- | --- | --- |
| CLI commands | Verified locally and in CI | Verified in CI | Verified in CI |
| Packed CLI install smoke | Verified locally and in CI | Verified in CI | Verified in CI |
| Recovery bundle generation | Verified locally and in CI | Verified in CI | Verified in CI |
| Monitor install artifact | LaunchAgent implemented and locally running | systemd user service generated | Task Scheduler script generated |
| Monitor lifecycle | Verified on this Mac | Needs real-host validation | Needs real-host validation |
| Desktop app-server handoff | Experimental, macOS-focused | Not claimed | Not claimed |

## Required Runtime

- Node.js: `>=26`.
- Codex CLI: tested locally with `codex-cli 0.133.0`.
- SQLite: required for Codex local state inspection.
- GitHub CLI: optional, required only for online release checks and GitHub publishing.
- npm login: required only for registry publication.

## v1.0 Claims Boundary

Relay Baton can claim cross-platform CLI packaging once CI remains green on Linux, macOS, and Windows.

Relay Baton should not claim fully validated cross-platform background monitoring until `monitor install`, `monitor start`, `monitor status`, and `monitor stop` are run on real Linux and Windows hosts.

## Host Validation Evidence

Use `relay-baton validate host` to collect repeatable evidence on each platform:

```bash
relay-baton follow install
relay-baton follow start
relay-baton validate host --output ./relay-baton-validation
```

By default, the report treats source-release checks as advisory so installed tarballs can validate host health without repository-only files. Use `--strict-release` or `--online` when validating a release checkout:

```bash
relay-baton validate host --strict-release --output ./relay-baton-validation
relay-baton validate host --online --output ./relay-baton-validation
```

The report writes:

- `VALIDATION_REPORT.json` for automated checks;
- `VALIDATION_REPORT.md` for issue reports, release notes, or support-matrix updates.

For v1.0, attach validation reports from:

- macOS with LaunchAgent running;
- Linux with systemd user service running;
- Windows with Task Scheduler task running.
