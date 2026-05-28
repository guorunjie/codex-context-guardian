# Research Notes

Key findings used for the v0.1 design:

- OpenAI describes Codex as using automatic compaction when long tasks approach context limits.
- OpenAI's API documentation documents context compaction through `/responses/compact`.
- OpenAI's compaction API returns an opaque compacted context window and says the returned window should be treated as the canonical next context window, not pruned manually. Relay Baton therefore avoids editing compact output and instead creates a separate explicit recovery bundle when compaction is unhealthy.
- Codex memories are a separate local recall layer for stable preferences, workflows, project conventions, and pitfalls. They are not a replacement for required project guidance, so Relay Baton uses explicit bundle files for task state instead of relying on ambient memory.
- Codex hooks expose `PreCompact` and `PostCompact`, which Relay Baton uses for snapshots around compaction attempts.
- Codex CLI currently exposes `resume`, `fork`, `exec resume`, `--model`, and per-command `-c` config overrides, which are enough for a standalone recovery orchestrator.
- GitHub issues in `openai/codex` show real user demand around compaction reliability and continuing work in fresh sessions.
- GitHub issue #21288 specifically asks for a new-session recovery option after repeated compact failures, initialized from previous session context: latest user instruction, cwd, branch, changed files, completed work, pending tasks, blockers, and constraints.
- GitHub issue #14347 highlights progressive amnesia across repeated compactions and recommends preserving cumulative decisions and direction, not only recent work.
- GitHub issue #19400 shows model-specific remote compaction failures and motivates treating fallback model use as a bounded handoff helper, not an infinite retry loop.
- Claude Code memory guidance separates persistent project rules from auto memory, recommends concise scoped memory, and warns that context files are guidance rather than enforcement. Relay Baton mirrors this by separating explicit handoff facts from older docs and requiring current worktree verification.
- Claude Code cost guidance recommends clearing between unrelated tasks and adding custom compaction instructions for what to preserve. Relay Baton follows the same principle by rotating to a fork or fresh conversation with explicit handoff instructions after repeated compaction failure.
- gstack `context-save`/`context-restore` locally reinforce the same pattern: save high-level goal, decisions, remaining work, notes, and load the newest useful checkpoint first.
- The most robust user workaround is not UI model switching by itself; it is durable state handoff. Model fallback is best treated as a helper to produce that handoff.

Sources:

- https://openai.com/index/unrolling-the-codex-agent-loop/
- https://developers.openai.com/api/docs/guides/compaction
- https://developers.openai.com/codex/memories
- https://developers.openai.com/codex/hooks
- https://developers.openai.com/codex/cli
- https://code.claude.com/docs/en/memory
- https://code.claude.com/docs/en/costs
- https://github.com/openai/codex/issues/19400
- https://github.com/openai/codex/issues/14347
- https://github.com/openai/codex/issues/21288
- https://github.com/openai/codex/pull/19771
- Local skill references:
  - `/Users/quanquanlv/.codex/skills/gstack/context-save/SKILL.md`
  - `/Users/quanquanlv/.codex/skills/gstack/context-restore/SKILL.md`
