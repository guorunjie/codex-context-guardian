# Growth And Release Plan

Relay Baton has a working local recovery core. The next release work is about trust, installation, and discoverability.

## Current State

- GitHub repository is public.
- Local package version is `1.1.6`.
- GitHub Release `v1.1.6` and npm `codex-relay-baton-guardian@1.1.6` are the current public release targets.
- The project has a clear wedge: sleep-safe recovery for Codex long-running tasks.
- Tests, build, release check, host validation, and monitor install commands exist.
- Codex app-server integration exists for `thread/fork`, `thread/rollback`, `thread/compact/start`, and app-server status probing.
- `relay-baton release check --v1 --online` should pass after the `v1.1.6` GitHub Release, npm publication, and latest CI are visible.

## Release Priorities

1. Keep GitHub `NPM_TOKEN` scoped to `codex-relay-baton-guardian` and rotate it after any accidental terminal/screenshot exposure.
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
- A new user can run `npm install -g codex-relay-baton-guardian`, then `relay-baton follow install && relay-baton follow start && relay-baton follow doctor`.
- README explains the app-server path without overstating that Relay Baton replaces Codex compaction.
- At least one public issue or case study proves a real stuck Codex task was recovered.
- Launch copy exists for GitHub README, Hacker News, Reddit, X, Chinese developer communities, and awesome-list submissions.
