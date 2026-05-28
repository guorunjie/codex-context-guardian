import type { HandoffMemory } from "./threadContext.ts";

export type HandoffQuality = {
  ok: boolean;
  score: number;
  grade: "excellent" | "good" | "review" | "blocked";
  blockers: string[];
  reasons: string[];
  recommendation: string;
};

export type HandoffAudit = {
  ok: boolean;
  schemaOk: boolean;
  schemaErrors: string[];
  quality: HandoffQuality;
};

export function auditHandoffMemory(value: unknown): HandoffAudit {
  const schemaErrors = validateHandoffMemory(value);
  if (schemaErrors.length > 0) {
    return {
      ok: false,
      schemaOk: false,
      schemaErrors,
      quality: {
        ok: false,
        score: 0,
        grade: "blocked",
        blockers: schemaErrors,
        reasons: ["HANDOFF_MEMORY.json does not match the expected schema."],
        recommendation: "Do not create a continuation from this bundle. Regenerate the recovery bundle or inspect the source thread manually."
      }
    };
  }
  const quality = evaluateHandoffMemory(value as HandoffMemory);
  return {
    ok: quality.ok,
    schemaOk: true,
    schemaErrors: [],
    quality
  };
}

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

export function validateHandoffMemory(value: unknown): string[] {
  const errors: string[] = [];
  if (!isObject(value)) return ["Memory must be a JSON object."];
  if (value.schemaVersion !== 2) errors.push("schemaVersion must be 2.");
  if (!isNonEmptyString(value.generatedAt)) errors.push("generatedAt must be a non-empty string.");
  if (!isObject(value.source)) {
    errors.push("source must be an object.");
  } else {
    if (!isNonEmptyString(value.source.threadId)) errors.push("source.threadId must be a non-empty string.");
    if (!isNonEmptyString(value.source.title)) errors.push("source.title must be a non-empty string.");
    if (!isNonEmptyString(value.source.cwd)) errors.push("source.cwd must be a non-empty string.");
    if (!isNonEmptyString(value.source.model)) errors.push("source.model must be a non-empty string.");
  }
  if (value.latestGoal !== null && value.latestGoal !== undefined && !isObject(value.latestGoal)) {
    errors.push("latestGoal must be null or an object.");
  }
  if (!isClaimOrNull(value.latestUserIntent)) errors.push("latestUserIntent must be null or a claim object.");
  if (!isClaimOrNull(value.latestAssistantProgress)) errors.push("latestAssistantProgress must be null or a claim object.");
  if (!Array.isArray(value.progressSinceLatestUser)) errors.push("progressSinceLatestUser must be an array.");
  if (!isObject(value.currentTaskState)) {
    errors.push("currentTaskState must be an object.");
  } else {
    if (!isNonEmptyString(value.currentTaskState.summary)) errors.push("currentTaskState.summary must be a non-empty string.");
    if (typeof value.currentTaskState.interrupted !== "boolean") errors.push("currentTaskState.interrupted must be boolean.");
    if (!isEvidenceArray(value.currentTaskState.evidence)) errors.push("currentTaskState.evidence must be an evidence array.");
  }
  if (!isEvidenceArray(value.recentTail)) errors.push("recentTail must be an evidence array.");
  if (!Array.isArray(value.supersededDirections)) errors.push("supersededDirections must be an array.");
  if (!Array.isArray(value.completed)) errors.push("completed must be an array.");
  if (!Array.isArray(value.pending)) errors.push("pending must be an array.");
  if (!Array.isArray(value.blockers)) errors.push("blockers must be an array.");
  if (!isClaim(value.nextAction)) errors.push("nextAction must be a claim object.");
  if (!isClaim(value.handoffDirective)) errors.push("handoffDirective must be a claim object.");
  if (!isObject(value.telemetry)) {
    errors.push("telemetry must be an object.");
  } else {
    if (typeof value.telemetry.messageCount !== "number") errors.push("telemetry.messageCount must be a number.");
    if (typeof value.telemetry.recentTailCount !== "number") errors.push("telemetry.recentTailCount must be a number.");
    if (typeof value.telemetry.rolloutAvailable !== "boolean") errors.push("telemetry.rolloutAvailable must be boolean.");
  }
  if (!Array.isArray(value.warnings)) errors.push("warnings must be an array.");
  return unique(errors);
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

function isObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isClaimOrNull(value: unknown): boolean {
  return value === null || value === undefined || isClaim(value);
}

function isClaim(value: unknown): boolean {
  if (!isObject(value)) return false;
  return isNonEmptyString(value.summary) && isEvidenceArray(value.evidence);
}

function isEvidenceArray(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.every((item) => {
    return isObject(item)
      && isNonEmptyString(item.timestamp)
      && (item.role === "user" || item.role === "assistant" || item.role === "system")
      && isNonEmptyString(item.kind)
      && typeof item.text === "string";
  });
}
