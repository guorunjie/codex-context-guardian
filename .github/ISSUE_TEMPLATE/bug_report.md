---
name: Bug report
about: Report a Relay Baton failure or incorrect recovery
title: "[Bug]: "
labels: bug
assignees: ""
---

## What happened?

## Expected behavior

## Environment

- OS:
- Node version:
- Codex CLI version:
- Relay Baton version:

## Commands

```bash
relay-baton doctor
relay-baton status
relay-baton validate host --output ./relay-baton-validation
```

Attach `relay-baton-validation/VALIDATION_REPORT.json` when possible.
See `docs/validation-report-guide.md` before sharing public logs.

## Recovery bundle

If the issue is about a wrong, duplicate, or missing relay, run:

```bash
relay-baton audit /path/to/recovery-bundle --json
```

Paste the audit output and list the bundle files that were present.

## Relevant logs

```text
Paste `~/.codex/relay-baton/logs/monitor.err.log` and `monitor.out.log` excerpts if relevant.
```
