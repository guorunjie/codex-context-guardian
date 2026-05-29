import { classifyLogs } from "./classifier.ts";
import type { FailureSignal } from "./classifier.ts";
import { getLatestThread, getMaxLogId, getThread, readRecentLogs } from "./codexState.ts";
import { defaultGuardianConfig, type GuardianConfig } from "./config.ts";
import { createHandoffRecovery } from "./handoff.ts";
import { buildRecoveryPlan, recover } from "./recovery.ts";
import { detectActivityFailure, loadActivityState, type ActivityState, type ThreadActivityState } from "./activity.ts";
import {
  canRecoverThread,
  loadRecoveryState,
  normalizeThreadState,
  recordDesktopHandoff,
  recordForkHandoff,
  recordFallbackAttempt,
  recordRecoveryAttempt,
  saveRecoveryState,
  type GuardianRecoveryState
} from "./recoveryState.ts";

export type WatchOptions = {
  home?: string;
  auto?: boolean;
  once?: boolean;
  dryRun?: boolean;
  pollIntervalMs?: number;
  desktop?: boolean;
  fork?: boolean;
  planMode?: boolean;
  goalMode?: boolean;
};

export async function watch(options: WatchOptions = {}): Promise<void> {
  const config = defaultGuardianConfig(options.home);
  const state = loadRecoveryState(options.home);
  if (!state.lastSeenLogId) {
    state.lastSeenLogId = getMaxLogId(options.home);
    saveRecoveryState(state, options.home);
  }

  while (true) {
    await tick(options);
    if (options.once) return;
    await sleep(options.pollIntervalMs || config.pollIntervalMs);
  }
}

export async function tick(options: WatchOptions = {}): Promise<string> {
  const config = defaultGuardianConfig(options.home);
  const state = loadRecoveryState(options.home);
  const rows = readRecentLogs({ home: options.home, afterId: state.lastSeenLogId, limit: 200 });
  const maxSeen = rows.reduce((max, row) => Math.max(max, row.id), state.lastSeenLogId || 0);
  const activityState = loadActivityState(options.home);
  const signal = classifyLogs(rows) || detectActivityFailure(activityState, {
    compactTimeoutMs: config.compactTimeoutMs,
    turnStallMs: config.turnStallMs
  });
  state.lastSeenLogId = maxSeen;

  if (!signal) {
    saveRecoveryState(state, options.home);
    return "no failure signal";
  }

  const threadId = resolveRecoveryThreadId(signal, activityState, state, options.home);
  if (!threadId) {
    saveRecoveryState(state, options.home);
    return "failure signal found, but no thread id was available";
  }
  const logId = signal.sourceLogId || maxSeen;

  const gate = canRecoverThread(state, threadId, Date.now(), {
    cooldownMs: config.recoveryCooldownMs,
    maxConsecutiveRecoveries: config.maxConsecutiveRecoveries,
    failureLogId: logId
  });
  if (!gate.ok) {
    saveRecoveryState(state, options.home);
    return `recovery skipped: ${gate.reason}; why_not_rescued=${describeSkippedRecovery(signal, threadId)}`;
  }

  const thread = getThread(threadId, options.home);
  const destination = recoveryDestination(options, config);
  const strategy = thread
    ? chooseAutoRecoveryStrategy(state, threadId, {
      fallbackAttempts: config.fallbackAttempts,
      autoDestination: destination,
      signal
    })
    : "new-session";
  const plan = buildRecoveryPlan({
    home: options.home,
    threadId,
    signal,
    dryRun: true,
    strategy
  });

  if (options.auto) {
    const now = Date.now();
    if (strategy === "fallback-model") {
      recordFallbackAttempt(state, threadId, logId, now);
      saveRecoveryState(state, options.home);
      await recover({
        home: options.home,
        threadId,
        signal,
        dryRun: options.dryRun,
        strategy
      });
      return `recovery launched: fallback-model for ${thread?.id || threadId}`;
    }

    if (destination === "desktop") {
      const upgrade = isRelayUpgrade(state, threadId, logId);
      if (options.dryRun) {
        recordRecoveryAttempt(state, threadId, logId, now);
        saveRecoveryState(state, options.home);
        return `desktop handoff planned: ${plan.strategy} for ${thread?.id || threadId}`;
      }
      const handoff = await createHandoffRecovery({
        home: options.home,
        threadId,
        desktop: true,
        planMode: options.planMode,
        goalMode: options.goalMode ?? true,
        recordState: false,
        stateLogId: logId
      });
      if (handoff.blocked) {
        recordRecoveryAttempt(state, threadId, logId, now);
        saveRecoveryState(state, options.home);
        return `desktop handoff blocked: ${handoff.blocked.reason}`;
      }
      if (handoff.reusedDesktop) {
        saveRecoveryState(state, options.home);
        return `desktop handoff reused: ${handoff.reusedDesktop.threadId} for ${thread?.id || threadId}`;
      }
      recordDesktopHandoff(state, threadId, logId, now, handoff.desktop?.threadId, {
        bundleDir: handoff.bundleDir,
        qualityScore: handoff.quality?.score,
        qualityOk: handoff.quality?.ok
      });
      saveRecoveryState(state, options.home);
      const prefix = upgrade ? "desktop handoff upgraded" : "desktop handoff launched";
      return `${prefix}: ${handoff.desktop?.threadId || "unknown"} for ${thread?.id || threadId}`;
    }

    const upgrade = isRelayUpgrade(state, threadId, logId);
    if ((strategy === "fork" || strategy === "last-healthy-fork") && !options.dryRun) {
      recordForkHandoff(state, threadId, logId, now, { bundleDir: plan.bundleDir });
    } else {
      recordRecoveryAttempt(state, threadId, logId, now);
    }
    saveRecoveryState(state, options.home);
    await recover({
      home: options.home,
      threadId,
      signal,
      dryRun: options.dryRun,
      strategy
    });
    return `${upgrade ? "recovery upgraded" : "recovery launched"}: ${plan.strategy} for ${thread?.id || threadId}`;
  }

  saveRecoveryState(state, options.home);
  return `failure detected: ${signal.kind}; suggested strategy: ${plan.strategy}`;
}

