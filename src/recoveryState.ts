import fs from "node:fs";
import path from "node:path";
import { recoveryStatePath } from "./paths.ts";

export type ThreadRecoveryState = {
  lastRecoveryAt: number;
  consecutiveRecoveries: number;
  lastLogId: number;
  fallbackAttempts: number;
  lastFallbackAt?: number;
  lastFailureLogId?: number;
  desktopHandoffCreated?: boolean;
  lastDesktopHandoffThreadId?: string;
  lastDesktopHandoffBundleDir?: string;
  lastDesktopHandoffQualityScore?: number;
  lastDesktopHandoffQualityOk?: boolean;
  forkHandoffCreated?: boolean;
  lastForkHandoffBundleDir?: string;
  queuedHandoffCreated?: boolean;
  lastQueuedHandoffBundleDir?: string;
  lastQueuedHandoffStrategy?: "fallback-model" | "last-healthy-fork" | "fork" | "new-session";
  lastRecoveryTransport?: "app-server" | "cli" | "desktop" | "bundle";
  lastRecoveryError?: string;
  manualHandoffRequired?: boolean;
  lastManualHandoffBundleDir?: string;
  lastFailureDedupeKey?: string;
};

export type GuardianRecoveryState = {
  lastSeenLogId: number;
  visibleRelayWindowStartedAt?: number;
  visibleRelaysCreatedInWindow?: number;
  threads: Record<string, ThreadRecoveryState>;
};

export function loadRecoveryState(home?: string): GuardianRecoveryState {
  const file = recoveryStatePath(home);
  if (!fs.existsSync(file)) return { lastSeenLogId: 0, threads: {} };
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return { lastSeenLogId: 0, threads: {} };
  }
}

export function saveRecoveryState(state: GuardianRecoveryState, home?: string): void {
  const file = recoveryStatePath(home);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2));
}

export function canRecoverThread(state: GuardianRecoveryState, threadId: string, now: number, options: {
  cooldownMs: number;
  maxConsecutiveRecoveries: number;
  failureLogId?: number;
  failureDedupeKey?: string;
}): { ok: true } | { ok: false; reason: string } {
  const current = state.threads[threadId];
  if (!current) return { ok: true };
  const failureLogId = Number(options.failureLogId || 0);
  const failureDedupeKey = options.failureDedupeKey || "";
  const hasHandoff = Boolean(current.desktopHandoffCreated || current.forkHandoffCreated || current.queuedHandoffCreated);
  const sameDedupeKey = Boolean(failureDedupeKey && current.lastFailureDedupeKey === failureDedupeKey);
  const isNewerFailure = (failureLogId > 0 && (!current.lastFailureLogId || failureLogId > current.lastFailureLogId))
    || Boolean(failureDedupeKey && current.lastFailureDedupeKey !== failureDedupeKey);
  if (hasHandoff && sameDedupeKey) {
    return { ok: false, reason: "existing handoff already covers this failure" };
  }
  if (hasHandoff && failureLogId > 0 && current.lastFailureLogId && failureLogId <= current.lastFailureLogId) {
    return { ok: false, reason: "existing handoff already covers this failure" };
  }
  if (current.consecutiveRecoveries >= options.maxConsecutiveRecoveries && !(hasHandoff && isNewerFailure)) {
    return { ok: false, reason: `recovery limit reached (${current.consecutiveRecoveries})` };
  }
  if (!hasHandoff && now - current.lastRecoveryAt < options.cooldownMs) {
    return { ok: false, reason: "cooldown active" };
  }
  return { ok: true };
}

export function recordRecoveryAttempt(state: GuardianRecoveryState, threadId: string, logId: number, now: number, failureDedupeKey?: string): void {
  const current = normalizeThreadState(state.threads[threadId]);
  state.threads[threadId] = {
    lastRecoveryAt: now,
    consecutiveRecoveries: current.consecutiveRecoveries + 1,
    lastLogId: Math.max(current.lastLogId || 0, logId || 0),
    fallbackAttempts: current.fallbackAttempts,
    lastFallbackAt: current.lastFallbackAt,
    lastFailureLogId: logId || current.lastFailureLogId,
    desktopHandoffCreated: current.desktopHandoffCreated,
    lastDesktopHandoffThreadId: current.lastDesktopHandoffThreadId,
    lastDesktopHandoffBundleDir: current.lastDesktopHandoffBundleDir,
    lastDesktopHandoffQualityScore: current.lastDesktopHandoffQualityScore,
    lastDesktopHandoffQualityOk: current.lastDesktopHandoffQualityOk,
    forkHandoffCreated: current.forkHandoffCreated,
    lastForkHandoffBundleDir: current.lastForkHandoffBundleDir,
    queuedHandoffCreated: current.queuedHandoffCreated,
    lastQueuedHandoffBundleDir: current.lastQueuedHandoffBundleDir,
    lastQueuedHandoffStrategy: current.lastQueuedHandoffStrategy,
    lastRecoveryTransport: current.lastRecoveryTransport,
    lastRecoveryError: current.lastRecoveryError,
    manualHandoffRequired: current.manualHandoffRequired,
    lastManualHandoffBundleDir: current.lastManualHandoffBundleDir,
    lastFailureDedupeKey: failureDedupeKey || current.lastFailureDedupeKey
  };
  state.lastSeenLogId = Math.max(state.lastSeenLogId || 0, logId || 0);
}

