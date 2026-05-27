import fs from "node:fs";
import path from "node:path";
import type { ThreadInfo } from "./codexState.ts";

export type ThreadContextMessage = {
  timestamp: string;
  role: "user" | "assistant" | "system";
  kind: string;
  text: string;
};

export type ThreadGoalContext = {
  objective: string;
  status: string;
  tokensUsed?: number;
  timeUsedSeconds?: number;
  updatedAt?: number;
};

export type RecentThreadContext = {
  rolloutPath: string | null;
  activeGoal: ThreadGoalContext | null;
  messages: ThreadContextMessage[];
  warnings: string[];
};

export type RecentThreadContextOptions = {
  home?: string;
  maxMessages?: number;
  maxMessageChars?: number;
};

export function readRecentThreadContext(
  thread: ThreadInfo | null,
  options: RecentThreadContextOptions = {}
): RecentThreadContext {
  const rolloutPath = resolveRolloutPath(thread, options.home);
  const empty: RecentThreadContext = {
    rolloutPath,
    activeGoal: null,
    messages: [],
    warnings: []
  };
  if (!thread || !rolloutPath) {
    empty.warnings.push("No rollout file was available for the source thread.");
    return empty;
  }
  if (!fs.existsSync(rolloutPath)) {
    empty.warnings.push(`Rollout file does not exist: ${rolloutPath}`);
    return empty;
  }

  const maxMessages = options.maxMessages || 18;
  const maxMessageChars = options.maxMessageChars || 2400;
  const messages: ThreadContextMessage[] = [];
  let activeGoal: ThreadGoalContext | null = null;

  for (const line of fs.readFileSync(rolloutPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let entry: any;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const timestamp = String(entry.timestamp || "");
    const payload = entry.payload;
    if (!payload) continue;

    if (entry.type === "event_msg") {
      if (payload.type === "thread_goal_updated" && payload.goal) {
        activeGoal = {
          objective: String(payload.goal.objective || "").trim(),
          status: String(payload.goal.status || ""),
          tokensUsed: numberOrUndefined(payload.goal.tokensUsed),
          timeUsedSeconds: numberOrUndefined(payload.goal.timeUsedSeconds),
          updatedAt: numberOrUndefined(payload.goal.updatedAt)
        };
        continue;
      }
      if (payload.type === "task_complete" && payload.last_agent_message) {
        pushMessage(messages, {
          timestamp,
          role: "assistant",
          kind: "task_complete",
          text: clipText(String(payload.last_agent_message), maxMessageChars)
        });
        continue;
      }
      if (payload.type === "turn_aborted") {
        pushMessage(messages, {
          timestamp,
          role: "system",
          kind: "turn_aborted",
          text: `The previous turn was interrupted by the user. Reason: ${payload.reason || "unknown"}.`
        });
        continue;
      }
      if (payload.type === "agent_message" && payload.message) {
        pushMessage(messages, {
          timestamp,
          role: "assistant",
          kind: payload.phase ? `agent_message:${payload.phase}` : "agent_message",
          text: clipText(String(payload.message), maxMessageChars)
        });
      }
      continue;
    }

    if (entry.type === "response_item" && payload.type === "message") {
      const role = payload.role === "user" ? "user" : payload.role === "assistant" ? "assistant" : null;
      if (!role) continue;
      const text = normalizeMessageText(extractMessageText(payload.content), maxMessageChars);
      if (!text) continue;
      pushMessage(messages, {
        timestamp,
        role,
        kind: "message",
        text
      });
    }
  }

  return {
    rolloutPath,
    activeGoal,
    messages: messages.slice(-maxMessages),
    warnings: []
  };
}

export function renderRecentThreadContext(context: RecentThreadContext): string {
  const lines = [
    "# Recent Thread Context",
    "",
    "This file is generated from the source thread rollout. Treat it as the highest-priority recovery evidence because it captures late-stage user intent, goal changes, and interruptions that may supersede older project documents.",
    "",
    "## Source",
    "",
    `- rollout: ${context.rolloutPath || "unavailable"}`
  ];

  if (context.activeGoal) {
    lines.push(
      "",
      "## Latest Active Goal",
      "",
      `- status: ${context.activeGoal.status || "unknown"}`,
      `- objective: ${context.activeGoal.objective || "unknown"}`,
      `- tokensUsed: ${context.activeGoal.tokensUsed ?? "unknown"}`,
      `- timeUsedSeconds: ${context.activeGoal.timeUsedSeconds ?? "unknown"}`,
      `- updatedAt: ${context.activeGoal.updatedAt ?? "unknown"}`
    );
  } else {
    lines.push("", "## Latest Active Goal", "", "- unavailable");
  }

  if (context.warnings.length > 0) {
    lines.push("", "## Warnings", "");
    for (const warning of context.warnings) lines.push(`- ${warning}`);
  }

  lines.push("", "## Recent Messages", "");
  if (context.messages.length === 0) {
    lines.push("- No recent messages were extracted.");
  } else {
    for (const message of context.messages) {
      lines.push(
        `### ${message.timestamp || "unknown time"} | ${message.role} | ${message.kind}`,
        "",
        "```text",
        message.text,
        "```",
        ""
      );
    }
  }

  return `${lines.join("\n").trim()}\n`;
}

export function latestGoalObjective(context: RecentThreadContext): string | undefined {
  const objective = context.activeGoal?.objective?.trim();
  return objective || undefined;
}

function resolveRolloutPath(thread: ThreadInfo | null, home?: string): string | null {
  if (!thread) return null;
  if (thread.rolloutPath) return thread.rolloutPath;
  const codexHome = home || process.env.CODEX_HOME || path.join(process.env.HOME || "", ".codex");
  const sessionsDir = path.join(codexHome, "sessions");
  if (!fs.existsSync(sessionsDir)) return null;
  return findRolloutByThreadId(sessionsDir, thread.id);
}

function findRolloutByThreadId(root: string, threadId: string): string | null {
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolute);
      } else if (entry.isFile() && entry.name.includes(threadId) && entry.name.endsWith(".jsonl")) {
        return absolute;
      }
    }
  }
  return null;
}

function extractMessageText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((item: any) => {
      if (!item || typeof item !== "object") return "";
      return item.text || item.input_text || item.output_text || "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function normalizeMessageText(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const objective = trimmed.match(/<objective>\s*([\s\S]*?)\s*<\/objective>/);
  if (objective?.[1]) {
    return clipText(`Active goal objective:\n${objective[1].trim()}`, maxChars);
  }
  if (trimmed.includes("<turn_aborted>")) {
    return "The user interrupted the previous turn on purpose. Treat the interrupted work as incomplete and inspect current state before continuing.";
  }
  if (trimmed.startsWith("<environment_context>")) return "";
  return clipText(trimmed, maxChars);
}

function pushMessage(messages: ThreadContextMessage[], message: ThreadContextMessage): void {
  const last = messages[messages.length - 1];
  if (last && last.role === message.role && last.text === message.text) return;
  messages.push(message);
}

function clipText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n[truncated]`;
}

function numberOrUndefined(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
