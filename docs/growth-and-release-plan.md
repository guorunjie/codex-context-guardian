# Growth And Release Plan

Relay Baton has a working local recovery core. The next release work is about trust, installation, and discoverability.

## Current State

- GitHub repository is public.
- Local package version is `1.1.0`.
- npm registry currently serves `1.1.0`, so GitHub Release and npm latest are aligned.
- The project has a clear wedge: sleep-safe recovery for Codex long-running tasks.
- Tests, build, release check, host validation, and monitor install commands exist.
- Codex app-server integration exists for `thread/fork`, `thread/rollback`, `thread/compact/start`, and app-server status probing.

## Release Priorities

1. Add one short demo GIF or screenshot sequence under `docs/assets/`.
2. Publish a redacted real recovery case study as a scannable README section.
3. Add a `diagnose` command that explains why a stuck thread was or was not rescued.
4. Run one public app-server recovery drill and link the evidence in release notes.
5. Submit Relay Baton to Codex/agent tool directories and publish one technical launch post.

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
- A new user can run `npm install -g codex-relay-baton-guardian` and then `relay-baton follow install`.
- README explains the app-server path without overstating that Relay Baton replaces Codex compaction.
- At least one public issue or case study proves a real stuck Codex task was recovered.
