import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { codexHome, monitorLogsDir, recoveryStatePath } from "./paths.ts";
import { runCommand } from "./exec.ts";

export const MONITOR_LABEL = "com.codex-context-guardian.monitor";

export type MonitorInstallResult = {
  label: string;
  plistPath: string;
  stdoutPath: string;
  stderrPath: string;
  changed: boolean;
  plist: string;
};

export type MonitorStatus = {
  label: string;
  plistPath: string;
  installed: boolean;
  loaded: boolean;
  detail: string;
  recoveryStatePath: string;
};

export function monitorPlistPath(): string {
  return path.join(os.homedir(), "Library", "LaunchAgents", `${MONITOR_LABEL}.plist`);
}

export function buildMonitorPlist(options: {
  home?: string;
  nodeBin: string;
  guardianBin: string;
}): MonitorInstallResult {
  const home = options.home || codexHome();
  const logsDir = monitorLogsDir(home);
  const stdoutPath = path.join(logsDir, "monitor.out.log");
  const stderrPath = path.join(logsDir, "monitor.err.log");
  const args = [
    options.nodeBin,
    options.guardianBin,
    "watch",
    "--auto",
    "--desktop",
    "--goal-mode",
    "--home",
    home
  ];
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(MONITOR_LABEL)}</string>
  <key>ProgramArguments</key>
  <array>
${args.map((arg) => `    <string>${escapeXml(arg)}</string>`).join("\n")}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${escapeXml(stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(stderrPath)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>CODEX_HOME</key>
    <string>${escapeXml(home)}</string>
  </dict>
</dict>
</plist>
`;
  return {
    label: MONITOR_LABEL,
    plistPath: monitorPlistPath(),
    stdoutPath,
    stderrPath,
    changed: true,
    plist
  };
}

export function installMonitor(options: {
  home?: string;
  nodeBin: string;
  guardianBin: string;
  dryRun?: boolean;
}): MonitorInstallResult {
  const result = buildMonitorPlist(options);
  const existing = fs.existsSync(result.plistPath) ? fs.readFileSync(result.plistPath, "utf8") : "";
  result.changed = existing !== result.plist;
  if (options.dryRun) return result;
  fs.mkdirSync(path.dirname(result.plistPath), { recursive: true });
  fs.mkdirSync(path.dirname(result.stdoutPath), { recursive: true });
  if (result.changed) fs.writeFileSync(result.plistPath, result.plist);
  return result;
}

export function uninstallMonitor(): { label: string; plistPath: string; removed: boolean; stopDetail: string } {
  const stopResult = stopMonitor();
  const plistPath = monitorPlistPath();
  const removed = fs.existsSync(plistPath);
  if (removed) fs.unlinkSync(plistPath);
  return {
    label: MONITOR_LABEL,
    plistPath,
    removed,
    stopDetail: stopResult.detail
  };
}

export function startMonitor(): { label: string; plistPath: string; ok: boolean; detail: string } {
  const plistPath = monitorPlistPath();
  const gui = guiTarget();
  const bootstrap = runCommand("launchctl", ["bootstrap", gui, plistPath], { timeoutMs: 5000 });
  if (bootstrap.status === 0) {
    return { label: MONITOR_LABEL, plistPath, ok: true, detail: bootstrap.stdout || "started" };
  }
  const load = runCommand("launchctl", ["load", plistPath], { timeoutMs: 5000 });
  return {
    label: MONITOR_LABEL,
    plistPath,
    ok: load.status === 0,
    detail: load.stderr || load.stdout || bootstrap.stderr || bootstrap.stdout
  };
}

export function stopMonitor(): { label: string; plistPath: string; ok: boolean; detail: string } {
  const plistPath = monitorPlistPath();
  const gui = guiTarget();
  const bootout = runCommand("launchctl", ["bootout", gui, plistPath], { timeoutMs: 5000 });
  if (bootout.status === 0) {
    return { label: MONITOR_LABEL, plistPath, ok: true, detail: bootout.stdout || "stopped" };
  }
  const unload = runCommand("launchctl", ["unload", plistPath], { timeoutMs: 5000 });
  return {
    label: MONITOR_LABEL,
    plistPath,
    ok: unload.status === 0,
    detail: unload.stderr || unload.stdout || bootout.stderr || bootout.stdout
  };
}

export function monitorStatus(home?: string): MonitorStatus {
  const plistPath = monitorPlistPath();
  const print = runCommand("launchctl", ["print", `${guiTarget()}/${MONITOR_LABEL}`], { timeoutMs: 5000 });
  return {
    label: MONITOR_LABEL,
    plistPath,
    installed: fs.existsSync(plistPath),
    loaded: print.status === 0,
    detail: print.status === 0 ? firstLines(print.stdout, 20) : firstLines(print.stderr || print.stdout, 20),
    recoveryStatePath: recoveryStatePath(home)
  };
}

function guiTarget(): string {
  return `gui/${process.getuid?.() || os.userInfo().uid}`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

function firstLines(text: string, count: number): string {
  return text.split("\n").slice(0, count).join("\n").trim();
}
