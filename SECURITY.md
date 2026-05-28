# Security Policy

Relay Baton reads local Codex state and writes recovery bundles under `~/.codex/relay-baton/`.

## Supported Versions

Security fixes target the latest release.

## Reporting

Please open a private security advisory on GitHub if available, or contact the maintainer through the repository owner profile.

## Safety Boundaries

- Relay Baton does not edit `~/.codex/config.toml`.
- Hook snapshots redact obvious secrets.
- Recovery bundles may include git status, diffs, selected project files, and recent conversation evidence. Review bundles before sharing them publicly.
- Desktop handoff uses experimental local app-server behavior and should be treated as a local automation path.
