# 30-60 Second Rescue Demo

This is the public demo outline for Relay Baton. It is intentionally short enough to record as a GIF or screen video.

## Message

Codex long tasks can die after context compaction. Relay Baton watches locally, preserves the latest task state, and queues one audited recovery bundle so the task can keep moving while you sleep. Visible relays are created only when explicitly requested.

## Shot List

1. Show the stuck Codex thread with:

   ```text
   Error running remote compact task: stream disconnected before completion
   ... /backend-api/codex/responses/compact
   ```

2. Show the monitor already running:

   ```bash
   relay-baton follow doctor
   ```

3. Show the diagnostic explanation:

   ```bash
   relay-baton diagnose --thread <stuck-thread-id>
   ```

   The output should call out the detected signal, recovery gate, app-server availability, and any reason the previous attempt was skipped.

4. Trigger one safe pass:

   ```bash
   relay-baton watch --once --auto --fork --queue-only
   ```

5. Show the generated bundle:

   ```bash
   relay-baton audit ~/.codex/relay-baton/bundles/<bundle-id>
   ```

6. Optionally create one visible relay after auditing:

   ```bash
   relay-baton recover --thread <stuck-thread-id> --strategy fork --app-server
   ```

7. End on the continuation reading:

   ```text
   Trust HANDOFF_MEMORY.json and RECENT_THREAD_CONTEXT.md over the old title.
   Continue from the latest real user intent and current git diff.
   ```

## Proof Points To Keep On Screen

- `HANDOFF_MEMORY.json`
- `RECENT_THREAD_CONTEXT.md`
- latest user intent
- current next action
- superseded directions
- `git-status.txt`
- one queued bundle by default, no duplicate sidebar confusion

## Recording Rules

- Redact private thread titles, paths, tokens, and customer data.
- Show timestamps and command outputs briefly, but avoid exposing full private logs.
- Do not claim a visible relay succeeded unless the fork thread was actually created and the recovery turn started. Queue-only success means the bundle was written and `manualHandoffRequired` was recorded.
