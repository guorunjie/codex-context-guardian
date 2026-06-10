import fs from "node:fs";
import path from "node:path";
import { activityEventsPath, activityStatePath } from "./paths.ts";
import { getLatestThread, getThread, type ThreadInfo } from "./codexState.ts";
import type { FailureSignal } from "./classifier.ts";

export type ActivityEvent = {
  schemaVersion: 1;
  capturedAt: string;
  phase: string;
  hookEventName: string;
  threadId: string;
  turnId?: string;
  transcriptPath?: string;
  cwd?: string;
  model?: string;
};

export type HealthyCheckpoint = {
  capturedAt: string;
  phase: "stop" | "postcompact";
  hookEventName: string;
  threadId: string;
  turnId?: string;
  transcriptPath?: string;
  cwd?: string;
  model?: string;
};

export type ThreadActivityState = {
  threadId: string;
  title?: string;
  cwd?: string;
  rolloutPath?: string;
  model?: string;
  lastEventAt: number;
  lastEventName: string;
  lastTurnId?: string;
  activeTurnStartedAt?: number;
  lastUserPromptAt?: number;
  lastToolEventAt?: number;
  lastStopAt?: number;
  compactInFlight?: boolean;
  lastCompactStartedAt?: number;
  lastCompactCompletedAt?: number;
  healthyCheckpoints?: HealthyCheckpoint[];
  recentEvents: ActivityEvent[];
};

export type ActivityState = {
  schemaVersion: 1;
  updatedAt: number;
  threads: Record<string, ThreadActivityState>;
};

export type ActivityFailureOptions = {
  now?: number;
  compactTimeoutMs: number;
  turnStallMs: number;
  ignoredThreadIds?: Iterable<string>;
};

const MAX_RECENT_EVENTS = 20;
const MAX_HEALTHY_CHECKPOINTS = 12;

export function recordActivityEvent(input: {
  home?: string;
  phase: string;
  payload?: Record<string, unknown>;
}): ActivityEvent {
  const payload = input.payload || {};
  const threadId = readThreadIdFromPayload(payload) || process.env.CODEX_THREAD_ID || getLatestThread(input.home)?.id || "unknown";
  const thread = threadId !== "unknown" ? getThread(threadId, input.home) : getLatestThread(input.home);
  const event: ActivityEvent = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    phase: input.phase,
    hookEventName: String(payload.hook_event_name || payload.hookEventName || input.phase),
    threadId,
    turnId: stringOrUndefined(payload.turn_id || payload.turnId),
    transcriptPath: stringOrUndefined(payload.transcript_path || payload.transcriptPath),
    cwd: stringOrUndefined(payload.cwd) || thread?.cwd,
    model: stringOrUndefined(payload.model) || thread?.model
  };

  appendActivityEvent(input.home, event);
  updateActivityState(input.home, event, thread);
  return event;
}

export function loadActivityState(home?: string): ActivityState {
  const file = activityStatePath(home);
  if (!fs.existsSync(file)) return emptyActivityState();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return {
      schemaVersion: 1,
      updatedAt: Number(parsed.updatedAt || 0),
      threads: parsed.threads && typeof parsed.threads === "object" ? parsed.threads : {}
    };
  } catch {
    return emptyActivityState();
  }
}

export function detectActivityFailure(
  state: ActivityState,
  options: ActivityFailureOptions
): FailureSignal | null {
  const now = options.now ?? Date.now();
  const ignoredThreadIds = new Set(options.ignoredThreadIds || []);
  const threads = Object.values(state.threads)
    .filter((thread) => thread.threadId && thread.threadId !== "unknown")
    .filter((thread) => !ignoredThreadIds.has(thread.threadId))
    .sort((a, b) => b.lastEventAt - a.lastEventAt);

  for (const thread of threads) {
    if (thread.compactInFlight && thread.lastCompactStartedAt && now - thread.lastCompactStartedAt >= options.compactTimeoutMs) {
      return {
        kind: "compact_stalled",
        confidence: "high",
        reason: `PreCompact was observed but PostCompact did not arrive within ${Math.round(options.compactTimeoutMs / 1000)}s`,
        dedupeKey: `compact_stalled:${thread.threadId}:${thread.lastCompactStartedAt}`,
        threadId: thread.threadId
      };
    }
    if (thread.activeTurnStartedAt && !thread.lastStopAt && now - thread.activeTurnStartedAt >= options.turnStallMs) {
      return {
        kind: "turn_stalled",
        confidence: "medium",
        reason: `Codex turn activity has been open for ${Math.round((now - thread.activeTurnStartedAt) / 1000)}s without Stop`,
        dedupeKey: `turn_stalled:${thread.threadId}:${thread.activeTurnStartedAt}:${thread.lastTurnId || ""}`,
        threadId: thread.threadId
      };
    }
  }

  return null;
}

export function latestHealthyCheckpoint(state: ActivityState, threadId: string): HealthyCheckpoint | null {
  const thread = state.threads[threadId];
  if (!thread?.healthyCheckpoints?.length) return null;
  return [...thread.healthyCheckpoints]
    .sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt))[0] || null;
}

