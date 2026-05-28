# Support Matrix

Relay Baton is a local Codex companion. Support depends on Node.js, Codex CLI, SQLite, and each platform's background service manager.

## Current Support

| Area | macOS | Linux | Windows |
| --- | --- | --- | --- |
| CLI commands | Verified locally and in CI | Verified in CI | Verified in CI |
| Packed CLI install smoke | Verified locally and in CI | Verified in CI | Verified in CI |
| Recovery bundle generation | Verified locally and in CI | Verified in CI | Verified in CI |
| Monitor install artifact | LaunchAgent implemented and locally running | systemd user service generated | Task Scheduler script generated |
| Monitor lifecycle | Verified on this Mac | Verified in Host Validation workflow | Verified in Host Validation workflow |
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

See [docs/validation-report-guide.md](validation-report-guide.md) for redaction rules and the full support-evidence checklist.

Maintainers can also run the manual `Host Validation` GitHub Actions workflow to collect Linux, macOS, and Windows artifacts from the packed global CLI:

```bash
gh workflow run host-validation.yml
```

Those artifacts are useful for release triage, but v1.0 support claims require healthy reports. The release gate validates report contents, not just file presence: `schemaVersion` must be `1`, `platform.os` must match the report directory, and `summary.ok`, `summary.doctorOk`, `summary.monitorInstalled`, and `summary.monitorLoaded` must all be `true`.

Current committed release evidence:

- macOS with LaunchAgent running: `docs/validation-reports/macos/`;
- Linux with systemd user service running: `docs/validation-reports/linux/`;
- Windows with Task Scheduler task running: `docs/validation-reports/windows/`.
