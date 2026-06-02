# Relay Baton

[![CI](https://github.com/guorunjie/codex-relay-baton-guardian/actions/workflows/ci.yml/badge.svg)](https://github.com/guorunjie/codex-relay-baton-guardian/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/guorunjie/codex-relay-baton-guardian)](https://github.com/guorunjie/codex-relay-baton-guardian/releases)
[![npm](https://img.shields.io/npm/v/codex-relay-baton-guardian)](https://www.npmjs.com/package/codex-relay-baton-guardian)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Sleep-safe Codex recovery for long-running tasks. Let Codex keep working while you sleep.**

![Relay Baton recovery flow](docs/assets/relay-baton-demo.png)

Relay Baton is a local monitor for Codex Desktop/CLI. When a long task hits remote compaction failures, unsupported compact models, or the hard context-window error `Codex ran out of room in the model's context window`, Relay Baton detects the stuck source thread, preserves the latest real task state, and queues one audited recovery bundle so the work can continue instead of dying overnight. Visible fork/Desktop relays are explicit, not a background side effect.

The core rule is simple: keep one best relay anchored on the latest real task state, not an old title, stale summary, or abandoned direction.

```bash
npm install -g codex-relay-baton-guardian
relay-baton doctor
relay-baton follow install
relay-baton follow start
relay-baton diagnose --last
```

Public evidence:

- Real compact-failure case study: [docs/case-study-codex-compact-failure.md](docs/case-study-codex-compact-failure.md)
- 30-60 second demo outline: [docs/demo-30s-rescue.md](docs/demo-30s-rescue.md)
- Host validation guide: [docs/validation-report-guide.md](docs/validation-report-guide.md)
- High-star readiness audit: [docs/high-star-readiness-audit.md](docs/high-star-readiness-audit.md)

## Why It Exists

Long agent sessions often fail after the project has already changed direction. A naive handoff based on the old thread title or an early summary can revive abandoned work and mislead the next conversation.

Relay Baton avoids that by combining:

- Queue-only unattended monitoring by default, because LaunchAgent/systemd/Task Scheduler monitors do not have an interactive TTY and should not create empty visible sidebar threads if a remote-control turn cannot start.
- Codex app-server `thread/fork` with `excludeTurns` for explicit visible recovery when the user asks Relay Baton to create a fork.
- Codex CLI `fork` for manual recovery when the user is in a terminal and wants the closest possible branch from the original readable session.
- Last-healthy-checkpoint fork for hard context overflow, using the newest successful `Stop` or `PostCompact` hook instead of retrying the saturated source thread.
- Startup backfill over recent compact failures, so restarting the monitor does not silently skip a failure that happened minutes earlier.
- `relay-baton diagnose`, which explains why a thread was not rescued: skipped log id, missing hooks, cooldown, old handoff state, lineage mismatch, non-TTY CLI failure, or app-server unavailability.
- Structured memory files that prioritize the latest goal, latest real user intent, concrete tool progress, current worktree state, and superseded directions.
- Desktop handoff only when the user asks for a visible new Desktop conversation or when fork/CLI recovery is unavailable.

## Features

- `relay-baton doctor` checks Codex CLI, local SQLite state, logs, configured models, and compact hooks.
- `relay-baton diagnose --thread <id>|--last` explains why a stuck task was or was not rescued.
- `relay-baton status` summarizes doctor, monitor, activity, and recovery state in one view.
- `relay-baton install-hooks` installs Codex lifecycle hooks for activity tracking and compact snapshots.
- `relay-baton follow install` installs Codex lifecycle hooks and the background monitor together.
- `relay-baton follow repair` repairs hooks, LaunchAgent PATH, and monitor startup after shell or Homebrew path changes.
- `relay-baton watch --auto --fork --queue-only` monitors Codex logs and queues audited recovery bundles automatically.
- `relay-baton recover --thread <id> --strategy auto` executes fallback-model, last-healthy-fork, fork, or new-session recovery.
- `relay-baton recover --thread <id> --strategy fork --app-server` uses Codex app-server `thread/fork` for official-control-plane recovery.
- `relay-baton app-server status|fork|rollback|compact` probes and exercises Codex app-server thread operations directly.
- `relay-baton audit <bundle>` scores a recovery bundle without creating a fork or Desktop conversation.
- `relay-baton demo` creates an auditable sample recovery bundle for trying the workflow without waiting for a real stuck thread.
- `relay-baton handoff --thread <id> --desktop --goal-mode` creates a Desktop-visible continuation with a quality gate.
- `relay-baton release check` verifies release readiness locally, with optional online GitHub/npm checks and a strict `--v1` evidence gate.
- `relay-baton validate host` writes a shareable host validation report for platform support evidence.
- `relay-baton monitor install` installs a background monitor:
  - macOS: LaunchAgent at `~/Library/LaunchAgents/com.relay-baton.monitor.plist`
  - Linux: systemd user service at `~/.config/systemd/user/relay-baton-monitor.service`
  - Windows: Task Scheduler install script generated under the Relay Baton log directory
- Legacy aliases remain available: `guardian` and `codex-context-guardian`.

## Recovery Bundle

Every fork/new-session/Desktop relay can carry the same bundle:

- `HANDOFF_MEMORY.json`: machine-readable checkpoint with latest goal, latest user intent, latest assistant/tool progress, superseded directions, pending/completed/blockers, next action, telemetry, warnings, confidence, and evidence.
- `RECENT_THREAD_CONTEXT.md`: human-readable recent context. Evidence blocks are clearly marked as source evidence, not fresh instructions.
- `RECOVERY.md`: fixed recovery order and prompt.
- `git-status.txt`, `git-diff-stat.txt`, `git-diff.patch`: current workspace facts.
- `selected-files.md`: capped project files for recovery.

Recovery priority is fixed:

1. `HANDOFF_MEMORY.json`
2. `RECENT_THREAD_CONTEXT.md`
3. Git status/diff and current files
4. Selected project files
5. Old thread title

If those disagree, Relay Baton tells the next session to trust the bundle and current worktree over the old title.

## Codex Following

Relay Baton follows Codex with a hybrid trigger model:

- Lifecycle hooks record near-real-time activity for `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `PreCompact`, and `PostCompact`.
- The background monitor polls Codex's local log database as a safety net.
- `activity-state.json` keeps the latest event, active turn, compact state, healthy checkpoints, and recent hook events for each thread.

This is more reliable than pure polling and less brittle than depending only on private Desktop UI state.

Install the full local follower:

```bash
relay-baton follow install
relay-baton follow start
relay-baton follow status
```

Inspect recorded activity:

```bash
relay-baton activity status
```

Generate and audit a demo bundle:

```bash
relay-baton demo
relay-baton audit ~/.codex/relay-baton/bundles/<demo-bundle>
```

Repair local following after moving Node/Codex/Homebrew paths:

```bash
relay-baton follow repair
relay-baton status
```

## Automatic Strategy

For each source thread:

1. Hard context overflow: queue a last-healthy fork bundle from the newest successful `Stop` or `PostCompact` checkpoint. This handles `Codex ran out of room in the model's context window. Start a new thread or clear earlier history before retrying.`
2. Generic remote compaction failure: queue one structured recovery bundle for the best matching task chain. This avoids empty app-server forks from a background LaunchAgent.
3. Model-specific compact unsupported failure in an interactive CLI: fallback-model recovery can still be used manually.
4. If visible app-server recovery is explicitly enabled but unavailable: write the recovery bundle, record `manualHandoffRequired`, and surface the reason through `relay-baton diagnose` instead of silently pretending a fork succeeded.
5. One best relay is kept per source task chain:
   - default unattended route: queue-only bundle with `HANDOFF_MEMORY.json`, `RECENT_THREAD_CONTEXT.md`, and workspace facts;
   - explicit visible route: app-server `thread/fork` with the structured bundle prompt and visible-relay rate limiting;
   - manual route: `codex fork` when a TTY exists;
   - `--desktop` or `GUARDIAN_AUTO_DESTINATION=desktop`: one Desktop-visible continuation, guarded against duplicates;
   - `GUARDIAN_AUTO_DESTINATION=cli`: fresh CLI session in the original working directory.

The default fallback model is `gpt-5.4`; override it with `GUARDIAN_FALLBACK_MODEL`.

## Install

Install directly from GitHub:

```bash
npm install -g github:guorunjie/codex-relay-baton-guardian
relay-baton doctor
relay-baton follow install
relay-baton follow start
```

Install from npm after package publication:

```bash
npm install -g codex-relay-baton-guardian
relay-baton doctor
relay-baton follow install
relay-baton follow start
```

Local development:

```bash
git clone git@github.com:guorunjie/codex-relay-baton-guardian.git relay-baton
cd relay-baton
npm install
npm run build
npm test
npm link
relay-baton doctor
```

Use from a checkout without linking:

```bash
npm run build
node ./bin/relay-baton.js doctor
```

## Commands

Preview recovery for the latest thread:

```bash
relay-baton recover --last --dry-run
```

Fork a stuck thread with bundle-backed instructions:

```bash
relay-baton recover --thread <stuck-thread-id> --strategy fork
```

Recover a hard context-window overflow from the latest healthy checkpoint:

```bash
relay-baton recover --thread <stuck-thread-id> --strategy last-healthy-fork
```

Use Codex app-server as the recovery transport when available:

```bash
relay-baton app-server status
relay-baton recover --thread <stuck-thread-id> --strategy fork --app-server
relay-baton recover --thread <stuck-thread-id> --strategy last-healthy-fork --app-server
```

App-server recovery uses `thread/fork` with `excludeTurns` by default, then starts the recovery prompt in the forked thread. See [docs/app-server-integration.md](docs/app-server-integration.md).

Create a recovery bundle for manual use:

```bash
relay-baton handoff --last
```

Audit a bundle before creating a visible continuation:

```bash
relay-baton audit ~/.codex/relay-baton/bundles/<bundle-id>
```

Create one Desktop-visible continuation:

```bash
relay-baton handoff --thread <stuck-thread-id> --desktop --goal-mode
```

Relay Baton will not create a second Desktop continuation for the same source thread by default. It first evaluates `HANDOFF_MEMORY.json`; if a good Desktop relay already exists, it prints the existing thread id instead of creating another sidebar entry. Use `--force` only after reviewing the existing relay.

Start safe unattended monitoring:

```bash
relay-baton watch --auto --fork --queue-only
```

Create a visible app-server relay explicitly:

```bash
relay-baton watch --once --auto --fork --app-server --create-visible-relay
```

Create a visible Desktop handoff explicitly:

```bash
relay-baton watch --once --auto --desktop --goal-mode --create-visible-relay
```

Install the monitor:

```bash
relay-baton monitor install
relay-baton monitor start
relay-baton monitor status
```

Check release readiness:

```bash
relay-baton release check
relay-baton release check --online
relay-baton release check --v1 --online
```

Generate a host validation report:

```bash
relay-baton validate host --output ./relay-baton-validation
relay-baton validate host --strict-release --output ./relay-baton-validation
```

## Configuration

```bash
GUARDIAN_FALLBACK_MODEL=gpt-5.4
GUARDIAN_FALLBACK_ATTEMPTS=2
GUARDIAN_AUTO_DESTINATION=fork   # fork | desktop | cli
GUARDIAN_RECOVERY_TRANSPORT=app-server   # app-server | cli
GUARDIAN_BACKFILL_MS=3600000
GUARDIAN_CREATE_VISIBLE_RELAY=false
GUARDIAN_MAX_VISIBLE_RELAYS_PER_WINDOW=1
GUARDIAN_VISIBLE_RELAY_WINDOW_MS=3600000
GUARDIAN_COOLDOWN_MS=600000
GUARDIAN_COMPACT_TIMEOUT_MS=120000
GUARDIAN_TURN_STALL_MS=1800000
```

The environment variable names keep the old `GUARDIAN_` prefix for compatibility.

## Safety Model

- Does not edit `~/.codex/config.toml`.
- Uses per-command `--model` overrides.
- Stores Relay Baton state under `~/.codex/relay-baton/`.
- Redacts obvious secrets from hook snapshots.
- Records queued bundles, fallback attempts, fork attempts, and Desktop handoff state per source thread.
- Blocks duplicate Desktop/fork relays for the same source thread unless explicitly forced.
- Defaults background monitors to `--queue-only`; visible relays require `--create-visible-relay` or `GUARDIAN_CREATE_VISIBLE_RELAY=true`.
- Rate-limits visible relay creation to avoid sidebar spam during startup backfill.
- Requires worktree inspection when the source turn ended with `turn_aborted`.

## Desktop Accuracy Notes

Desktop handoff is useful, but less lossless than `codex fork` because it starts a fresh conversation and injects memory as a prompt. Relay Baton therefore:

- treats Desktop as explicit/visible recovery, not the default automatic route;
- scores the memory before creating a Desktop thread;
- blocks handoffs anchored only on interruption markers;
- includes concrete tool progress such as `apply_patch` and `task_complete`, so the new session sees code already written after the last user request;
- reuses the existing Desktop relay instead of creating parallel continuations.

## Roadmap

See [docs/relay-baton-roadmap.md](docs/relay-baton-roadmap.md) for the productization and memory-system roadmap, including Claude-style project memory, Codex fork-first recovery, and cross-platform monitor work.

See [docs/monitor-trigger-evaluation.md](docs/monitor-trigger-evaluation.md) for the monitoring trigger evaluation and chosen hybrid design.

See [docs/v1-launch-audit.md](docs/v1-launch-audit.md) for the evidence required before Relay Baton is declared v1.0.

See [docs/validation-report-guide.md](docs/validation-report-guide.md) for collecting support and release-validation reports.

See [docs/high-star-readiness-audit.md](docs/high-star-readiness-audit.md) for the current gap between Relay Baton and a high-star GitHub repository.

See [docs/v1-upgrade-roadmap.md](docs/v1-upgrade-roadmap.md) for the v1.0 launch gates, [docs/release-checklist.md](docs/release-checklist.md) for release verification, [docs/growth-and-release-plan.md](docs/growth-and-release-plan.md) for the public growth plan, [docs/app-server-integration.md](docs/app-server-integration.md) for official thread-control integration, [docs/support-matrix.md](docs/support-matrix.md) for platform status, [docs/architecture.md](docs/architecture.md) for the recovery flow, [docs/case-study-codex-compact-failure.md](docs/case-study-codex-compact-failure.md) for a concrete stuck-thread scenario, and [docs/competitive-analysis.md](docs/competitive-analysis.md) for the horizontal competitor analysis.
