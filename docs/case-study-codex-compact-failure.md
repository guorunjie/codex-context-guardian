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

## Follow-Up Leak Rescue: Background Monitor Missed A Real Stuck Thread

Evidence was collected on 2026-06-02 from a second local Codex Desktop compact failure. Private title text and paths are redacted.

The visible Desktop symptom was again:

```text
Error running remote compact task: stream disconnected before completion:
error sending request for url (.../backend-api/codex/responses/compact)
```

This case was more valuable because Relay Baton did **not** rescue the task automatically.

### What The Audit Found

| Finding | Impact |
| --- | --- |
| Monitor was running as `watch --auto --fork --goal-mode` | The monitor existed, so this was not an install/start failure |
| Compact failure existed in `logs_2.sqlite` | The source signal was real |
| `lastSeenLogId` had advanced beyond the failure log | A restart or later polling pass could classify the failure as historical and skip it |
| Local log timestamps were seconds while some code compared millisecond lookback values | Recent-log filtering could miss valid rows |
| Activity hooks were missing or later pruned for the source thread | `compact_stalled` could not always save the attribution |
| Lineage matching treated same `cwd` as enough evidence | A stuck source thread could be attributed to a newer unrelated thread in the same project folder |
| LaunchAgent stderr contained `stdin is not a terminal` | Interactive `codex fork` is not a safe unattended recovery transport |
| App-server fork could create a visible thread before the recovery turn started | Background visible app-server fork recovery can leave empty sidebar relays when remote-control turn startup is unhealthy |
| Recovery state recorded fork attempts before fork success | The state could say a fork handoff existed even when the background CLI fork failed |

### Fixes Added After This Case

- Startup backfill now scans recent compact failures instead of blindly jumping to the newest log id.
- Recent-log lookback accepts both second-level and millisecond-level Codex timestamps.
- `relay-baton diagnose --thread <id>` explains skipped log ids, missing activity, recovery gate blocks, lineage mismatch, non-TTY failures, trusted-directory failures, and app-server availability.
- Background monitor installs now include `--queue-only`; they write an audited bundle and recovery-state entry without creating a visible Desktop/sidebar thread.
- Visible app-server recovery now requires an explicit `--create-visible-relay` or `GUARDIAN_CREATE_VISIBLE_RELAY=true`, and visible relays are rate-limited.
- Interactive CLI recovery now refuses to run without a TTY and records a visible recovery failure instead of silently polluting successful handoff state.
- Fork handoff state is recorded after recovery succeeds; app-server or CLI failure records `lastRecoveryError` and `manualHandoffRequired`.
- Queued bundle state is recorded separately from successful visible fork/Desktop state, so "saved bundle" cannot masquerade as "visible relay created".
- Thread lineage no longer merges tasks merely because they share the same working directory.

### Diagnostic Output Shape

The new diagnostic command is designed to make a miss explainable:

```bash
relay-baton diagnose --thread <stuck-thread-id>
```

Expected useful findings include:

```text
Signal: compact_failed (high)
Why not rescued:
- signal log <id> is at or below lastSeenLogId <id>
- no lifecycle hook activity exists for this thread
- monitor stderr contains non-TTY interactive Codex failures
- queued recovery bundle exists: ~/.codex/relay-baton/bundles/...
```

This turns a vague "Relay Baton did not save it" report into concrete product work.

## Local Verification Commands

```bash
relay-baton status
relay-baton diagnose --thread <stuck-thread-id>
relay-baton demo
relay-baton audit ~/.codex/relay-baton/bundles/<demo-bundle>
relay-baton recover --last --dry-run
```

## Current Publication Status

Relay Baton's latest verified bundle is available from the GitHub Release:

```bash
npm install -g github:guorunjie/codex-relay-baton-guardian#v1.1.3
relay-baton doctor
relay-baton follow install
relay-baton follow start
```

The npm install path remains the stable package route after publication catches up:

```bash
npm install -g codex-relay-baton-guardian
```
