# Competitive Analysis

Relay Baton competes in the narrow space of recovering long-running AI coding sessions after context compaction, tool-loop stalls, or Desktop conversation failure.

## Competitor Groups

| Group | Examples | Strength | Gap Relay Baton Targets |
| --- | --- | --- | --- |
| Codex Desktop rescue tools | GUI or local rescue workarounds | Close to the same user pain | Often less auditable and less structured around recovery state |
| Codex hook utilities | Hook demos, branch/status/audio hooks | Easy to understand and install | Usually observe events but do not recover failed tasks |
| Claude handoff skills | Session handoff skills, post-compact reminders | Lightweight, familiar to Claude users | Manual, Claude-specific, weaker automatic detection |
| Agent memory platforms | MCP memory, code-intelligence memory, project memory banks | Broad agent memory and recall | Broader but less focused on a stuck Codex thread's latest task state |
| Workflow harnesses | Hook-enforced review or state gates | Strong process governance | Often optimize review/workflow quality, not compaction failure recovery |

## Relay Baton Advantages

- Codex-specific recovery path with `codex fork` as the preferred least-lossy continuation.
- Structured handoff memory with evidence, confidence, superseded directions, git state, and selected files.
- Hybrid trigger model: lifecycle hooks first, SQLite log polling second.
- Per-thread recovery state prevents duplicate fork/Desktop relays.
- Desktop handoff is treated as visible recovery, not the default automatic path.

## Relay Baton Weaknesses

- Relies on local Codex state, Codex CLI, and experimental Desktop app-server behavior for some workflows.
- macOS path handling must be robust because LaunchAgent does not inherit the user's shell PATH.
- npm registry distribution is not complete until the maintainer publishes the package.
- The current public surface needs stronger demo assets and case studies.
- Windows support is generated but not yet proven on a real Windows host.

## Positioning

Relay Baton should not market itself as a general memory platform first. The sharper message is:

> When Codex compaction fails or a long task gets stuck, Relay Baton creates the least-lossy continuation and makes the handoff auditable.

This positions the project beside context-compaction tools while keeping the promise testable.
