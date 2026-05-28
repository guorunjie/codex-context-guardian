# Contributing

Thanks for helping make Relay Baton more reliable.

## Local Setup

```bash
npm install
npm test
npm run build
node ./bin/relay-baton.js doctor
```

## Pull Request Expectations

- Keep recovery behavior deterministic and auditable.
- Add tests for new recovery decisions, monitor behavior, bundle schema changes, and CLI flags.
- Do not add network LLM summarization as a required path for recovery.
- Preserve the rule that fork/Desktop handoffs are deduplicated per source thread.
- Update README or docs when user-facing commands or recovery semantics change.

## Release Checks

```bash
npm test
npm run build
npm pack --dry-run --json
node ./bin/relay-baton.js status
```
