import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runDoctor, formatDoctor } from "./doctor.ts";
import { installHooks } from "./hooks.ts";
import { readStdinJson, writeSnapshot } from "./snapshot.ts";
import { loadActivityState, recordActivityEvent, type ActivityState } from "./activity.ts";
import { recover } from "./recovery.ts";
import { watch, tick } from "./watch.ts";
import { buildRecoveryPlan } from "./recovery.ts";
import { writeRecoveryBundle } from "./bundle.ts";
import { createHandoffRecovery } from "./handoff.ts";
import { installMonitor, monitorStatus, startMonitor, stopMonitor, uninstallMonitor } from "./monitor.ts";
import { defaultGuardianConfig } from "./config.ts";
import { loadRecoveryState } from "./recoveryState.ts";
import { auditHandoffMemory } from "./handoffQuality.ts";
import { writeDemoBundle } from "./demo.ts";
import { evaluateReleaseReadiness, formatReleaseReadiness } from "./releaseCheck.ts";
import { buildHostValidationReport, renderHostValidationReport, writeHostValidationReport } from "./validationReport.ts";
import { formatDiagnose, runDiagnose } from "./diagnose.ts";
import { buildFollowDoctorReport, formatFollowDoctorReport } from "./followDoctor.ts";
import {
  compactThreadWithAppServer,
  defaultDesktopTitle,
  defaultGoalObjective,
  forkThreadWithAppServer,
  probeAppServer,
  rollbackThreadWithAppServer
} from "./appServer.ts";

type ParsedArgs = {
  command: string;
  flags: Record<string, string | boolean>;
  positional: string[];
};

export async function main(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);
  if (parsed.flags.help || parsed.flags.h) {
    console.log(helpText());
    return;
  }
  switch (parsed.command) {
    case "doctor":
      return doctorCommand(parsed);
    case "diagnose":
      return diagnoseCommand(parsed);
    case "status":
      return statusCommand(parsed);
    case "install-hooks":
      return installHooksCommand(parsed);
    case "hook":
      return hookCommand(parsed);
    case "recover":
      return recoverCommand(parsed);
    case "pack":
      return packCommand(parsed);
    case "audit":
      return auditCommand(parsed);
    case "demo":
      return demoCommand(parsed);
    case "handoff":
      return handoffCommand(parsed);
    case "watch":
      return watchCommand(parsed);
    case "monitor":
      return monitorCommand(parsed);
    case "follow":
      return followCommand(parsed);
    case "activity":
      return activityCommand(parsed);
    case "app-server":
      return appServerCommand(parsed);
    case "release":
      return releaseCommand(parsed);
    case "validate":
      return validateCommand(parsed);
    case "help":
    case "":
      console.log(helpText());
      return;
    default:
      throw new Error(`Unknown command: ${parsed.command}\n\n${helpText()}`);
  }
}

export function parseArgs(argv: string[]): ParsedArgs {
  const command = argv[0] && !argv[0].startsWith("--") ? argv[0] : "";
  const rest = command ? argv.slice(1) : argv;
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index];
    if (!item.startsWith("--")) {
      positional.push(item);
      continue;
    }
    const [rawKey, rawValue] = item.slice(2).split("=", 2);
    const key = rawKey.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    if (rawValue !== undefined) {
      flags[key] = rawValue;
      continue;
    }
    const next = rest[index + 1];
    if (next && !next.startsWith("--")) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }

  return { command, flags, positional };
}

async function doctorCommand(parsed: ParsedArgs): Promise<void> {
  const checks = runDoctor(stringFlag(parsed, "home"));
  if (parsed.flags.json) {
    console.log(JSON.stringify(checks, null, 2));
    return;
  }
  console.log(formatDoctor(checks));
}

