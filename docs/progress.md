# Project Progress

## Completed

- Created standalone Node.js/TypeScript CLI with no runtime npm dependencies.
- Implemented diagnostics for Codex CLI, `~/.codex` state, logs, hooks, and model configuration.
- Implemented lifecycle hook installation for activity tracking plus `PreCompact` and `PostCompact` snapshots.
- Implemented snapshot capture with git state and secret redaction.
- Implemented SQLite-backed thread and log inspection.
- Implemented compaction failure classification.
- Implemented recovery strategy selection.
- Implemented two-stage fallback-model automation:
  - fallback model runs `codex exec resume` and writes a handoff summary;
  - primary model resumes the original thread with that summary path.
- Implemented fork and new-session fallback strategies.
- Renamed the product surface to Relay Baton with `relay-baton` as the primary CLI and `guardian` kept as a legacy alias.
- Implemented recovery bundles for fork, fresh-conversation, and Desktop handoff.
- Added `relay-baton pack` for manually creating a project recovery bundle.
- Added `relay-baton handoff` to create a bundle and print the exact fresh-session command.
- Added Desktop app-server handoff: `relay-baton handoff --desktop` now creates a left-sidebar-visible Desktop conversation and can auto-start the first continuation turn.
- Added Desktop continuation presets: `--plan-mode`, `--goal-mode`, `--goal`, and `--goal-budget` wire thread settings and active goal into the new handoff conversation.
- Added recent rollout context extraction so recovery bundles and default Desktop goals prioritize late-stage user intent over stale thread titles.
- Added structured `HANDOFF_MEMORY.json` v2 with current task, latest user intent, latest assistant/tool progress after that intent, bounded recent tail, superseded directions, handoff directive, next action, warnings, and telemetry.
- Upgraded `RECENT_THREAD_CONTEXT.md` so evidence is clearly labeled as source evidence, not new instructions, and interrupted turns force a worktree check before editing.
- Added continuation-point extraction so handoff sessions resume from late-stage assistant progress after the latest user request instead of restarting a broad implementation plan.
- Added a Desktop handoff quality gate so interruption-only memories are blocked before a visible conversation is created.
- Added per-source Desktop handoff reuse by default, with `--force` reserved for deliberate replacement, to avoid parallel misleading handoff threads.
- Changed watcher auto-recovery to try fallback-model recovery twice per source thread, then create one best relay. The default is now fork-first; Desktop and CLI new-session are configurable destinations.
- Added fork handoff state so the monitor does not create duplicate branch continuations for the same source thread.
- Added `relay-baton monitor install|uninstall|status|start|stop` for macOS LaunchAgent, Linux systemd user service, and Windows Task Scheduler background monitoring.
- Shifted watcher behavior so repeated recovery attempts move toward fresh session instead of repeated compact retries.
- Implemented watcher with cooldown and per-thread retry limits.
- Added `relay-baton audit` and `relay-baton demo` for recovery-bundle scoring and public smoke testing.
- Added unit tests for classifier, recovery strategy, hooks, snapshots, CLI parsing, audit quality, demo bundles, and monitor service generation.
- Added GitHub Actions CI matrix for Linux, macOS, and Windows.

## Next

- Add structured event ingestion if Codex exposes stable compaction failure events.
- Add a small terminal dashboard showing watched thread, last failure, and recovery attempts.
- Add optional desktop notification integration.
- Add an upstream PR against `openai/codex` once the standalone behavior is validated locally.
- Validate Linux and Windows monitor lifecycle on real hosts.
- Publish `codex-relay-baton-guardian` to npm after maintainer authentication.

## Open Questions

- Whether future Codex desktop builds expose a stable remote-control API for automatic Desktop App thread handoff.
- Which fallback models reliably support `/responses/compact` across accounts and release channels.
- Whether Codex should provide a first-class `codex recover <thread>` command upstream.
