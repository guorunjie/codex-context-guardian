# Relay Baton v1.0 Upgrade Roadmap

Relay Baton v1.0 means a new Codex user can install it, turn on following, survive a real compaction failure, and audit exactly why the continuation picked its next action.

## Current State

- Public GitHub repository: `guorunjie/codex-relay-baton-guardian`.
- GitHub install works through `npm install -g github:guorunjie/codex-relay-baton-guardian`.
- CI, Release, MIT license, built `dist/` package, and structured recovery bundles exist.
- macOS LaunchAgent, lifecycle hooks, compact-stall detection, fallback attempts, fork-first recovery, and Desktop handoff quality gates exist.
- npm registry publishing is prepared but not complete until an authenticated maintainer runs `npm publish`.

## v1.0 Launch Gates

1. Install and repair are self-healing.
   - `relay-baton doctor` reports Codex CLI, SQLite, hooks, monitor environment, models, and fallback readiness.
   - `relay-baton follow repair` rewrites hooks and monitor service with a usable PATH and `GUARDIAN_CODEX_BIN`.
   - `relay-baton status` gives one human-readable and JSON-readable operational view.

2. Automatic recovery is trustworthy.
   - Compact stalls, explicit compact failures, context overflow, and model compact unsupported errors all map to bounded recovery decisions.
   - Fallback model attempts are capped.
   - Fork/Desktop relays are deduplicated per source thread.
   - Recovery state records every attempt, bundle, quality score, and destination.

3. Handoff quality is auditable.
   - `HANDOFF_MEMORY.json`, `RECENT_THREAD_CONTEXT.md`, and `RECOVERY.md` are generated for every relay.
   - Evidence is marked as evidence, not new instruction.
   - Turn-aborted sources force worktree inspection before edits.
   - A first-class `relay-baton audit <bundle>` command scores an existing bundle without creating a new conversation.

4. Distribution is complete.
   - GitHub install works.
   - npm package `codex-relay-baton-guardian` is published.
   - GitHub Release includes tarball asset, notes, checksum, install commands, and upgrade commands.
   - CI verifies tarball install and GitHub install smoke tests.

5. Open-source surface is credible.
   - README has badges, 1-minute install, architecture diagram, GIF or screenshots, Before/After, and troubleshooting.
   - `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`, issue templates, and PR template exist.
   - At least one real stuck-Codex recovery case study is documented.

## Iteration Plan

### v0.2 Reliability Foundation

- Fix LaunchAgent PATH and `codex` binary resolution.
- Add `status` and `follow repair`.
- Add monitor environment doctor check.
- Update README and release notes with repair commands.
- Verify local monitor can see Homebrew Codex from a LaunchAgent environment.

### v0.3 Audit And Debug UX

- Expand `relay-baton audit <bundle>` with stricter schema validation and machine-readable CI gates.
- Add `relay-baton demo` with fixture rollout JSONL and sample bundle output.
- Add `relay-baton status --json` fields for automation: doctor, monitor, activity, recovery, latest failures.
- Add clearer recovery-state explanations for cooldown, fallback attempts, duplicate fork/Desktop prevention.

### v0.5 Public Demo Package

- Add screenshots or GIF of a stuck Codex thread being relayed.
- Add docs/case-study-codex-compact-failure.md.
- Add docs/architecture.md with Hooks -> Activity State -> Recovery Ladder -> Fork/Desktop.
- Add comparison table in README linking to `docs/competitive-analysis.md`.

### v0.8 Cross-Platform Hardening

- Validate Windows Task Scheduler install on a real Windows machine.
- Add Linux systemd user service.
- Add CI matrix for macOS, Linux, and Windows where feasible.
- Add uninstall and repair smoke tests for monitor service generation.

### v1.0 Stable Launch

- Publish npm package.
- Freeze the public CLI surface for `doctor`, `status`, `follow`, `recover`, `handoff`, `audit`, and `pack`.
- Tag `v1.0.0` with a full launch checklist.
- Publish launch post and share in Codex/AI coding communities.

## Acceptance Commands

```bash
npm test
npm run build
npm pack --dry-run --json
relay-baton doctor
relay-baton follow repair
relay-baton status
relay-baton recover --last --dry-run
npm install -g github:guorunjie/codex-relay-baton-guardian
```

v1.0 is complete only when these commands pass on a clean machine and the npm install path also works:

```bash
npm install -g codex-relay-baton-guardian
relay-baton doctor
relay-baton follow install
relay-baton status
```