export function readThreadIdFromPayload(payload?: Record<string, unknown>): string | undefined {
  const direct = payload?.thread_id || payload?.threadId || payload?.session_id || payload?.sessionId;
  return typeof direct === "string" && direct.trim() ? direct.trim() : undefined;
}

function appendActivityEvent(home: string | undefined, event: ActivityEvent): void {
  const file = activityEventsPath(home);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(event)}\n`);
}

function updateActivityState(home: string | undefined, event: ActivityEvent, thread: ThreadInfo | null): void {
  const state = loadActivityState(home);
  const eventTime = Date.parse(event.capturedAt);
  const current = normalizeThreadActivityState(state.threads[event.threadId], event.threadId);
  const next: ThreadActivityState = {
    ...current,
    threadId: event.threadId,
    title: thread?.title || current.title,
    cwd: event.cwd || thread?.cwd || current.cwd,
    rolloutPath: event.transcriptPath || thread?.rolloutPath || current.rolloutPath,
    model: event.model || thread?.model || current.model,
    lastEventAt: eventTime,
    lastEventName: event.hookEventName,
    lastTurnId: event.turnId || current.lastTurnId,
    recentEvents: [...current.recentEvents, event].slice(-MAX_RECENT_EVENTS)
  };

  if (isUserPromptEvent(event)) {
    next.activeTurnStartedAt = eventTime;
    next.lastUserPromptAt = eventTime;
    next.lastStopAt = undefined;
  }
  if (isToolEvent(event)) {
    next.activeTurnStartedAt ||= eventTime;
    next.lastToolEventAt = eventTime;
  }
  if (isStopEvent(event)) {
    next.lastStopAt = eventTime;
    next.activeTurnStartedAt = undefined;
    addHealthyCheckpoint(next, event, "stop");
  }
  if (isPreCompactEvent(event)) {
    next.compactInFlight = true;
    next.lastCompactStartedAt = eventTime;
  }
  if (isPostCompactEvent(event)) {
    next.compactInFlight = false;
    next.lastCompactCompletedAt = eventTime;
    addHealthyCheckpoint(next, event, "postcompact");
  }

  state.schemaVersion = 1;
  state.updatedAt = eventTime;
  state.threads[event.threadId] = next;
  const file = activityStatePath(home);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
}

function normalizeThreadActivityState(current: Partial<ThreadActivityState> | undefined, threadId: string): ThreadActivityState {
  return {
    threadId,
    title: current?.title,
    cwd: current?.cwd,
    rolloutPath: current?.rolloutPath,
    model: current?.model,
    lastEventAt: Number(current?.lastEventAt || 0),
    lastEventName: current?.lastEventName || "",
    lastTurnId: current?.lastTurnId,
    activeTurnStartedAt: numberOrUndefined(current?.activeTurnStartedAt),
    lastUserPromptAt: numberOrUndefined(current?.lastUserPromptAt),
    lastToolEventAt: numberOrUndefined(current?.lastToolEventAt),
    lastStopAt: numberOrUndefined(current?.lastStopAt),
    compactInFlight: Boolean(current?.compactInFlight),
    lastCompactStartedAt: numberOrUndefined(current?.lastCompactStartedAt),
    lastCompactCompletedAt: numberOrUndefined(current?.lastCompactCompletedAt),
    healthyCheckpoints: Array.isArray(current?.healthyCheckpoints)
      ? current.healthyCheckpoints.slice(-MAX_HEALTHY_CHECKPOINTS)
      : [],
    recentEvents: Array.isArray(current?.recentEvents) ? current.recentEvents.slice(-MAX_RECENT_EVENTS) : []
  };
}

function addHealthyCheckpoint(thread: ThreadActivityState, event: ActivityEvent, phase: HealthyCheckpoint["phase"]): void {
  const checkpoint: HealthyCheckpoint = {
    capturedAt: event.capturedAt,
    phase,
    hookEventName: event.hookEventName,
    threadId: event.threadId,
    turnId: event.turnId,
    transcriptPath: event.transcriptPath || thread.rolloutPath,
    cwd: event.cwd || thread.cwd,
    model: event.model || thread.model
  };
  thread.healthyCheckpoints = [...(thread.healthyCheckpoints || []), checkpoint].slice(-MAX_HEALTHY_CHECKPOINTS);
}

function emptyActivityState(): ActivityState {
  return {
    schemaVersion: 1,
    updatedAt: 0,
    threads: {}
  };
}

function isUserPromptEvent(event: ActivityEvent): boolean {
  return /UserPromptSubmit/i.test(event.hookEventName) || event.phase === "user-prompt-submit";
}

function isToolEvent(event: ActivityEvent): boolean {
  return /ToolUse/i.test(event.hookEventName) || event.phase === "pre-tool-use" || event.phase === "post-tool-use";
}

function isStopEvent(event: ActivityEvent): boolean {
  return /^Stop$/i.test(event.hookEventName) || event.phase === "stop";
}

function isPreCompactEvent(event: ActivityEvent): boolean {
  return /PreCompact/i.test(event.hookEventName) || event.phase === "precompact";
}

function isPostCompactEvent(event: ActivityEvent): boolean {
  return /PostCompact/i.test(event.hookEventName) || event.phase === "postcompact";
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberOrUndefined(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
