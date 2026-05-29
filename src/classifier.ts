import type { LogRow } from "./codexState.ts";

export type FailureKind =
  | "model_compact_unsupported"
  | "compact_failed"
  | "compact_stalled"
  | "context_overflow"
  | "transport_or_rate_limit"
  | "turn_stalled"
  | "unknown";

export type FailureSignal = {
  kind: FailureKind;
  confidence: "high" | "medium" | "low";
  reason: string;
  sourceLogId?: number;
  threadId?: string;
};

const MODEL_UNSUPPORTED = [
  /compact(?:ion)?.{0,80}(not supported|unsupported|unavailable)/i,
  /(model|gpt-[\w.-]+).{0,80}(not supported|unsupported).{0,80}compact/i,
  /not supported on this model/i
];

const COMPACT_FAILED = [
  /compaction failed/i,
  /compact task failed/i,
  /failed to compact/i,
  /run_compact_task/i,
  /context compaction/i,
  /compact_remote/i,
  /responses\/compact.{0,160}(error|failed|disconnected)/i,
  /stream disconnected before completion/i,
  /error sending request for url.{0,160}responses\/compact/i
];

const CONTEXT_OVERFLOW = [
  /ran out of room in the model'?s context window/i,
  /start a new thread or clear earlier history before retrying/i,
  /context_length_exceeded/i,
  /maximum context/i,
  /context window/i,
  /too many tokens/i
];

const TRANSIENT = [
  /rate limit/i,
  /429/,
  /timeout/i,
  /temporarily unavailable/i,
  /5\d\d/
];

export function classifyText(text: string): FailureSignal | null {
  const body = text || "";
  if (!/compact|compaction|context_length|context window|ran out of room|clear earlier history|not supported/i.test(body)) {
    return null;
  }
  if (MODEL_UNSUPPORTED.some((pattern) => pattern.test(body))) {
    return {
      kind: "model_compact_unsupported",
      confidence: "high",
      reason: "compact endpoint or current model appears unsupported"
    };
  }
  if (CONTEXT_OVERFLOW.some((pattern) => pattern.test(body))) {
    return {
      kind: "context_overflow",
      confidence: "high",
      reason: "request exceeded available context window"
    };
  }
  if (COMPACT_FAILED.some((pattern) => pattern.test(body))) {
    return {
      kind: "compact_failed",
      confidence: /responses\/compact|compact_remote|stream disconnected before completion/i.test(body) ? "high" : "medium",
      reason: "Codex reported compaction failure"
    };
  }
  if (TRANSIENT.some((pattern) => pattern.test(body))) {
    return {
      kind: "transport_or_rate_limit",
      confidence: "medium",
      reason: "compaction may have failed due to transient API or transport issue"
    };
  }
  return {
    kind: "unknown",
    confidence: "low",
    reason: "log mentions compaction/context but did not match a known failure class"
  };
}

export function classifyLogs(rows: LogRow[]): FailureSignal | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (!isOperationalFailureRow(row)) continue;
    const signal = classifyText(`${row.target}\n${row.body}`);
    if (!signal) continue;
    return {
      ...signal,
      sourceLogId: row.id,
      threadId: row.threadId || extractThreadId(row.body)
    };
  }
  return null;
}

export function extractThreadId(text: string): string | undefined {
  const match = text.match(/thread(?:\.id|_id)?[=:]"?([0-9a-f]{8}-[0-9a-f-]{27,})"?/i);
  return match?.[1];
}

function isOperationalFailureRow(row: LogRow): boolean {
  const level = row.level.toUpperCase();
  const body = row.body;
  const target = row.target;

  if (/function_call|function_call_arguments|response\.created|response\.in_progress|instructions/i.test(body)) {
    return false;
  }

  if (isCompactTransportFailure(row)) return true;

  if (level === "TRACE" || level === "DEBUG") return false;

  if (level === "ERROR" || level === "WARN") return true;
  if (/compact/i.test(target) && /failed|error|unsupported|not supported/i.test(body)) return true;
  return /response\.failed|status["']?:["']?failed|CodexErr|"error"\s*:\s*(\{|"(?!null)[^"]+")/i.test(body);
}

function isCompactTransportFailure(row: LogRow): boolean {
  const target = row.target;
  const body = row.body;
  const compactTarget = /compact|compact_remote|responses/i.test(target);
  const compactBody = /responses\/compact|compact_remote|remote compact|run_compact_task/i.test(body);
  if (!compactTarget && !compactBody) return false;
  return /stream disconnected before completion|error sending request for url|transport|connection|timeout|failed|CodexErr/i.test(body);
}
