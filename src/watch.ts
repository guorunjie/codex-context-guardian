import { classifyLogs } from "./classifier.ts";
import type { FailureSignal } from "./classifier.ts";
import { getLatestThread, getMaxLogId, getThread, readRecentLogs } from "./codexState.ts";
import { defaultGuardianConfig, type GuardianConfig } from "./config.ts";
import { createHandoffRecovery } from "./handoff.ts";
import { buildRecoveryPlan, recover } from "./recovery.ts";
import { writeRecoveryBundle } from "./bundle.ts";
import { detectActivityFailure, loadActivityState, type ActivityState, type ThreadActivityState } from "./activity.ts";
import {
  canCreateVisibleRelay,
  canRecoverThread,
  loadRecoveryState,
  normalizeThreadState,
  recordDesktopHandoff,
  recordForkHandoff,
  recordFallbackAttempt,
  recordQueuedHandoff,
  recordRecoveryFailure,
  recordRecoveryAttempt,
  recordVisibleRelay,
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
  appServer?: boolean;
  createVisibleRelay?: boolean;
  queueOnly?: boolean;
  planMode?: boolean;
  goalMode?: boolean;
  backfill?: boolean;
};

export async function watch(options: WatchOptions = {}): Promise<void> {
  const config = defaultGuardianConfig(options.home);
  let firstTick = true;

  while (true) {
    const message = await tick({ ...options, backfill: firstTick || options.backfill });
    if (message !== "no failure signal") console.log(message);
    if (options.once) return;
    firstTick = false;
    await sleep(options.pollIntervalMs || config.pollIntervalMs);
  }
}

