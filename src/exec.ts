import { spawn, spawnSync } from "node:child_process";

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
    maxBuffer: 20 * 1024 * 1024
  });

  return {
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || ""
  };
}

export function commandExists(command: string): boolean {
  const result = runCommand("sh", ["-lc", `command -v ${shellQuote(command)}`], { timeoutMs: 3000 });
  return result.status === 0 && result.stdout.trim().length > 0;
}

export function resolveCommand(command: string): string | null {
  if (command.includes("/") && commandExists(command)) return command;
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
