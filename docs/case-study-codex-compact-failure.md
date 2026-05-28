# Case Study: Recovering A Stuck Codex Compaction

This case study records a redacted local recovery drill for the failure mode Relay Baton is built for.

Evidence status: complete

Evidence was collected on 2026-05-28 from a local Codex Desktop/CLI environment. User-specific paths, thread ids, and private thread titles are redacted.

## Situation

A long Codex Desktop task had already changed direction several times. The old thread title pointed at the original context-summary project, while the latest active goal had shifted to productizing Relay Baton toward v1.0 and GitHub release readiness.

The visible Desktop symptom in the source task was repeated compact failure text:

```text
Error running remote compact task: stream disconnected before completion:
error sending request for url (.../backend-api/codex/responses/compact)
```

A naive continuation created from the old title would have restarted early context-summary work. The correct continuation needed to resume from the latest v1.0 productization work and current git state.

## Redacted Evidence

| Evidence | Result |
| --- | --- |
| Source thread | `<THREAD_ID>` in Codex local state, model `gpt-5.5`, high-context Desktop session |
| Latest goal recovered | `按上述规划迭代路线...完成v1.0...更新github发布` |
| Latest user intent recovered | Same v1.0 productization objective, not the old thread title |
| Latest assistant progress recovered | Recent `apply_patch` progress against README, changelog, CLI, tests, and v1 roadmap |
| Bundle path | `<HOME>/.codex/relay-baton/bundles/<THREAD_ID>-<timestamp>` |
| Bundle files | `HANDOFF_MEMORY.json`, `RECENT_THREAD_CONTEXT.md`, `RECOVERY.md`, `git-status.txt`, `git-diff.patch`, `selected-files.md` |
| Bundle audit | `ok: true`, `schemaOk: true`, `grade: excellent`, `score: 100` |
| Duplicate state | Per-thread recovery state records prior recovery attempts and blocks duplicate fork/Desktop handoffs |
| macOS host state | `relay-baton status` ok; LaunchAgent `com.relay-baton.monitor` installed and running |

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

In this drill, the bundle audit output was:

```json
{
  "audit": {
    "ok": true,
    "schemaOk": true,
    "quality": {
      "ok": true,
      "score": 100,
      "grade": "excellent",
      "blockers": []
    }
  }
}
```

## Why It Does Not Run Backward

`HANDOFF_MEMORY.json` records:

- latest active goal;
- latest real user intent;
- assistant progress after that user message;
- superseded directions;
- next action;
- source evidence with confidence.

The continuation prompt explicitly says to trust the bundle and current worktree over old titles or abandoned plans.

In the recovered memory, the old title stayed historical. The latest active goal and latest user intent both pointed at v1.0 release productization. Recent assistant/tool evidence showed the work had already moved into release checks, docs, README, changelog, and tests. That evidence made the next action continue v1.0 hardening instead of restarting the earlier context-summary direction.

## Current v1.0 Impact

This case proves the core fidelity behavior:

- latest goal overrides stale title;
- recent assistant/tool progress after the latest user request is preserved;
- evidence is visible and auditable before a new continuation is trusted;
- duplicate recovery state prevents multiple misleading continuations for the same source thread.

It does not prove Linux or Windows monitor lifecycle. Those hosts still need separate `relay-baton validate host` reports before v1.0.

## Local Verification Commands

```bash
relay-baton status
relay-baton demo
relay-baton audit ~/.codex/relay-baton/bundles/<demo-bundle>
relay-baton recover --last --dry-run
```

## Known Remaining Limit

NPM registry installation is prepared, but npm publication requires maintainer 2FA or a granular token with publish permission:

```bash
npm publish
```

Until then, the supported public install path is:

```bash
npm install -g github:guorunjie/codex-relay-baton-guardian
```
