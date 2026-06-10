import type { ActivityState } from "./activity.ts";
import type { Check } from "./doctor.ts";
import type { MonitorStatus } from "./monitor.ts";
import type { GuardianRecoveryState } from "./recoveryState.ts";

export type FollowDoctorReport = {
  ok: boolean;
  status: "ready" | "needs-attention";
  doctorOk: boolean;
  failedDoctorChecks: string[];
  hooksInstalled: boolean;
  monitorInstalled: boolean;
  monitorLoaded: boolean;
  activityThreads: number;
  activeThreads: number;
  recoveryThreads: number;
  lastSeenLogId: number;
  latestActivityAt?: string;
  nextActions: string[];
};

export function buildFollowDoctorReport(input: {
  doctor: Check[];
  monitor: MonitorStatus;
  activity: ActivityState;
  recovery: GuardianRecoveryState;
}): FollowDoctorReport {
  const failedDoctorChecks = input.doctor.filter((check) => !check.ok).map((check) => check.name);
  const hooksInstalled = input.doctor.some((check) => check.name === "relay-baton compact hooks" && check.ok);
  const activityThreads = Object.keys(input.activity.threads).length;
  const activeThreads = Object.values(input.activity.threads)
    .filter((thread) => thread.compactInFlight || thread.activeTurnStartedAt)
    .length;
  const recoveryThreads = Object.keys(input.recovery.threads).length;
  const latestActivity = Math.max(0, ...Object.values(input.activity.threads).map((thread) => Number(thread.lastEventAt || 0)));
  const doctorOk = failedDoctorChecks.length === 0;
  const ok = doctorOk && hooksInstalled && input.monitor.installed && input.monitor.loaded;
  const nextActions = followDoctorNextActions({
    doctorOk,
    failedDoctorChecks,
    hooksInstalled,
    monitorInstalled: input.monitor.installed,
    monitorLoaded: input.monitor.loaded,
    activityThreads
  });

  return {
    ok,
    status: ok ? "ready" : "needs-attention",
    doctorOk,
    failedDoctorChecks,
    hooksInstalled,
    monitorInstalled: input.monitor.installed,
    monitorLoaded: input.monitor.loaded,
    activityThreads,
    activeThreads,
    recoveryThreads,
    lastSeenLogId: Number(input.recovery.lastSeenLogId || 0),
    latestActivityAt: latestActivity > 0 ? new Date(latestActivity).toISOString() : undefined,
    nextActions
  };
}

export function formatFollowDoctorReport(report: FollowDoctorReport): string {
  const lines = [
    `Relay Baton follow doctor: ${report.status}`,
    `doctor: ${report.doctorOk ? "ok" : `failed (${report.failedDoctorChecks.join(", ")})`}`,
    `hooks: ${report.hooksInstalled ? "installed" : "missing"}`,
    `monitor: ${report.monitorLoaded ? "running" : report.monitorInstalled ? "installed but stopped" : "not installed"}`,
    `activity threads: ${report.activityThreads}, active: ${report.activeThreads}`,
    `recovery-tracked threads: ${report.recoveryThreads}`,
    `last seen log id: ${report.lastSeenLogId}`,
    `latest activity: ${report.latestActivityAt || "none"}`
  ];
  if (report.nextActions.length > 0) {
    lines.push("", "Next actions:");
    for (const action of report.nextActions) lines.push(`- ${action}`);
  }
  return lines.join("\n");
}

function followDoctorNextActions(input: {
  doctorOk: boolean;
  failedDoctorChecks: string[];
  hooksInstalled: boolean;
  monitorInstalled: boolean;
  monitorLoaded: boolean;
  activityThreads: number;
}): string[] {
  const actions: string[] = [];
  if (!input.doctorOk) {
    actions.push(`Run relay-baton doctor and fix failed checks: ${input.failedDoctorChecks.join(", ")}.`);
  }
  if (!input.hooksInstalled || !input.monitorInstalled) {
    actions.push("Run relay-baton follow install to install hooks and the background monitor.");
  } else if (!input.monitorLoaded) {
    actions.push("Run relay-baton follow start, or relay-baton follow repair if the monitor launch environment changed.");
  }
  if (input.doctorOk && input.hooksInstalled && input.monitorInstalled && input.monitorLoaded && input.activityThreads === 0) {
    actions.push("No Codex hook activity has been observed yet; start or continue a Codex task, then re-run relay-baton follow doctor.");
  }
  if (actions.length === 0) {
    actions.push("Ready for unattended queue-only monitoring. Use relay-baton diagnose --last after a stuck task to inspect any rescue decision.");
  }
  return actions;
}
