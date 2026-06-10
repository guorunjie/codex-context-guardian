# Growth And Release Plan

Relay Baton has a working local recovery core. The next release work is about trust, installation, and discoverability.

## Current State

- GitHub repository is public.
- Local package version is `1.1.3`.
- GitHub Release `v1.1.3` exists; npm registry currently remains on `1.1.2` until the repository `NPM_TOKEN` secret is replaced with a maintainer token that can publish `codex-relay-baton-guardian`.
- The project has a clear wedge: sleep-safe recovery for Codex long-running tasks.
- Tests, build, release check, host validation, and monitor install commands exist.
- Codex app-server integration exists for `thread/fork`, `thread/rollback`, `thread/compact/start`, and app-server status probing.
- `relay-baton release check --v1 --online` passes for GitHub Release, latest CI, package metadata, real case study, visual demo asset, and three-platform host validation evidence; it still fails on npm `1.1.3` publication and npm authentication until the maintainer token is replaced or local npm login succeeds.

## Release Priorities

1. Replace the GitHub `NPM_TOKEN` secret with a token owned by the `guorunjie` npm maintainer account, then rerun `Publish npm` for `v1.1.3`.
2. Publish one technical launch post and link it from the README.
3. Submit Relay Baton to Codex/agent tool directories and relevant awesome lists.
4. Run one public app-server recovery drill and link the evidence in release notes.
5. Convert the static demo screenshot into a 30-60 second GIF or short video.
6. Gather at least three external recovery reports through issues or discussions.

## Growth Priorities

The best public message is:

> Keep Codex long tasks running while you sleep.

Use concrete failure language in posts and docs:

- `Error running remote compact task: stream disconnected before completion`
- `Codex ran out of room in the model's context window`
- stale handoff summaries reviving old task directions
- duplicate continuation threads confusing the user

## Target Channels

- GitHub Topics: `codex`, `codex-cli`, `context-compaction`, `agent-recovery`, `long-running-tasks`.
- Awesome Codex CLI lists and agent tooling directories.
- Short technical post: "How to stop Codex long tasks from dying on context compaction."
- Reddit and Chinese developer communities with a real compact-failure case study.

## Success Signals

- npm latest equals `package.json` version.
- GitHub Release exists for the same tag.
- A new user can run `npm install -g github:guorunjie/codex-relay-baton-guardian#v1.1.3` now, and `npm install -g codex-relay-baton-guardian` after npm publication catches up.
- README explains the app-server path without overstating that Relay Baton replaces Codex compaction.
- At least one public issue or case study proves a real stuck Codex task was recovered.
- Launch copy exists for GitHub README, Hacker News, Reddit, X, Chinese developer communities, and awesome-list submissions.
