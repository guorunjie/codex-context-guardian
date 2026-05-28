import type { HandoffMemory } from "./threadContext.ts";

export type HandoffQuality = {
  ok: boolean;
  score: number;
  grade: "excellent" | "good" | "review" | "blocked";
  blockers: string[];
  reasons: string[];
  recommendation: string;
};

export function evaluateHandoffMemory(memory: HandoffMemory): HandoffQuality {
  let score = 0;
  const reasons: string[] = [];
  const blockers: string[] = [];

  if (memory.latestGoal?.objective?.trim()) {
    score += 20;
  } else {
    reasons.push("No latest active goal was found.");
  }

  const latestUserIntent = memory.latestUserIntent?.summary?.trim() || "";
  const hasMeaningfulUserIntent = Boolean(latestUserIntent) && !isTurnAbortOnly(latestUserIntent);
  if (hasMeaningfulUserIntent) {
    score += 20;
  } else if (latestUserIntent) {
    blockers.push("Latest user intent is only a turn-aborted marker, not a recoverable task direction.");
  } else {
    reasons.push("No latest real user intent was found.");
  }

  const latestProgress = memory.latestAssistantProgress?.summary?.trim() || "";
  const hasAssistantProgress = Boolean(latestProgress) && !isTurnAbortOnly(latestProgress);
  if (hasAssistantProgress) {
    score += 30;
  } else {
    reasons.push("No assistant progress after the latest user request was found.");
  }

  const tailHasRealUserAnchor = memory.recentTail.some((evidence) => {
    return evidence.role === "user" && !isTurnAbortOnly(evidence.text);
  });
  if (tailHasRealUserAnchor) {
    score += 10;
  } else {
    reasons.push("Recent tail does not contain a real user-message anchor.");
  }

  if (!memory.currentTaskState.interrupted) {
    score += 10;
  } else if (requiresWorktreeInspection(memory.nextAction.summary)) {
    score += 10;
  } else {
    blockers.push("Interrupted source turn does not require checking git status/diff before continuation.");
  }

  if (memory.warnings.length === 0) {
    score += 10;
  } else {
    reasons.push(`Handoff memory contains ${memory.warnings.length} warning(s).`);
  }

  if (memory.currentTaskState.interrupted && !hasMeaningfulUserIntent && !hasAssistantProgress) {
    blockers.push("Interrupted source turn has neither a real user intent nor assistant progress to resume from.");
  }
  if (!memory.latestGoal && !hasMeaningfulUserIntent) {
    blockers.push("No reliable current task objective was extracted.");
  }

  const ok = blockers.length === 0 && score >= 50;
  const grade = !ok ? "blocked" : score >= 80 ? "excellent" : score >= 60 ? "good" : "review";
  const recommendation = ok
    ? "Create or reuse a Desktop handoff from this memory."
    : "Do not create a Desktop handoff. Regenerate the memory from a better rollout window or inspect the source thread manually.";

  return {
    ok,
    score,
    grade,
    blockers: unique(blockers),
    reasons: unique(reasons),
    recommendation
  };
}

export function isTurnAbortOnly(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  return /^(<turn_aborted>|The user interrupted the previous turn|The previous turn was interrupted|Source turn was interrupted|用户中断|中断标记)/i.test(normalized)
    || /^Inspect git status, git diff, and current files before editing because the source turn was interrupted\.?$/i.test(normalized);
}

function requiresWorktreeInspection(text: string): boolean {
  return /\b(git status|git diff|worktree|working tree|current files)\b|工作区|当前文件/i.test(text);
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}
