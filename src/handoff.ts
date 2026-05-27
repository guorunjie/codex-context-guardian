import { buildDesktopHandoffPrompt, createDesktopHandoff, defaultDesktopTitle, defaultGoalObjective, type DesktopHandoffResult } from "./appServer.ts";
import { writeRecoveryBundle } from "./bundle.ts";
import { buildRecoveryPlan, type RecoveryPlan } from "./recovery.ts";
import { buildHandoffMemory, latestGoalObjectiveFromMemory, readRecentThreadContext } from "./threadContext.ts";
import { shellQuote } from "./exec.ts";

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
};

export type HandoffRecoveryResult = {
  bundleDir: string;
  plan: RecoveryPlan;
  command: string;
  desktop?: DesktopHandoffResult;
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

  return { bundleDir, plan, command, desktop };
}
