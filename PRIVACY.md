# Privacy and Local Data

Relay Baton is designed as a local Codex companion. It does not run a hosted service and does not add a cloud telemetry pipeline.

## What Relay Baton Reads

Relay Baton may read:

- Codex local configuration needed for diagnostics, such as model settings and hook configuration.
- Codex local SQLite state and log databases under `~/.codex`.
- Codex rollout JSONL files when building a recovery bundle.
- Git status, diff stats, diffs, and selected project files from the current workspace.
- Relay Baton state files under `~/.codex/relay-baton`.

It does not need your npm token, GitHub token, OpenAI API key, or Codex account credentials to monitor and queue recovery bundles.

## What Relay Baton Writes

Relay Baton writes its own state under `~/.codex/relay-baton/`, including:

- activity and recovery state;
- monitor logs;
- snapshots used for compact/failure recovery;
- recovery bundles such as `HANDOFF_MEMORY.json`, `RECENT_THREAD_CONTEXT.md`, and `RECOVERY.md`;
- service manager files or install scripts for LaunchAgent, systemd user services, or Windows Task Scheduler.

Relay Baton does not edit `~/.codex/config.toml`.

## Network Behavior

The core monitor, bundle generation, diagnosis, and audit flows are local.

Network access can occur only when you run commands that explicitly use external services, such as:

- GitHub commands for release checks, workflow publishing, or repository metadata;
- npm commands for package metadata, authentication, dry-run publish, or publishing;
- Codex CLI or Codex app-server operations that you explicitly invoke for recovery.

Unattended monitor mode defaults to queue-only recovery and does not create visible Desktop/sidebar relays unless configured to do so.

## Redaction And Sharing

Relay Baton redacts obvious secrets from hook snapshots, but recovery bundles can still contain sensitive context. Before sharing a bundle, report, screenshot, or demo publicly, review and redact:

- private thread titles and conversation excerpts;
- customer, account, or project names;
- local usernames and absolute paths;
- git diffs that reveal proprietary code;
- tokens, cookies, credentials, and API keys.

Use `relay-baton audit <bundle> --json` before using a bundle as support or release evidence.

## npm And GitHub Tokens

Publishing the npm package requires a maintainer npm token or an npm browser login. Keep those credentials in npm/GitHub directly:

- do not paste npm tokens into issues, PRs, chat messages, or recovery bundles;
- prefer the GitHub Actions `NPM_TOKEN` secret for release publishing;
- use `npm whoami` only to verify local authentication state.

If `npm whoami` returns `E401`, the machine is not logged in. If npm publish returns `E404` for an existing package, the token usually lacks package publish permission.
