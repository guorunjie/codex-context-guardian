import fs from "node:fs";
import path from "node:path";
import { latestHealthyCheckpoint, loadActivityState, type HealthyCheckpoint } from "./activity.ts";
import { classifyLogs, type FailureSignal } from "./classifier.ts";
import { getLatestThread, getThread, readRecentLogs, type ThreadInfo } from "./codexState.ts";
import { defaultGuardianConfig } from "./config.ts";
import { spawnInteractive } from "./exec.ts";
import { buildFallbackSummaryPrompt, buildPrimaryResumePrompt, buildRecoveryPrompt } from "./prompt.ts";
import { recoveriesDir } from "./paths.ts";
import { plannedBundleDir, writeRecoveryBundle } from "./bundle.ts";
import { forkThreadWithAppServer, defaultDesktopTitle } from "./appServer.ts";

export type RecoveryOptions = {
  home?: string;
  threadId?: string;
  last?: boolean;
  strategy?: "auto" | "fallback-model" | "last-healthy-fork" | "fork" | "new-session";
  primaryModel?: string;
  fallbackModel?: string;
  dryRun?: boolean;
  cwd?: string;
  signal?: FailureSignal;
  bundleDir?: string;
  appServer?: boolean;
  startTurn?: boolean;
};

export type RecoveryPlan = {
  strategy: "fallback-model" | "last-healthy-fork" | "fork" | "new-session";
  command: string;
  args: string[];
  steps: RecoveryStep[];
  cwd: string;
  prompt: string;
  thread: ThreadInfo | null;
  signal: FailureSignal;
  bundleDir?: string;
  healthyCheckpoint?: HealthyCheckpoint | null;
};

export type RecoveryStep = {
  name: string;
  command: string;
  args: string[];
  cwd: string;
  interactive: boolean;
};

export function buildRecoveryPlan(options: RecoveryOptions = {}): RecoveryPlan {
  const config = defaultGuardianConfig(options.home);
  const codexBin = config.codexBin;
  const primaryModel = options.primaryModel || config.primaryModel;
  const fallbackModel = options.fallbackModel || config.fallbackModel;
  const thread = resolveThread(options);
  const signal = options.signal || inferFailureSignal(thread?.id, options.home);
  const strategy = chooseStrategy(options.strategy || "auto", signal, thread);
  const healthyCheckpoint = thread ? latestHealthyCheckpoint(loadActivityState(options.home), thread.id) : null;
  const cwd = options.cwd || thread?.cwd || process.cwd();
  const summaryFile = recoverySummaryFile(options.home, thread?.id || signal.threadId || "unknown");
  const bundleDir = strategy !== "fallback-model"
    ? options.bundleDir || plannedBundleDir(options.home, thread?.id || signal.threadId || "unknown")
    : null;
  const prompt = strategy === "fallback-model"
    ? buildPrimaryResumePrompt({ thread, signal, primaryModel, fallbackModel, home: options.home, summaryFile })
    : buildRecoveryPrompt({ thread, signal, primaryModel, fallbackModel, home: options.home, bundleDir, healthyCheckpoint });

  if (strategy === "fallback-model" && thread) {
    const fallbackPrompt = buildFallbackSummaryPrompt({
      thread,
      signal,
      primaryModel,
      fallbackModel,
      home: options.home,
      summaryFile
    });
    const steps: RecoveryStep[] = [
      {
        name: "fallback-summary",
        command: codexBin,
        args: ["exec", "resume", "--model", fallbackModel, "--output-last-message", summaryFile, thread.id, fallbackPrompt],
        cwd,
        interactive: false
      },
      {
        name: "primary-resume",
        command: codexBin,
        args: ["resume", "--model", primaryModel, thread.id, prompt],
        cwd,
        interactive: true
      }
    ];
    return {
      strategy,
      command: steps[0].command,
      args: steps[0].args,
      steps,
      cwd,
      prompt,
      thread,
      signal,
      bundleDir: bundleDir || undefined,
      healthyCheckpoint
    };
  }

  if ((strategy === "fork" || strategy === "last-healthy-fork") && thread) {
    const steps: RecoveryStep[] = [{
      name: strategy === "last-healthy-fork" ? "last-healthy-fork" : "primary-fork",
      command: codexBin,
      args: ["fork", "--model", primaryModel, thread.id, prompt],
      cwd,
      interactive: true
    }];
    return {
      strategy,
      command: steps[0].command,
      args: steps[0].args,
      steps,
      cwd,
      prompt,
      thread,
      signal,
      bundleDir: bundleDir || undefined,
      healthyCheckpoint
    };
  }

  const steps: RecoveryStep[] = [{
    name: "new-session",
    command: codexBin,
    args: ["-C", cwd, "--model", primaryModel, prompt],
    cwd,
    interactive: true
  }];
  return {
    strategy: "new-session",
    command: steps[0].command,
    args: steps[0].args,
    steps,
    cwd,
    prompt,
    thread,
    signal,
    bundleDir: bundleDir || undefined,
    healthyCheckpoint
  };
}

