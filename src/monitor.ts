import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { codexHome, monitorLogsDir, recoveryStatePath } from "./paths.ts";
import { runCommand } from "./exec.ts";

export const MONITOR_LABEL = "com.relay-baton.monitor";
export const WINDOWS_TASK_NAME = "RelayBatonMonitor";

export type MonitorInstallResult = {
  label: string;
  plistPath: string;
  stdoutPath: string;
  stderrPath: string;
  changed: boolean;
  plist: string;
  platform?: NodeJS.Platform;
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
    "--fork",
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
    plist,
    platform: "darwin"
  };
}

export function buildWindowsMonitorScript(options: {
  home?: string;
  nodeBin: string;
  guardianBin: string;
}): MonitorInstallResult {
  const home = options.home || codexHome();
  const logsDir = monitorLogsDir(home);
  const stdoutPath = path.join(logsDir, "monitor.out.log");
  const stderrPath = path.join(logsDir, "monitor.err.log");
  const argument = [
    quoteWindowsArg(options.guardianBin),
    "watch",
    "--auto",
    "--fork",
    "--goal-mode",
    "--home",
    quoteWindowsArg(home)
  ].join(" ");
  const taskRun = `cmd.exe /d /c ${quoteWindowsArg(`${quoteWindowsArg(options.nodeBin)} ${argument} >> ${quoteWindowsArg(stdoutPath)} 2>> ${quoteWindowsArg(stderrPath)}`)}`;
  const script = `$ErrorActionPreference = "Stop"
schtasks.exe /Create /TN ${psString(WINDOWS_TASK_NAME)} /SC MINUTE /MO 1 /TR ${psString(taskRun)} /F | Out-Null
`;
  return {
    label: WINDOWS_TASK_NAME,
    plistPath: windowsScriptPath(home),
    stdoutPath,
    stderrPath,
    changed: true,
    plist: script,
    platform: "win32"
  };
}

export function installMonitor(options: {
  home?: string;
  nodeBin: string;
  guardianBin: string;
  dryRun?: boolean;
}): MonitorInstallResult {
  if (process.platform === "win32") return installWindowsMonitor(options);
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
  if (process.platform === "win32") return uninstallWindowsMonitor();
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
  if (process.platform === "win32") return startWindowsMonitor();
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
  if (process.platform === "win32") return stopWindowsMonitor();
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
  if (process.platform === "win32") return windowsMonitorStatus(home);
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

function installWindowsMonitor(options: {
  home?: string;
  nodeBin: string;
  guardianBin: string;
  dryRun?: boolean;
}): MonitorInstallResult {
  const result = buildWindowsMonitorScript(options);
  const existing = fs.existsSync(result.plistPath) ? fs.readFileSync(result.plistPath, "utf8") : "";
  result.changed = existing !== result.plist;
  if (options.dryRun) return result;
  fs.mkdirSync(path.dirname(result.plistPath), { recursive: true });
  fs.mkdirSync(path.dirname(result.stdoutPath), { recursive: true });
  if (result.changed) fs.writeFileSync(result.plistPath, result.plist);
  runCommand("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", result.plistPath], { timeoutMs: 15_000 });
  return result;
}

function uninstallWindowsMonitor(): { label: string; plistPath: string; removed: boolean; stopDetail: string } {
  const stopResult = stopWindowsMonitor();
  const home = codexHome();
  const scriptPath = windowsScriptPath(home);
  const deleteResult = runCommand("schtasks.exe", ["/Delete", "/TN", WINDOWS_TASK_NAME, "/F"], { timeoutMs: 10_000 });
  const removed = deleteResult.status === 0 || fs.existsSync(scriptPath);
  if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath);
  return {
    label: WINDOWS_TASK_NAME,
    plistPath: scriptPath,
    removed,
    stopDetail: stopResult.detail || deleteResult.stderr || deleteResult.stdout
  };
}

function startWindowsMonitor(): { label: string; plistPath: string; ok: boolean; detail: string } {
  const result = runCommand("schtasks.exe", ["/Run", "/TN", WINDOWS_TASK_NAME], { timeoutMs: 10_000 });
  return {
    label: WINDOWS_TASK_NAME,
    plistPath: windowsScriptPath(codexHome()),
    ok: result.status === 0,
    detail: result.stderr || result.stdout || "started"
  };
}

function stopWindowsMonitor(): { label: string; plistPath: string; ok: boolean; detail: string } {
  const result = runCommand("schtasks.exe", ["/End", "/TN", WINDOWS_TASK_NAME], { timeoutMs: 10_000 });
  return {
    label: WINDOWS_TASK_NAME,
    plistPath: windowsScriptPath(codexHome()),
    ok: result.status === 0,
    detail: result.stderr || result.stdout || "stopped"
  };
}

function windowsMonitorStatus(home?: string): MonitorStatus {
  const result = runCommand("schtasks.exe", ["/Query", "/TN", WINDOWS_TASK_NAME, "/FO", "LIST"], { timeoutMs: 10_000 });
  return {
    label: WINDOWS_TASK_NAME,
    plistPath: windowsScriptPath(home || codexHome()),
    installed: result.status === 0,
    loaded: result.status === 0,
    detail: result.status === 0 ? firstLines(result.stdout, 20) : firstLines(result.stderr || result.stdout, 20),
    recoveryStatePath: recoveryStatePath(home)
  };
}

function windowsScriptPath(home: string): string {
  return path.join(monitorLogsDir(home), "install-monitor.ps1");
}

function psString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function quoteWindowsArg(value: string): string {
  return `"${value.replaceAll("\"", "\\\"")}"`;
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