async function diagnoseCommand(parsed: ParsedArgs): Promise<void> {
  const minutes = numberFlag(parsed, "minutes");
  const report = await runDiagnose({
    home: stringFlag(parsed, "home"),
    threadId: stringFlag(parsed, "thread") || parsed.positional[0],
    last: Boolean(parsed.flags.last),
    lookbackMs: minutes ? minutes * 60 * 1000 : undefined
  });
  if (parsed.flags.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(formatDiagnose(report));
}

async function statusCommand(parsed: ParsedArgs): Promise<void> {
  const home = stringFlag(parsed, "home");
  const checks = runDoctor(home);
  const status = {
    ok: checks.every((check) => check.ok),
    config: defaultGuardianConfig(home),
    doctor: checks,
    monitor: monitorStatus(home),
    activity: loadActivityState(home),
    recovery: loadRecoveryState(home)
  };
  if (parsed.flags.json) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }
  console.log(formatStatus(status));
}

async function installHooksCommand(parsed: ParsedArgs): Promise<void> {
  const result = installHooks({
    home: stringFlag(parsed, "home"),
    guardianBin: guardianBinPath(),
    dryRun: Boolean(parsed.flags.dryRun)
  });
  console.log(JSON.stringify(result, null, 2));
}

async function hookCommand(parsed: ParsedArgs): Promise<void> {
  const payload = await readStdinJson();
  const phase = stringFlag(parsed, "phase") || "manual";
  const event = recordActivityEvent({
    home: stringFlag(parsed, "home"),
    phase,
    payload
  });
  const shouldSnapshot = phase === "precompact" || phase === "postcompact" || Boolean(parsed.flags.snapshot);
  if (shouldSnapshot) {
    const file = writeSnapshot({
      home: stringFlag(parsed, "home"),
      phase,
      threadId: stringFlag(parsed, "thread"),
      payload
    });
    console.log(file);
    return;
  }
  console.log(JSON.stringify(event));
}

async function recoverCommand(parsed: ParsedArgs): Promise<void> {
  const plan = await recover({
    home: stringFlag(parsed, "home"),
    threadId: stringFlag(parsed, "thread") || parsed.positional[0],
    last: Boolean(parsed.flags.last),
    strategy: strategyFlag(parsed),
    primaryModel: stringFlag(parsed, "primary"),
    fallbackModel: stringFlag(parsed, "fallback"),
    dryRun: Boolean(parsed.flags.dryRun),
    cwd: stringFlag(parsed, "cwd"),
    appServer: Boolean(parsed.flags.appServer),
    startTurn: !Boolean(parsed.flags.noStartTurn)
  });

  if (parsed.flags.dryRun) {
    console.log(JSON.stringify({
      strategy: plan.strategy,
      command: plan.command,
      args: plan.args,
      steps: plan.steps,
      bundleDir: plan.bundleDir,
      cwd: plan.cwd,
      signal: plan.signal,
      thread: plan.thread,
      appServer: Boolean(parsed.flags.appServer),
      appServerRecovery: parsed.flags.appServer && (plan.strategy === "fork" || plan.strategy === "last-healthy-fork") && plan.thread
        ? {
          method: "thread/fork",
          sourceThreadId: plan.thread.id,
          excludeTurns: true,
          startTurn: !Boolean(parsed.flags.noStartTurn)
        }
        : undefined
    }, null, 2));
  }
}

async function packCommand(parsed: ParsedArgs): Promise<void> {
  const plan = buildRecoveryPlan({
    home: stringFlag(parsed, "home"),
    threadId: stringFlag(parsed, "thread") || parsed.positional[0],
    last: Boolean(parsed.flags.last),
    strategy: "new-session",
    dryRun: true,
    cwd: stringFlag(parsed, "cwd")
  });
  if (!plan.bundleDir) throw new Error("Could not plan recovery bundle");
  const dir = writeRecoveryBundle({
    home: stringFlag(parsed, "home"),
    bundleDir: plan.bundleDir,
    thread: plan.thread,
    signal: plan.signal,
    prompt: plan.prompt,
    projectRoot: plan.cwd
  });
  console.log(dir);
}

