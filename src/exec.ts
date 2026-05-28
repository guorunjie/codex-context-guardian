import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type CommandResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

export function runCommand(command: string, args: string[] = [], options: {
  cwd?: string;
  timeoutMs?: number;
  input?: string;
} = {}): CommandResult {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    input: options.input,
    timeout: options.timeoutMs,
    maxBuffer: 20 * 1024 * 1024,
    shell: windowsNeedsShell(command)
  });

  return {
    status: result.status ?? (result.error ? 1 : null),
    stdout: result.stdout || "",
    stderr: result.stderr || result.error?.message || ""
  };
}

export function commandExists(command: string): boolean {
  if (process.platform === "win32") return resolveWindowsCommand(command) !== null;
  const result = runCommand("sh", ["-lc", `command -v ${shellQuote(command)}`], { timeoutMs: 3000 });
  return result.status === 0 && result.stdout.trim().length > 0;
}

export function resolveCommand(command: string): string | null {
  if (process.platform === "win32") {
    const resolved = resolveWindowsCommand(command);
    if (resolved) return resolved;
  }
  if (isPathLike(command) && commandExists(command)) return command;
  const result = runCommand("sh", ["-lc", `command -v ${shellQuote(command)}`], { timeoutMs: 3000 });
  if (result.status !== 0) return null;
  const resolved = result.stdout.trim().split(/\r?\n/)[0];
  return resolved || null;
}

export function spawnInteractive(command: string, args: string[], options: {
  cwd?: string;
  detached?: boolean;
} = {}): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: "inherit",
      detached: options.detached === true
    });

    child.on("error", reject);
    child.on("close", resolve);
  });
}

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function resolveWindowsCommand(command: string): string | null {
  const direct = existingWindowsCommandPath(command);
  if (direct) return direct;
  const result = spawnSync("where.exe", [command], {
    encoding: "utf8",
    timeout: 3000,
    maxBuffer: 1024 * 1024
  });
  if (result.status !== 0) return null;
  const matches = (result.stdout || "")
    .split(/\r?\n/)
    .map((line) => normalizeWindowsCommandPath(line.trim()))
    .filter(Boolean);
  return matches.find((item) => /\.(cmd|bat|exe|com)$/i.test(item)) || matches[0] || null;
}

function existingWindowsCommandPath(command: string): string | null {
  const normalized = normalizeWindowsCommandPath(command);
  if (!isPathLike(normalized)) return null;
  const candidates = path.extname(normalized)
    ? [normalized]
    : [normalized, `${normalized}.cmd`, `${normalized}.exe`, `${normalized}.bat`, `${normalized}.com`];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function normalizeWindowsCommandPath(value: string): string {
  if (/^\/[a-zA-Z]\//.test(value)) {
    return `${value[1].toUpperCase()}:\\${value.slice(3).replaceAll("/", "\\")}`;
  }
  return value;
}

function isPathLike(value: string): boolean {
  return path.isAbsolute(value) || value.includes("/") || value.includes("\\");
}

function windowsNeedsShell(command: string): boolean {
  return process.platform === "win32" && /\.(cmd|bat)$/i.test(command);
}
