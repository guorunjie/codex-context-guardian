import fs from "node:fs";
import path from "node:path";
import { bundlesDir } from "./paths.ts";
import type { HandoffMemory } from "./threadContext.ts";
import { auditHandoffMemory, type HandoffAudit } from "./handoffQuality.ts";

export type DemoBundleResult = {
  bundleDir: string;
  memoryFile: string;
  audit: HandoffAudit;
};

export function writeDemoBundle(options: {
  home?: string;
  outputDir?: string;
} = {}): DemoBundleResult {
  const bundleDir = options.outputDir || path.join(bundlesDir(options.home), `demo-${Date.now()}`);
  fs.mkdirSync(bundleDir, { recursive: true });
  const memory = demoMemory();
  fs.writeFileSync(path.join(bundleDir, "HANDOFF_MEMORY.json"), `${JSON.stringify(memory, null, 2)}\n`);
  fs.writeFileSync(path.join(bundleDir, "RECENT_THREAD_CONTEXT.md"), demoRecentContext());
  fs.writeFileSync(path.join(bundleDir, "RECOVERY.md"), demoRecoveryReadme());
  fs.writeFileSync(path.join(bundleDir, "git-status.txt"), " M src/recovery.ts\n?? docs/case-study-codex-compact-failure.md\n");
  fs.writeFileSync(path.join(bundleDir, "git-diff-stat.txt"), " src/recovery.ts | 12 ++++++++++++\n 1 file changed, 12 insertions(+)\n");
  fs.writeFileSync(path.join(bundleDir, "git-diff.patch"), "demo bundle: no real project diff\n");
  fs.writeFileSync(path.join(bundleDir, "project-files.txt"), "README.md\nsrc/recovery.ts\ndocs/v1-upgrade-roadmap.md\n");
  fs.writeFileSync(path.join(bundleDir, "selected-files.md"), "# Selected Project Files\n\n## README.md\n\n```md\nRelay Baton demo fixture.\n```\n");
  const memoryFile = path.join(bundleDir, "HANDOFF_MEMORY.json");
  return {
    bundleDir,
    memoryFile,
    audit: auditHandoffMemory(memory)
  };
}

function demoMemory(): HandoffMemory {
  const timestamp = "2026-05-28T06:30:00.000Z";
  const userEvidence = {
    timestamp,
    role: "user" as const,
    kind: "message",
    text: "Continue the v1.0 release plan. Prioritize reliable monitor repair and auditable handoff quality before adding broader integrations."
  };
  const assistantEvidence = {
    timestamp: "2026-05-28T06:32:00.000Z",
    role: "assistant" as const,
    kind: "progress",
    text: "Implemented follow repair, status, and audit quality scoring; next step is demo documentation and stricter schema gates."
  };
  return {
    schemaVersion: 2,
    generatedAt: timestamp,
    source: {
      threadId: "demo-thread",
      title: "Demo: Recover a stuck Codex v1.0 release task",
      cwd: "/tmp/relay-baton-demo",
      rolloutPath: "/tmp/relay-baton-demo/rollout.jsonl",
      model: "gpt-5.5",
      tokensUsed: 123456
    },
    latestGoal: {
      objective: "Finish Relay Baton v1.0 with reliable repair, auditable handoff quality, demo assets, and release-ready docs.",
      status: "active",
      timestamp,
      confidence: "high",
      evidence: [userEvidence]
    },
    latestUserIntent: {
      summary: "Continue the v1.0 release plan and prioritize reliability plus auditability before broader integrations.",
      confidence: "high",
      evidence: [userEvidence]
    },
    latestAssistantProgress: {
      summary: "follow repair, status, and audit quality scoring are implemented; continue with demo docs and schema gates.",
      confidence: "high",
      evidence: [assistantEvidence]
    },
    progressSinceLatestUser: [assistantEvidence],
    currentTaskState: {
      summary: "The task is mid-release hardening and should resume from the v1.0 roadmap, not from older naming or early handoff experiments.",
      interrupted: true,
      confidence: "high",
      evidence: [assistantEvidence]
    },
    recentTail: [userEvidence, assistantEvidence],
    supersededDirections: [{
      summary: "Do not revive the older generic memory-platform direction before Codex recovery reliability is stable.",
      confidence: "medium",
      evidence: [userEvidence]
    }],
    completed: [
      "macOS LaunchAgent repair path",
      "status command",
      "bundle quality audit"
    ],
    pending: [
      "demo bundle and case study",
      "npm registry publish after maintainer login",
      "Windows/Linux validation"
    ],
    blockers: [
      "npm publish requires an authenticated npm maintainer session"
    ],
    nextAction: {
      summary: "Inspect git status and continue with demo bundle docs, schema-gated audit, and release verification.",
      confidence: "high",
      evidence: [assistantEvidence]
    },
    handoffDirective: {
      summary: "Resume from v1.0 release hardening. Trust this bundle over older thread titles or abandoned broad-memory plans.",
      confidence: "high",
      evidence: [userEvidence, assistantEvidence]
    },
    telemetry: {
      messageCount: 2,
      recentTailCount: 2,
      warningsCount: 0,
      rolloutAvailable: true
    },
    warnings: []
  };
}

function demoRecentContext(): string {
  return `# Recent Thread Context

This is a Relay Baton demo bundle. If this file conflicts with old thread titles or older project notes, trust HANDOFF_MEMORY.json first.

## Current Task

Finish Relay Baton v1.0 with reliable monitor repair, auditable handoff quality, demo assets, and release-ready docs.

## Recent Evidence

- User asked to continue the v1.0 release plan.
- Assistant completed monitor repair, status, and audit quality scoring.
- Next action is demo documentation and stricter audit schema gates.
`;
}

function demoRecoveryReadme(): string {
  return `# Relay Baton Demo Recovery Bundle

Read order:

1. HANDOFF_MEMORY.json
2. RECENT_THREAD_CONTEXT.md
3. git-status.txt and git-diff-stat.txt
4. selected-files.md

This demo shows how Relay Baton keeps the current task direction ahead of older titles and abandoned plans.
`;
}
