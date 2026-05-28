import os from "node:os";
import path from "node:path";

export function codexHome(): string {
  return process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
}

export function guardianHome(home = codexHome()): string {
  return path.join(home, "relay-baton");
}

export function stateDbPath(home = codexHome()): string {
  return path.join(home, "state_5.sqlite");
}

export function logsDbPath(home = codexHome()): string {
  return path.join(home, "logs_2.sqlite");
}

export function configPath(home = codexHome()): string {
  return path.join(home, "config.toml");
}

export function hooksPath(home = codexHome()): string {
  return path.join(home, "hooks.json");
}

export function modelsCachePath(home = codexHome()): string {
  return path.join(home, "models_cache.json");
}

export function snapshotsDir(home = codexHome()): string {
  return path.join(guardianHome(home), "snapshots");
}

export function recoveryStatePath(home = codexHome()): string {
  return path.join(guardianHome(home), "recovery-state.json");
}

export function recoveriesDir(home = codexHome()): string {
  return path.join(guardianHome(home), "recoveries");
}

export function bundlesDir(home = codexHome()): string {
  return path.join(guardianHome(home), "bundles");
}

export function monitorLogsDir(home = codexHome()): string {
  return path.join(guardianHome(home), "logs");
}
