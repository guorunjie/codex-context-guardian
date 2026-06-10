# Outreach Log

Relay Baton's growth goal is to earn discovery from Codex users who actually hit long-task failures, not generic AI-tool traffic.

## Baseline

- Date: 2026-06-10
- GitHub repository: <https://github.com/guorunjie/codex-relay-baton-guardian>
- GitHub stars: 1
- GitHub forks: 0
- npm package: <https://www.npmjs.com/package/codex-relay-baton-guardian>
- Current release line: `v1.1.3`
- npm latest: `1.1.2` until the `NPM_TOKEN` secret is replaced and the `Publish npm` workflow is rerun for `v1.1.3`

## Submitted

| Date | Target | Status | Link | Why it fits |
| --- | --- | --- | --- | --- |
| 2026-06-09 | `RoggeOhta/awesome-codex-cli` | PR opened; mergeable, no review/comments as of 2026-06-10 | <https://github.com/RoggeOhta/awesome-codex-cli/pull/78> | Most relevant Codex-specific directory; Relay Baton fits `Monitoring & Analytics` because it watches Codex hooks/logs and recovers compact/context-window failures. |
| 2026-06-09 | `milisp/awesome-codex-cli` | PR opened; mergeable, no review/comments as of 2026-06-10 | <https://github.com/milisp/awesome-codex-cli/pull/42> | Codex-specific directory with a broad `Development Tools` section; Relay Baton fits as a local reliability/recovery tool for long-running Codex tasks. |
| 2026-06-09 | `bradAGI/awesome-cli-coding-agents` | PR opened; mergeable, no review/comments as of 2026-06-10 | <https://github.com/bradAGI/awesome-cli-coding-agents/pull/120> | Larger CLI agent directory with an `Agent infrastructure` section; Relay Baton is positioned as Codex long-task recovery infrastructure rather than a standalone coding agent. |
| 2026-06-09 | `brandonhimpfen/awesome-ai-coding-agents` | Closed without merge or maintainer comment on 2026-06-09 | <https://github.com/brandonhimpfen/awesome-ai-coding-agents/pull/22> | Smaller AI coding agents list; closure suggests broad/generic AI-agent directories are lower fit than Codex-specific reliability lists. |
| 2026-06-10 | `KarelDO/awesome-codex` | PR opened | <https://github.com/KarelDO/awesome-codex/pull/17> | Older but relevant Codex products/tools directory; Relay Baton fits as a Codex Desktop/CLI reliability tool rather than a plugin or automation template. |

## Release Operations

| Date | Item | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| 2026-06-09 | `v1.1.3` GitHub Release | Complete | <https://github.com/guorunjie/codex-relay-baton-guardian/releases/tag/v1.1.3>; tag, target commit, tarball, and `SHA256SUMS` assets are present. | None |
| 2026-06-09 | `v1.1.3` npm publication | Blocked | <https://github.com/guorunjie/codex-relay-baton-guardian/actions/runs/27198149765> reached `npm publish`, signed provenance, then failed with npm `E404` / no package permission. | Replace repository `NPM_TOKEN` with a publish-capable token from the `guorunjie` npm maintainer account, then rerun `Publish npm` with `tag=v1.1.3`. |

## Next Targets

| Priority | Target | Proposed placement | Submission note |
| --- | --- | --- | --- |
| P0 | `RoggeOhta/awesome-codex-cli`, `milisp/awesome-codex-cli`, `bradAGI/awesome-cli-coding-agents`, and `KarelDO/awesome-codex` | Existing PR follow-up | Watch for maintainer feedback; revise descriptions if they ask for shorter copy, category changes, or proof of usage. |
| P1 | Codex-related Reddit / HN launch post | `Show HN` or developer tooling discussion | Use the exact searchable failure strings: `responses/compact`, `stream disconnected before completion`, and `Codex ran out of room in the model's context window`. |
| P1 | Chinese developer communities | Tool launch / long-task reliability story | Use the Chinese copy in `docs/promotion-kit.md`; emphasize local monitor, queue-only safety, and no cloud service. |
| P2 | Upstream Codex compact/context issues | Helpful comment only when directly relevant | Link the case study and `diagnose` command. Avoid spam; comment only where Relay Baton solves the reported failure mode. |

## Follow-Up Rules

- Do not claim an awesome-list entry until the PR is merged.
- Re-check star and fork counts after each external post or accepted PR.
- If a PR is rejected, record the reason and adjust README positioning instead of resubmitting the same copy.
- Prefer narrow Codex reliability channels over broad AI directories.
- Avoid resubmitting unchanged copy to broad AI coding-agent lists after a silent close; use that signal to tighten category fit and positioning first.
