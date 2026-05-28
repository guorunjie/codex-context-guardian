import fs from "node:fs";
import path from "node:path";
import { runCommand, type CommandResult } from "./exec.ts";

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
  runner?: CommandRunner;
} = {}): ReleaseReadiness {
  const root = path.resolve(options.root || process.cwd());
  const online = options.online === true;
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
  add(checks, "competitive analysis", fs.existsSync(path.join(root, "docs", "competitive-analysis.md")), "docs/competitive-analysis.md");

  const ci = readText(path.join(root, ".github", "workflows", "ci.yml"));
  add(checks, "cross-platform CI matrix",
    ci.includes("ubuntu-latest") && ci.includes("macos-latest") && ci.includes("windows-latest") && ci.includes("Smoke test packed CLI"),
    "CI should test Linux, macOS, Windows, and packed CLI smoke");

  const gitStatus = runner("git", ["status", "--short"], { cwd: root, timeoutMs: 5000 });
  if (gitStatus.status === 0) {
    add(checks, "git worktree clean", gitStatus.stdout.trim().length === 0, gitStatus.stdout.trim() || "clean");
  } else {
    checks.push({ name: "git worktree clean", status: "warn", detail: "not a git checkout or git unavailable" });
  }

  if (online) addOnlineChecks(checks, root, packageName, version, tag, runner);

  return {
    ok: checks.every((check) => check.status !== "fail"),
    packageName,
    version,
    tag,
    online,
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

  const ghRelease = runner("gh", ["release", "view", tag, "--json", "tagName,targetCommitish,url"], { cwd: root, timeoutMs: 15_000 });
  add(checks, "GitHub release", ghRelease.status === 0, ghRelease.status === 0 ? `${tag} exists` : `missing ${tag}`);

  const ci = runner("gh", ["run", "list", "--limit", "1", "--json", "headSha,conclusion,status"], { cwd: root, timeoutMs: 15_000 });
  let ciDetail = "unable to inspect latest CI";
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

  const npmAuth = runner("npm", ["whoami"], { cwd: root, timeoutMs: 15_000 });
  add(checks, "npm auth", npmAuth.status === 0, npmAuth.status === 0 ? `logged in as ${npmAuth.stdout.trim()}` : "not logged in; run npm adduser");

  const npmPackage = runner("npm", ["view", `${packageName}@${version}`, "version"], { cwd: root, timeoutMs: 15_000 });
  add(checks, "npm package version", npmPackage.status === 0 && npmPackage.stdout.trim() === version,
    npmPackage.status === 0 ? `registry version ${npmPackage.stdout.trim()}` : `${packageName}@${version} not published`);
}

function nextActions(checks: ReleaseCheck[], online: boolean): string[] {
  const actions: string[] = [];
  for (const check of checks.filter((item) => item.status === "fail")) {
    if (check.name === "built CLI") actions.push("Run npm run build before packaging.");
    else if (check.name === "git worktree clean") actions.push("Commit or stash local changes before cutting a release.");
    else if (check.name === "GitHub release") actions.push("Create the matching GitHub Release after CI passes.");
    else if (check.name === "latest GitHub CI") actions.push("Wait for the latest GitHub CI run to pass on the current commit.");
    else if (check.name === "npm auth") actions.push("Log in with npm adduser before publishing to the registry.");
    else if (check.name === "npm package version") actions.push("Publish the package with npm publish after authentication.");
    else actions.push(`Fix failed check: ${check.name}.`);
  }
  if (!online) actions.push("Run relay-baton release check --online before declaring v1.0 distribution complete.");
  return [...new Set(actions)];
}

function add(checks: ReleaseCheck[], name: string, ok: boolean, detail: string): void {
  checks.push({ name, status: ok ? "pass" : "fail", detail });
}

function label(status: ReleaseCheckStatus): string {
  if (status === "pass") return "OK ";
  if (status === "warn") return "WARN";
  return "FAIL";
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
