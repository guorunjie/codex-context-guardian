import crypto from "node:crypto";
import net from "node:net";
import path from "node:path";
import { defaultGuardianConfig } from "./config.ts";
import { runCommand } from "./exec.ts";

const APP_CLIENT_VERSION = "0.8.1";

export type DesktopHandoffOptions = {
  home?: string;
  cwd: string;
  model: string;
  title: string;
  prompt: string;
  startTurn?: boolean;
  planMode?: boolean;
  titleStabilizeDelayMs?: number;
  goal?: {
    objective: string;
    tokenBudget?: number;
    status?: "active" | "paused" | "blocked" | "usageLimited" | "budgetLimited" | "complete";
  };
  timeoutMs?: number;
};

export type DesktopHandoffResult = {
  threadId: string;
  title: string;
  socketPath: string;
  turnStarted: boolean;
  planModeApplied: boolean;
  goalApplied: boolean;
};

export type AppServerProbeResult = {
  socketPath: string;
  initialized: boolean;
  loadedThreadIds?: string[];
  warnings: string[];
};

export type AppServerForkOptions = {
  home?: string;
  sourceThreadId: string;
  cwd: string;
  model: string;
  title?: string;
  prompt: string;
  startTurn?: boolean;
  planMode?: boolean;
  excludeTurns?: boolean;
  timeoutMs?: number;
  goal?: DesktopHandoffOptions["goal"];
};

export type AppServerForkResult = {
  sourceThreadId: string;
  threadId: string;
  forkedFromId?: string;
  sessionId?: string;
  title?: string;
  socketPath: string;
  turnStarted: boolean;
  planModeApplied: boolean;
  goalApplied: boolean;
  excludeTurns: boolean;
};

export type AppServerRollbackResult = {
  threadId: string;
  droppedTurns: number;
  socketPath: string;
  returnedThreadId?: string;
};

export type AppServerCompactResult = {
  threadId: string;
  socketPath: string;
};

type PendingRequest = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

