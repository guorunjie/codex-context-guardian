import { classifyLogs } from "./classifier.ts";
import { getLatestThread, getMaxLogId, getThread, readRecentLogs } from "./codexState.ts";
import { defaultGuardianConfig } from "./config.ts";
import { buildRecoveryPlan, recover } from "./recovery.ts";
import {
  canRecoverThread,
  loadRecoveryState,
  recordRecoveryAttempt,
  saveRecoveryState
} from "./recoveryState.ts";

export type WatchOptions = {
  home?: string;
  auto?: boolean;
  once?: boolean;
  dryRun?: boolean;
  pollIntervalMs?: number;
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
  const previousAttempts = state.threads[threadId]?.consecutiveRecoveries || 0;
  const strategy = previousAttempts + 1 >= config.freshSessionAfterAttempts ? "new-session" : undefined;
  const plan = buildRecoveryPlan({
    home: options.home,
    threadId,
    signal,
    dryRun: true,
    strategy
  });

  if (options.auto) {
    recordRecoveryAttempt(state, threadId, signal.sourceLogId || maxSeen, Date.now());
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
