# Research Notes

Key findings used for the v0.1 design:

- OpenAI describes Codex as using automatic compaction when long tasks approach context limits.
- OpenAI's API documentation documents context compaction through `/responses/compact`.
- Codex CLI currently exposes `resume`, `fork`, `exec resume`, `--model`, and per-command `-c` config overrides, which are enough for a standalone recovery orchestrator.
- GitHub issues in `openai/codex` show real user demand around compaction reliability and continuing work in fresh sessions.
- The most robust user workaround is not UI model switching by itself; it is durable state handoff. Model fallback is best treated as a helper to produce that handoff.

Sources:

- https://openai.com/index/unrolling-the-codex-agent-loop/
- https://developers.openai.com/api/docs/guides/compaction
- https://developers.openai.com/codex/cli
- https://github.com/openai/codex/issues/19400
- https://github.com/openai/codex/issues/21288
- https://github.com/openai/codex/pull/19771
