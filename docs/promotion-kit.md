# Promotion Kit

Relay Baton's strongest public positioning is narrow and concrete:

> Keep Codex long tasks running while you sleep.

It should not be pitched as a generic relay, memory, or summarization tool. The winning message is that a local monitor can detect compact failures and hard context-window exhaustion, preserve the latest task state, and queue one auditable recovery bundle instead of letting the work die overnight.

## Proof Links

- GitHub: <https://github.com/guorunjie/codex-relay-baton-guardian>
- npm: <https://www.npmjs.com/package/codex-relay-baton-guardian>
- Release: <https://github.com/guorunjie/codex-relay-baton-guardian/releases/tag/v1.1.3>
- Demo: [demo-30s-rescue.md](demo-30s-rescue.md)
- Case study: [case-study-codex-compact-failure.md](case-study-codex-compact-failure.md)
- Validation guide: [validation-report-guide.md](validation-report-guide.md)
- Outreach log: [outreach-log.md](outreach-log.md)

## Short Pitch

Relay Baton is a local reliability layer for Codex Desktop/CLI. It watches lifecycle hooks and local logs, detects remote compact failures or `Codex ran out of room in the model's context window`, writes a structured recovery bundle anchored on the latest real user intent, and queues one best relay for review.

## GitHub Description

Keep Codex long tasks running while you sleep: detect compact failures and context-window overflow, preserve the latest task state, and queue one safe fork relay.

## Launch Post

Title:

```text
Relay Baton: keep Codex long tasks running while you sleep
```

Body:

```text
I built Relay Baton after several long Codex Desktop tasks died on remote context compaction:

Error running remote compact task: stream disconnected before completion
Codex ran out of room in the model's context window

The painful part was not just the failure. A naive continuation often picked up an old title or stale summary and revived a direction the task had already abandoned.

Relay Baton runs locally. It watches Codex lifecycle hooks and logs, detects compact/context-window failures, writes HANDOFF_MEMORY.json plus RECENT_THREAD_CONTEXT.md, captures git status/diff, and queues one audited recovery bundle. Background monitors are queue-only by default so they do not create empty visible sidebar threads while you are away.

Install:

npm install -g github:guorunjie/codex-relay-baton-guardian#v1.1.3
relay-baton follow install
relay-baton follow start
relay-baton follow doctor

The goal is simple: let long Codex jobs survive overnight without losing the latest task direction.
```

## X / Short Social Copy

```text
I shipped Relay Baton: a local monitor that keeps Codex long tasks alive while you sleep.

It detects compact failures / context-window overflow, preserves the latest task state, and queues one audited recovery bundle instead of spawning confusing blank relays.

npm install -g github:guorunjie/codex-relay-baton-guardian#v1.1.3
```

## Hacker News / Reddit Angle

Use a technical title, not a marketing title:

```text
Show HN: Relay Baton, a local recovery monitor for long-running Codex tasks
```

Key points to include:

- Built for real Codex failure strings users can search.
- Runs locally against `~/.codex`; no cloud service required.
- Uses structured handoff memory instead of opaque summaries.
- Defaults to queued bundles because background services do not have a reliable interactive TTY.
- Includes `diagnose` so missed rescues are explainable.

## Chinese Community Copy

```text
我做了一个 Codex 长任务自动守护工具 Relay Baton。

它解决的是很具体的问题：任务跑很久以后，Codex 可能出现远程压缩失败或上下文窗口耗尽。最麻烦的不是失败本身，而是新对话接力时经常继承旧标题或早期方向，导致任务跑偏。

Relay Baton 在本机运行，监控 Codex hooks 和日志，发现 compact/context-window 故障后生成 HANDOFF_MEMORY.json、RECENT_THREAD_CONTEXT.md、git 状态和 diff，只保留一个最新、可审计的恢复 bundle。后台默认 queue-only，避免睡觉时自动创建一堆空白接力。

安装：
npm install -g github:guorunjie/codex-relay-baton-guardian#v1.1.3
relay-baton follow install
relay-baton follow start
relay-baton follow doctor
```

## Directory Submission Blurb

```text
Relay Baton is a local Codex Desktop/CLI recovery monitor for long-running agent tasks. It detects remote compact failures and context-window overflow, preserves the latest real task state in an auditable handoff bundle, and queues one safe recovery path. It is built for unattended overnight work and defaults to queue-only recovery to avoid blank visible relay threads.
```

## Star Conversion Checklist

- Pin the exact failure strings in the README and launch posts.
- Keep the first install path to four commands.
- Ask users to open issues with `relay-baton diagnose --last` and `relay-baton validate host` output.
- Add external recovery reports as short case studies.
- Convert the static demo image into a GIF before the next broad launch push.
- Comment on relevant upstream Codex compact/context-window issues only with useful reproduction and recovery steps.

## Suggested Target Channels

- Awesome Codex CLI lists and agent tooling directories.
- Hacker News `Show HN`.
- Reddit communities focused on AI coding tools and developer productivity.
- X threads from the concrete failure story.
- Chinese developer communities and WeChat/knowledge-base posts.
- GitHub topics: `codex`, `codex-cli`, `context-compaction`, `agent-recovery`, `long-running-tasks`.
