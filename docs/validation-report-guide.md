# Validation Report Guide

`relay-baton validate host` is the standard evidence bundle for support requests and release validation.

## When To Collect It

Collect a report when:

- a monitor does not start or keep running;
- a compact failure is not detected;
- a relay is duplicated, blocked, or created in the wrong destination;
- a maintainer is validating macOS, Linux, or Windows support for a release.

## Commands

```bash
relay-baton doctor
relay-baton status
relay-baton validate host --output ./relay-baton-validation
```

For release checkouts, include source-release readiness:

```bash
relay-baton validate host --strict-release --output ./relay-baton-validation
```

For final release validation, include online GitHub/npm checks:

```bash
relay-baton validate host --online --output ./relay-baton-validation
```

## GitHub Host Validation Workflow

Maintainers can collect cross-platform artifacts from GitHub Actions before a release:

```bash
gh workflow run host-validation.yml
gh run list --workflow "Host Validation"
gh run download <run-id> --name host-validation-linux
gh run download <run-id> --name host-validation-windows
gh run download <run-id> --name host-validation-macos
```

The workflow installs the packed package globally and runs the public `relay-baton` command, so it catches packaging and service-manager regressions that local source commands can miss.

Only attach or commit reports whose `VALIDATION_REPORT.json` has `summary.ok: true`, `summary.doctorOk: true`, `summary.monitorInstalled: true`, and `summary.monitorLoaded: true`. Treat failed workflow artifacts as debugging evidence, not as v1.0 support proof.

## Files To Attach

Attach these files to GitHub issues or release notes:

- `relay-baton-validation/VALIDATION_REPORT.md`
- `relay-baton-validation/VALIDATION_REPORT.json`
- relevant `~/.codex/relay-baton/logs/monitor.out.log` excerpts
- relevant `~/.codex/relay-baton/logs/monitor.err.log` excerpts

If the issue is about an incorrect relay, also attach:

```bash
relay-baton audit /path/to/recovery-bundle --json
```

## Redaction

Before sharing publicly, review and redact:

- local usernames and absolute paths when they reveal private information;
- repository names that are not public;
- thread titles containing private business context;
- secrets, tokens, cookies, account ids, and customer data.

Do not redact command names, platform, Node version, Codex CLI version, monitor state, or release-check statuses. Those fields are needed to debug the problem.

## Platform Validation

For v1.0, maintainers should collect one report from each supported monitor environment:

- macOS with LaunchAgent running;
- Linux with systemd user service running;
- Windows with Task Scheduler task running.

Store final release evidence outside the npm package unless the report is fully redacted. Redacted reports committed under `docs/validation-reports/<platform>/` must still preserve platform, Node, Codex CLI, monitor status, release-check status, and next-action fields.
