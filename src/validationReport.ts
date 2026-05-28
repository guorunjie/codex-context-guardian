import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadActivityState, type ActivityState } from "./activity.ts";
import { runDoctor, type Check } from "./doctor.ts";
import { monitorStatus, type MonitorStatus } from "./monitor.ts";
import { codexHome } from "./paths.ts";
import { evaluateReleaseReadiness, type ReleaseReadiness } from "./releaseCheck.ts";
import { loadRecoveryState, type GuardianRecoveryState } from "./recoveryState.ts";

export type HostValidationReport = {
  schemaVersion: 1;
  generatedAt: string;
  platform: {
    os: NodeJS.Platform;
    arch: string;
    node: string;
    cwd: string;
    home: string;
  };
  summary: {
    ok: boolean;
    doctorOk: boolean;
    monitorInstalled: boolean;
    monitorLoaded: boolean;
    releaseOk: boolean;
    activityThreads: number;
    recoveryThreads: number;
  };
  doctor: Check[];
  monitor: MonitorStatus;
  release: ReleaseReadiness;
  activity: {
    updatedAt: number;
    threadCount: number;
    activeThreadCount: number;
  };
  recovery: {
    lastSeenLogId: number;
    threadCount: number;
  };
  nextActions: string[];
};

export function buildHostValidationReport(options: {
  home?: string;
  root?: string;
  online?: boolean;
  generatedAt?: string;
  doctor?: Check[];
  monitor?: MonitorStatus;
  release?: ReleaseReadiness;
  activity?: ActivityState;
  recovery?: GuardianRecoveryState;
} = {}): HostValidationReport {
  const home = options.home || codexHome();
  const root = path.resolve(options.root || process.cwd());
  const doctor = options.doctor || runDoctor(home);
  const monitor = options.monitor || monitorStatus(home);
  const release = options.release || evaluateReleaseReadiness({ root, online: options.online });
  const activity = options.activity || loadActivityState(home);
  const recovery = options.recovery || loadRecoveryState(home);
  const doctorOk = doctor.every((check) => check.ok);
  const activeThreadCount = Object.values(activity.threads)
    .filter((thread) => thread.compactInFlight || thread.activeTurnStartedAt)
    .length;
  const summary = {
    ok: doctorOk && monitor.installed && monitor.loaded && release.ok,
    doctorOk,
    monitorInstalled: monitor.installed,
    monitorLoaded: monitor.loaded,
    releaseOk: release.ok,
    activityThreads: Object.keys(activity.threads).length,
    recoveryThreads: Object.keys(recovery.threads).length
  };

  return {
    schemaVersion: 1,
    generatedAt: options.generatedAt || new Date().toISOString(),
    platform: {
      os: process.platform,
      arch: process.arch,
      node: process.versions.node,
      cwd: root,
      home
    },
    summary,
    doctor,
    monitor,
    release,
    activity: {
      updatedAt: activity.updatedAt,
      threadCount: Object.keys(activity.threads).length,
      activeThreadCount
    },
    recovery: {
      lastSeenLogId: recovery.lastSeenLogId,
      threadCount: Object.keys(recovery.threads).length
    },
    nextActions: nextActions(summary, doctor, release)
  };
}

export function renderHostValidationReport(report: HostValidationReport): string {
  const lines = [
    "# Relay Baton Host Validation Report",
    "",
    `Generated: ${report.generatedAt}`,
    `Platform: ${report.platform.os} ${report.platform.arch}`,
    `Node: ${report.platform.node}`,
    `Workspace: ${report.platform.cwd}`,
    `Codex home: ${report.platform.home}`,
    "",
    "## Summary",
    "",
    `- overall: ${report.summary.ok ? "ok" : "needs attention"}`,
    `- doctor: ${report.summary.doctorOk ? "ok" : "failed"}`,
    `- monitor installed: ${report.summary.monitorInstalled ? "yes" : "no"}`,
    `- monitor loaded: ${report.summary.monitorLoaded ? "yes" : "no"}`,
    `- release gate: ${report.summary.releaseOk ? "ok" : "failed"}`,
    `- activity threads: ${report.summary.activityThreads}`,
    `- recovery threads: ${report.summary.recoveryThreads}`,
    "",
    "## Doctor",
    ""
  ];

  for (const check of report.doctor) {
    lines.push(`- ${check.ok ? "OK" : "FAIL"} ${check.name}: ${check.detail}`);
  }

  lines.push(
    "",
    "## Monitor",
    "",
    `- label: ${report.monitor.label}`,
    `- installed: ${report.monitor.installed ? "yes" : "no"}`,
    `- loaded: ${report.monitor.loaded ? "yes" : "no"}`,
    `- path: ${report.monitor.plistPath}`,
    "",
    "## Release Gate",
    ""
  );

  for (const check of report.release.checks) {
    lines.push(`- ${check.status.toUpperCase()} ${check.name}: ${check.detail}`);
  }

  if (report.nextActions.length > 0) {
    lines.push("", "## Next Actions", "");
    for (const action of report.nextActions) lines.push(`- ${action}`);
  }

  return `${lines.join("\n")}\n`;
}

export function writeHostValidationReport(report: HostValidationReport, outputDir: string): {
  outputDir: string;
  jsonFile: string;
  markdownFile: string;
} {
  fs.mkdirSync(outputDir, { recursive: true });
  const jsonFile = path.join(outputDir, "VALIDATION_REPORT.json");
  const markdownFile = path.join(outputDir, "VALIDATION_REPORT.md");
  fs.writeFileSync(jsonFile, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(markdownFile, renderHostValidationReport(report));
  return { outputDir, jsonFile, markdownFile };
}

function nextActions(
  summary: HostValidationReport["summary"],
  doctor: Check[],
  release: ReleaseReadiness
): string[] {
  const actions: string[] = [];
  if (!summary.doctorOk) {
    const failed = doctor.filter((check) => !check.ok).map((check) => check.name).join(", ");
    actions.push(`Fix failed doctor checks: ${failed}.`);
  }
  if (!summary.monitorInstalled) actions.push("Run relay-baton follow install to install the monitor.");
  if (summary.monitorInstalled && !summary.monitorLoaded) actions.push("Run relay-baton follow start or relay-baton follow repair to start the monitor.");
  if (!summary.releaseOk) actions.push(...release.nextActions);
  return [...new Set(actions)];
}
