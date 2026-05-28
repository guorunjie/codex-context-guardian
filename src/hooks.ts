import fs from "node:fs";
import path from "node:path";
import { hooksPath } from "./paths.ts";

export type HookInstallResult = {
  hooksFile: string;
  backupFile: string | null;
  changed: boolean;
  commands: string[];
};

const EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "Stop",
  "PreCompact",
  "PostCompact"
] as const;

export function installHooks(options: {
  home?: string;
  guardianBin: string;
  dryRun?: boolean;
}): HookInstallResult {
  const file = hooksPath(options.home);
  const current = readHooksFile(file);
  const commands: string[] = [];
  let changed = false;

  current.hooks ||= {};
  for (const event of EVENTS) {
    current.hooks[event] ||= [];
    const phase = hookPhase(event);
    const command = `node ${shellPath(options.guardianBin)} hook --phase ${phase}`;
    commands.push(command);
    const pruned = pruneLegacyRelayHooks(current.hooks[event], command);
    if (pruned.changed) {
      current.hooks[event] = pruned.entries;
      changed = true;
    }
    const hasCommand = current.hooks[event].some((entry: any) =>
      Array.isArray(entry?.hooks) && entry.hooks.some((hook: any) => hook?.type === "command" && hook?.command === command)
    );
    if (!hasCommand) {
      current.hooks[event].push({ hooks: [{ type: "command", command }] });
      changed = true;
    }
  }

  if (options.dryRun || !changed) {
    return { hooksFile: file, backupFile: null, changed, commands };
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });
  const backupFile = fs.existsSync(file) ? `${file}.relay-baton-bak-${Date.now()}` : null;
  if (backupFile) fs.copyFileSync(file, backupFile);
  fs.writeFileSync(file, `${JSON.stringify(current, null, 2)}\n`);
  return { hooksFile: file, backupFile, changed, commands };
}

function hookPhase(event: typeof EVENTS[number]): string {
  if (event === "PreCompact") return "precompact";
  if (event === "PostCompact") return "postcompact";
  return event.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

function pruneLegacyRelayHooks(entries: any[], desiredCommand: string): { entries: any[]; changed: boolean } {
  let changed = false;
  const nextEntries: any[] = [];
  for (const entry of entries) {
    if (!Array.isArray(entry?.hooks)) {
      nextEntries.push(entry);
      continue;
    }
    const nextHooks = entry.hooks.filter((hook: any) => {
      const command = String(hook?.command || "");
      if (!isRelayBatonHook(command) || command === desiredCommand) return true;
      changed = true;
      return false;
    });
    if (nextHooks.length > 0) {
      nextEntries.push({ ...entry, hooks: nextHooks });
    } else {
      changed = true;
    }
  }
  return { entries: nextEntries, changed };
}

function isRelayBatonHook(command: string): boolean {
  return /\bnode\b.*\/bin\/(?:guardian|relay-baton)\.js'?\s+hook\s+--phase\b/.test(command)
    || /\bnode\b.*\\bin\\(?:guardian|relay-baton)\.js"?\s+hook\s+--phase\b/.test(command);
}

function readHooksFile(file: string): any {
  if (!fs.existsSync(file)) return { hooks: {} };
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`Cannot parse hooks file ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function shellPath(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
