import path from "node:path";
import { fileURLToPath } from "node:url";
import { runDoctor, formatDoctor } from "./doctor.ts";
import { installHooks } from "./hooks.ts";
import { readStdinJson, writeSnapshot } from "./snapshot.ts";
import { recover } from "./recovery.ts";
import { watch, tick } from "./watch.ts";
import { buildRecoveryPlan } from "./recovery.ts";
import { writeRecoveryBundle } from "./bundle.ts";

type ParsedArgs = {
  command: string;
  flags: Record<string, string | boolean>;
  positional: string[];
};

export async function main(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);
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
    case "watch":
      return watchCommand(parsed);
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

async function watchCommand(parsed: ParsedArgs): Promise<void> {
  if (parsed.flags.once) {
    const message = await tick({
      home: stringFlag(parsed, "home"),
      auto: Boolean(parsed.flags.auto),
      dryRun: Boolean(parsed.flags.dryRun)
    });
    console.log(message);
    return;
  }
  await watch({
    home: stringFlag(parsed, "home"),
    auto: Boolean(parsed.flags.auto),
    dryRun: Boolean(parsed.flags.dryRun)
  });
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
  guardian watch [--auto] [--once] [--dry-run] [--home <CODEX_HOME>]
  guardian pack --thread <id>|--last [--home <CODEX_HOME>]
  guardian recover --thread <id> [--strategy auto|fallback-model|fork|new-session] [--dry-run]
  guardian recover --last [--dry-run]
`;
}
