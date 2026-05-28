# Codex Context Guardian

**Automatic recovery for long-running Codex tasks when context compaction fails.**

Codex Context Guardian watches local Codex session state, detects context-compaction failures, and automatically resumes the task through the safest available recovery path. It turns two manual workarounds into a repeatable tool:

1. Temporarily resume with a fallback model when the current model cannot compact.
2. Fork or start a fresh session with a durable recovery prompt when the original thread is stuck.

The project is designed as a standalone CLI first, with a clear path toward an upstream `openai/codex` patch later.

## Core Design Decision

Model switching helps only when the failure is tied to model/compact-endpoint compatibility. It is not the primary solution for repeated compaction failures.

The durable strategy is:

1. Try the configured fallback model for the first two eligible compaction failures on the same source thread.
2. If the thread keeps failing, stop fighting the old context.
3. Package the project state into a recovery bundle with structured handoff memory.
4. Start a fresh Desktop-visible Codex conversation with a concise recovery prompt and the bundle path.

This matches the lower-level failure mode: once history, tool traces, repeated summaries, or context state are already unhealthy, another compact attempt often reuses the same bad input. A fresh conversation plus a project bundle avoids that state.

## Why This Exists

Long Codex tasks can fail at the worst possible moment: when the conversation needs compaction before the work can continue. Today the practical workarounds are manual:

- switch from a newer model such as `gpt-5.5` to a fallback such as `gpt-5.4`, nudge the thread until compaction succeeds, then switch back;
- create a new conversation and ask it to recover the previous project and task state.

Guardian automates both. It does not click the UI or mutate global model settings. It uses Codex CLI capabilities such as `resume`, `fork`, `exec resume`, `--model`, and local `~/.codex` state.

## Features

- `guardian doctor` checks Codex CLI, SQLite state, logs, configured models, and hook status.
- `guardian install-hooks` installs `PreCompact` and `PostCompact` snapshot hooks.
- `guardian watch --auto --desktop --goal-mode` monitors Codex logs for compaction failure signals and starts the recovery ladder.
- `guardian monitor install` installs a macOS LaunchAgent that keeps the watcher running in the background.
- `guardian pack --thread <id>` creates a recovery bundle for a fresh conversation.
- `guardian handoff --thread <id>` creates a recovery bundle and prints the exact new-session command.
- `guardian handoff --thread <id> --desktop` creates a Desktop-visible continuation conversation and injects the recovery prompt automatically.
- `guardian handoff --desktop --plan-mode --goal-mode` can preconfigure the new Desktop thread with plan collaboration mode and an active goal.
- Desktop handoff creation is guarded by a quality gate. Guardian blocks handoffs that only recover interruption markers, and it reuses an existing Desktop handoff for the same source thread unless `--force` is provided.
- Recovery bundles include `HANDOFF_MEMORY.json` and `RECENT_THREAD_CONTEXT.md`, which promote the source thread's latest goal, latest user intent, assistant progress after that intent, recent tail, superseded directions, and interruption state over older titles or abandoned early plans.
- `guardian recover --thread <id> --strategy auto` builds and executes the recovery plan.
- Model-incompatibility recovery is two-stage:
  - `codex exec resume --model <fallback>` produces a durable handoff summary.
  - `codex resume --model <primary>` continues the same task with the primary model.
- Automatic recovery tries the fallback model twice before giving up on the unhealthy old thread and creating a Desktop-visible handoff.
- Final fallback starts a new Codex session in the original working directory when Desktop handoff is unavailable.
- Per-thread cooldown and recovery limits prevent runaway loops.

## Install

```bash
cd codex-context-guardian
npm test
node ./bin/guardian.js doctor
```

For local CLI usage:

```bash
npm link
guardian doctor
```

## Usage

Run diagnostics:

```bash
guardian doctor
```

Install compact snapshot hooks:

```bash
guardian install-hooks
```

Preview recovery for the latest thread:

```bash
guardian recover --last --dry-run
```

Recover a known thread:

```bash
guardian recover --thread 019e6a4a-22e6-7962-862b-cfb5ad04ac41 --strategy auto
```

Create a recovery bundle and use it in a new conversation:

```bash
guardian handoff --last
```

Create a Desktop-visible handoff thread and immediately continue in plan/goal mode:

```bash
guardian handoff --thread <stuck-thread-id> --desktop --plan-mode --goal-mode
```

Guardian will not create a second Desktop continuation for the same source thread by default. It first generates a candidate bundle, checks `HANDOFF_MEMORY.json`, and only creates a visible conversation when the handoff has a real task anchor. If a good Desktop handoff already exists, the command prints that thread id instead of creating another confusing sidebar entry.

Force a new Desktop handoff only after reviewing the existing one:

```bash
guardian handoff --thread <stuck-thread-id> --desktop --goal-mode --force
```

Set a custom goal objective and budget:

```bash
guardian handoff --thread <stuck-thread-id> --desktop --plan-mode --goal "继续完成影刀RPA任务交付" --goal-budget 120000
```

Start the watcher without auto-recovery:

```bash
guardian watch
```

Start fully automatic recovery:

```bash
guardian watch --auto --desktop --goal-mode
```

Install the background monitor on macOS:

```bash
guardian monitor install
guardian monitor start
guardian monitor status
```

Use a different fallback model:

```bash
GUARDIAN_FALLBACK_MODEL=gpt-5.4 guardian watch --auto --desktop --goal-mode
```

## Recovery Strategy

Guardian classifies recent Codex logs into:

- `model_compact_unsupported`
- `compact_failed`
- `context_overflow`
- `transport_or_rate_limit`
- `unknown`

The automatic strategy is:

1. On the first eligible compaction failure for a thread, run a fallback-model summary stage and then resume with the primary model.
2. On the second eligible failure for the same source thread, try the fallback-model recovery once more.
3. On the third eligible failure, stop fighting the unhealthy old thread and create a recovery bundle plus Desktop-visible handoff.
4. If Desktop handoff is unavailable, print or run the CLI new-session recovery command in the original working directory.

Recovery bundles are read in this priority order:

1. `HANDOFF_MEMORY.json`
2. `RECENT_THREAD_CONTEXT.md`
3. `git-status.txt`, `git-diff-stat.txt`, and `git-diff.patch`
4. `selected-files.md` and older project documents
5. the old thread title

Inside `HANDOFF_MEMORY.json`, `handoffDirective` and `latestAssistantProgress` are the highest-signal continuation hints. They are generated from the assistant messages after the latest user request, so a new session resumes from the actual late-stage task process instead of restarting an older plan.

Before a Desktop thread is created, Guardian scores the handoff memory. A candidate is blocked when the latest user intent is only a `turn_aborted` marker, when there is no reliable current objective, or when an interrupted turn does not require checking the worktree first. This keeps bad recovery bundles out of the Desktop sidebar instead of creating a misleading continuation and hoping the user notices.

## Safety Model

Guardian is intentionally conservative about state:

- It does not edit `~/.codex/config.toml`.
- It uses per-command `--model` overrides instead of changing global defaults.
- It stores snapshots under `~/.codex/context-guardian/`.
- It redacts obvious secrets from hook payload snapshots.
- It limits each thread to one recovery per cooldown window and stops after repeated failures.

## Current Status

This is v0.1. It is useful as a local recovery harness and project prototype. The next milestone is deeper integration with Codex events so the recovery action can be surfaced directly in the CLI/TUI instead of inferred from logs.

See [docs/progress.md](docs/progress.md) and [docs/upstream-patch-plan.md](docs/upstream-patch-plan.md).
