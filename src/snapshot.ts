import fs from "node:fs";
import path from "node:path";
import { getLatestThread, getThread, type ThreadInfo } from "./codexState.ts";
import { runCommand } from "./exec.ts";
import { snapshotsDir } from "./paths.ts";
import { readThreadIdFromPayload } from "./activity.ts";

export type SnapshotInput = {
  phase: string;
  home?: string;
  threadId?: string;
  payload?: Record<string, unknown>;
};

export type Snapshot = {
  schemaVersion: 1;
  capturedAt: string;
  phase: string;
  thread: ThreadInfo | null;
  git: {
    branch: string;
    sha: string;
    status: string;
  };
  payload: Record<string, unknown>;
};

export function writeSnapshot(input: SnapshotInput): string {
  const threadId = input.threadId || readThreadIdFromPayload(input.payload) || process.env.CODEX_THREAD_ID;
  const thread = threadId ? getThread(threadId, input.home) : getLatestThread(input.home);
  const cwd = thread?.cwd || process.cwd();
  const snapshot: Snapshot = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    phase: input.phase,
    thread,
    git: readGitState(cwd),
    payload: sanitizePayload(input.payload || {})
  };
  const dir = snapshotsDir(input.home);
  fs.mkdirSync(dir, { recursive: true });
  const name = `${thread?.id || threadId || "unknown"}-${Date.now()}-${input.phase}.json`;
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(snapshot, null, 2));
  return file;
}

export function readStdinJson(): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let text = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      text += chunk;
    });
    process.stdin.on("end", () => {
      if (!text.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch {
        resolve({ raw: text.slice(0, 20000) });
      }
    });
  });
}

function readGitState(cwd: string): Snapshot["git"] {
  if (!fs.existsSync(cwd)) {
    return { branch: "", sha: "", status: "" };
  }
  const branch = runCommand("git", ["branch", "--show-current"], { cwd, timeoutMs: 3000 });
  const sha = runCommand("git", ["rev-parse", "HEAD"], { cwd, timeoutMs: 3000 });
  const status = runCommand("git", ["status", "--short"], { cwd, timeoutMs: 3000 });
  return {
    branch: branch.status === 0 ? branch.stdout.trim() : "",
    sha: sha.status === 0 ? sha.stdout.trim() : "",
    status: status.status === 0 ? status.stdout.trim() : ""
  };
}

function sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(payload, (key, value) => {
    if (/token|secret|password|authorization|api[_-]?key/i.test(key)) {
      return "[redacted]";
    }
    if (typeof value === "string" && value.length > 20000) {
      return `${value.slice(0, 20000)}\n[truncated]`;
    }
    return value;
  }));
}
