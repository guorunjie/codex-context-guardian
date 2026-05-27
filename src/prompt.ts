import fs from "node:fs";
import path from "node:path";
import type { FailureSignal } from "./classifier.ts";
import type { ThreadInfo } from "./codexState.ts";
import { snapshotsDir } from "./paths.ts";

export type RecoveryPromptInput = {
  thread: ThreadInfo | null;
  signal: FailureSignal;
  primaryModel: string;
  fallbackModel: string;
  home?: string;
  bundleDir?: string | null;
};

export function buildRecoveryPrompt(input: RecoveryPromptInput): string {
  const thread = input.thread;
  const snapshotPath = thread ? latestSnapshotPath(thread.id, input.home) : null;
  const lines = [
    "Recover and continue the interrupted Codex task.",
    "",
    "Failure signal:",
    `- kind: ${input.signal.kind}`,
    `- confidence: ${input.signal.confidence}`,
    `- reason: ${input.signal.reason}`,
    `- sourceLogId: ${input.signal.sourceLogId || "unknown"}`,
    "",
    "Thread:",
    `- id: ${thread?.id || input.signal.threadId || "unknown"}`,
    `- title: ${thread?.title || "unknown"}`,
    `- cwd: ${thread?.cwd || process.cwd()}`,
    `- previousModel: ${thread?.model || "unknown"}`,
    `- primaryModel: ${input.primaryModel}`,
    `- fallbackModel: ${input.fallbackModel}`,
    `- tokensUsed: ${thread?.tokensUsed ?? "unknown"}`,
    "",
    "Recovery instructions:",
    "- Read the working tree before editing.",
    "- Treat any existing user changes as intentional and do not revert them.",
    "- Use the snapshot file if it exists.",
    "- Continue the last user goal from the recovered context.",
    "- If compaction failed because the previous model cannot compact, keep the task moving with the active model and avoid manually triggering compact until the context is stable.",
    "- Create a short progress note before major edits so the new session has a durable handoff point.",
    ""
  ];

  if (snapshotPath) {
    lines.push(`Snapshot file: ${snapshotPath}`);
  } else {
    lines.push("Snapshot file: unavailable");
  }

  if (input.bundleDir) {
    lines.push(`Recovery bundle: ${input.bundleDir}`);
    lines.push("- Start by reading HANDOFF_MEMORY.json, then RECENT_THREAD_CONTEXT.md, then RECOVERY.md inside the recovery bundle.");
    lines.push("- If the handoff memory conflicts with the old thread title or older project docs, follow the handoff memory.");
    lines.push("- If latestAssistantProgress or handoffDirective shows work advanced after the latest user request, resume from that progress instead of restarting the older plan.");
    lines.push("- Do not revive directions listed as superseded or parked in the handoff memory.");
  }

  return lines.join("\n");
}

export function buildFallbackSummaryPrompt(input: RecoveryPromptInput & { summaryFile: string }): string {
  const base = buildRecoveryPrompt(input);
  return `${base}

Fallback model stage:
- Do not edit project files.
- Reconstruct the current objective, decisions, completed work, pending work, known blockers, and exact next action.
- Keep the final answer as a durable handoff summary for the primary model.
- The guardian will save your final answer to: ${input.summaryFile}
`;
}

export function buildPrimaryResumePrompt(input: RecoveryPromptInput & { summaryFile: string }): string {
  const base = buildRecoveryPrompt(input);
  return `${base}

Primary model stage:
- The fallback model has produced or attempted to produce a handoff summary at: ${input.summaryFile}
- Read that file if it exists, then continue the task with the primary model.
- Do not repeat the fallback summary unless it is needed to continue safely.
`;
}

export function latestSnapshotPath(threadId: string, home?: string): string | null {
  const dir = snapshotsDir(home);
  if (!fs.existsSync(dir)) return null;
  const prefix = `${threadId}-`;
  const files = fs.readdirSync(dir)
    .filter((file) => file.startsWith(prefix) && file.endsWith(".json"))
    .sort()
    .reverse();
  return files[0] ? path.join(dir, files[0]) : null;
}
