# Relay Baton Roadmap

Relay Baton is moving from a local recovery harness into a reliable task-relay layer for Codex Desktop and CLI.

## Design Principles

1. Prefer the least lossy continuation path.
   - Codex `fork` keeps original history closest to intact.
   - Desktop handoff is for visible continuity and explicit user-facing recovery.
   - Fresh CLI sessions are a fallback when the source thread cannot be forked.

2. Treat recent truth as stronger than old labels.
   - Latest active goal beats old thread title.
   - Latest real user message beats old summaries.
   - Concrete tool evidence beats assistant intent text.
   - Current git status/diff beats any memory file.

3. Keep memory inspectable.
   - No black-box summary-only recovery.
   - Every key claim has confidence and evidence.
   - Evidence quoted from the old thread is marked as evidence, not as new instructions.

4. Create one best relay.
   - Reuse existing Desktop handoff for the same source thread.
   - Mark fork handoff state as created before launching the fork.
   - Do not continue automatically from a known bad relay.

## Memory Layers

Relay Baton intentionally borrows the structure of durable project memory without copying any product-specific hidden compaction behavior.

1. `HANDOFF_MEMORY.json`
   - Structured current checkpoint.
   - Includes latest goal, user intent, assistant progress, tool progress, superseded directions, completed/pending/blockers, next action, confidence, evidence, and warnings.

2. `RECENT_THREAD_CONTEXT.md`
   - Human-readable recent tail.
   - Explicitly says old title and old docs lose when they conflict with the memory and current worktree.

3. `RECOVERY.md`
   - Fixed read order.
   - Recovery prompt preserved for auditing.

4. Workspace facts
   - Git status, diff stat, capped diff, and selected project files.
   - A continuation must inspect these before editing after `turn_aborted`.

## Recovery Ladder

1. Fallback model attempt 1.
2. Fallback model attempt 2.
3. Fork-first relay.
4. Desktop-visible handoff if explicitly requested or configured.
5. CLI new-session fallback when fork/Desktop are unavailable.

The ladder is per source thread and cooldown-protected.

## Desktop And CLI Coverage

- CLI users can run `relay-baton recover --strategy fork` or `relay-baton watch --auto --fork`.
- Desktop users can run `relay-baton handoff --desktop --goal-mode` to create a visible continuation.
- The Desktop prompt reads the bundle first, applies the recovered active goal, and starts the first turn when requested.

## macOS And Windows Coverage

- macOS monitor uses LaunchAgent.
- Windows monitor generates and installs a Task Scheduler script through PowerShell/schtasks.
- The core recovery commands are Node.js and Codex CLI based, so they remain portable across both environments where Codex CLI is installed.

## Next Iterations

- Add a first-class `PROJECT_MEMORY.md` layer for stable repo decisions that should survive many relays.
- Add a `relay-baton audit <bundle>` command that scores an existing bundle without creating a handoff.
- Add optional Desktop naming cleanup to mark blocked/incorrect relay samples as superseded automatically.
- Add richer rollout event extraction for tests, long-running shell sessions, and final answer summaries.
- Add upstream Codex integration notes for surfacing recovery choices directly in the CLI/TUI.
