# Local Validation: Stuck Codex Thread Recovery

- Date: 2026-05-28
- Machine: local Codex Desktop / Codex CLI `0.133.0`
- Target stuck thread: `019e6792-dcbb-7ef3-a511-0adf14bac709`
- Thread title: `确认codex是否有能够编辑影刀rpa等能力，用于编辑影刀加入到目前的美团自动运营方案中`

## Current Project Status

Codex Context Guardian is functional as a local recovery prototype.

Implemented:

- CLI installation through `npm link`.
- `guardian doctor` for Codex CLI, SQLite state/log database, model, and hook checks.
- `guardian install-hooks` for `PreCompact` and `PostCompact` snapshots.
- `guardian recover` for fallback-model, fork, and new-session plans.
- `guardian pack` for recovery bundle generation.
- `guardian handoff` for bundle generation plus exact fresh-session command output.
- Desktop-visible handoff through Codex app-server remote control.
- `guardian monitor install|start|status|stop|uninstall` for macOS LaunchAgent background watching.
- Log classification and prompt-echo filtering.
- Per-thread cooldown/retry state.
- Recovery bundles with selected files, git status, diff, `HANDOFF_MEMORY.json`, `RECENT_THREAD_CONTEXT.md`, and `RECOVERY.md`.
- `HANDOFF_MEMORY.json` schema v2 captures latest active goal, latest user intent, assistant progress after that intent, progress tail, superseded directions, next action, and handoff directive.
- 27 local tests covering classifier, recovery planning, hooks, snapshots, bundles, CLI parsing, context extraction, handoff memory, monitor plist generation, and watcher strategy.

Remote repository:

- Public repo: https://github.com/guorunjie/codex-context-guardian
- Main branch pushed.
- Description: `Automatic recovery for long-running Codex tasks when context compaction fails`

## Local Install Evidence

Commands verified:

```bash
npm link
guardian doctor
guardian install-hooks
guardian handoff --thread 019e6792-dcbb-7ef3-a511-0adf14bac709 --json
guardian monitor install --dry-run --home /tmp/guardian-codex-home
guardian watch --once --dry-run --home /tmp/guardian-empty-codex-home
npm test
git diff --check
```

`guardian doctor` reports:

- Codex CLI available.
- `sqlite3` available.
- `~/.codex/state_5.sqlite` and `~/.codex/logs_2.sqlite` readable.
- `threads` and `logs` tables present.
- compact hooks installed.
- primary model `gpt-5.5`.
- fallback model `gpt-5.4`.

## Stuck Thread Recovery Result

The screenshot thread was located in Codex state:

```text
019e6792-dcbb-7ef3-a511-0adf14bac709
title: 确认codex是否有能够编辑影刀rpa等能力，用于编辑影刀加入到目前的美团自动运营方案中
cwd: /Users/quanquanlv/Documents/New project
model: gpt-5.5
tokensUsed: 86093506
```

Recovery bundle generated:

```text
/Users/quanquanlv/.codex/context-guardian/bundles/019e6792-dcbb-7ef3-a511-0adf14bac709-1779902143516
```

Bundle contents:

- `HANDOFF_MEMORY.json`
- `RECENT_THREAD_CONTEXT.md`
- `RECOVERY.md`
- `project-files.txt`
- `selected-files.md`
- `git-status.txt`
- `git-diff-stat.txt`
- `git-diff.patch`

The original stuck task was completed by producing this project report:

```text
/Users/quanquanlv/Documents/New project/meituan-ops-automation/.workflow/drafts/2026-05-28-yingdao-rpa-codex-editing-capability.md
```

Core conclusion:

- Codex can help integrate Yingdao RPA, but should not be treated as a reliable direct editor of Yingdao GUI workflows.
- The right boundary is: Yingdao captures live browser artifacts; the Node project imports, validates, parses, tests, and decides.
- Repeated compaction failure should be handled through recovery bundle + fresh session, not repeated model switching.

## Effectiveness Analysis

What worked:

- The stuck thread was identifiable by title from `state_5.sqlite`.
- The thread's working directory, model, title, and token usage were recovered without opening the broken conversation.
- A fresh-session recovery bundle was created successfully.
- The previous task was completed from repo evidence plus the bundle.
- The generated report landed in the target project, so the old task no longer depends on the broken conversation.

What did not fully work yet:

- Log classification did not find a fresh compact error for the screenshot thread because the latest stored logs did not include a clear `ERROR`/`WARN` compaction failure. The high token count and stale UI state were enough to choose fresh-session recovery manually.
- The recovery bundle is capped and file-selected; for very large workspaces, it should become more semantic and project-aware.

## Next Iteration Roadmap

1. Desktop-aware recovery UX
   - Detect the currently selected Desktop thread.
   - Offer a one-click "create recovery handoff" action.
   - Add a small terminal dashboard showing watched thread, last failure, and recovery attempts.

2. Better failure detection
   - Add state-table heuristics: very high `tokens_used`, stale updated_at, repeated same title, and UI stuck signal.
   - Separate `compact_endpoint_failure`, `high_context_risk`, and `ui_stuck_without_error`.
   - Add a `guardian inspect --thread <id>` command.

3. Recovery bundle quality
   - Prefer project-specific roots over the broad thread cwd.
   - Include recent handoff docs and task files first.
   - Add configurable include/exclude globs.
   - Add a machine-readable `bundle.json`.

4. Safer automation
   - Add `guardian recover --strategy handoff-only`.
   - Add `guardian recover --strategy exec-new-session` for non-interactive validation.
   - Keep interactive fresh sessions opt-in.

5. Upstream Codex proposal
   - Propose structured `compaction.failed` events.
   - Propose first-class recovery bundle/fork behavior after repeated compact failures.
   - Propose model fallback as one tactical retry, not the main recovery loop.