async function auditCommand(parsed: ParsedArgs): Promise<void> {
  const target = stringFlag(parsed, "bundle") || parsed.positional[0];
  if (!target) throw new Error("Usage: relay-baton audit <bundle-dir|HANDOFF_MEMORY.json> [--json]");
  const memoryFile = resolveMemoryFile(target);
  const memory = JSON.parse(fs.readFileSync(memoryFile, "utf8"));
  const audit = auditHandoffMemory(memory);
  if (parsed.flags.json) {
    console.log(JSON.stringify({ memoryFile, audit }, null, 2));
    if (!audit.ok) process.exitCode = 1;
    return;
  }
  console.log([
    `Memory file: ${memoryFile}`,
    `Schema: ${audit.schemaOk ? "ok" : "invalid"}`,
    `Quality: ${audit.quality.grade} (${audit.quality.score}/100)`,
    `OK: ${audit.ok ? "yes" : "no"}`,
    `Recommendation: ${audit.quality.recommendation}`,
    audit.schemaErrors.length > 0 ? `Schema errors:\n${audit.schemaErrors.map((item) => `- ${item}`).join("\n")}` : "",
    audit.quality.blockers.length > 0 ? `Blockers:\n${audit.quality.blockers.map((item) => `- ${item}`).join("\n")}` : "",
    audit.quality.reasons.length > 0 ? `Reasons:\n${audit.quality.reasons.map((item) => `- ${item}`).join("\n")}` : ""
  ].filter(Boolean).join("\n"));
  if (!audit.ok) process.exitCode = 1;
}

