# Project Progress

## Completed

- Created standalone Node.js/TypeScript CLI with no runtime npm dependencies.
- Implemented diagnostics for Codex CLI, `~/.codex` state, logs, hooks, and model configuration.
- Implemented compact hook installation for `PreCompact` and `PostCompact`.
- Implemented snapshot capture with git state and secret redaction.
- Implemented SQLite-backed thread and log inspection.
- Implemented compaction failure classification.
- Implemented recovery strategy selection.
- Implemented two-stage fallback-model automation:
  - fallback model runs `codex exec resume` and writes a handoff summary;
  - primary model resumes the original thread with that summary path.
- Implemented fork and new-session fallback strategies.
- Implemented recovery bundles for fresh-conversation handoff.
- Added `guardian pack` for manually creating a project recovery bundle.
- Added `guardian handoff` to create a bundle and print the exact fresh-session command.
- Added Desktop app-server handoff: `guardian handoff --desktop` now creates a left-sidebar-visible Desktop conversation and can auto-start the first continuation turn.
- Added Desktop continuation presets: `--plan-mode`, `--goal-mode`, `--goal`, and `--goal-budget` wire thread settings and active goal into the new handoff conversation.
- Added recent rollout context extraction so recovery bundles and default Desktop goals prioritize late-stage user intent over stale thread titles.
- Shifted watcher behavior so repeated recovery attempts move toward fresh session instead of repeated compact retries.
- Implemented watcher with cooldown and per-thread retry limits.
- Added unit tests for classifier, recovery strategy, hooks, snapshots, and CLI parsing.

## Next

- Add structured event ingestion if Codex exposes stable compaction failure events.
- Add a small terminal dashboard showing watched thread, last failure, and recovery attempts.
- Add optional desktop notification integration.
- Add an upstream PR against `openai/codex` once the standalone behavior is validated locally.

## Open Questions

- Whether future Codex desktop builds expose a stable remote-control API for automatic Desktop App thread handoff.
- Which fallback models reliably support `/responses/compact` across accounts and release channels.
- Whether Codex should provide a first-class `codex recover <thread>` command upstream.
