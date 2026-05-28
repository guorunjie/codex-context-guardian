import fs from "node:fs";
import path from "node:path";
import { hooksPath } from "./paths.ts";

export type HookInstallResult = {
  hooksFile: string;
  backupFile: string | null;
  changed: boolean;
  commands: string[];
};

const EVENTS = ["PreCompact", "PostCompact"] as const;

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
    const phase = event === "PreCompact" ? "precompact" : "postcompact";
    const command = `node ${shellPath(options.guardianBin)} hook --phase ${phase}`;
    commands.push(command);
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