async function demoCommand(parsed: ParsedArgs): Promise<void> {
  const result = writeDemoBundle({
    home: stringFlag(parsed, "home"),
    outputDir: stringFlag(parsed, "output")
  });
  if (parsed.flags.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log([
    `Demo bundle: ${result.bundleDir}`,
    `Memory file: ${result.memoryFile}`,
    `Audit: ${result.audit.quality.grade} (${result.audit.quality.score}/100)`,
    "Try:",
    `  relay-baton audit ${result.bundleDir}`
  ].join("\n"));
}

async function handoffCommand(parsed: ParsedArgs): Promise<void> {
  const result = await createHandoffRecovery({
    home: stringFlag(parsed, "home"),
    threadId: stringFlag(parsed, "thread") || parsed.positional[0],
    last: Boolean(parsed.flags.last),
    cwd: stringFlag(parsed, "cwd"),
    desktop: Boolean(parsed.flags.desktop),
    planMode: Boolean(parsed.flags.planMode),
    goalMode: Boolean(parsed.flags.goalMode),
    goal: stringFlag(parsed, "goal"),
    goalBudget: numberFlag(parsed, "goalBudget"),
    startTurn: !Boolean(parsed.flags.noStartTurn),
    title: stringFlag(parsed, "title"),
    primaryModel: stringFlag(parsed, "primary"),
    force: Boolean(parsed.flags.force)
  });
  if (parsed.flags.desktop) {
    if (parsed.flags.json) {
      console.log(JSON.stringify({
        bundleDir: result.bundleDir,
        desktop: result.desktop,
        reusedDesktop: result.reusedDesktop,
        blocked: result.blocked,
        quality: result.quality,
        plan: result.plan
      }, null, 2));
      return;
    }
    console.log(`Recovery bundle: ${result.bundleDir}`);
    if (result.blocked) {
      console.log(`Desktop handoff blocked: ${result.blocked.reason}`);
      if (result.blocked.blockers.length > 0) {
        console.log("Blockers:");
        for (const blocker of result.blocked.blockers) console.log(`- ${blocker}`);
      }
      if (result.quality) {
        console.log(`Quality: ${result.quality.grade} (${result.quality.score}/100)`);
      }
      return;
    }
    if (result.reusedDesktop) {
      console.log(`Existing Desktop conversation: ${result.reusedDesktop.threadId}`);
      if (result.reusedDesktop.bundleDir) console.log(`Existing bundle: ${result.reusedDesktop.bundleDir}`);
      console.log(result.reusedDesktop.reason);
      if (result.quality) console.log(`Candidate quality: ${result.quality.grade} (${result.quality.score}/100)`);
      return;
    }
    console.log(`Desktop conversation: ${result.desktop?.title}`);
    console.log(`Thread id: ${result.desktop?.threadId}`);
    console.log(`Turn started: ${result.desktop?.turnStarted ? "yes" : "no"}`);
    console.log(`Plan mode: ${result.desktop?.planModeApplied ? "yes" : "no"}`);
    console.log(`Goal mode: ${result.desktop?.goalApplied ? "yes" : "no"}`);
    if (result.quality) console.log(`Quality: ${result.quality.grade} (${result.quality.score}/100)`);
    return;
  }
  if (parsed.flags.json) {
    console.log(JSON.stringify({ bundleDir: result.bundleDir, command: result.command, plan: result.plan }, null, 2));
    return;
  }
  console.log(`Recovery bundle: ${result.bundleDir}`);
  console.log("New conversation command:");
  console.log(result.command);
}

async function watchCommand(parsed: ParsedArgs): Promise<void> {
  if (parsed.flags.once) {
    const message = await tick({
      home: stringFlag(parsed, "home"),
      auto: Boolean(parsed.flags.auto),
      dryRun: Boolean(parsed.flags.dryRun),
      desktop: Boolean(parsed.flags.desktop),
      fork: Boolean(parsed.flags.fork),
      appServer: Boolean(parsed.flags.appServer),
      createVisibleRelay: Boolean(parsed.flags.createVisibleRelay),
      queueOnly: Boolean(parsed.flags.queueOnly),
      planMode: Boolean(parsed.flags.planMode),
      goalMode: Boolean(parsed.flags.goalMode),
      backfill: Boolean(parsed.flags.backfill)
    });
    console.log(message);
    return;
  }
  await watch({
    home: stringFlag(parsed, "home"),
    auto: Boolean(parsed.flags.auto),
    dryRun: Boolean(parsed.flags.dryRun),
    desktop: Boolean(parsed.flags.desktop),
    fork: Boolean(parsed.flags.fork),
    appServer: Boolean(parsed.flags.appServer),
    createVisibleRelay: Boolean(parsed.flags.createVisibleRelay),
    queueOnly: Boolean(parsed.flags.queueOnly),
    planMode: Boolean(parsed.flags.planMode),
    goalMode: Boolean(parsed.flags.goalMode),
    backfill: Boolean(parsed.flags.backfill)
  });
}

async function monitorCommand(parsed: ParsedArgs): Promise<void> {
  const action = parsed.positional[0] || "status";
  if (action === "install") {
    const result = installMonitor({
      home: stringFlag(parsed, "home"),
      nodeBin: process.execPath,
      guardianBin: guardianBinPath(),
      codexBin: defaultGuardianConfig(stringFlag(parsed, "home")).codexBin,
      dryRun: Boolean(parsed.flags.dryRun)
    });
    if (parsed.flags.json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (parsed.flags.dryRun) {
      console.log(result.plist);
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
    return;
  }
  if (action === "uninstall") {
    console.log(JSON.stringify(uninstallMonitor(), null, 2));
    return;
  }
  if (action === "start") {
    console.log(JSON.stringify(startMonitor(), null, 2));
    return;
  }
  if (action === "stop") {
    console.log(JSON.stringify(stopMonitor(), null, 2));
    return;
  }
  if (action === "status") {
    console.log(JSON.stringify(monitorStatus(stringFlag(parsed, "home")), null, 2));
    return;
  }
  throw new Error(`Unknown monitor action: ${action}`);
}

async function followCommand(parsed: ParsedArgs): Promise<void> {
  const action = parsed.positional[0] || "status";
  if (action === "install") {
    const home = stringFlag(parsed, "home");
    const config = defaultGuardianConfig(home);
    const hooks = installHooks({
      home,
      guardianBin: guardianBinPath(),
      dryRun: Boolean(parsed.flags.dryRun)
    });
    const monitor = installMonitor({
      home,
      nodeBin: process.execPath,
      guardianBin: guardianBinPath(),
      codexBin: config.codexBin,
      dryRun: Boolean(parsed.flags.dryRun)
    });
    console.log(JSON.stringify({ hooks, monitor }, null, 2));
    return;
  }
  if (action === "repair") {
    const home = stringFlag(parsed, "home");
    const config = defaultGuardianConfig(home);
    const hooks = installHooks({
      home,
      guardianBin: guardianBinPath(),
      dryRun: Boolean(parsed.flags.dryRun)
    });
    const monitor = installMonitor({
      home,
      nodeBin: process.execPath,
      guardianBin: guardianBinPath(),
      codexBin: config.codexBin,
      dryRun: Boolean(parsed.flags.dryRun)
    });
    if (parsed.flags.dryRun) {
      console.log(JSON.stringify({ hooks, monitor }, null, 2));
      return;
    }
    const stopped = stopMonitor();
    const started = startMonitor();
    console.log(JSON.stringify({
      codexBin: config.codexBin,
      hooks,
      monitor,
      stopped,
      started,
      status: monitorStatus(home)
    }, null, 2));
    return;
  }
  if (action === "start") {
    console.log(JSON.stringify(startMonitor(), null, 2));
    return;
  }
  if (action === "stop") {
    console.log(JSON.stringify(stopMonitor(), null, 2));
    return;
  }
  if (action === "status") {
    console.log(JSON.stringify({
      monitor: monitorStatus(stringFlag(parsed, "home")),
      activity: loadActivityState(stringFlag(parsed, "home"))
    }, null, 2));
    return;
  }
  if (action === "doctor") {
    const home = stringFlag(parsed, "home");
    const report = buildFollowDoctorReport({
      doctor: runDoctor(home),
      monitor: monitorStatus(home),
      activity: loadActivityState(home),
      recovery: loadRecoveryState(home)
    });
    if (parsed.flags.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    console.log(formatFollowDoctorReport(report));
    return;
  }
  throw new Error(`Unknown follow action: ${action}`);
}

async function activityCommand(parsed: ParsedArgs): Promise<void> {
  const action = parsed.positional[0] || "status";
  if (action !== "status") throw new Error(`Unknown activity action: ${action}`);
  const state = loadActivityState(stringFlag(parsed, "home"));
  if (parsed.flags.json) {
    console.log(JSON.stringify(state, null, 2));
    return;
  }
  console.log(formatActivityState(state));
}

async function appServerCommand(parsed: ParsedArgs): Promise<void> {
  const action = parsed.positional[0] || "status";
  const home = stringFlag(parsed, "home");
  if (action === "status") {
    const status = await probeAppServer({ home });
    if (parsed.flags.json) {
      console.log(JSON.stringify(status, null, 2));
      return;
    }
    console.log(formatAppServerStatus(status));
    return;
  }
  if (action === "fork") {
    const sourceThreadId = stringFlag(parsed, "thread") || parsed.positional[1];
    if (!sourceThreadId) throw new Error("Usage: relay-baton app-server fork --thread <id> --prompt <text> [--cwd <dir>] [--model <model>]");
    const cwd = stringFlag(parsed, "cwd") || process.cwd();
    const model = stringFlag(parsed, "model") || defaultGuardianConfig(home).primaryModel;
    const prompt = stringFlag(parsed, "prompt") || "Continue this interrupted Codex task from the latest reliable state.";
    const result = await forkThreadWithAppServer({
      home,
      sourceThreadId,
      cwd,
      model,
      prompt,
      title: stringFlag(parsed, "title") || defaultDesktopTitle(`fork ${sourceThreadId}`),
      startTurn: !Boolean(parsed.flags.noStartTurn),
      planMode: Boolean(parsed.flags.planMode),
      excludeTurns: !Boolean(parsed.flags.includeTurns),
      goal: Boolean(parsed.flags.goalMode)
        ? { objective: stringFlag(parsed, "goal") || defaultGoalObjective({ sourceThreadId }), status: "active" }
        : undefined
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (action === "rollback") {
    const threadId = stringFlag(parsed, "thread") || parsed.positional[1];
    const turns = numberFlag(parsed, "turns") || numberFlag(parsed, "drop") || 1;
    if (!threadId) throw new Error("Usage: relay-baton app-server rollback --thread <id> --turns <n>");
    console.log(JSON.stringify(await rollbackThreadWithAppServer({ home, threadId, droppedTurns: turns }), null, 2));
    return;
  }
  if (action === "compact") {
    const threadId = stringFlag(parsed, "thread") || parsed.positional[1];
    if (!threadId) throw new Error("Usage: relay-baton app-server compact --thread <id>");
    console.log(JSON.stringify(await compactThreadWithAppServer({ home, threadId }), null, 2));
    return;
  }
  throw new Error(`Unknown app-server action: ${action}`);
}

async function releaseCommand(parsed: ParsedArgs): Promise<void> {
  const action = parsed.positional[0] || "check";
  if (action !== "check") throw new Error(`Unknown release action: ${action}`);
  const readiness = evaluateReleaseReadiness({
    root: stringFlag(parsed, "root") || process.cwd(),
    online: Boolean(parsed.flags.online),
    v1: Boolean(parsed.flags.v1)
  });
  if (parsed.flags.json) {
    console.log(JSON.stringify(readiness, null, 2));
  } else {
    console.log(formatReleaseReadiness(readiness));
  }
  if (!readiness.ok) process.exitCode = 1;
}

function formatAppServerStatus(status: Awaited<ReturnType<typeof probeAppServer>>): string {
  return [
    "Relay Baton app-server",
    `socket: ${status.socketPath}`,
    `initialized: ${status.initialized ? "yes" : "no"}`,
    `loaded threads: ${status.loadedThreadIds?.length ?? "unknown"}`,
    status.warnings.length > 0 ? `warnings: ${status.warnings.join("; ")}` : "warnings: none"
  ].join("\n");
}

async function validateCommand(parsed: ParsedArgs): Promise<void> {
  const action = parsed.positional[0] || "host";
  if (action !== "host") throw new Error(`Unknown validate action: ${action}`);
  const report = buildHostValidationReport({
    home: stringFlag(parsed, "home"),
    root: stringFlag(parsed, "root") || process.cwd(),
    online: Boolean(parsed.flags.online),
    strictRelease: Boolean(parsed.flags.strictRelease)
  });
  const outputDir = stringFlag(parsed, "output");
  if (outputDir) {
    const written = writeHostValidationReport(report, outputDir);
    if (parsed.flags.json) {
      console.log(JSON.stringify({ report, written }, null, 2));
    } else {
      console.log(`Validation report: ${written.markdownFile}`);
      console.log(`Validation JSON: ${written.jsonFile}`);
    }
  } else if (parsed.flags.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderHostValidationReport(report));
  }
  if (!report.summary.ok) process.exitCode = 1;
}

function stringFlag(parsed: ParsedArgs, name: string): string | undefined {
  const value = parsed.flags[name];
  return typeof value === "string" ? value : undefined;
}

function strategyFlag(parsed: ParsedArgs): "auto" | "fallback-model" | "last-healthy-fork" | "fork" | "new-session" | undefined {
  const value = stringFlag(parsed, "strategy");
  if (!value) return undefined;
  if (value === "auto" || value === "fallback-model" || value === "last-healthy-fork" || value === "fork" || value === "new-session") return value;
  throw new Error(`Unknown strategy: ${value}`);
}

function numberFlag(parsed: ParsedArgs, name: string): number | undefined {
  const value = stringFlag(parsed, name);
  if (!value) return undefined;
  const parsedNumber = Number(value);
  if (!Number.isFinite(parsedNumber) || parsedNumber <= 0) {
    throw new Error(`Invalid value for --${name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}: ${value}`);
  }
  return Math.floor(parsedNumber);
}

function formatActivityState(state: ActivityState): string {
  const threads = Object.values(state.threads)
    .sort((a, b) => b.lastEventAt - a.lastEventAt)
    .slice(0, 8);
  const lines = [
    "Relay Baton activity",
    `updated: ${state.updatedAt ? new Date(state.updatedAt).toISOString() : "never"}`,
    `threads: ${Object.keys(state.threads).length}`
  ];
  if (threads.length === 0) {
    lines.push("No Codex hook activity has been recorded yet.");
    return lines.join("\n");
  }
  for (const thread of threads) {
    const flags = [
      thread.compactInFlight ? "compact:in-flight" : "",
      thread.activeTurnStartedAt ? "turn:active" : ""
    ].filter(Boolean);
    lines.push(
      "",
      `${thread.threadId} ${flags.length > 0 ? `[${flags.join(", ")}]` : ""}`.trim(),
      `  title: ${thread.title || "unknown"}`,
      `  lastEvent: ${thread.lastEventName || "unknown"} @ ${thread.lastEventAt ? new Date(thread.lastEventAt).toISOString() : "unknown"}`,
      `  cwd: ${thread.cwd || "unknown"}`
    );
  }
  return lines.join("\n");
}

function resolveMemoryFile(target: string): string {
  const resolved = path.resolve(target);
  if (!fs.existsSync(resolved)) throw new Error(`Bundle or memory file not found: ${target}`);
  const stat = fs.statSync(resolved);
  const memoryFile = stat.isDirectory() ? path.join(resolved, "HANDOFF_MEMORY.json") : resolved;
  if (!fs.existsSync(memoryFile)) throw new Error(`HANDOFF_MEMORY.json not found: ${memoryFile}`);
  return memoryFile;
}

function formatStatus(status: {
  ok: boolean;
  config: ReturnType<typeof defaultGuardianConfig>;
  doctor: ReturnType<typeof runDoctor>;
  monitor: ReturnType<typeof monitorStatus>;
  activity: ActivityState;
  recovery: ReturnType<typeof loadRecoveryState>;
}): string {
  const failed = status.doctor.filter((check) => !check.ok);
  const activeThreads = Object.values(status.activity.threads)
    .filter((thread) => thread.compactInFlight || thread.activeTurnStartedAt)
    .length;
  const recoveryThreads = Object.keys(status.recovery.threads).length;
  return [
    `Relay Baton status: ${status.ok && status.monitor.loaded ? "ok" : "needs attention"}`,
    `codex: ${status.config.codexBin}`,
    `monitor: ${status.monitor.loaded ? "running" : "stopped"} (${status.monitor.label})`,
    `activity threads: ${Object.keys(status.activity.threads).length}, active: ${activeThreads}`,
    `recovery-tracked threads: ${recoveryThreads}`,
    failed.length > 0 ? `failed checks: ${failed.map((check) => check.name).join(", ")}` : "failed checks: none",
    "",
    "Doctor:",
    formatDoctor(status.doctor)
  ].join("\n");
}

function guardianBinPath(): string {
  const srcDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(srcDir, "../bin/relay-baton.js");
}

function helpText(): string {
  return `Relay Baton

Usage:
  relay-baton doctor [--json] [--home <CODEX_HOME>]
  relay-baton diagnose --thread <id>|--last [--minutes 60] [--json] [--home <CODEX_HOME>]
  relay-baton status [--json] [--home <CODEX_HOME>]
  relay-baton install-hooks [--dry-run] [--home <CODEX_HOME>]
  relay-baton hook --phase <event-name> [--thread <id>] [--snapshot]
  relay-baton watch [--auto] [--fork|--desktop] [--queue-only|--create-visible-relay] [--app-server] [--goal-mode] [--once] [--backfill] [--dry-run] [--home <CODEX_HOME>]
  relay-baton follow install|repair|doctor|status|start|stop [--dry-run] [--json] [--home <CODEX_HOME>]
  relay-baton monitor install|uninstall|status|start|stop [--dry-run] [--home <CODEX_HOME>]
  relay-baton activity status [--json] [--home <CODEX_HOME>]
  relay-baton app-server status [--json] [--home <CODEX_HOME>]
  relay-baton app-server fork --thread <id> [--prompt <text>] [--no-start-turn] [--plan-mode] [--goal-mode] [--include-turns]
  relay-baton app-server rollback --thread <id> --turns <n>
  relay-baton app-server compact --thread <id>
  relay-baton release check [--online] [--v1] [--json] [--root <repo>]
  relay-baton validate host [--online] [--strict-release] [--json] [--output <dir>] [--root <repo>] [--home <CODEX_HOME>]
  relay-baton pack --thread <id>|--last [--home <CODEX_HOME>]
  relay-baton audit <bundle-dir|HANDOFF_MEMORY.json> [--json]
  relay-baton demo [--output <dir>] [--json] [--home <CODEX_HOME>]
  relay-baton handoff --thread <id>|--last [--desktop] [--plan-mode] [--goal-mode] [--goal "<objective>"] [--goal-budget <n>] [--no-start-turn] [--force] [--json] [--home <CODEX_HOME>]
  relay-baton recover --thread <id> [--strategy auto|fallback-model|last-healthy-fork|fork|new-session] [--app-server] [--dry-run]
  relay-baton recover --last [--dry-run]

Legacy aliases remain available: guardian, codex-context-guardian.
`;
}
