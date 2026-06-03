import fs from "node:fs";
import path from "node:path";
import { detectActivityFailure, loadActivityState, type ThreadActivityState } from "./activity.ts";
import { classifyLogs, type FailureSignal } from "./classifier.ts";
import { getLatestThread, getThread, readRecentLogs, type LogRow, type ThreadInfo } from "./codexState.ts";
import { defaultGuardianConfig } from "./config.ts";
import { monitorStatus } from "./monitor.ts";
import { monitorLogsDir } from "./paths.ts";
import { probeAppServer } from "./appServer.ts";
import { canRecoverThread, loadRecoveryState, normalizeThreadState, type ThreadRecoveryState } from "./recoveryState.ts";
import { resolveRecoveryThreadId } from "./watch.ts";

export type DiagnoseReport = {
  schemaVersion: 1;
  generatedAt: string;
  home?: string;
  threadId?: string;
  thread: ThreadInfo | null;
  monitor: {
    installed: boolean;
    loaded: boolean;
    detail: string;
    forkFirst: boolean;
    appServerFirst: boolean;
    queueOnly: boolean;
    visibleRelayEnabled: boolean;
  };
  logs: {
    lookbackMs: number;
    lastSeenLogId: number;
    recentRows: Array<Pick<LogRow, "id" | "ts" | "level" | "target" | "threadId"> & { bodyPreview: string }>;
    signal: FailureSignal | null;
    signalSkippedByLastSeen: boolean;
  };
  activity: {
    present: boolean;
    compactInFlight: boolean;
    compactStalled: boolean;
    lastEventName?: string;
    lastEventAt?: number;
    lastCompactStartedAt?: number;
    healthyCheckpointCount: number;
  };
  lineage: {
    resolvedThreadId?: string;
    sourceThreadId?: string;
    mismatch: boolean;
  };
  recovery: {
    state?: ThreadRecoveryState;
    gate?: { ok: boolean; reason?: string };
    archived: boolean;
  };
  runtime: {
    stdinIsTTY: boolean;
    monitorHasTtyErrors: boolean;
    monitorHasTrustErrors: boolean;
    appServer: {
      ok: boolean;
      socketPath?: string;
      warnings: string[];
      error?: string;
    };
  };
  whyNotRescued: string[];
  recommendations: string[];
};

export async function runDiagnose(options: {
  home?: string;
  threadId?: string;
  last?: boolean;
  lookbackMs?: number;
} = {}): Promise<DiagnoseReport> {
  const config = defaultGuardianConfig(options.home);
  const lookbackMs = options.lookbackMs || config.backfillMs;
  const latest = options.last ? getLatestThread(options.home) : null;
  const threadId = options.threadId || latest?.id;
  const thread = threadId ? getThread(threadId, options.home) : null;
  const activityState = loadActivityState(options.home);
  const activity = threadId ? activityState.threads[threadId] : undefined;
  const recoveryState = loadRecoveryState(options.home);
  const rows = readRecentLogs({
    home: options.home,
    threadId,
    sinceTs: Date.now() - lookbackMs,
    limit: 100
  });
  const signal = classifyLogs(rows) || activitySignalForThread(activity, config.compactTimeoutMs);
  const resolvedThreadId = signal ? resolveRecoveryThreadId(signal, activityState, recoveryState, options.home) : threadId;
  const recoveryThreadId = resolvedThreadId || threadId;
  const threadState = recoveryThreadId ? normalizeThreadState(recoveryState.threads[recoveryThreadId]) : undefined;
  const sourceLogId = signal?.sourceLogId || rows.reduce((max, row) => Math.max(max, row.id), 0);
  const gate = recoveryThreadId
    ? canRecoverThread(recoveryState, recoveryThreadId, Date.now(), {
      cooldownMs: config.recoveryCooldownMs,
      maxConsecutiveRecoveries: config.maxConsecutiveRecoveries,
      failureLogId: sourceLogId
    })
    : undefined;
  const monitor = monitorStatus(options.home);
  const stderrTail = readMonitorErrTail(options.home);
  const appServer = await probeAppServerSafe(options.home);
  const compactStalled = isCompactStalled(activity, config.compactTimeoutMs);

  const whyNotRescued = reasons({
    threadId,
    resolvedThreadId,
    activity,
    compactStalled,
    rows,
    signal,
    lastSeenLogId: recoveryState.lastSeenLogId || 0,
    gate,
    threadState,
    threadArchived: Boolean(thread?.archived),
    monitorDetail: monitor.detail,
    stderrTail,
    appServerOk: appServer.ok
  });
  const recommendations = recommendedActions(whyNotRescued, appServer.ok);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    home: options.home,
    threadId,
    thread,
    monitor: {
      installed: monitor.installed,
      loaded: monitor.loaded,
      detail: monitor.detail,
      forkFirst: /--fork/.test(monitor.detail) && !/--app-server/.test(monitor.detail),
      appServerFirst: /--app-server/.test(monitor.detail),
      queueOnly: /--queue-only/.test(monitor.detail),
      visibleRelayEnabled: /--create-visible-relay/.test(monitor.detail) || config.createVisibleRelay
    },
    logs: {
      lookbackMs,
      lastSeenLogId: recoveryState.lastSeenLogId || 0,
      recentRows: rows.map((row) => ({
        id: row.id,
        ts: row.ts,
        level: row.level,
        target: row.target,
        threadId: row.threadId,
        bodyPreview: row.body.slice(0, 240)
      })),
      signal,
      signalSkippedByLastSeen: Boolean(signal?.sourceLogId && signal.sourceLogId <= (recoveryState.lastSeenLogId || 0))
    },
    activity: {
      present: Boolean(activity),
      compactInFlight: Boolean(activity?.compactInFlight),
      compactStalled,
      lastEventName: activity?.lastEventName,
      lastEventAt: activity?.lastEventAt,
      lastCompactStartedAt: activity?.lastCompactStartedAt,
      healthyCheckpointCount: activity?.healthyCheckpoints?.length || 0
    },
    lineage: {
      resolvedThreadId,
      sourceThreadId: threadId,
      mismatch: Boolean(threadId && resolvedThreadId && threadId !== resolvedThreadId)
    },
    recovery: {
      state: threadState,
      gate: gate ? gate.ok ? { ok: true } : { ok: false, reason: gate.reason } : undefined,
      archived: Boolean(thread?.archived)
    },
    runtime: {
      stdinIsTTY: Boolean(process.stdin.isTTY),
      monitorHasTtyErrors: /stdin is not a terminal/i.test(stderrTail),
      monitorHasTrustErrors: /not inside a trusted directory/i.test(stderrTail),
      appServer
    },
    whyNotRescued,
    recommendations
  };
}

