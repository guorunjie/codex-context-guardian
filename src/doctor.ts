import fs from "node:fs";
import path from "node:path";
import { commandExists, runCommand } from "./exec.ts";
import { configPath, hooksPath, logsDbPath, stateDbPath } from "./paths.ts";
import { tableExists } from "./sqlite.ts";
import { defaultGuardianConfig, fallbackModelLooksAvailable } from "./config.ts";
import { monitorPlistPath } from "./monitor.ts";

export type Check = {
  name: string;
  ok: boolean;
  detail: string;
};

export function runDoctor(home?: string): Check[] {
  const config = defaultGuardianConfig(home);
  const checks: Check[] = [];

  const codex = runCommand(config.codexBin, ["--version"], { timeoutMs: 5000 });
  checks.push({
    name: "codex cli",
    ok: codex.status === 0,
    detail: codex.status === 0 ? `${config.codexBin} (${codex.stdout.trim()})` : codex.stderr.trim() || `${config.codexBin} not found`
  });

  checks.push({
    name: "sqlite3",
    ok: commandExists("sqlite3"),
    detail: commandExists("sqlite3") ? "available" : "missing"
  });

  checks.push(fileCheck("config", configPath(home)));
  checks.push(fileCheck("state database", stateDbPath(home)));
  checks.push(fileCheck("logs database", logsDbPath(home)));

  if (fs.existsSync(stateDbPath(home))) {
    checks.push({
      name: "threads table",
      ok: tableExists(stateDbPath(home), "threads"),
      detail: "state_5.sqlite"
    });
  }

  if (fs.existsSync(logsDbPath(home))) {
    checks.push({
      name: "logs table",
      ok: tableExists(logsDbPath(home), "logs"),
      detail: "logs_2.sqlite"
    });
  }

  const hooksFile = hooksPath(home);
  const hooksText = fs.existsSync(hooksFile) ? fs.readFileSync(hooksFile, "utf8") : "";
  checks.push({
    name: "relay-baton compact hooks",
    ok: hooksText.includes("hook --phase precompact") && hooksText.includes("hook --phase postcompact"),
    detail: fs.existsSync(hooksFile) ? hooksFile : "hooks.json missing"
  });

  checks.push({
    name: "primary model",
    ok: Boolean(config.primaryModel),
    detail: config.primaryModel
  });

  checks.push({
    name: "fallback model",
    ok: fallbackModelLooksAvailable(config.fallbackModel, home),
    detail: config.fallbackModel
  });

  if (process.platform === "darwin") {
    checks.push(monitorEnvironmentCheck(config.codexBin));
  }

  return checks;
}

export function formatDoctor(checks: Check[]): string {
  return checks
    .map((check) => `${check.ok ? "OK " : "ERR"} ${check.name}: ${check.detail}`)
    .join("\n");
}

function fileCheck(name: string, file: string): Check {
  return {
    name,
    ok: fs.existsSync(file),
    detail: file
  };
}

function monitorEnvironmentCheck(codexBin: string): Check {
  const file = monitorPlistPath();
  if (!fs.existsSync(file)) {
    return {
      name: "monitor launch environment",
      ok: false,
      detail: `${file} missing`
    };
  }
  const text = fs.readFileSync(file, "utf8");
  const codexDir = codexBin.includes(path.sep) ? path.dirname(codexBin) : "";
  const hasPath = text.includes("<key>PATH</key>");
  const hasCodexDir = !codexDir || text.includes(codexDir);
  const hasCodexBin = text.includes("<key>GUARDIAN_CODEX_BIN</key>");
  return {
    name: "monitor launch environment",
    ok: hasPath && hasCodexDir && hasCodexBin,
    detail: hasPath && hasCodexDir && hasCodexBin
      ? `${file} includes PATH and GUARDIAN_CODEX_BIN`
      : `${file} should be repaired with relay-baton follow repair`
  };
}
