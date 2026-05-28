import path from "node:path";
import { fileURLToPath } from "node:url";
import { runDoctor, formatDoctor } from "./doctor.ts";
import { installHooks } from "./hooks.ts";
import { readStdinJson, writeSnapshot } from "./snapshot.ts";
import { recover } from "./recovery.ts";
import { watch, tick } from "./watch.ts";
import { buildRecoveryPlan } from "./recovery.ts";
import { writeRecoveryBundle } from "./bundle.ts";
import { createHandoffRecovery } from "./handoff.ts";
import { installMonitor, monitorStatus, startMonitor, stopMonitor, uninstallMonitor } from "./monitor.ts";

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
    case "install-hooks":
      return installHooksCommand(parsed);
    case "hook":
      return hookCommand(parsed);
    case "recover":
      return recoverCommand(parsed);
    case "pack":
      return packCommand(parsed);
    case "handoff":
      return handoffCommand(parsed);
    case "watch":
      return watchCommand(parsed);
    case "monitor":
      return monitorCommand(parsed);
    case "help":
    case "":
      console.log(helpText());
      return;
    default:
      throw new Error(`Unknown command: ${parsed.command}\n\n${helpText()}`);
  }
}

export function parseArgs(argv: string[]): ParsedArgs {
  const [command = "", ...rest] = argv;
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
  const file = writeSnapshot({
    home: stringFlag(parsed, "home"),
    phase: stringFlag(parsed, "phase") || "manual",
    threadId: stringFlag(parsed, "thread"),
    payload
  });
  console.log(file);
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
    cwd: stringFlag(parsed, "cwd")
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
      thread: plan.thread
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
      planMode: Boolean(parsed.flags.planMode),
      goalMode: Boolean(parsed.flags.goalMode)
    });
    console.log(message);
    return;
  }
  await watch({
    home: stringFlag(parsed, "home"),
    auto: Boolean(parsed.flags.auto),
    dryRun: Boolean(parsed.flags.dryRun),
    desktop: Boolean(parsed.flags.desktop),
    planMode: Boolean(parsed.flags.planMode),
    goalMode: Boolean(parsed.flags.goalMode)
  });
}

async function monitorCommand(parsed: ParsedArgs): Promise<void> {
  const action = parsed.positional[0] || "status";
  if (action === "install") {
    const result = installMonitor({
      home: stringFlag(parsed, "home"),
      nodeBin: process.execPath,
      guardianBin: guardianBinPath(),
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

function stringFlag(parsed: ParsedArgs, name: string): string | undefined {
  const value = parsed.flags[name];
  return typeof value === "string" ? value : undefined;
}

function strategyFlag(parsed: ParsedArgs): "auto" | "fallback-model" | "fork" | "new-session" | undefined {
  const value = stringFlag(parsed, "strategy");
  if (!value) return undefined;
  if (value === "auto" || value === "fallback-model" || value === "fork" || value === "new-session") return value;
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

function guardianBinPath(): string {
  const srcDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(srcDir, "../bin/guardian.js");
}

function helpText(): string {
  return `Codex Context Guardian

Usage:
  guardian doctor [--json] [--home <CODEX_HOME>]
  guardian install-hooks [--dry-run] [--home <CODEX_HOME>]
  guardian hook --phase <precompact|postcompact> [--thread <id>]
  guardian watch [--auto] [--desktop] [--goal-mode] [--once] [--dry-run] [--home <CODEX_HOME>]
  guardian monitor install|uninstall|status|start|stop [--dry-run] [--home <CODEX_HOME>]
  guardian pack --thread <id>|--last [--home <CODEX_HOME>]
  guardian handoff --thread <id>|--last [--desktop] [--plan-mode] [--goal-mode] [--goal "<objective>"] [--goal-budget <n>] [--no-start-turn] [--force] [--json] [--home <CODEX_HOME>]
  guardian recover --thread <id> [--strategy auto|fallback-model|fork|new-session] [--dry-run]
  guardian recover --last [--dry-run]
`;
}
