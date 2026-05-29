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
};

export type GuardianRecoveryState = {
  lastSeenLogId: number;
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
}): { ok: true } | { ok: false; reason: string } {
  const current = state.threads[threadId];
  if (!current) return { ok: true };
  const failureLogId = Number(options.failureLogId || 0);
  const hasHandoff = Boolean(current.desktopHandoffCreated || current.forkHandoffCreated);
  const isNewerFailure = failureLogId > 0 && (!current.lastFailureLogId || failureLogId > current.lastFailureLogId);
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

export function recordRecoveryAttempt(state: GuardianRecoveryState, threadId: string, logId: number, now: number): void {
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
    lastForkHandoffBundleDir: current.lastForkHandoffBundleDir
  };
  state.lastSeenLogId = Math.max(state.lastSeenLogId || 0, logId || 0);
}

export function recordFallbackAttempt(state: GuardianRecoveryState, threadId: string, logId: number, now: number): void {
  const current = normalizeThreadState(state.threads[threadId]);
  state.threads[threadId] = {
    ...current,
    lastRecoveryAt: now,
    consecutiveRecoveries: current.consecutiveRecoveries + 1,
    fallbackAttempts: current.fallbackAttempts + 1,
    lastFallbackAt: now,
    lastFailureLogId: logId || current.lastFailureLogId,
    lastLogId: Math.max(current.lastLogId || 0, logId || 0)
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
    lastDesktopHandoffQualityOk: details.qualityOk ?? current.lastDesktopHandoffQualityOk
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
    lastForkHandoffBundleDir: details.bundleDir || current.lastForkHandoffBundleDir
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
    lastForkHandoffBundleDir: current?.lastForkHandoffBundleDir
  };
}
