import fs from "node:fs";
import path from "node:path";
import { buildDesktopHandoffPrompt, createDesktopHandoff, defaultDesktopTitle, defaultGoalObjective, type DesktopHandoffResult } from "./appServer.ts";
import { writeRecoveryBundle } from "./bundle.ts";
import { buildRecoveryPlan, type RecoveryPlan } from "./recovery.ts";
import { buildHandoffMemory, latestGoalObjectiveFromMemory, readRecentThreadContext } from "./threadContext.ts";
import { shellQuote } from "./exec.ts";
import { guardianHome } from "./paths.ts";
import { evaluateHandoffMemory, type HandoffQuality } from "./handoffQuality.ts";
import { loadRecoveryState, normalizeThreadState, recordDesktopHandoff, saveRecoveryState } from "./recoveryState.ts";

export type HandoffRecoveryOptions = {
  home?: string;
  threadId?: string;
  last?: boolean;
  cwd?: string;
  desktop?: boolean;
  planMode?: boolean;
  goalMode?: boolean;
  goal?: string;
  goalBudget?: number;
  startTurn?: boolean;
  title?: string;
  primaryModel?: string;
  force?: boolean;
  recordState?: boolean;
  stateLogId?: number;
};

export type HandoffRecoveryResult = {
  bundleDir: string;
  plan: RecoveryPlan;
  command: string;
  desktop?: DesktopHandoffResult;
  quality?: HandoffQuality;
  blocked?: {
    reason: string;
    blockers: string[];
  };
  reusedDesktop?: {
    threadId: string;
    bundleDir?: string;
    qualityScore?: number;
    reason: string;
  };
};

export async function createHandoffRecovery(options: HandoffRecoveryOptions): Promise<HandoffRecoveryResult> {
  const initialPlan = buildRecoveryPlan({
    home: options.home,
    threadId: options.threadId,
    last: options.last,
    strategy: "new-session",
    dryRun: true,
    cwd: options.cwd
  });
  if (!initialPlan.bundleDir) throw new Error("Could not plan recovery bundle");

  const sourceThreadId = initialPlan.thread?.id || initialPlan.signal.threadId || "unknown";
  const releaseLock = options.desktop ? acquireHandoffLock(options.home, sourceThreadId) : undefined;
  try {
    const bundleDir = writeRecoveryBundle({
      home: options.home,
      bundleDir: initialPlan.bundleDir,
      thread: initialPlan.thread,
      signal: initialPlan.signal,
      prompt: initialPlan.prompt,
      projectRoot: initialPlan.cwd
    });
    const plan = buildRecoveryPlan({
      home: options.home,
      threadId: initialPlan.thread?.id,
      strategy: "new-session",
      dryRun: true,
      cwd: initialPlan.cwd,
      signal: initialPlan.signal,
      bundleDir
    });
    const command = [plan.command, ...plan.args].map(shellQuote).join(" ");

    if (!options.desktop) {
      return { bundleDir, plan, command };
    }

    const recentContext = readRecentThreadContext(initialPlan.thread, { home: options.home });
    const handoffMemory = buildHandoffMemory(initialPlan.thread, recentContext);
    const quality = evaluateHandoffMemory(handoffMemory);
    if (!quality.ok) {
      return {
        bundleDir,
        plan,
        command,
        quality,
        blocked: {
          reason: quality.recommendation,
          blockers: quality.blockers
        }
      };
    }

    const existing = existingDesktopHandoff(options.home, sourceThreadId);
    if (!options.force && existing) {
      return {
        bundleDir,
        plan,
        command,
        quality,
        reusedDesktop: existing
      };
    }

    const recoveredGoal = latestGoalObjectiveFromMemory(handoffMemory);
    const goalObjective = options.goal || (options.goalMode ? recoveredGoal || defaultGoalObjective({
      sourceTitle: initialPlan.thread?.title,
      sourceThreadId: initialPlan.thread?.id
    }) : undefined);
    const prompt = buildDesktopHandoffPrompt({
      sourceThreadId: initialPlan.thread?.id,
      sourceTitle: initialPlan.thread?.title,
      bundleDir,
      cwd: initialPlan.cwd,
      prompt: plan.prompt
    });
    const desktop = await createDesktopHandoff({
      home: options.home,
      cwd: initialPlan.cwd,
      model: options.primaryModel || initialPlan.thread?.model || "gpt-5.5",
      title: options.title || defaultDesktopTitle(initialPlan.thread?.title),
      prompt,
      planMode: Boolean(options.planMode),
      goal: goalObjective ? {
        objective: goalObjective,
        tokenBudget: options.goalBudget,
        status: "active"
      } : undefined,
      startTurn: options.startTurn !== false
    });

    if (options.recordState !== false) {
      const state = loadRecoveryState(options.home);
      recordDesktopHandoff(state, sourceThreadId, options.stateLogId || 0, Date.now(), desktop.threadId, {
        bundleDir,
        qualityScore: quality.score,
        qualityOk: quality.ok
      });
      saveRecoveryState(state, options.home);
    }

    return { bundleDir, plan, command, desktop, quality };
  } finally {
    releaseLock?.();
  }
}

function existingDesktopHandoff(home: string | undefined, sourceThreadId: string): HandoffRecoveryResult["reusedDesktop"] | null {
  const state = loadRecoveryState(home);
  const current = normalizeThreadState(state.threads[sourceThreadId]);
  if (!current.desktopHandoffCreated || !current.lastDesktopHandoffThreadId) return null;
  if (current.lastDesktopHandoffQualityOk === false) return null;
  return {
    threadId: current.lastDesktopHandoffThreadId,
    bundleDir: current.lastDesktopHandoffBundleDir,
    qualityScore: current.lastDesktopHandoffQualityScore,
    reason: "A Desktop handoff already exists for this source thread. Reusing it avoids creating parallel continuation threads."
  };
}

function acquireHandoffLock(home: string | undefined, sourceThreadId: string): (() => void) | undefined {
  const safeId = sourceThreadId.replace(/[^a-z0-9-]/gi, "_");
  const lockDir = path.join(guardianHome(home), "locks");
  const lockPath = path.join(lockDir, `${safeId}.desktop-handoff.lock`);
  fs.mkdirSync(lockDir, { recursive: true });
  const now = Date.now();
  if (fs.existsSync(lockPath)) {
    const ageMs = now - Number(fs.statSync(lockPath).mtimeMs || 0);
    if (ageMs < 10 * 60 * 1000) {
      throw new Error(`Desktop handoff already in progress for source thread ${sourceThreadId}.`);
    }
    fs.unlinkSync(lockPath);
  }
  const fd = fs.openSync(lockPath, "wx");
  fs.writeFileSync(fd, JSON.stringify({ sourceThreadId, pid: process.pid, createdAt: new Date(now).toISOString() }));
  fs.closeSync(fd);
  return () => {
    try {
      fs.unlinkSync(lockPath);
    } catch {
      // Best-effort cleanup; stale locks expire on the next attempt.
    }
  };
}
