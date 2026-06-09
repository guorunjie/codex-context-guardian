import fs from "node:fs";
import path from "node:path";
import { runCommand, type CommandResult } from "./exec.ts";

const ONLINE_GITHUB_TIMEOUT_MS = 60_000;
const ONLINE_NPM_TIMEOUT_MS = 30_000;

export type ReleaseCheckStatus = "pass" | "fail" | "warn";

export type ReleaseCheck = {
  name: string;
  status: ReleaseCheckStatus;
  detail: string;
};

export type ReleaseReadiness = {
  ok: boolean;
  packageName: string;
  version: string;
  tag: string;
  online: boolean;
  v1: boolean;
  checks: ReleaseCheck[];
  nextActions: string[];
};

export type CommandRunner = (command: string, args?: string[], options?: {
  cwd?: string;
  timeoutMs?: number;
}) => CommandResult;

export function evaluateReleaseReadiness(options: {
  root?: string;
  online?: boolean;
  v1?: boolean;
  runner?: CommandRunner;
} = {}): ReleaseReadiness {
  const root = path.resolve(options.root || process.cwd());
  const online = options.online === true;
  const v1 = options.v1 === true;
  const runner = options.runner || runCommand;
  const packageJson = readJson(path.join(root, "package.json"));
  const packageName = stringField(packageJson, "name") || "unknown";
  const version = stringField(packageJson, "version") || "0.0.0";
  const tag = `v${version}`;
  const checks: ReleaseCheck[] = [];

  add(checks, "package metadata", packageName === "codex-relay-baton-guardian" && version !== "0.0.0", `${packageName}@${version}`);

  const bin = isObject(packageJson.bin) ? packageJson.bin : {};
  add(checks, "primary CLI bin", typeof bin["relay-baton"] === "string",
    typeof bin["relay-baton"] === "string" ? `relay-baton -> ${bin["relay-baton"]}` : "relay-baton bin missing");
  add(checks, "npm-safe bin paths", npmSafeBinPaths(bin), binPathDetail(bin));

  const lock = readJson(path.join(root, "package-lock.json"));
  add(checks, "package-lock version", stringField(lock, "version") === version,
    `package-lock version: ${stringField(lock, "version") || "missing"}`);

  const changelog = readText(path.join(root, "CHANGELOG.md"));
  add(checks, "changelog entry", changelog.includes(`## ${version} -`) || changelog.includes(`## ${version}`),
    `CHANGELOG.md ${changelog.includes(version) ? "mentions" : "does not mention"} ${version}`);

  add(checks, "built CLI", fs.existsSync(path.join(root, "dist", "cli.js")),
    fs.existsSync(path.join(root, "dist", "cli.js")) ? "dist/cli.js exists" : "run npm run build");

  const readme = readText(path.join(root, "README.md"));
  add(checks, "README install commands",
    readme.includes("github:guorunjie/codex-relay-baton-guardian") && readme.includes("npm install -g codex-relay-baton-guardian"),
    "README documents GitHub and npm install paths");

  add(checks, "v1 roadmap", fs.existsSync(path.join(root, "docs", "v1-upgrade-roadmap.md")), "docs/v1-upgrade-roadmap.md");
  const launchAudit = readText(path.join(root, "docs", "v1-launch-audit.md"));
  add(checks, "v1 launch audit",
    launchAudit.includes("Requirement Matrix") && launchAudit.includes("v1.0 Blockers") && launchAudit.includes("Evidence Pack For Release Notes"),
    "docs/v1-launch-audit.md should list requirements, blockers, and release evidence");
  add(checks, "competitive analysis", fs.existsSync(path.join(root, "docs", "competitive-analysis.md")), "docs/competitive-analysis.md");
  add(checks, "validation report guide", fs.existsSync(path.join(root, "docs", "validation-report-guide.md")), "docs/validation-report-guide.md");

  const bugTemplate = readText(path.join(root, ".github", "ISSUE_TEMPLATE", "bug_report.md"));
  add(checks, "support intake template",
    bugTemplate.includes("VALIDATION_REPORT.json") && bugTemplate.includes("relay-baton validate host") && bugTemplate.includes("relay-baton audit"),
    "bug reports should request validation reports, bundle audit output, and logs");

  const ci = readText(path.join(root, ".github", "workflows", "ci.yml"));
  add(checks, "cross-platform CI matrix",
    hasLinuxRunner(ci) && hasMacosRunner(ci) && hasWindowsRunner(ci) && ci.includes("Smoke test packed CLI"),
    "CI should test Linux, macOS, Windows, and packed CLI smoke");

  const scripts = isObject(packageJson.scripts) ? packageJson.scripts : {};
  const publishDryRunScript = typeof scripts["publish:dry-run"] === "string" ? scripts["publish:dry-run"] : "";
  const publishDryRunHelper = readText(path.join(root, "scripts", "publish-dry-run.mjs"));
  add(checks, "publish dry-run CI",
    ci.includes("npm run publish:dry-run")
      && publishDryRunScript.includes("publish-dry-run")
      && publishDryRunHelper.includes("npm")
      && publishDryRunHelper.includes("publish")
      && publishDryRunHelper.includes("--dry-run"),
    "CI should run a version-aware npm publish --dry-run before release");

  const publishWorkflow = readText(path.join(root, ".github", "workflows", "publish-npm.yml"));
  add(checks, "npm publish workflow",
    publishWorkflow.includes("workflow_dispatch") && publishWorkflow.includes("npm publish --provenance") && publishWorkflow.includes("NODE_AUTH_TOKEN"),
    ".github/workflows/publish-npm.yml should publish manually with provenance and NPM_TOKEN");

  const hostValidationWorkflow = readText(path.join(root, ".github", "workflows", "host-validation.yml"));
  add(checks, "host validation workflow",
    hostValidationWorkflow.includes("workflow_dispatch")
      && hostValidationWorkflow.includes("relay-baton validate host")
      && hostValidationWorkflow.includes("actions/upload-artifact")
      && hasLinuxRunner(hostValidationWorkflow)
      && hasWindowsRunner(hostValidationWorkflow),
    ".github/workflows/host-validation.yml should collect host validation artifacts on Linux and Windows");

  const gitStatus = runner("git", ["status", "--short"], { cwd: root, timeoutMs: 5000 });
  if (gitStatus.status === 0) {
    add(checks, "git worktree clean", gitStatus.stdout.trim().length === 0, gitStatus.stdout.trim() || "clean");
  } else {
    checks.push({ name: "git worktree clean", status: "warn", detail: "not a git checkout or git unavailable" });
  }

  if (online) addOnlineChecks(checks, root, packageName, version, tag, runner);
  if (v1) addV1Checks(checks, root, online);

  return {
    ok: checks.every((check) => check.status !== "fail"),
    packageName,
    version,
    tag,
    online,
    v1,
    checks,
    nextActions: nextActions(checks, online)
  };
}