export async function recover(options: RecoveryOptions = {}): Promise<RecoveryPlan> {
  const plan = buildRecoveryPlan(options);
  if (!options.dryRun) {
    ensureRecoveryOutputDirs(plan);
    if (plan.bundleDir) {
      writeRecoveryBundle({
        home: options.home,
        bundleDir: plan.bundleDir,
        thread: plan.thread,
        signal: plan.signal,
        prompt: plan.prompt,
        projectRoot: plan.cwd,
        healthyCheckpoint: plan.healthyCheckpoint
      });
    }
    if (options.appServer && (plan.strategy === "fork" || plan.strategy === "last-healthy-fork") && plan.thread) {
      await forkThreadWithAppServer({
        home: options.home,
        sourceThreadId: plan.thread.id,
        cwd: plan.cwd,
        model: options.primaryModel || defaultGuardianConfig(options.home).primaryModel,
        title: defaultDesktopTitle(plan.thread.title),
        prompt: plan.prompt,
        startTurn: options.startTurn !== false,
        excludeTurns: true
      });
      return plan;
    }
    for (const step of plan.steps) {
      await spawnInteractive(step.command, step.args, { cwd: step.cwd });
    }
  }
  return plan;
}

export function chooseStrategy(
  requested: RecoveryOptions["strategy"],
  signal: FailureSignal,
  thread: ThreadInfo | null
): RecoveryPlan["strategy"] {
  if (requested && requested !== "auto") return requested;
  if (!thread) return "new-session";
  if (signal.kind === "model_compact_unsupported") return "fallback-model";
  if (signal.kind === "context_overflow") return "last-healthy-fork";
  return "fork";
}

function resolveThread(options: RecoveryOptions): ThreadInfo | null {
  if (options.threadId) return getThread(options.threadId, options.home);
  if (options.last) return getLatestThread(options.home);
  return null;
}

function inferFailureSignal(threadId?: string, home?: string): FailureSignal {
  const logs = readRecentLogs({ home, threadId, limit: 100 });
  return classifyLogs(logs) || {
    kind: "unknown",
    confidence: "low",
    reason: "no recent compaction failure log found",
    threadId
  };
}

function recoverySummaryFile(home: string | undefined, threadId: string): string {
  const dir = recoveriesDir(home);
  const safeId = threadId.replace(/[^a-z0-9-]/gi, "_");
  return path.join(dir, `${safeId}-${Date.now()}-fallback-summary.md`);
}

function ensureRecoveryOutputDirs(plan: RecoveryPlan): void {
  for (const step of plan.steps) {
    const outputIndex = step.args.indexOf("--output-last-message");
    if (outputIndex === -1) continue;
    const outputFile = step.args[outputIndex + 1];
    if (outputFile) fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  }
}
