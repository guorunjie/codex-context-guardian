# High-Star Readiness Audit

Date: 2026-06-03

Relay Baton is technically usable, published, and differentiated, but it is not yet packaged like a high-star open-source project. The current gap is mostly trust and distribution, not core functionality.

## Current Evidence

- GitHub: `guorunjie/codex-relay-baton-guardian`, public, `1` star, `0` forks.
- GitHub Release: `v1.1.0` published with tarball and `SHA256SUMS`.
- npm: `codex-relay-baton-guardian@1.1.0`, `latest` points to `1.1.0`.
- CI: latest GitHub CI passes on Linux, macOS, and Windows.
- Local monitor: LaunchAgent installed, loaded, and running on this Mac.
- Release gate: `relay-baton release check --online` passes.
- Codex pain signal: open upstream issues still include `responses/compact`, `stream disconnected before completion`, and `Codex ran out of room...`.

## Competitive Read

High-star adjacent Codex repositories are currently winning on broad, immediately understandable jobs:

- phone or remote control for Codex;
- cross-device session sync;
- API relay or provider routing;
- visible UI workflows.

Compact-specific repair repositories are much smaller. That means Relay Baton should not compete on the generic `codex-relay` phrase. Its sharper wedge is:

> Sleep-safe recovery for Codex long-running tasks.

## Biggest Gaps

1. Public proof is thin.
   The README has a diagram and a case-study document, but it does not yet show a short before/after failure recovery story in the first screen.

2. First-run experience is too CLI-heavy.
   Users need to know whether hooks, monitor, app-server, npm, Codex CLI, and local databases are all healthy. `doctor` exists, but the README does not yet turn it into a guided onboarding flow.

3. Diagnostics are not user-facing enough.
   The project can recover and track state, but users need a command like `relay-baton diagnose --thread <id>` that explains why a stuck thread did or did not trigger a relay.

4. Visible app-server recovery is intentionally opt-in.
   `recover --app-server` and `app-server fork` exist, but background monitoring now defaults to queue-only bundles to avoid empty Desktop/sidebar relays. The next high-value feature is a smoother "review queued bundle -> create one visible relay" flow.

5. Distribution is early.
   GitHub topics and npm are aligned, but the project has not yet entered awesome lists, Codex community docs, Reddit/HN/X/中文社区 posts, or plugin/action ecosystems.

## High-Star Roadmap

### P0: Trust Assets

- Add a 30-60 second GIF showing: compact failure, Relay Baton detection, one bundle queued, optional visible relay created after audit, continuation reads bundle.
- Add a README section titled "What happens when Codex dies overnight?"
- Add a redacted real recovery transcript with exact commands and outputs.
- Add npm download and version badges.

### P1: User Confidence

- Add `relay-baton diagnose --thread <id>`:
  - latest failure signal;
  - matched recovery thread;
  - gate decision;
  - existing relay;
  - next recommended command.
- Add `relay-baton follow doctor` as a guided monitor onboarding command.
- Add a troubleshooting matrix for common failures: missing Codex CLI, no hooks, app-server unavailable, compact failure not classified.

### P2: Safe Visible Relay Recovery

- Add `GUARDIAN_RECOVERY_TRANSPORT=app-server|cli`.
- Keep `watch --auto --fork --queue-only` as the default unattended monitor path.
- Make `watch --once --auto --fork --app-server --create-visible-relay` available for explicit visible recovery.
- Use `thread/fork` with `excludeTurns` as the preferred visible fork transport when app-server is healthy.
- Keep CLI fork as fallback.

### P3: Growth

- Submit to Codex CLI awesome lists and agent tooling collections.
- Publish a technical post using the exact failure messages users search for.
- Open helpful comments on upstream Codex compact issues with reproducible recovery steps, avoiding spam.
- Package a GitHub Action only as install/demo validation, not as the core local monitor.

## Star Potential

- Near term, 50-100 stars is realistic after a strong README/GIF/case-study launch because the pain is visible in upstream issues.
- 300+ stars likely requires either the queued-bundle-to-visible-relay flow becoming very smooth, or a broader "Codex long task supervisor" mode that users can adopt even before they hit compact failure.
- 1000+ stars would require the project to become the default local reliability layer for Codex, with clean onboarding, strong diagnostics, and visible community proof.