export function formatReleaseReadiness(readiness: ReleaseReadiness): string {
  const lines = [
    `Release readiness: ${readiness.ok ? "ok" : "needs attention"}`,
    `package: ${readiness.packageName}@${readiness.version}`,
    `tag: ${readiness.tag}`,
    `online checks: ${readiness.online ? "enabled" : "disabled"}`,
    `v1 checks: ${readiness.v1 ? "enabled" : "disabled"}`,
    "",
    "Checks:"
  ];
  for (const check of readiness.checks) lines.push(`${label(check.status)} ${check.name}: ${check.detail}`);
  if (readiness.nextActions.length > 0) {
    lines.push("", "Next actions:");
    for (const action of readiness.nextActions) lines.push(`- ${action}`);
  }
  return lines.join("\n");
}

function addOnlineChecks(
  checks: ReleaseCheck[],
  root: string,
  packageName: string,
  version: string,
  tag: string,
  runner: CommandRunner
): void {
  const head = runner("git", ["rev-parse", "HEAD"], { cwd: root, timeoutMs: 5000 });
  const headSha = head.status === 0 ? head.stdout.trim() : "";

  const ghRelease = runner("gh", ["release", "view", tag, "--json", "tagName,targetCommitish,url,assets"], { cwd: root, timeoutMs: ONLINE_GITHUB_TIMEOUT_MS });
  add(checks, "GitHub release", ghRelease.status === 0, ghRelease.status === 0 ? `${tag} exists` : commandFailureDetail(ghRelease, `missing ${tag}`));
  if (ghRelease.status === 0) {
    const releaseTarget = releaseTargetCommitish(ghRelease.stdout);
    add(checks, "GitHub release target", releaseTarget === headSha,
      releaseTarget ? `${tag} targets ${releaseTarget}` : `could not parse ${tag} targetCommitish`);
    const releaseAssets = releaseAssetNames(ghRelease.stdout);
    add(checks, "GitHub release assets",
      releaseAssets.includes(`${packageName}-${version}.tgz`) && releaseAssets.includes("SHA256SUMS"),
      releaseAssets.length > 0 ? releaseAssets.join(", ") : `${tag} has no downloadable release assets`);
  } else {
    checks.push({ name: "GitHub release target", status: "fail", detail: `missing ${tag}` });
    checks.push({ name: "GitHub release assets", status: "fail", detail: `missing ${tag}` });
  }

  const ci = runner("gh", ["run", "list", "--workflow", "CI", "--limit", "1", "--json", "headSha,conclusion,status"], { cwd: root, timeoutMs: ONLINE_GITHUB_TIMEOUT_MS });
  let ciDetail = commandFailureDetail(ci, "unable to inspect latest CI");
  let ciOk = false;
  if (ci.status === 0) {
    try {
      const runs = JSON.parse(ci.stdout) as Array<{ headSha?: string; conclusion?: string; status?: string }>;
      const latest = runs[0];
      ciOk = latest?.headSha === headSha && latest?.status === "completed" && latest?.conclusion === "success";
      ciDetail = latest ? `${latest.status || "unknown"} ${latest.conclusion || ""} @ ${latest.headSha || "unknown"}`.trim() : "no CI runs";
    } catch {
      ciDetail = "could not parse gh run list";
    }
  }
  add(checks, "latest GitHub CI", ciOk, ciDetail);

  const npmPackage = runner("npm", ["view", `${packageName}@${version}`, "version"], { cwd: root, timeoutMs: ONLINE_NPM_TIMEOUT_MS });
  const npmPublished = npmPackage.status === 0 && npmPackage.stdout.trim() === version;
  add(checks, "npm package version", npmPublished,
    npmPackage.status === 0 ? `registry version ${npmPackage.stdout.trim()}` : commandFailureDetail(npmPackage, `${packageName}@${version} not published`));

  const npmAuth = runner("npm", ["whoami"], { cwd: root, timeoutMs: ONLINE_NPM_TIMEOUT_MS });
  if (npmAuth.status === 0) {
    add(checks, "npm auth", true, `logged in as ${npmAuth.stdout.trim()}`);
  } else if (npmPublished) {
    checks.push({
      name: "npm auth",
      status: "warn",
      detail: "not logged in; published registry version already matches, auth is only needed for the next npm publish"
    });
  } else {
    add(checks, "npm auth", false, "not logged in; run npm adduser");
  }
}

