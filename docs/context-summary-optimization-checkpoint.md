# Context Summary Optimization Checkpoint

Updated: 2026-05-28

## Problem

Desktop handoff is now technically working, but the generated continuation can revive stale early-thread direction because the recovery bundle previously emphasized project files, git diff, and a generic prompt. It did not preserve late-stage user intent, active goal changes, interrupted turns, or the latest assistant conclusions as first-class recovery evidence.

## Current Diagnosis

- `writeRecoveryBundle` generated `RECOVERY.md`, `selected-files.md`, git state, and project file lists.
- It did not parse the source thread rollout JSONL.
- The stuck Yingdao thread's latest active goal is not the original "confirm Yingdao capability" title. It later changed to:
  `按照方案 B：Meituan Ops 自己控制内置浏览器开发落地，最终完成项目流畅稳定的运行操作内置浏览器后台`
- The rollout also shows the late-stage direction:
  - bootstrap four steps moved toward embedded Electron browser client;
  - next migration target became campaign enrollment / signup pilot;
  - the final source turn was interrupted, so recovery must inspect current state before continuing.

## Implemented So Far

- `src/codexState.ts`
  - Added optional `rolloutPath` to `ThreadInfo`.
  - Reads `threads.rollout_path` when available, with schema-compatible fallback.
- `src/threadContext.ts`
  - New module that reads source rollout JSONL.
  - Extracts latest `thread_goal_updated`.
  - Extracts recent user/assistant/system messages.
  - Extracts assistant progress after the latest user request, so the continuation resumes from the latest task process instead of the beginning of a broad plan.
  - Normalizes `<goal_context>` to only the active objective.
  - Marks `<turn_aborted>` as an incomplete interrupted turn.
  - Renders `RECENT_THREAD_CONTEXT.md`.
- `src/bundle.ts`
  - Now writes structured `HANDOFF_MEMORY.json` v2.
  - Now writes `RECENT_THREAD_CONTEXT.md`.
  - `RECOVERY.md` now tells the next session to read `HANDOFF_MEMORY.json`, then recent context, then git state, and treat latest goals/user messages as higher priority than old docs.
- `src/cli.ts`
  - Desktop handoff default goal now prefers the latest rollout active goal over the source thread title.

## Best-Practice Principles Found Locally

- From gstack/context-save and context-restore:
  - persist explicit checkpoints outside the transient chat;
  - recover newest useful artifact first;
  - keep active goal, decisions, remaining work, and blockers compact.
- From gstack QA/context startup rules:
  - after compaction, read latest project context/checkpoint before acting;
  - write progress summaries during long-running sessions;
  - stop and reassess if repeating stale diagnostics or stale fix variants.
- From local memory/knowledge skills:
  - separate active execution context from durable background notes;
  - keep memory concise and archive old data instead of letting it grow unbounded.

## Design Direction To Finish

The recovery bundle should use a four-layer hierarchy:

1. Latest user intent, active goal, and assistant progress after that user intent from source rollout.
2. Latest assistant final/progress messages and interrupted turn state.
3. Current working tree/git diff/project files.
4. Older project docs and previous summaries.

The handoff prompt now explicitly says:

- read `HANDOFF_MEMORY.json` and `RECENT_THREAD_CONTEXT.md` before `selected-files.md`;
- if source title conflicts with latest active goal, latest active goal wins;
- if assistant progress after the latest user request exists, resume there and do not restart the user's older plan from the beginning;
- if recent context says a direction was abandoned, do not revive it;
- inspect current worktree before editing because interrupted turns may have partially applied changes.

## Remaining Work

- Add a small terminal dashboard showing watched thread, last failure, and recovery attempts.
- Add optional desktop notification integration.