export async function tick(options: WatchOptions = {}): Promise<string> {
  const config = defaultGuardianConfig(options.home);
  const state = loadRecoveryState(options.home);
  const backfill = options.backfill || !state.lastSeenLogId;
  const rows = readRecentLogs({
    home: options.home,
    afterId: backfill ? undefined : state.lastSeenLogId,
    sinceTs: backfill ? Date.now() - config.backfillMs : undefined,
    limit: backfill ? 500 : 200
  });
  const maxSeen = rows.length > 0
    ? rows.reduce((max, row) => Math.max(max, row.id), state.lastSeenLogId || 0)
    : Math.max(state.lastSeenLogId || 0, getMaxLogId(options.home));
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
  const visibleRelay = shouldCreateVisibleRelay(options, config);
  const selectedStrategy = thread
    ? chooseAutoRecoveryStrategy(state, threadId, {
      fallbackAttempts: config.fallbackAttempts,
      autoDestination: destination,
      recoveryTransport: recoveryTransport(options, config),
      signal
    })
    : "new-session";
  const strategy = options.auto && !visibleRelay
    ? queuedRecoveryStrategy(selectedStrategy, destination)
    : selectedStrategy;
  const plan = buildRecoveryPlan({
    home: options.home,
    threadId,
    signal,
    dryRun: true,
    strategy
  });

  if (options.auto) {
    const now = Date.now();
    if (!visibleRelay) {
      return queueRecovery({
        state,
        options,
        threadId,
        logId,
        now,
        plan,
        dryRunMessage: `${isRelayUpgrade(state, threadId, logId) ? "recovery queue upgrade planned" : "recovery queue planned"}: ${plan.strategy} for ${thread?.id || threadId}`,
        reason: "visible relay creation is disabled for unattended monitor runs"
      });
    }

    const visibleGate = canCreateVisibleRelay(state, now, {
      maxVisibleRelaysPerWindow: config.maxVisibleRelaysPerWindow,
      visibleRelayWindowMs: config.visibleRelayWindowMs
    });
    if (!visibleGate.ok) {
      return queueRecovery({
        state,
        options,
        threadId,
        logId,
        now,
        plan,
        dryRunMessage: `visible relay blocked: ${visibleGate.reason}; recovery queue planned for ${thread?.id || threadId}`,
        reason: visibleGate.reason
      });
    }

    if (strategy === "fallback-model") {
      if (options.dryRun) return `recovery planned: fallback-model for ${thread?.id || threadId}`;
      recordFallbackAttempt(state, threadId, logId, now);
      saveRecoveryState(state, options.home);
      await recover({ home: options.home, threadId, signal, dryRun: false, strategy, bundleDir: plan.bundleDir });
      return `recovery launched: fallback-model for ${thread?.id || threadId}`;
    }

    if (destination === "desktop") {
      const upgrade = isRelayUpgrade(state, threadId, logId);
      if (options.dryRun) {
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
      recordVisibleRelay(state, now, { visibleRelayWindowMs: config.visibleRelayWindowMs });
      saveRecoveryState(state, options.home);
      const prefix = upgrade ? "desktop handoff upgraded" : "desktop handoff launched";
      return `${prefix}: ${handoff.desktop?.threadId || "unknown"} for ${thread?.id || threadId}`;
    }

    const upgrade = isRelayUpgrade(state, threadId, logId);
    if (options.dryRun) {
      return `${upgrade ? "recovery upgrade planned" : "recovery planned"}: ${plan.strategy} for ${thread?.id || threadId}`;
    }
    try {
      await recover({
        home: options.home,
        threadId,
        signal,
        dryRun: false,
        strategy,
        appServer: recoveryTransport(options, config) === "app-server",
        bundleDir: plan.bundleDir
      });
      if (strategy === "fork" || strategy === "last-healthy-fork") {
        recordForkHandoff(state, threadId, logId, now, {
          bundleDir: plan.bundleDir,
          transport: recoveryTransport(options, config) === "app-server" ? "app-server" : "cli"
        });
        recordVisibleRelay(state, now, { visibleRelayWindowMs: config.visibleRelayWindowMs });
      } else {
        recordRecoveryAttempt(state, threadId, logId, now);
      }
      saveRecoveryState(state, options.home);
      return `${upgrade ? "recovery upgraded" : "recovery launched"}: ${plan.strategy} via ${recoveryTransport(options, config)} for ${thread?.id || threadId}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      recordRecoveryFailure(state, threadId, logId, now, {
        error: message,
        transport: recoveryTransport(options, config) === "app-server" ? "app-server" : "cli",
        bundleDir: plan.bundleDir,
        manualHandoffRequired: true
      });
      saveRecoveryState(state, options.home);
      return `recovery blocked: ${message}; bundle=${plan.bundleDir || "none"}; manual_handoff_required=true`;
    }
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
  config: Pick<GuardianConfig, "fallbackAttempts" | "autoDestination"> & { recoveryTransport?: GuardianConfig["recoveryTransport"]; signal?: FailureSignal }
): "fallback-model" | "last-healthy-fork" | "fork" | "new-session" {
  const current = normalizeThreadState(state.threads[threadId]);
  if (config.signal?.kind === "context_overflow") {
    return config.autoDestination === "fork" ? "last-healthy-fork" : "new-session";
  }
  if ("recoveryTransport" in config && config.recoveryTransport === "app-server" && config.autoDestination === "fork") {
    return "fork";
  }
  if ("recoveryTransport" in config && config.recoveryTransport === "app-server" && config.autoDestination === "cli") {
    return "new-session";
  }
  if (current.fallbackAttempts < config.fallbackAttempts) return "fallback-model";
  return config.autoDestination === "fork" ? "fork" : "new-session";
}

function recoveryDestination(options: WatchOptions, config: GuardianConfig): GuardianConfig["autoDestination"] {
  if (options.desktop) return "desktop";
  if (options.fork) return "fork";
  return config.autoDestination;
}

function recoveryTransport(options: WatchOptions, config: GuardianConfig): GuardianConfig["recoveryTransport"] {
  if (options.appServer) return "app-server";
  return config.recoveryTransport;
}

function shouldCreateVisibleRelay(options: WatchOptions, config: GuardianConfig): boolean {
  if (options.queueOnly) return false;
  return Boolean(options.createVisibleRelay || config.createVisibleRelay);
}

function queuedRecoveryStrategy(
  strategy: ReturnType<typeof chooseAutoRecoveryStrategy>,
  destination: GuardianConfig["autoDestination"]
): ReturnType<typeof chooseAutoRecoveryStrategy> {
  if (strategy !== "fallback-model") return strategy;
  return destination === "cli" ? "new-session" : "fork";
}

function queueRecovery(input: {
  state: GuardianRecoveryState;
  options: WatchOptions;
  threadId: string;
  logId: number;
  now: number;
  plan: ReturnType<typeof buildRecoveryPlan>;
  dryRunMessage: string;
  reason: string;
}): string {
  if (!input.plan.bundleDir) {
    recordRecoveryFailure(input.state, input.threadId, input.logId, input.now, {
      error: "could not create recovery bundle for queued handoff",
      transport: "bundle",
      manualHandoffRequired: true
    });
    saveRecoveryState(input.state, input.options.home);
    return "recovery blocked: could not create recovery bundle; manual_handoff_required=true";
  }
  if (input.options.dryRun) return input.dryRunMessage;
  writeRecoveryBundle({
    home: input.options.home,
    bundleDir: input.plan.bundleDir,
    thread: input.plan.thread,
    signal: input.plan.signal,
    prompt: input.plan.prompt,
    projectRoot: input.plan.cwd,
    healthyCheckpoint: input.plan.healthyCheckpoint
  });
  recordQueuedHandoff(input.state, input.threadId, input.logId, input.now, {
    bundleDir: input.plan.bundleDir,
    strategy: input.plan.strategy
  });
  saveRecoveryState(input.state, input.options.home);
  return [
    `recovery queued: ${input.plan.strategy} for ${input.plan.thread?.id || input.threadId}`,
    `bundle=${input.plan.bundleDir}`,
    "visible_relay=false",
    `reason=${input.reason}`,
    "next=run relay-baton recover or handoff explicitly after reviewing the bundle"
  ].join("; ");
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
  if (thread.cwd && activity.cwd && thread.cwd !== activity.cwd) return false;
  if (thread.rolloutPath && activity.rolloutPath && thread.rolloutPath === activity.rolloutPath) return true;
  return titleOverlap(thread.title, activity.title || "") >= 3;
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
