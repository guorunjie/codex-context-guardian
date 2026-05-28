# Relay Baton Host Validation Report

Generated: 2026-05-28T08:00:20.460Z
Platform: darwin arm64
Node: 26.0.0
Workspace: <HOME>/Documents/New project/codex-context-guardian
Codex home: <HOME>/.codex

## Summary

- overall: ok
- doctor: ok
- monitor installed: yes
- monitor loaded: yes
- release gate: ok (advisory)
- activity threads: 3
- recovery threads: 1

## Doctor

- OK codex cli: /opt/homebrew/bin/codex (codex-cli 0.133.0)
- OK sqlite3: available
- OK config: <HOME>/.codex/config.toml
- OK state database: <HOME>/.codex/state_5.sqlite
- OK logs database: <HOME>/.codex/logs_2.sqlite
- OK threads table: state_5.sqlite
- OK logs table: logs_2.sqlite
- OK relay-baton compact hooks: <HOME>/.codex/hooks.json
- OK primary model: gpt-5.5
- OK fallback model: gpt-5.4
- OK monitor launch environment: <HOME>/Library/LaunchAgents/com.relay-baton.monitor.plist includes PATH and GUARDIAN_CODEX_BIN

## Monitor

- label: com.relay-baton.monitor
- installed: yes
- loaded: yes
- path: <HOME>/Library/LaunchAgents/com.relay-baton.monitor.plist

## Release Gate

- PASS package metadata: codex-relay-baton-guardian@0.8.2
- PASS primary CLI bin: relay-baton -> bin/relay-baton.js
- PASS npm-safe bin paths: relay-baton -> bin/relay-baton.js, guardian -> bin/guardian.js, codex-context-guardian -> bin/guardian.js
- PASS package-lock version: package-lock version: 0.8.2
- PASS changelog entry: CHANGELOG.md mentions 0.8.2
- PASS built CLI: dist/cli.js exists
- PASS README install commands: README documents GitHub and npm install paths
- PASS v1 roadmap: docs/v1-upgrade-roadmap.md
- PASS v1 launch audit: docs/v1-launch-audit.md should list requirements, blockers, and release evidence
- PASS competitive analysis: docs/competitive-analysis.md
- PASS validation report guide: docs/validation-report-guide.md
- PASS support intake template: bug reports should request validation reports, bundle audit output, and logs
- PASS cross-platform CI matrix: CI should test Linux, macOS, Windows, and packed CLI smoke
- PASS publish dry-run CI: CI should run npm publish --dry-run before release
- PASS npm publish workflow: .github/workflows/publish-npm.yml should publish manually with provenance and NPM_TOKEN
- PASS git worktree clean: clean
