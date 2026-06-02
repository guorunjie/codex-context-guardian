# Competitive Analysis

Relay Baton competes in a narrow but painful workflow: recovering long-running Codex work after compaction failure, model-specific compact failure, or a Desktop conversation loop.

The product should be compared on continuation fidelity, auditability, automatic recovery, and user confusion risk, not just on general coding-agent capability.

## Sources Checked

- OpenAI Codex CLI overview: https://help.openai.com/en/articles/11096431
- Codex `fork` documentation: https://openai-codex.mintlify.app/cli/fork
- Codex app-server README: https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md
- OpenAI Codex 0.136.0 release: https://github.com/openai/codex/releases/tag/rust-v0.136.0
- Claude Code memory documentation: https://docs.anthropic.com/en/docs/claude-code/memory
- Cursor checkpoints documentation: https://docs.cursor.com/en/agent/chat/checkpoints

## Horizontal Comparison

| Product or Pattern | What It Does Well | Gap For Stuck-Thread Recovery | Relay Baton Position |
| --- | --- | --- | --- |
| Codex built-in `fork` | Least-lossy branch of an existing session; preserves the original while creating a new thread ID. | It is user-triggered and does not decide when a compact failure should stop retrying. It also does not add structured handoff audit files by itself. | Relay Baton should use `fork` as the default recovery destination whenever the source session is readable. |
| Codex app-server `thread/fork` / `thread/rollback` | Official thread control plane with lightweight `excludeTurns` fork support and rollback hooks. | It is an API surface, not a recovery policy. It does not watch compact failures, choose the best relay, or package latest task memory. | Relay Baton should use app-server as the preferred transport while keeping hooks/logs as the detector and bundle generation as the correctness layer. |
| Codex built-in `resume` | Continues the same session and keeps normal user flow. | If the source thread is stuck because compact keeps failing, repeated resume can keep the user trapped in the same failure loop. | Relay Baton should use resume only in bounded fallback-model recovery, then leave the unhealthy thread. |
| Claude Code memory | Mature memory model with hierarchical `CLAUDE.md` locations and explicit `/memory` editing. Good for durable project instructions. | Durable memory is advisory project knowledge, not a per-failure recovery checkpoint with recent-tail evidence and git diff facts. | Relay Baton should copy the principle of visible, layered memory, while keeping recovery facts source-linked and task-specific. |
| Claude-style manual handoff skills | Simple, portable, easy for users to understand. | Manual handoffs can miss late-stage task pivots and usually lack duplicate prevention or automatic failure classification. | Relay Baton should keep a human-readable handoff file, but generate it deterministically from rollout/log/worktree evidence. |
| Cursor checkpoints | Useful automatic snapshots for undoing agent edits; strong safety affordance for code changes. | Checkpoints restore code state, not conversation intent. They track agent changes, not manual edits, and are not a task-continuation memory system. | Relay Baton should complement, not emulate, checkpoints: preserve task direction and require git/diff inspection. |
| General agent memory platforms | Broad recall across projects, repos, and tools. | Broad memory can over-retrieve stale context; the failure mode is exactly what Relay Baton tries to prevent: reviving old plans after a task pivot. | Relay Baton should stay narrow and bias toward latest user intent plus current workspace facts. |
| Workflow governance hooks | Good at enforcing tests, reviews, approvals, or notifications. | Hooks observe process events but usually do not create a continuation plan or new Codex session. | Relay Baton should use hooks as signal capture, then make a bounded recovery decision. |

## Advantages

- Narrow wedge: specifically targets Codex compact failure and long-task relay, not generic memory.
- Least-lossy first: `fork` is the default after bounded fallback attempts; Desktop handoff is visible but not treated as automatically lossless.
- Official-control-plane path: app-server `thread/fork` with `excludeTurns` is available for recovery when the local Codex app-server can be reached.
- Auditable memory: every relay carries `HANDOFF_MEMORY.json`, `RECENT_THREAD_CONTEXT.md`, `RECOVERY.md`, git status, diff, and selected files.
- Direction correction: latest real user intent, recent assistant/tool progress, and superseded directions are first-class fields.
- Duplicate protection: per-source recovery state prevents parallel fork/Desktop relays unless the user forces a replacement.
- Local-first: no extra LLM summarization API is required for the deterministic bundle path.

## Weaknesses

- It depends on Codex local state, rollout/log formats, and CLI behavior that may change upstream.
- App-server and Desktop controls are still upstream-sensitive and should keep CLI fallback behavior.
- Windows and Linux monitor generation exist, but real host validation is still required before v1.0 claims.
- npm registry publication is prepared but not complete until an authenticated maintainer publishes the package.
- Public trust assets are early: the project needs a demo GIF/video, a real case study, and clearer troubleshooting for common Codex install shapes.

## v1.0 Positioning

Use this sentence as the public promise:

> When Codex compaction fails, Relay Baton creates one auditable continuation from the latest real task state.

Do not position v1.0 as a universal memory layer. That market is broader, noisier, and harder to prove. The sharper wedge is recovery correctness: avoid stale summaries, avoid duplicate relays, and make every continuation inspectable.