function addV1Checks(checks: ReleaseCheck[], root: string, online: boolean): void {
  add(checks, "v1 online release gate", online,
    online ? "online checks enabled" : "run relay-baton release check --v1 --online before v1.0");

  const caseStudy = readText(path.join(root, "docs", "case-study-codex-compact-failure.md"));
  add(checks, "real recovery case study",
    caseStudy.includes("Evidence status: complete"),
    caseStudy.includes("Evidence status:")
      ? "case study has explicit evidence status"
      : "case study needs real compact-failure evidence status");

  add(checks, "public visual demo", hasVisualDemo(root),
    "docs/assets/relay-baton-demo.gif, .mp4, or .png should exist before v1.0");
  const macosReport = hostValidationReportStatus(root, "macos");
  add(checks, "macOS host validation report", macosReport.ok, macosReport.detail);
  const linuxReport = hostValidationReportStatus(root, "linux");
  add(checks, "Linux host validation report", linuxReport.ok, linuxReport.detail);
  const windowsReport = hostValidationReportStatus(root, "windows");
  add(checks, "Windows host validation report", windowsReport.ok, windowsReport.detail);

  const audit = readText(path.join(root, "docs", "v1-launch-audit.md"));
  add(checks, "stable CLI surface",
    audit.includes("Stable CLI Surface") && audit.includes("doctor") && audit.includes("recover") && audit.includes("validate host"),
    "docs/v1-launch-audit.md should document stable v1 commands and experimental boundaries");
}

