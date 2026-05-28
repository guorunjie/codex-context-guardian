import { classifyLogs } from "./classifier.ts";
import { getLatestThread, getMaxLogId, getThread, readRecentLogs } from "./codexState.ts";
import { defaultGuardianConfig, type GuardianConfig } from "./config.ts";
import { createHandoffRecovery } from "./handoff.ts";
import { buildRecoveryPlan, recover } from "./recovery.ts";
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
  const signal = classifyLogs(rows);
  state.lastSeenLogId = maxSeen;

  if (!signal) {
    saveRecoveryState(state, options.home);
    return "no failure signal";
  }

  const threadId = signal.threadId || getLatestThread(options.home)?.id;
  if (!threadId) {
    saveRecoveryState(state, options.home);
    return "failure signal found, but no thread id was available";
  }

  const gate = canRecoverThread(state, threadId, Date.now(), {
    cooldownMs: config.recoveryCooldownMs,
    maxConsecutiveRecoveries: config.maxConsecutiveRecoveries
  });
  if (!gate.ok) {
    saveRecoveryState(state, options.home);
    return `recovery skipped: ${gate.reason}`;
  }

  const thread = getThread(threadId, options.home);
  const destination = recoveryDestination(options, config);
  const strategy = thread
    ? chooseAutoRecoveryStrategy(state, threadId, {
      fallbackAttempts: config.fallbackAttempts,
      autoDestination: destination
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
    const logId = signal.sourceLogId || maxSeen;
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
      return `desktop handoff launched: ${handoff.desktop?.threadId || "unknown"} for ${thread?.id || threadId}`;
    }

    if (strategy === "fork" && !options.dryRun) {
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
    return `recovery launched: ${plan.strategy} for ${thread?.id || threadId}`;
  }

  saveRecoveryState(state, options.home);
  return `failure detected: ${signal.kind}; suggested strategy: ${plan.strategy}`;
}

export function chooseAutoRecoveryStrategy(
  state: GuardianRecoveryState,
  threadId: string,
  config: Pick<GuardianConfig, "fallbackAttempts" | "autoDestination">
): "fallback-model" | "fork" | "new-session" {
  const current = normalizeThreadState(state.threads[threadId]);
  if (current.fallbackAttempts < config.fallbackAttempts) return "fallback-model";
  return config.autoDestination === "fork" ? "fork" : "new-session";
}

function recoveryDestination(options: WatchOptions, config: GuardianConfig): GuardianConfig["autoDestination"] {
  if (options.desktop) return "desktop";
  if (options.fork) return "fork";
  return config.autoDestination;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
