# High-Star Readiness Audit

Date: 2026-06-10

Relay Baton is technically usable, published on GitHub, and differentiated, but it is not yet packaged like a high-star open-source project. The current gap is mostly trust, npm distribution, and community proof, not core functionality.

## Current Evidence

- GitHub: `guorunjie/codex-relay-baton-guardian`, public, `1` star, `0` forks.
- GitHub Release: `v1.1.5` is the current public release target.
- npm: `codex-relay-baton-guardian@1.1.5` is the current public package target.
- CI: latest GitHub CI passes on Linux, macOS, and Windows.
- Local monitor: LaunchAgent installed, loaded, and running on this Mac.
- Release gate: `relay-baton release check --v1 --online` should pass once `v1.1.5` release assets, npm publication, and CI success are visible.
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

1. Public proof needs more external validation.
   The README has a diagram, demo guide, and case-study document, but most evidence is still local and redacted.

2. npm release operations need a fresh maintainer token.
   Keep the package-scoped npm token current, rotate it after accidental exposure, and prefer local `npm publish` only when interactive OTP is available.

3. First-run experience is still CLI-heavy.
   Users need to know whether hooks, monitor, app-server, npm, Codex CLI, and local databases are all healthy. `doctor`, `status`, `diagnose`, and `validate host` exist, but the next product step is a smoother guided flow.

4. Diagnostics now exist, but need more examples.
   `relay-baton diagnose --thread <id>` explains why a stuck thread was or was not rescued. More screenshots and real outputs would improve trust.

5. Visible app-server recovery is intentionally opt-in.
   `recover --app-server` and `app-server fork` exist, but background monitoring now defaults to queue-only bundles to avoid empty Desktop/sidebar relays. The next high-value feature is a smoother "review queued bundle -> create one visible relay" flow.

6. Distribution is early.
   GitHub topics and npm are aligned, but the project has not yet entered awesome lists, Codex community docs, Reddit/HN/X/中文社区 posts, or plugin/action ecosystems.

## High-Star Roadmap

### P0: Trust Assets

- Add a 30-60 second GIF showing: compact failure, Relay Baton detection, one bundle queued, optional visible relay created after audit, continuation reads bundle.
- Keep the README section titled "What happens when Codex dies overnight?" near the first screen and link it in launch posts.
- Add a redacted real recovery transcript with exact commands and outputs.
- Add npm download and version badges.

### P1: User Confidence

- Keep `relay-baton follow doctor` as the guided monitor onboarding command in README and launch copy.
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
- Use [promotion-kit.md](promotion-kit.md) for launch copy, target channels, and star-conversion follow-up.

## Star Potential

- Near term, 50-100 stars is realistic after a strong README/GIF/case-study launch because the pain is visible in upstream issues.
- 300+ stars likely requires either the queued-bundle-to-visible-relay flow becoming very smooth, or a broader "Codex long task supervisor" mode that users can adopt even before they hit compact failure.
- 1000+ stars would require the project to become the default local reliability layer for Codex, with clean onboarding, strong diagnostics, and visible community proof.