function nextActions(checks: ReleaseCheck[], online: boolean): string[] {
  const actions: string[] = [];
  for (const check of checks.filter((item) => item.status === "fail")) {
    if (check.name === "built CLI") actions.push("Run npm run build before packaging.");
    else if (check.name === "git worktree clean") actions.push("Commit or stash local changes before cutting a release.");
    else if (check.name === "GitHub release") actions.push("Create the matching GitHub Release after CI passes.");
    else if (check.name === "GitHub release target") actions.push("Move the GitHub Release tag to the exact commit being published, or bump the package version and create a new release.");
    else if (check.name === "GitHub release assets") actions.push("Upload the npm tarball and SHA256SUMS to the matching GitHub Release.");
    else if (check.name === "latest GitHub CI") actions.push("Wait for the latest GitHub CI run to pass on the current commit.");
    else if (check.name === "npm-safe bin paths") actions.push("Use npm-normalized bin paths such as bin/relay-baton.js.");
    else if (check.name === "publish dry-run CI") actions.push("Add a version-aware npm publish --dry-run script to CI.");
    else if (check.name === "npm publish workflow") actions.push("Add a manual npm publish workflow using NODE_AUTH_TOKEN.");
    else if (check.name === "host validation workflow") actions.push("Add a manual host validation workflow that uploads Linux and Windows validation artifacts.");
    else if (check.name === "v1 launch audit") actions.push("Add docs/v1-launch-audit.md with requirement evidence and blockers.");
    else if (check.name === "support intake template") actions.push("Update bug reports to request validation reports and bundle audit output.");
    else if (check.name === "npm auth") actions.push("Log in with npm adduser before publishing to the registry.");
    else if (check.name === "npm package version") actions.push("Publish the package with npm publish after authentication.");
    else if (check.name === "validation report guide") actions.push("Add docs/validation-report-guide.md with collection and redaction instructions.");
    else if (check.name === "v1 online release gate") actions.push("Run relay-baton release check --v1 --online before tagging v1.0.");
    else if (check.name === "real recovery case study") actions.push("Record one redacted real compact-failure recovery and mark its case-study evidence status complete.");
    else if (check.name === "public visual demo") actions.push("Add a short demo GIF, video, or screenshot sequence under docs/assets before v1.0.");
    else if (check.name.endsWith("host validation report")) actions.push(`Attach a real ${check.name.replace(" host validation report", "")} VALIDATION_REPORT.json before v1.0.`);
    else if (check.name === "stable CLI surface") actions.push("Document the stable v1 CLI surface and experimental boundaries in docs/v1-launch-audit.md.");
    else actions.push(`Fix failed check: ${check.name}.`);
  }
  if (!online) actions.push("Run relay-baton release check --online before declaring v1.0 distribution complete.");
  return [...new Set(actions)];
}