export async function probeAppServer(options: {
  home?: string;
  timeoutMs?: number;
} = {}): Promise<AppServerProbeResult> {
  const socketPath = ensureRemoteControlSocket(options.home);
  const client = new AppServerClient(socketPath, options.timeoutMs || 15_000);
  const warnings: string[] = [];
  await client.connect();
  try {
    await initializeClient(client);
    let loadedThreadIds: string[] | undefined;
    try {
      const loaded = await client.request("thread/loaded/list", {});
      const rawIds = Array.isArray(loaded?.threadIds)
        ? loaded.threadIds
        : Array.isArray(loaded?.threads)
          ? loaded.threads
          : undefined;
      loadedThreadIds = rawIds?.map((item: unknown) => typeof item === "string" ? item : String((item as any)?.id || "")).filter(Boolean);
    } catch (error) {
      warnings.push(`thread/loaded/list unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
    return { socketPath, initialized: true, loadedThreadIds, warnings };
  } finally {
    client.close();
  }
}

export async function forkThreadWithAppServer(options: AppServerForkOptions): Promise<AppServerForkResult> {
  const socketPath = ensureRemoteControlSocket(options.home);
  const client = new AppServerClient(socketPath, options.timeoutMs || 15_000);
  await client.connect();
  try {
    await initializeClient(client);
    const excludeTurns = options.excludeTurns !== false;
    const forked = await client.request("thread/fork", buildThreadForkParams(options, excludeTurns));
    const thread = forked?.thread;
    const threadId = thread?.id;
    if (!threadId) throw new Error("app-server thread/fork did not return a thread id");

    if (options.title) await setTitleOnClient(client, threadId, options.title);
    const planModeApplied = options.planMode ? await applyPlanMode(client, threadId, options.model) : false;
    const goalApplied = await applyGoal(client, threadId, options.goal);

    let turnStarted = false;
    if (options.startTurn !== false) {
      try {
        await client.request("turn/start", buildTurnStartParams({
          threadId,
          cwd: options.cwd,
          model: options.model,
          prompt: options.prompt
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`app-server turn/start failed after creating fork ${threadId}: ${message}`);
      }
      if (options.title) {
        await sleep(1_000);
        await setTitleOnClient(client, threadId, options.title);
      }
      turnStarted = true;
    }

    return {
      sourceThreadId: options.sourceThreadId,
      threadId,
      forkedFromId: typeof thread?.forkedFromId === "string" ? thread.forkedFromId : undefined,
      sessionId: typeof thread?.sessionId === "string" ? thread.sessionId : undefined,
      title: options.title,
      socketPath,
      turnStarted,
      planModeApplied,
      goalApplied,
      excludeTurns
    };
  } finally {
    client.close();
  }
}

export async function rollbackThreadWithAppServer(options: {
  home?: string;
  threadId: string;
  droppedTurns: number;
  timeoutMs?: number;
}): Promise<AppServerRollbackResult> {
  const socketPath = ensureRemoteControlSocket(options.home);
  const client = new AppServerClient(socketPath, options.timeoutMs || 15_000);
  await client.connect();
  try {
    await initializeClient(client);
    const result = await client.request("thread/rollback", {
      threadId: options.threadId,
      droppedTurns: options.droppedTurns
    });
    return {
      threadId: options.threadId,
      droppedTurns: options.droppedTurns,
      socketPath,
      returnedThreadId: typeof result?.thread?.id === "string" ? result.thread.id : undefined
    };
  } finally {
    client.close();
  }
}

export async function compactThreadWithAppServer(options: {
  home?: string;
  threadId: string;
  timeoutMs?: number;
}): Promise<AppServerCompactResult> {
  const socketPath = ensureRemoteControlSocket(options.home);
  const client = new AppServerClient(socketPath, options.timeoutMs || 15_000);
  await client.connect();
  try {
    await initializeClient(client);
    await client.request("thread/compact/start", { threadId: options.threadId });
    return { threadId: options.threadId, socketPath };
  } finally {
    client.close();
  }
}

export async function createDesktopHandoff(options: DesktopHandoffOptions): Promise<DesktopHandoffResult> {
  const socketPath = ensureRemoteControlSocket(options.home);
  const client = new AppServerClient(socketPath, options.timeoutMs || 15_000);
  await client.connect();
  try {
    await initializeClient(client);

    const started = await client.request("thread/start", {
      model: options.model,
      cwd: options.cwd,
      runtimeWorkspaceRoots: [options.cwd],
      approvalPolicy: "never",
      sandbox: "danger-full-access",
      threadSource: "user",
      experimentalRawEvents: false,
      persistExtendedHistory: false
    });
    const threadId = started?.thread?.id;
    if (!threadId) throw new Error("app-server thread/start did not return a thread id");

    await setTitleOnClient(client, threadId, options.title);

    const planModeApplied = options.planMode ? await applyPlanMode(client, threadId, options.model) : false;
    const goalApplied = await applyGoal(client, threadId, options.goal);

    let turnStarted = false;
    if (options.startTurn !== false) {
      try {
        await client.request("turn/start", buildTurnStartParams({
          threadId,
          cwd: options.cwd,
          model: options.model,
          prompt: options.prompt
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`app-server turn/start failed after creating Desktop handoff ${threadId}: ${message}`);
      }
      // Keep the sidebar title stable; first-turn auto-titling can arrive shortly after turn/start.
      await sleep(options.titleStabilizeDelayMs ?? 1_000);
      await setTitleOnClient(client, threadId, options.title);
      turnStarted = true;
    }

    return {
      threadId,
      title: options.title,
      socketPath,
      turnStarted,
      planModeApplied,
      goalApplied
    };
  } finally {
    client.close();
  }
}

export async function setDesktopThreadTitle(options: {
  home?: string;
  threadId: string;
  title: string;
  timeoutMs?: number;
}): Promise<void> {
  const socketPath = ensureRemoteControlSocket(options.home);
  const client = new AppServerClient(socketPath, options.timeoutMs || 15_000);
  await client.connect();
  try {
    await initializeClient(client);
    await setTitleOnClient(client, options.threadId, options.title);
  } finally {
    client.close();
  }
}

export function buildDesktopHandoffPrompt(input: {
  sourceThreadId?: string;
  sourceTitle?: string;
  bundleDir: string;
  cwd: string;
  prompt: string;
}): string {
  return `This is a Desktop-visible continuation created by relay-baton.

Source thread: ${input.sourceThreadId || "unknown"}
Source title: ${input.sourceTitle || "unknown"}
Recovery bundle: ${input.bundleDir}
Workspace: ${input.cwd}

Continue the interrupted task in this new Desktop conversation. Start by reading HANDOFF_MEMORY.json, RECENT_THREAD_CONTEXT.md, and then RECOVERY.md in the recovery bundle. If those files conflict with the old source title or older project documents, follow the handoff memory. If latestAssistantProgress or handoffDirective shows work advanced after the latest user request, resume from that progress instead of restarting the older plan. Do not revive directions listed as superseded or parked. Before editing, inspect the current git status and diff so the continuation matches the actual workspace.

${input.prompt}`;
}

export function defaultDesktopTitle(sourceTitle?: string): string {
  const title = (sourceTitle || "Codex Recovery").replace(/\s+/g, " ").trim();
  return `接力：${title}`.slice(0, 80);
}

export function defaultGoalObjective(input: {
  sourceTitle?: string;
  sourceThreadId?: string;
}): string {
  const sourceTitle = (input.sourceTitle || "卡住任务").trim();
  const sourceThread = (input.sourceThreadId || "unknown-thread").trim();
  return `继续完成卡住对话「${sourceTitle}」的剩余工作，保持原任务目标和验收标准。来源线程：${sourceThread}。`;
}

function ensureRemoteControlSocket(home?: string): string {
  const result = runCommand(defaultGuardianConfig(home).codexBin, ["remote-control", "start", "--json"], {
    timeoutMs: 30_000
  });
  if (result.status !== 0) {
    throw new Error(`Failed to start Codex remote control: ${result.stderr || result.stdout}`);
  }
  try {
    const parsed = JSON.parse(result.stdout);
    const socketPath = parsed?.daemon?.socketPath;
    if (typeof socketPath === "string" && socketPath.length > 0) return socketPath;
  } catch {
    // Fall through to the conventional path used by Codex 0.133.
  }
  const codexHome = home || process.env.CODEX_HOME || path.join(process.env.HOME || "", ".codex");
  return path.join(codexHome, "app-server-control", "app-server-control.sock");
}

function setTitleOnClient(client: AppServerClient, threadId: string, title: string): Promise<any> {
  return client.request("thread/name/set", {
    threadId,
    name: title
  });
}

function initializeClient(client: AppServerClient): Promise<any> {
  return client.request("initialize", {
    clientInfo: {
      name: "relay-baton",
      title: "Relay Baton",
      version: APP_CLIENT_VERSION
    },
    capabilities: {
      experimentalApi: true,
      requestAttestation: false
    }
  });
}

export function buildThreadForkParams(options: AppServerForkOptions, excludeTurns = true): Record<string, unknown> {
  return {
    threadId: options.sourceThreadId,
    model: options.model,
    cwd: options.cwd,
    runtimeWorkspaceRoots: [options.cwd],
    approvalPolicy: "never",
    sandbox: "danger-full-access",
    threadSource: "user",
    experimentalRawEvents: false,
    persistExtendedHistory: false,
    excludeTurns
  };
}

export function buildTurnStartParams(input: {
  threadId: string;
  cwd: string;
  model: string;
  prompt: string;
}): Record<string, unknown> {
  return {
    threadId: input.threadId,
    input: [{
      type: "text",
      text: input.prompt,
      text_elements: []
    }],
    cwd: input.cwd,
    runtimeWorkspaceRoots: [input.cwd],
    approvalPolicy: "never",
    sandboxPolicy: { type: "dangerFullAccess" },
    model: input.model
  };
}

async function applyPlanMode(client: AppServerClient, threadId: string, model: string): Promise<boolean> {
  await client.request("thread/settings/update", {
    threadId,
    collaborationMode: {
      mode: "plan",
      settings: {
        model,
        reasoning_effort: null,
        developer_instructions: null
      }
    }
  });
  return true;
}

async function applyGoal(client: AppServerClient, threadId: string, goal?: DesktopHandoffOptions["goal"]): Promise<boolean> {
  const goalObjective = goal?.objective?.trim();
  if (!goalObjective) return false;
  const goalParams: {
    threadId: string;
    objective: string;
    status: "active" | "paused" | "blocked" | "usageLimited" | "budgetLimited" | "complete";
    tokenBudget?: number;
  } = {
    threadId,
    objective: goalObjective,
    status: goal?.status || "active"
  };
  if (typeof goal?.tokenBudget === "number" && Number.isFinite(goal.tokenBudget) && goal.tokenBudget > 0) {
    goalParams.tokenBudget = Math.floor(goal.tokenBudget);
  }
  await client.request("thread/goal/set", goalParams);
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class AppServerClient {
  private readonly socketPath: string;
  private readonly timeoutMs: number;
  private socket: net.Socket | null = null;
  private buffer = Buffer.alloc(0);
  private upgraded = false;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();

  constructor(socketPath: string, timeoutMs: number) {
    this.socketPath = socketPath;
    this.timeoutMs = timeoutMs;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const key = crypto.randomBytes(16).toString("base64");
      const socket = net.createConnection(this.socketPath);
      this.socket = socket;
      const fail = (error: Error) => {
        socket.destroy();
        reject(error);
      };
      const timer = setTimeout(() => fail(new Error("Timed out connecting to Codex app-server")), this.timeoutMs);

      socket.once("error", fail);
      socket.on("connect", () => {
        socket.write([
          "GET / HTTP/1.1",
          "Host: localhost",
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Key: ${key}`,
          "Sec-WebSocket-Version: 13",
          "",
          ""
        ].join("\r\n"));
      });
      socket.on("data", (chunk) => {
        const data = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
        this.buffer = Buffer.concat([this.buffer, data]);
        if (!this.upgraded) {
          const index = this.buffer.indexOf("\r\n\r\n");
          if (index === -1) return;
          const header = this.buffer.subarray(0, index).toString("utf8");
          this.buffer = this.buffer.subarray(index + 4);
          if (!header.includes("101")) {
            fail(new Error(`Codex app-server websocket upgrade failed: ${header.split("\r\n")[0]}`));
            return;
          }
          clearTimeout(timer);
          this.upgraded = true;
          socket.off("error", fail);
          socket.on("error", (error) => this.rejectAll(error));
          resolve();
        }
        this.readFrames();
      });
    });
  }

  request(method: string, params: unknown): Promise<any> {
    if (!this.socket || !this.upgraded) throw new Error("Codex app-server is not connected");
    const id = this.nextId;
    this.nextId += 1;
    const payload = JSON.stringify({ id, method, params });
    this.socket.write(encodeClientFrame(payload));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for app-server response to ${method}`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
    });
  }

  close(): void {
    this.rejectAll(new Error("Codex app-server client closed"));
    this.socket?.end();
    this.socket = null;
  }

  private readFrames(): void {
    while (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const second = this.buffer[1];
      let length = second & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (this.buffer.length < 4) return;
        length = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (this.buffer.length < 10) return;
        length = Number(this.buffer.readBigUInt64BE(2));
        offset = 10;
      }
      const masked = Boolean(second & 0x80);
      const maskOffset = offset;
      if (masked) offset += 4;
      if (this.buffer.length < offset + length) return;
      let payload = this.buffer.subarray(offset, offset + length);
      if (masked) {
        const mask = this.buffer.subarray(maskOffset, maskOffset + 4);
        const unmasked = Buffer.alloc(payload.length);
        for (let index = 0; index < payload.length; index += 1) {
          unmasked[index] = payload[index] ^ mask[index % 4];
        }
        payload = unmasked;
      }
      this.buffer = this.buffer.subarray(offset + length);
      const opcode = first & 0x0f;
      if (opcode === 1) this.handleText(payload.toString("utf8"));
      if (opcode === 8) this.close();
    }
  }

  private handleText(text: string): void {
    let message: any;
    try {
      message = JSON.parse(text);
    } catch {
      return;
    }
    if (typeof message.id !== "number") return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
    } else {
      pending.resolve(message.result);
    }
  }

  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }
}

function encodeClientFrame(text: string): Buffer {
  const payload = Buffer.from(text, "utf8");
  let header: Buffer;
  if (payload.length < 126) {
    header = Buffer.from([0x81, 0x80 | payload.length]);
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  const mask = crypto.randomBytes(4);
  const masked = Buffer.alloc(payload.length);
  for (let index = 0; index < payload.length; index += 1) {
    masked[index] = payload[index] ^ mask[index % 4];
  }
  return Buffer.concat([header, mask, masked]);
}