export function resolveRecoveryThreadId(
  signal: FailureSignal,
  activityState: ActivityState,
  recoveryState: GuardianRecoveryState,
  home?: string
): string | undefined {
  const signalThreadId = signal.threadId;
  const signalThread = signalThreadId ? getThread(signalThreadId, home) : null;
  const candidate = findLineageCandidate(signalThread, signalThreadId, activityState, recoveryState);

  if (!signalThreadId) return candidate?.threadId || getLatestThread(home)?.id;
  if (!candidate) return signalThreadId;
  if (!signalThread) return candidate.threadId;

  const current = normalizeThreadState(recoveryState.threads[signalThreadId]);
  const hasExistingHandoff = current.desktopHandoffCreated || current.forkHandoffCreated;
  if (hasExistingHandoff && candidate.lastEventAt >= current.lastRecoveryAt) return candidate.threadId;
  if (candidate.lastEventAt > signalThread.updatedAt && sameTaskThread(signalThread, candidate)) return candidate.threadId;
  return signalThreadId;
}

export function chooseAutoRecoveryStrategy(
  state: GuardianRecoveryState,
  threadId: string,
  config: Pick<GuardianConfig, "fallbackAttempts" | "autoDestination"> & { signal?: FailureSignal }
): "fallback-model" | "last-healthy-fork" | "fork" | "new-session" {
  const current = normalizeThreadState(state.threads[threadId]);
  if (config.signal?.kind === "context_overflow") {
    return config.autoDestination === "fork" ? "last-healthy-fork" : "new-session";
  }
  if (current.fallbackAttempts < config.fallbackAttempts) return "fallback-model";
  return config.autoDestination === "fork" ? "fork" : "new-session";
}

function recoveryDestination(options: WatchOptions, config: GuardianConfig): GuardianConfig["autoDestination"] {
  if (options.desktop) return "desktop";
  if (options.fork) return "fork";
  return config.autoDestination;
}

function findLineageCandidate(
  signalThread: ReturnType<typeof getThread>,
  signalThreadId: string | undefined,
  activityState: ActivityState,
  recoveryState: GuardianRecoveryState
): ThreadActivityState | null {
  const candidates = Object.values(activityState.threads)
    .filter((thread) => thread.threadId && thread.threadId !== "unknown" && thread.threadId !== signalThreadId)
    .filter((thread) => !signalThread || sameTaskThread(signalThread, thread))
    .sort((a, b) => b.lastEventAt - a.lastEventAt);
  if (!candidates.length) return null;

  const exact = signalThreadId ? normalizeThreadState(recoveryState.threads[signalThreadId]) : null;
  if (!exact?.lastRecoveryAt) return candidates[0];
  return candidates.find((thread) => thread.lastEventAt >= exact.lastRecoveryAt) || null;
}

function sameTaskThread(
  thread: NonNullable<ReturnType<typeof getThread>>,
  activity: ThreadActivityState
): boolean {
  if (thread.cwd && activity.cwd && thread.cwd === activity.cwd) return true;
  if (thread.cwd && activity.cwd && thread.cwd !== activity.cwd) return false;
  if (thread.rolloutPath && activity.rolloutPath && thread.rolloutPath === activity.rolloutPath) return true;
  return titleOverlap(thread.title, activity.title || "") >= 2;
}

function titleOverlap(left: string, right: string): number {
  const leftTokens = titleTokens(left);
  const rightTokens = new Set(titleTokens(right));
  return leftTokens.filter((token) => rightTokens.has(token)).length;
}

function titleTokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function isRelayUpgrade(state: GuardianRecoveryState, threadId: string, logId: number): boolean {
  const current = normalizeThreadState(state.threads[threadId]);
  const hasHandoff = Boolean(current.desktopHandoffCreated || current.forkHandoffCreated);
  return hasHandoff && Boolean(logId) && (!current.lastFailureLogId || logId > current.lastFailureLogId);
}

function describeSkippedRecovery(signal: FailureSignal, threadId: string): string {
  const source = signal.threadId && signal.threadId !== threadId
    ? `signal_thread=${signal.threadId},recovery_thread=${threadId}`
    : `thread=${threadId}`;
  return `${signal.kind},${source}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
