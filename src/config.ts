import fs from "node:fs";
import { configPath, modelsCachePath } from "./paths.ts";

export type GuardianConfig = {
  primaryModel: string;
  fallbackModel: string;
  pollIntervalMs: number;
  recoveryCooldownMs: number;
  compactTimeoutMs: number;
  turnStallMs: number;
  maxConsecutiveRecoveries: number;
  freshSessionAfterAttempts: number;
  fallbackAttempts: number;
  autoDestination: "fork" | "desktop" | "cli";
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
    primaryModel: readCodexPrimaryModel(home),
    fallbackModel: process.env.GUARDIAN_FALLBACK_MODEL || "gpt-5.4",
    pollIntervalMs: numberFromEnv("GUARDIAN_POLL_MS", 5000),
    recoveryCooldownMs: numberFromEnv("GUARDIAN_COOLDOWN_MS", 10 * 60 * 1000),
    compactTimeoutMs: numberFromEnv("GUARDIAN_COMPACT_TIMEOUT_MS", 2 * 60 * 1000),
    turnStallMs: numberFromEnv("GUARDIAN_TURN_STALL_MS", 30 * 60 * 1000),
    maxConsecutiveRecoveries: numberFromEnv("GUARDIAN_MAX_RECOVERIES", 3),
    freshSessionAfterAttempts: numberFromEnv("GUARDIAN_FRESH_SESSION_AFTER", 2),
    fallbackAttempts: numberFromEnv("GUARDIAN_FALLBACK_ATTEMPTS", 2),
    autoDestination: autoDestinationFromEnv()
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

function autoDestinationFromEnv(): GuardianConfig["autoDestination"] {
  const value = process.env.GUARDIAN_AUTO_DESTINATION;
  if (value === "desktop" || value === "cli" || value === "fork") return value;
  return "fork";
}
