import fs from "node:fs";
import path from "node:path";
import { recoveryStatePath } from "./paths.ts";

export type ThreadRecoveryState = {
  lastRecoveryAt: number;
  consecutiveRecoveries: number;
  lastLogId: number;
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
}): { ok: true } | { ok: false; reason: string } {
  const current = state.threads[threadId];
  if (!current) return { ok: true };
  if (current.consecutiveRecoveries >= options.maxConsecutiveRecoveries) {
    return { ok: false, reason: `recovery limit reached (${current.consecutiveRecoveries})` };
  }
  if (now - current.lastRecoveryAt < options.cooldownMs) {
    return { ok: false, reason: "cooldown active" };
  }
  return { ok: true };
}

export function recordRecoveryAttempt(state: GuardianRecoveryState, threadId: string, logId: number, now: number): void {
  const current = state.threads[threadId] || {
    lastRecoveryAt: 0,
    consecutiveRecoveries: 0,
    lastLogId: 0
  };
  state.threads[threadId] = {
    lastRecoveryAt: now,
    consecutiveRecoveries: current.consecutiveRecoveries + 1,
    lastLogId: Math.max(current.lastLogId || 0, logId || 0)
  };
  state.lastSeenLogId = Math.max(state.lastSeenLogId || 0, logId || 0);
}