export function formatDiagnose(report: DiagnoseReport): string {
  const lines = [
    "Relay Baton diagnose",
    `Thread: ${report.threadId || "unknown"}`,
    `Title: ${report.thread?.title || "unknown"}`,
    `Archived: ${report.recovery.archived ? "yes" : "no"}`,
    `Monitor: ${report.monitor.loaded ? "running" : "not running"}${report.monitor.queueOnly ? " (queue-only)" : report.monitor.appServerFirst ? " (app-server-first)" : report.monitor.forkFirst ? " (fork-first)" : ""}`,
    `Signal: ${report.logs.signal ? `${report.logs.signal.kind} (${report.logs.signal.confidence})` : "none"}`,
    `Activity: ${report.activity.present ? report.activity.compactStalled ? "compact stalled" : report.activity.compactInFlight ? "compact in flight" : "present" : "missing"}`,
    `Recovery gate: ${report.recovery.gate ? report.recovery.gate.ok ? "open" : `blocked: ${report.recovery.gate.reason}` : "unknown"}`,
    `App-server: ${report.runtime.appServer.ok ? "available" : `unavailable: ${report.runtime.appServer.error || "unknown"}`}`,
    "",
    "Why not rescued:"
  ];
  if (report.whyNotRescued.length === 0) lines.push("- no blocker found in the selected lookback window");
  else for (const reason of report.whyNotRescued) lines.push(`- ${reason}`);
  lines.push("", "Recommended next actions:");
  for (const action of report.recommendations) lines.push(`- ${action}`);
  return lines.join("\n");
}

function activitySignalForThread(activity: ThreadActivityState | undefined, compactTimeoutMs: number): FailureSignal | null {
  if (!activity) return null;
  const state = {
    schemaVersion: 1 as const,
    updatedAt: Date.now(),
    threads: {
      [activity.threadId]: activity
    }
  };
  return detectActivityFailure(state, { compactTimeoutMs, turnStallMs: Number.MAX_SAFE_INTEGER });
}

function isCompactStalled(activity: ThreadActivityState | undefined, compactTimeoutMs: number): boolean {
  return Boolean(activity?.compactInFlight && activity.lastCompactStartedAt && Date.now() - activity.lastCompactStartedAt >= compactTimeoutMs);
}

