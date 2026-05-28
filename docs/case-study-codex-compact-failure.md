# Case Study: Recovering A Stuck Codex Compaction

This case study describes the failure mode Relay Baton is built for.

## Situation

A long Codex Desktop task has already changed direction several times. The old thread title still points at an early plan, but the latest user messages and assistant progress point at a newer implementation path.

Then remote context compaction fails or stalls. A naive new conversation created from the old title can revive the abandoned early plan.

## Relay Baton Response

1. Lifecycle hooks record `PreCompact`.
2. If `PostCompact` does not arrive before `GUARDIAN_COMPACT_TIMEOUT_MS`, Relay Baton marks a compact stall.
3. The watcher checks per-thread recovery state and cooldown.
4. The first two eligible failures use fallback-model recovery.
5. If recovery still fails, Relay Baton creates one best relay, defaulting to `codex fork`.
6. A recovery bundle is written before the continuation:
   - `HANDOFF_MEMORY.json`
   - `RECENT_THREAD_CONTEXT.md`
   - `RECOVERY.md`
   - git status/diff
   - selected project files

## Why It Does Not Run Backward

`HANDOFF_MEMORY.json` records:

- latest active goal;
- latest real user intent;
- assistant progress after that user message;
- superseded directions;
- next action;
- source evidence with confidence.

The continuation prompt explicitly says to trust the bundle and current worktree over old titles or abandoned plans.

## Local Verification Commands

```bash
relay-baton status
relay-baton demo
relay-baton audit ~/.codex/relay-baton/bundles/<demo-bundle>
relay-baton recover --last --dry-run
```

## Known Remaining Limit

NPM registry installation is prepared but still requires a maintainer to authenticate and run:

```bash
npm publish
```

Until then, the supported public install path is:

```bash
npm install -g github:guorunjie/codex-relay-baton-guardian
```
