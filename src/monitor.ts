import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { codexHome, monitorLogsDir, recoveryStatePath } from "./paths.ts";
import { runCommand } from "./exec.ts";

export const MONITOR_LABEL = "com.relay-baton.monitor";
export const WINDOWS_TASK_NAME = "RelayBatonMonitor";
export const LINUX_SERVICE_NAME = "relay-baton-monitor.service";

export type MonitorInstallResult = {
  label: string;
  plistPath: string;
  launcherPath?: string;
  stdoutPath: string;
  stderrPath: string;
  pathEnv?: string;
  codexBin?: string;
  changed: boolean;
  plist: string;
  launcher?: string;
  detail?: string;
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

export function linuxServicePath(): string {
  return path.join(os.homedir(), ".config", "systemd", "user", LINUX_SERVICE_NAME);
}

export function buildMonitorPlist(options: {
  home?: string;
  nodeBin: string;
  guardianBin: string;
  codexBin?: string;
  pathEnv?: string;
}): MonitorInstallResult {
  const home = options.home || codexHome();
  const logsDir = monitorLogsDir(home);
  const stdoutPath = path.join(logsDir, "monitor.out.log");
  const stderrPath = path.join(logsDir, "monitor.err.log");
  const pathEnv = buildLaunchPath({
    nodeBin: options.nodeBin,
    codexBin: options.codexBin,
    basePath: options.pathEnv || process.env.PATH || ""
  });
  const args = [
    options.nodeBin,
    options.guardianBin,
    "watch",
    "--auto",
    "--fork",
    "--queue-only",
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
    <key>PATH</key>
    <string>${escapeXml(pathEnv)}</string>
    <key>GUARDIAN_CODEX_BIN</key>
    <string>${escapeXml(options.codexBin || "codex")}</string>
  </dict>
</dict>
</plist>
`;
  return {
    label: MONITOR_LABEL,
    plistPath: monitorPlistPath(),
    stdoutPath,
    stderrPath,
    pathEnv,
    codexBin: options.codexBin,
    changed: true,
    plist,
    platform: "darwin"
  };
}

export function buildWindowsMonitorScript(options: {
  home?: string;
  nodeBin: string;
  guardianBin: string;
  codexBin?: string;
  pathEnv?: string;
}): MonitorInstallResult {
  const home = options.home || codexHome();
  const logsDir = monitorLogsDir(home);
  const stdoutPath = path.join(logsDir, "monitor.out.log");
  const stderrPath = path.join(logsDir, "monitor.err.log");
  const launcherPath = windowsLauncherPath(home);
  const pathEnv = buildLaunchPath({
    nodeBin: options.nodeBin,
    codexBin: options.codexBin,
    basePath: options.pathEnv || process.env.PATH || ""
  });
  const argument = [
    quoteWindowsArg(options.guardianBin),
    "watch",
    "--auto",
    "--fork",
    "--queue-only",
    "--goal-mode",
    "--home",
    quoteWindowsArg(home)
  ].join(" ");
  const launcher = [
    "@echo off",
    `set "PATH=${pathEnv}"`,
    `set "GUARDIAN_CODEX_BIN=${options.codexBin || "codex"}"`,
    `${quoteWindowsArg(options.nodeBin)} ${argument} >> ${quoteWindowsArg(stdoutPath)} 2>> ${quoteWindowsArg(stderrPath)}`
  ].join("\r\n");
  const taskRun = `cmd.exe /d /c ${quoteWindowsArg(launcherPath)}`;
  const script = `$ErrorActionPreference = "Stop"
$launcherPath = ${psString(launcherPath)}
$launcher = @'
${launcher}
'@
Set-Content -LiteralPath $launcherPath -Value $launcher -Encoding ASCII
schtasks.exe /Create /TN ${psString(WINDOWS_TASK_NAME)} /SC MINUTE /MO 1 /TR ${psString(taskRun)} /F | Out-Null
if ($LASTEXITCODE -ne 0) { throw "schtasks.exe /Create failed with exit code $LASTEXITCODE" }
`;
  return {
    label: WINDOWS_TASK_NAME,
    plistPath: windowsScriptPath(home),
    launcherPath,
    stdoutPath,
    stderrPath,
    pathEnv,
    codexBin: options.codexBin,
    changed: true,
    plist: script,
    launcher,
    platform: "win32"
  };
}

export function buildLinuxMonitorService(options: {
  home?: string;
  nodeBin: string;
  guardianBin: string;
  codexBin?: string;
  pathEnv?: string;
}): MonitorInstallResult {
  const home = options.home || codexHome();
  const logsDir = monitorLogsDir(home);
  const stdoutPath = path.join(logsDir, "monitor.out.log");
  const stderrPath = path.join(logsDir, "monitor.err.log");
  const pathEnv = buildLaunchPath({
    nodeBin: options.nodeBin,
    codexBin: options.codexBin,
    basePath: options.pathEnv || process.env.PATH || ""
  });
  const args = [
    options.guardianBin,
    "watch",
    "--auto",
    "--fork",
    "--queue-only",
    "--goal-mode",
    "--home",
    home
  ];
  const service = `[Unit]
Description=Relay Baton Codex recovery monitor
After=default.target

[Service]
Type=simple
Environment="CODEX_HOME=${systemdEscape(home)}"
Environment="PATH=${systemdEscape(pathEnv)}"
Environment="GUARDIAN_CODEX_BIN=${systemdEscape(options.codexBin || "codex")}"
ExecStart=${systemdQuote(options.nodeBin)} ${args.map(systemdQuote).join(" ")}
Restart=always
RestartSec=5
StandardOutput=append:${stdoutPath}
StandardError=append:${stderrPath}

[Install]
WantedBy=default.target
`;
  return {
    label: LINUX_SERVICE_NAME,
    plistPath: linuxServicePath(),
    stdoutPath,
    stderrPath,
    pathEnv,
    codexBin: options.codexBin,
    changed: true,
    plist: service,
    platform: "linux"
  };
}

export function installMonitor(options: {
  home?: string;
  nodeBin: string;
  guardianBin: string;
  codexBin?: string;
  dryRun?: boolean;
}): MonitorInstallResult {
  if (process.platform === "win32") return installWindowsMonitor(options);
  if (process.platform === "linux") return installLinuxMonitor(options);
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
  if (process.platform === "linux") return uninstallLinuxMonitor();
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
  if (process.platform === "linux") return startLinuxMonitor();
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
  if (process.platform === "linux") return stopLinuxMonitor();
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
  if (process.platform === "linux") return linuxMonitorStatus(home);
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
  codexBin?: string;
  dryRun?: boolean;
}): MonitorInstallResult {
  const result = buildWindowsMonitorScript(options);
  const existing = fs.existsSync(result.plistPath) ? fs.readFileSync(result.plistPath, "utf8") : "";
  result.changed = existing !== result.plist;
  if (options.dryRun) return result;
  fs.mkdirSync(path.dirname(result.plistPath), { recursive: true });
  fs.mkdirSync(path.dirname(result.stdoutPath), { recursive: true });
  if (result.changed) fs.writeFileSync(result.plistPath, result.plist);
  const install = runCommand("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", result.plistPath], { timeoutMs: 15_000 });
  result.detail = install.stderr || install.stdout;
  return result;
}

function installLinuxMonitor(options: {
  home?: string;
  nodeBin: string;
  guardianBin: string;
  codexBin?: string;
  dryRun?: boolean;
}): MonitorInstallResult {
  const result = buildLinuxMonitorService(options);
  const existing = fs.existsSync(result.plistPath) ? fs.readFileSync(result.plistPath, "utf8") : "";
  result.changed = existing !== result.plist;
  if (options.dryRun) return result;
  fs.mkdirSync(path.dirname(result.plistPath), { recursive: true });
  fs.mkdirSync(path.dirname(result.stdoutPath), { recursive: true });
  if (result.changed) fs.writeFileSync(result.plistPath, result.plist);
  runCommand("systemctl", ["--user", "daemon-reload"], { timeoutMs: 10_000 });
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

function windowsLauncherPath(home: string): string {
  return path.join(monitorLogsDir(home), "run-monitor.cmd");
}

function uninstallLinuxMonitor(): { label: string; plistPath: string; removed: boolean; stopDetail: string } {
  const stopResult = stopLinuxMonitor();
  const servicePath = linuxServicePath();
  const removed = fs.existsSync(servicePath);
  if (removed) fs.unlinkSync(servicePath);
  runCommand("systemctl", ["--user", "daemon-reload"], { timeoutMs: 10_000 });
  return {
    label: LINUX_SERVICE_NAME,
    plistPath: servicePath,
    removed,
    stopDetail: stopResult.detail
  };
}

function startLinuxMonitor(): { label: string; plistPath: string; ok: boolean; detail: string } {
  const servicePath = linuxServicePath();
  const reload = runCommand("systemctl", ["--user", "daemon-reload"], { timeoutMs: 10_000 });
  const result = runCommand("systemctl", ["--user", "enable", "--now", LINUX_SERVICE_NAME], { timeoutMs: 10_000 });
  return {
    label: LINUX_SERVICE_NAME,
    plistPath: servicePath,
    ok: result.status === 0,
    detail: result.stderr || result.stdout || reload.stderr || reload.stdout || "started"
  };
}

function stopLinuxMonitor(): { label: string; plistPath: string; ok: boolean; detail: string } {
  const servicePath = linuxServicePath();
  const result = runCommand("systemctl", ["--user", "disable", "--now", LINUX_SERVICE_NAME], { timeoutMs: 10_000 });
  return {
    label: LINUX_SERVICE_NAME,
    plistPath: servicePath,
    ok: result.status === 0,
    detail: result.stderr || result.stdout || "stopped"
  };
}

function linuxMonitorStatus(home?: string): MonitorStatus {
  const servicePath = linuxServicePath();
  const active = runCommand("systemctl", ["--user", "is-active", LINUX_SERVICE_NAME], { timeoutMs: 5000 });
  const status = runCommand("systemctl", ["--user", "status", LINUX_SERVICE_NAME, "--no-pager"], { timeoutMs: 5000 });
  return {
    label: LINUX_SERVICE_NAME,
    plistPath: servicePath,
    installed: fs.existsSync(servicePath),
    loaded: active.status === 0,
    detail: firstLines(status.stdout || status.stderr || active.stdout || active.stderr, 20),
    recoveryStatePath: recoveryStatePath(home)
  };
}

function psString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function quoteWindowsArg(value: string): string {
  return `"${value.replaceAll("\"", "\\\"")}"`;
}

function systemdQuote(value: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value;
  return `"${systemdEscape(value)}"`;
}

function systemdEscape(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
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

function buildLaunchPath(options: {
  nodeBin: string;
  codexBin?: string;
  basePath: string;
}): string {
  const candidates = [
    path.dirname(options.nodeBin),
    options.codexBin && options.codexBin.includes(path.sep) ? path.dirname(options.codexBin) : "",
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
    ...options.basePath.split(path.delimiter)
  ];
  const seen = new Set<string>();
  return candidates
    .filter(Boolean)
    .filter((entry) => {
      if (seen.has(entry)) return false;
      seen.add(entry);
      return true;
    })
    .join(path.delimiter);
}

function firstLines(text: string, count: number): string {
  return text.split("\n").slice(0, count).join("\n").trim();
}