export function recordFallbackAttempt(state: GuardianRecoveryState, threadId: string, logId: number, now: number, failureDedupeKey?: string): void {
  const current = normalizeThreadState(state.threads[threadId]);
  state.threads[threadId] = {
    ...current,
    lastRecoveryAt: now,
    consecutiveRecoveries: current.consecutiveRecoveries + 1,
    fallbackAttempts: current.fallbackAttempts + 1,
    lastFallbackAt: now,
    lastFailureLogId: logId || current.lastFailureLogId,
    lastLogId: Math.max(current.lastLogId || 0, logId || 0),
    lastFailureDedupeKey: failureDedupeKey || current.lastFailureDedupeKey
  };
  state.lastSeenLogId = Math.max(state.lastSeenLogId || 0, logId || 0);
}

export function recordDesktopHandoff(
  state: GuardianRecoveryState,
  threadId: string,
  logId: number,
  now: number,
  desktopThreadId?: string,
  details: {
    bundleDir?: string;
    qualityScore?: number;
    qualityOk?: boolean;
    failureDedupeKey?: string;
  } = {}
): void {
  const current = normalizeThreadState(state.threads[threadId]);
  state.threads[threadId] = {
    ...current,
    lastRecoveryAt: now,
    consecutiveRecoveries: current.consecutiveRecoveries + 1,
    lastFailureLogId: logId || current.lastFailureLogId,
    lastLogId: Math.max(current.lastLogId || 0, logId || 0),
    desktopHandoffCreated: true,
    lastDesktopHandoffThreadId: desktopThreadId || current.lastDesktopHandoffThreadId,
    lastDesktopHandoffBundleDir: details.bundleDir || current.lastDesktopHandoffBundleDir,
    lastDesktopHandoffQualityScore: details.qualityScore ?? current.lastDesktopHandoffQualityScore,
    lastDesktopHandoffQualityOk: details.qualityOk ?? current.lastDesktopHandoffQualityOk,
    lastRecoveryTransport: "desktop",
    lastRecoveryError: undefined,
    manualHandoffRequired: false,
    lastFailureDedupeKey: details.failureDedupeKey || current.lastFailureDedupeKey
  };
  state.lastSeenLogId = Math.max(state.lastSeenLogId || 0, logId || 0);
}

export function recordForkHandoff(
  state: GuardianRecoveryState,
  threadId: string,
  logId: number,
  now: number,
  details: {
    bundleDir?: string;
    transport?: "app-server" | "cli";
    failureDedupeKey?: string;
  } = {}
): void {
  const current = normalizeThreadState(state.threads[threadId]);
  state.threads[threadId] = {
    ...current,
    lastRecoveryAt: now,
    consecutiveRecoveries: current.consecutiveRecoveries + 1,
    lastFailureLogId: logId || current.lastFailureLogId,
    lastLogId: Math.max(current.lastLogId || 0, logId || 0),
    forkHandoffCreated: true,
    lastForkHandoffBundleDir: details.bundleDir || current.lastForkHandoffBundleDir,
    lastRecoveryTransport: details.transport || current.lastRecoveryTransport,
    lastRecoveryError: undefined,
    manualHandoffRequired: false,
    lastFailureDedupeKey: details.failureDedupeKey || current.lastFailureDedupeKey
  };
  state.lastSeenLogId = Math.max(state.lastSeenLogId || 0, logId || 0);
}

export function recordQueuedHandoff(
  state: GuardianRecoveryState,
  threadId: string,
  logId: number,
  now: number,
  details: {
    bundleDir?: string;
    strategy?: ThreadRecoveryState["lastQueuedHandoffStrategy"];
    failureDedupeKey?: string;
  } = {}
): void {
  const current = normalizeThreadState(state.threads[threadId]);
  state.threads[threadId] = {
    ...current,
    lastRecoveryAt: now,
    consecutiveRecoveries: current.consecutiveRecoveries + 1,
    lastFailureLogId: logId || current.lastFailureLogId,
    lastLogId: Math.max(current.lastLogId || 0, logId || 0),
    queuedHandoffCreated: true,
    lastQueuedHandoffBundleDir: details.bundleDir || current.lastQueuedHandoffBundleDir,
    lastQueuedHandoffStrategy: details.strategy || current.lastQueuedHandoffStrategy,
    lastRecoveryTransport: "bundle",
    lastRecoveryError: undefined,
    manualHandoffRequired: true,
    lastManualHandoffBundleDir: details.bundleDir || current.lastManualHandoffBundleDir,
    lastFailureDedupeKey: details.failureDedupeKey || current.lastFailureDedupeKey
  };
  state.lastSeenLogId = Math.max(state.lastSeenLogId || 0, logId || 0);
}