function add(checks: ReleaseCheck[], name: string, ok: boolean, detail: string): void {
  checks.push({ name, status: ok ? "pass" : "fail", detail });
}

function commandFailureDetail(result: CommandResult, fallback: string): string {
  const detail = (result.stderr || result.stdout).trim();
  return detail || fallback;
}

function releaseTargetCommitish(stdout: string): string {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    if (isObject(parsed) && typeof parsed.targetCommitish === "string") return parsed.targetCommitish;
  } catch {
    // Keep the caller-facing failure in the release check detail.
  }
  return "";
}

function releaseAssetNames(stdout: string): string[] {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    if (!isObject(parsed) || !Array.isArray(parsed.assets)) return [];
    return parsed.assets
      .map((asset) => isObject(asset) && typeof asset.name === "string" ? asset.name : "")
      .filter((name) => name.length > 0);
  } catch {
    return [];
  }
}

function label(status: ReleaseCheckStatus): string {
  if (status === "pass") return "OK ";
  if (status === "warn") return "WARN";
  return "FAIL";
}

function npmSafeBinPaths(bin: Record<string, unknown>): boolean {
  const values = Object.values(bin);
  return values.length > 0 && values.every((value) => typeof value === "string" && !value.startsWith("./") && !path.isAbsolute(value));
}

function binPathDetail(bin: Record<string, unknown>): string {
  const entries = Object.entries(bin);
  if (entries.length === 0) return "no bin entries";
  return entries.map(([name, value]) => `${name} -> ${String(value)}`).join(", ");
}

function hasLinuxRunner(workflow: string): boolean {
  return /\bubuntu-(?:latest|\d{2}\.\d{2})\b/.test(workflow);
}

function hasMacosRunner(workflow: string): boolean {
  return /\bmacos-(?:latest|\d+(?:-[A-Za-z0-9]+)*)\b/.test(workflow);
}

function hasWindowsRunner(workflow: string): boolean {
  return /\bwindows-(?:latest|\d{4}(?:-[A-Za-z0-9]+)*)\b/.test(workflow);
}

function hasVisualDemo(root: string): boolean {
  const assetsDir = path.join(root, "docs", "assets");
  return [".gif", ".mp4", ".png"].some((extension) => fs.existsSync(path.join(assetsDir, `relay-baton-demo${extension}`)));
}

function hostValidationReportStatus(root: string, platform: "macos" | "linux" | "windows"): { ok: boolean; detail: string } {
  const file = path.join(root, "docs", "validation-reports", platform, "VALIDATION_REPORT.json");
  if (!fs.existsSync(file)) return { ok: false, detail: file };
  const report = readJson(file);
  const expectedOs = platform === "macos" ? "darwin" : platform === "windows" ? "win32" : "linux";
  const platformInfo = isObject(report.platform) ? report.platform : {};
  const summary = isObject(report.summary) ? report.summary : {};
  const failures: string[] = [];
  if (Number(report.schemaVersion) !== 1) failures.push("schemaVersion must be 1");
  if (platformInfo.os !== expectedOs) failures.push(`platform.os must be ${expectedOs}`);
  if (summary.ok !== true) failures.push("summary.ok must be true");
  if (summary.doctorOk !== true) failures.push("summary.doctorOk must be true");
  if (summary.monitorInstalled !== true) failures.push("summary.monitorInstalled must be true");
  if (summary.monitorLoaded !== true) failures.push("summary.monitorLoaded must be true");
  return failures.length === 0
    ? { ok: true, detail: `${file} proves ${expectedOs} host health and monitor loaded` }
    : { ok: false, detail: `${file}: ${failures.join("; ")}` };
}

function readJson(file: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function readText(file: string): string {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function stringField(value: Record<string, unknown>, field: string): string | undefined {
  return typeof value[field] === "string" ? value[field] : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
