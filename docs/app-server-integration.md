# App-Server Integration

Relay Baton treats Codex app-server as the preferred control plane for explicit visible recovery. The local monitor still uses hooks and SQLite logs for detection, but unattended background recovery defaults to queue-only bundles so it never creates empty visible threads when a remote-control turn cannot start.

## Why It Matters

Codex exposes `thread/fork`, `thread/rollback`, and `thread/compact/start` through app-server. Those APIs are closer to the real conversation state than Desktop UI automation or ad hoc process control.

Relay Baton uses this direction for three reasons:

- `thread/fork` can preserve the source thread lineage while creating a new continuation thread.
- `excludeTurns: true` avoids pulling the full turn history when the client only needs metadata and a recovery prompt.
- `thread/rollback` gives a future path for pruning unsafe tail turns before starting a relay.

## Commands

Probe app-server:

```bash
relay-baton app-server status
relay-baton app-server status --json
```

Fork a thread through app-server and start a recovery turn:

```bash
relay-baton app-server fork --thread <source-thread-id> --prompt "Read the recovery bundle and continue."
```

Use app-server from the normal recovery command:

```bash
relay-baton recover --thread <source-thread-id> --strategy fork --app-server
relay-baton recover --thread <source-thread-id> --strategy last-healthy-fork --app-server
```

Rollback or compact explicitly:

```bash
relay-baton app-server rollback --thread <thread-id> --turns 1
relay-baton app-server compact --thread <thread-id>
```

## Current Boundary

App-server is an integration layer, not the only detector. Relay Baton still watches Codex hooks and local logs because compact failures can happen before a client has an app-server session loaded.

The recovery order is:

1. Detect stuck state with hooks/logs/activity.
2. Write the recovery bundle.
3. In unattended monitor mode, record a queued handoff and stop before creating a visible thread.
4. Prefer app-server fork when `--app-server` and `--create-visible-relay` are requested and the source thread is readable.
5. Fall back to CLI fork/new-session behavior when app-server is unavailable and a TTY exists.

## Next Iteration

The next app-server milestone is making explicit visible recovery smoother after the queue-only monitor has saved the task state:

- Probe app-server health during `doctor` and `status`.
- Keep `GUARDIAN_RECOVERY_TRANSPORT=app-server|cli` for explicit visible recovery.
- Add a guided command that opens the best queued bundle and creates one visible fork only after review.
- Use `thread/rollback` only after a source turn is known to contain unsafe partial context.
- Page turns with `thread/turns/list` for diagnostics instead of reconstructing full histories.
