import fs from "node:fs";
import { configPath, modelsCachePath } from "./paths.ts";
import { resolveCommand } from "./exec.ts";

export type GuardianConfig = {
  codexBin: string;
  primaryModel: string;
  fallbackModel: string;
  pollIntervalMs: number;
  recoveryCooldownMs: number;
  compactTimeoutMs: number;
  turnStallMs: number;
  turnStallIdleMs: number;
  turnStallVisibleRelay: boolean;
  maxConsecutiveRecoveries: number;
  freshSessionAfterAttempts: number;
  fallbackAttempts: number;
  autoDestination: "fork" | "desktop" | "cli";
  recoveryTransport: "app-server" | "cli";
  backfillMs: number;
  createVisibleRelay: boolean;
  maxVisibleRelaysPerWindow: number;
  visibleRelayWindowMs: number;
};

export function readCodexPrimaryModel(home?: string): string {
  const file = configPath(home);
  if (!fs.existsSync(file)) return "gpt-5.5";
  const text = fs.readFileSync(file, "utf8");
  const match = text.match(/^\s*model\s*=\s*"([^"]+)"/m);
  return match?.[1] || "gpt-5.5";
}

export function defaultGuardianConfig(home?: string): GuardianConfig {
  return {
    codexBin: process.env.GUARDIAN_CODEX_BIN || resolveCommand("codex") || "codex",
    primaryModel: readCodexPrimaryModel(home),
    fallbackModel: process.env.GUARDIAN_FALLBACK_MODEL || "gpt-5.4",
    pollIntervalMs: numberFromEnv("GUARDIAN_POLL_MS", 5000),
    recoveryCooldownMs: numberFromEnv("GUARDIAN_COOLDOWN_MS", 10 * 60 * 1000),
    compactTimeoutMs: numberFromEnv("GUARDIAN_COMPACT_TIMEOUT_MS", 2 * 60 * 1000),
    turnStallMs: numberFromEnv("GUARDIAN_TURN_STALL_MS", 30 * 60 * 1000),
    turnStallIdleMs: numberFromEnv("GUARDIAN_TURN_STALL_IDLE_MS", 15 * 60 * 1000),
    turnStallVisibleRelay: boolFromEnv("GUARDIAN_TURN_STALL_VISIBLE_RELAY", false),
    maxConsecutiveRecoveries: numberFromEnv("GUARDIAN_MAX_RECOVERIES", 3),
    freshSessionAfterAttempts: numberFromEnv("GUARDIAN_FRESH_SESSION_AFTER", 2),
    fallbackAttempts: numberFromEnv("GUARDIAN_FALLBACK_ATTEMPTS", 2),
    autoDestination: autoDestinationFromEnv(),
    recoveryTransport: recoveryTransportFromEnv(),
    backfillMs: numberFromEnv("GUARDIAN_BACKFILL_MS", 60 * 60 * 1000),
    createVisibleRelay: boolFromEnv("GUARDIAN_CREATE_VISIBLE_RELAY", false),
    maxVisibleRelaysPerWindow: numberFromEnv("GUARDIAN_MAX_VISIBLE_RELAYS_PER_WINDOW", 1),
    visibleRelayWindowMs: numberFromEnv("GUARDIAN_VISIBLE_RELAY_WINDOW_MS", 60 * 60 * 1000)
  };
}

export function fallbackModelLooksAvailable(model: string, home?: string): boolean {
  const file = modelsCachePath(home);
  if (!fs.existsSync(file)) return true;
  try {
    return fs.readFileSync(file, "utf8").includes(model);
  } catch {
    return true;
  }
}

function numberFromEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function boolFromEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function autoDestinationFromEnv(): GuardianConfig["autoDestination"] {
  const value = process.env.GUARDIAN_AUTO_DESTINATION;
  if (value === "desktop" || value === "cli" || value === "fork") return value;
  return "fork";
}

function recoveryTransportFromEnv(): GuardianConfig["recoveryTransport"] {
  const value = process.env.GUARDIAN_RECOVERY_TRANSPORT;
  if (value === "cli" || value === "app-server") return value;
  return "app-server";
}