function reasons(input: {
  threadId?: string;
  resolvedThreadId?: string;
  activity?: ThreadActivityState;
  compactStalled: boolean;
  rows: LogRow[];
  signal: FailureSignal | null;
  lastSeenLogId: number;
  gate?: { ok: true } | { ok: false; reason: string };
  threadState?: ThreadRecoveryState;
  threadArchived: boolean;
  monitorDetail: string;
  stderrTail: string;
  appServerOk: boolean;
}): string[] {
  const result: string[] = [];
  if (input.threadArchived) result.push("thread is archived; Relay Baton monitor ignores archived threads");
  if (input.signal?.sourceLogId && input.signal.sourceLogId <= input.lastSeenLogId) {
    result.push(`signal log ${input.signal.sourceLogId} is at or below lastSeenLogId ${input.lastSeenLogId}`);
  }
  if (!input.activity) result.push("no lifecycle hook activity exists for this thread");
  if (input.activity?.compactInFlight && !input.compactStalled) result.push("compact is in flight but has not exceeded the timeout yet");
  if (input.compactStalled) result.push("PreCompact was observed but PostCompact has not arrived");
  if (input.threadId && input.resolvedThreadId && input.threadId !== input.resolvedThreadId) {
    result.push(`lineage resolved to ${input.resolvedThreadId} instead of source ${input.threadId}`);
  }
  if (input.gate && !input.gate.ok) result.push(`recovery gate blocked: ${input.gate.reason}`);
  if (input.threadState?.forkHandoffCreated && input.threadState.lastRecoveryError) {
    result.push(`previous fork state exists but last recovery failed: ${input.threadState.lastRecoveryError}`);
  } else if (input.threadState?.forkHandoffCreated) {
    result.push("previous fork handoff state exists for this task chain");
  }
  if (input.threadState?.queuedHandoffCreated) {
    result.push(`queued recovery bundle exists: ${input.threadState.lastQueuedHandoffBundleDir || "unknown bundle"}`);
  }
  if (/stdin is not a terminal/i.test(input.stderrTail)) result.push("monitor stderr contains non-TTY interactive Codex failures");
  if (/not inside a trusted directory/i.test(input.stderrTail)) result.push("monitor stderr contains Codex trusted-directory failures");
  if (/--fork/.test(input.monitorDetail) && !/--app-server/.test(input.monitorDetail) && !/--queue-only/.test(input.monitorDetail)) {
    result.push("monitor is installed as fork-first without app-server transport");
  }
  if (!input.appServerOk) result.push("Codex app-server is unavailable for background thread/fork recovery");
  if (!input.signal && input.rows.length === 0 && !input.compactStalled) result.push("no compact failure signal was found in the lookback window");
  return [...new Set(result)];
}

function recommendedActions(reasonsList: string[], appServerOk: boolean): string[] {
  const actions = new Set<string>();
  if (reasonsList.some((reason) => /thread is archived/.test(reason))) actions.add("No recovery action is needed for archived threads. Use codex unarchive <thread-id> only if you want to continue that source conversation.");
  if (reasonsList.some((reason) => /lastSeenLogId/.test(reason))) actions.add("Run watch with startup backfill enabled or reset only after auditing recent compact failures.");
  if (reasonsList.some((reason) => /non-TTY|fork-first/.test(reason))) actions.add("Reinstall the monitor so it runs queue-only in the background: relay-baton follow repair && relay-baton follow start.");
  if (reasonsList.some((reason) => /lineage resolved/.test(reason))) actions.add("Audit lineage matching; same cwd alone should not merge unrelated Codex threads.");
  if (reasonsList.some((reason) => /queued recovery bundle/.test(reason))) actions.add("Open the queued bundle first; create a visible relay only with relay-baton recover --thread <id> --strategy fork --app-server after reviewing it.");
  if (reasonsList.some((reason) => /recovery gate blocked|previous fork/.test(reason))) actions.add("Run relay-baton diagnose --thread <id> --json and inspect lastFailureLogId, cooldown, and lastRecoveryError before forcing a new relay.");
  if (!appServerOk) actions.add("Start Codex Desktop or enable its app-server before unattended recovery; otherwise use the written bundle manually.");
  if (actions.size === 0) actions.add("No hard blocker found; run relay-baton watch --once --auto --fork --queue-only to create one audited recovery bundle.");
  return [...actions];
}

async function probeAppServerSafe(home?: string): Promise<DiagnoseReport["runtime"]["appServer"]> {
  try {
    const result = await probeAppServer({ home, timeoutMs: 5_000 });
    return { ok: true, socketPath: result.socketPath, warnings: result.warnings };
  } catch (error) {
    return {
      ok: false,
      warnings: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function readMonitorErrTail(home?: string): string {
  const file = path.join(monitorLogsDir(home), "monitor.err.log");
  if (!fs.existsSync(file)) return "";
  const text = fs.readFileSync(file, "utf8");
  return text.slice(-20_000);
}
