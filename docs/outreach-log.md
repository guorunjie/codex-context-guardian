# Outreach Log

Relay Baton's growth goal is to earn discovery from Codex users who actually hit long-task failures, not generic AI-tool traffic.

## Baseline

- Date: 2026-06-09
- GitHub repository: <https://github.com/guorunjie/codex-relay-baton-guardian>
- GitHub stars: 1
- GitHub forks: 0
- npm package: <https://www.npmjs.com/package/codex-relay-baton-guardian>
- Current release line: `v1.1.3`

## Submitted

| Date | Target | Status | Link | Why it fits |
| --- | --- | --- | --- | --- |
| 2026-06-09 | `RoggeOhta/awesome-codex-cli` | PR opened | <https://github.com/RoggeOhta/awesome-codex-cli/pull/78> | Most relevant Codex-specific directory; Relay Baton fits `Monitoring & Analytics` because it watches Codex hooks/logs and recovers compact/context-window failures. |

## Next Targets

| Priority | Target | Proposed placement | Submission note |
| --- | --- | --- | --- |
| P0 | `milisp/awesome-codex-cli` | Codex tools, hooks, or monitoring section | Reuse the concise directory blurb from `docs/promotion-kit.md`; verify duplicate status first. |
| P0 | `bradAGI/awesome-cli-coding-agents` | Harnesses & orchestration, agent infrastructure, or session managers | Pitch Relay Baton as a local supervisor/recovery harness, not a standalone coding agent. |
| P1 | Codex-related Reddit / HN launch post | `Show HN` or developer tooling discussion | Use the exact searchable failure strings: `responses/compact`, `stream disconnected before completion`, and `Codex ran out of room in the model's context window`. |
| P1 | Chinese developer communities | Tool launch / long-task reliability story | Use the Chinese copy in `docs/promotion-kit.md`; emphasize local monitor, queue-only safety, and no cloud service. |
| P2 | Upstream Codex compact/context issues | Helpful comment only when directly relevant | Link the case study and `diagnose` command. Avoid spam; comment only where Relay Baton solves the reported failure mode. |

## Follow-Up Rules

- Do not claim an awesome-list entry until the PR is merged.
- Re-check star and fork counts after each external post or accepted PR.
- If a PR is rejected, record the reason and adjust README positioning instead of resubmitting the same copy.
- Prefer narrow Codex reliability channels over broad AI directories.