export function recordRecoveryFailure(
  state: GuardianRecoveryState,
  threadId: string,
  logId: number,
  now: number,
  details: {
    error: string;
    transport?: "app-server" | "cli" | "desktop" | "bundle";
    bundleDir?: string;
    manualHandoffRequired?: boolean;
    failureDedupeKey?: string;
  }
): void {
  const current = normalizeThreadState(state.threads[threadId]);
  state.threads[threadId] = {
    ...current,
    lastRecoveryAt: now,
    consecutiveRecoveries: current.consecutiveRecoveries + 1,
    lastFailureLogId: logId || current.lastFailureLogId,
    lastLogId: Math.max(current.lastLogId || 0, logId || 0),
    lastRecoveryTransport: details.transport || current.lastRecoveryTransport,
    lastRecoveryError: details.error,
    manualHandoffRequired: details.manualHandoffRequired ?? current.manualHandoffRequired,
    lastManualHandoffBundleDir: details.bundleDir || current.lastManualHandoffBundleDir,
    lastFailureDedupeKey: details.failureDedupeKey || current.lastFailureDedupeKey
  };
  state.lastSeenLogId = Math.max(state.lastSeenLogId || 0, logId || 0);
}

export function normalizeThreadState(current?: Partial<ThreadRecoveryState>): ThreadRecoveryState {
  return {
    lastRecoveryAt: Number(current?.lastRecoveryAt || 0),
    consecutiveRecoveries: Number(current?.consecutiveRecoveries || 0),
    lastLogId: Number(current?.lastLogId || 0),
    fallbackAttempts: Number(current?.fallbackAttempts || 0),
    lastFallbackAt: current?.lastFallbackAt,
    lastFailureLogId: current?.lastFailureLogId,
    desktopHandoffCreated: Boolean(current?.desktopHandoffCreated),
    lastDesktopHandoffThreadId: current?.lastDesktopHandoffThreadId,
    lastDesktopHandoffBundleDir: current?.lastDesktopHandoffBundleDir,
    lastDesktopHandoffQualityScore: typeof current?.lastDesktopHandoffQualityScore === "number"
      ? current.lastDesktopHandoffQualityScore
      : undefined,
    lastDesktopHandoffQualityOk: typeof current?.lastDesktopHandoffQualityOk === "boolean"
      ? current.lastDesktopHandoffQualityOk
      : undefined,
    forkHandoffCreated: Boolean(current?.forkHandoffCreated),
    lastForkHandoffBundleDir: current?.lastForkHandoffBundleDir,
    queuedHandoffCreated: Boolean(current?.queuedHandoffCreated),
    lastQueuedHandoffBundleDir: current?.lastQueuedHandoffBundleDir,
    lastQueuedHandoffStrategy: current?.lastQueuedHandoffStrategy,
    lastRecoveryTransport: current?.lastRecoveryTransport,
    lastRecoveryError: current?.lastRecoveryError,
    manualHandoffRequired: Boolean(current?.manualHandoffRequired),
    lastManualHandoffBundleDir: current?.lastManualHandoffBundleDir,
    lastFailureDedupeKey: current?.lastFailureDedupeKey
  };
}

export function canCreateVisibleRelay(state: GuardianRecoveryState, now: number, options: {
  maxVisibleRelaysPerWindow: number;
  visibleRelayWindowMs: number;
}): { ok: true } | { ok: false; reason: string } {
  const windowStartedAt = Number(state.visibleRelayWindowStartedAt || 0);
  const windowExpired = !windowStartedAt || now - windowStartedAt >= options.visibleRelayWindowMs;
  const currentCount = windowExpired ? 0 : Number(state.visibleRelaysCreatedInWindow || 0);
  if (currentCount >= options.maxVisibleRelaysPerWindow) {
    return { ok: false, reason: `visible relay limit reached (${currentCount}/${options.maxVisibleRelaysPerWindow})` };
  }
  return { ok: true };
}

export function recordVisibleRelay(state: GuardianRecoveryState, now: number, options: {
  visibleRelayWindowMs: number;
}): void {
  const windowStartedAt = Number(state.visibleRelayWindowStartedAt || 0);
  const windowExpired = !windowStartedAt || now - windowStartedAt >= options.visibleRelayWindowMs;
  state.visibleRelayWindowStartedAt = windowExpired ? now : windowStartedAt;
  state.visibleRelaysCreatedInWindow = (windowExpired ? 0 : Number(state.visibleRelaysCreatedInWindow || 0)) + 1;
}
