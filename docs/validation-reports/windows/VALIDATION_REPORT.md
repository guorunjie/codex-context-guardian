# Relay Baton Host Validation Report

Generated: 2026-05-28T08:50:25.764Z
Platform: win32 x64
Node: 26.2.0
Workspace: D:\a\codex-relay-baton-guardian\codex-relay-baton-guardian
Codex home: D:\a\_temp/codex-home

## Summary

- overall: ok
- doctor: ok
- monitor installed: yes
- monitor loaded: yes
- release gate: failed (advisory)
- activity threads: 0
- recovery threads: 0

## Doctor

- OK codex cli: C:\npm\prefix\codex.cmd (codex-cli 0.134.0)
- OK sqlite3: available
- OK config: D:\a\_temp\codex-home\config.toml
- OK state database: D:\a\_temp\codex-home\state_5.sqlite
- OK logs database: D:\a\_temp\codex-home\logs_2.sqlite
- OK threads table: state_5.sqlite
- OK logs table: logs_2.sqlite
- OK relay-baton compact hooks: D:\a\_temp\codex-home\hooks.json
- OK primary model: gpt-5.5
- OK fallback model: gpt-5.4

## Monitor

- label: RelayBatonMonitor
- installed: yes
- loaded: yes
- path: D:\a\_temp\codex-home\relay-baton\logs\install-monitor.ps1

## Release Gate

- PASS package metadata: codex-relay-baton-guardian@0.8.5
- PASS primary CLI bin: relay-baton -> bin/relay-baton.js
- PASS npm-safe bin paths: relay-baton -> bin/relay-baton.js, guardian -> bin/guardian.js, codex-context-guardian -> bin/guardian.js
- PASS package-lock version: package-lock version: 0.8.5
- PASS changelog entry: CHANGELOG.md mentions 0.8.5
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
- PASS host validation workflow: .github/workflows/host-validation.yml should collect host validation artifacts on Linux and Windows
- FAIL git worktree clean: ?? codex-relay-baton-guardian-0.8.5.tgz
?? pack.json
