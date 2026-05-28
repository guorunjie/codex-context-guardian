# Monitor Trigger Evaluation

## Goal

Relay Baton should automatically follow Codex while it runs, monitor conversation state, and trigger the recovery ladder when the source thread becomes unhealthy.

## Options Considered

### 1. Poll Codex Logs Only

Pros:

- Simple and already available through `~/.codex/logs_2.sqlite`.
- Good at catching explicit compact errors, context overflows, and model unsupported failures.

Cons:

- Not real-time; default polling is every 5 seconds.
- Some failures are visible in the UI but do not produce a clean error log.
- Cannot know whether `PreCompact` started and `PostCompact` never arrived unless a log says so.

Verdict: useful fallback, insufficient alone.

### 2. Codex Lifecycle Hooks Only

Pros:

- Near-real-time.
- Captures `SessionStart`, `UserPromptSubmit`, tool use, `Stop`, `PreCompact`, and `PostCompact`.
- Lets Relay Baton build a per-thread activity state without scraping UI.

Cons:

- Hooks depend on Codex invoking them correctly.
- Hooks do not classify every remote API failure.
- Some historical threads may predate hook installation.

Verdict: best primary trigger source, but needs a fallback.

### 3. Desktop Remote-Control State Only

Pros:

- Desktop-visible and user-friendly.
- Can create visible handoff threads.

Cons:

- More brittle because Desktop app-server APIs are experimental.
- Not available in CLI-only environments.
- It observes the product shell, not necessarily the most reliable source of failure facts.

Verdict: valuable destination and UX layer, not the primary monitor trigger.

### 4. Hybrid Hooks + SQLite Polling

Pros:

- Hooks provide near-real-time lifecycle state.
- Log polling catches explicit compact failures that hooks may not classify.
- Works for Desktop and CLI because both share Codex local state and hooks.
- Does not depend on screen scraping or private UI selection state.

Cons:

- Still not millisecond-level event streaming.
- Requires hook installation.
- Requires cooldown and duplicate-handoff state to avoid over-triggering.

Verdict: chosen design.

## Implemented Trigger Policy

Relay Baton now records lifecycle events into:

- `~/.codex/relay-baton/activity-events.jsonl`
- `~/.codex/relay-baton/activity-state.json`

Installed hook events:

- `SessionStart`
- `UserPromptSubmit`
- `PreToolUse`
- `PostToolUse`
- `Stop`
- `PreCompact`
- `PostCompact`

The watcher checks:

1. Explicit compaction failures from `logs_2.sqlite`.
2. Compact stall: `PreCompact` seen but `PostCompact` missing past `GUARDIAN_COMPACT_TIMEOUT_MS`.
3. Turn stall: active turn has not received `Stop` past `GUARDIAN_TURN_STALL_MS`.

The recovery ladder is unchanged:

1. fallback model attempt;
2. second fallback model attempt;
3. one best relay, defaulting to `codex fork`.

## Operational Commands

Install full following:

```bash
relay-baton follow install
relay-baton follow start
relay-baton follow status
```

Inspect activity:

```bash
relay-baton activity status
relay-baton activity status --json
```

## False Positive Controls

- Per-thread cooldown.
- Per-thread max recovery count.
- Duplicate Desktop handoff prevention.
- Duplicate fork handoff prevention.
- Fallback attempts are bounded.
- Activity-based triggers use time thresholds instead of immediate hook absence.

## Remaining Limits

- If Codex is not configured to run hooks, Relay Baton falls back to log polling.
- If Codex crashes before writing any hook or log event, there may be no reliable thread id.
- Desktop selected-thread state is not treated as authoritative; the latest thread and hook payloads are stronger evidence.
