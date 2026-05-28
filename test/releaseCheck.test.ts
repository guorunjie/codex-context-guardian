import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { evaluateReleaseReadiness, formatReleaseReadiness, type CommandRunner } from "../src/releaseCheck.ts";

test("evaluates offline release readiness", () => {
  const root = makeReleaseFixture("1.2.3");
  const readiness = evaluateReleaseReadiness({
    root,
    runner: cleanGitRunner
  });

  assert.equal(readiness.ok, true);
  assert.equal(readiness.packageName, "codex-relay-baton-guardian");
  assert.equal(readiness.version, "1.2.3");
  assert.equal(readiness.tag, "v1.2.3");
  assert.equal(readiness.online, false);
  assert.equal(readiness.v1, false);
  assert.equal(readiness.checks.every((check) => check.status !== "fail"), true);
  assert.match(formatReleaseReadiness(readiness), /Run relay-baton release check --online/);
});

test("online release readiness surfaces npm publication blockers", () => {
  const root = makeReleaseFixture("1.2.3");
  const readiness = evaluateReleaseReadiness({
    root,
    online: true,
    runner: fakeOnlineRunner({
      npmAuth: false,
      npmPublished: false
    })
  });

  assert.equal(readiness.ok, false);
  assert.equal(readiness.checks.find((check) => check.name === "npm auth")?.status, "fail");
  assert.equal(readiness.checks.find((check) => check.name === "npm package version")?.status, "fail");
  assert.match(readiness.nextActions.join("\n"), /npm adduser/);
  assert.match(readiness.nextActions.join("\n"), /npm publish/);
});

test("online release readiness inspects the CI workflow instead of the latest manual run", () => {
  const root = makeReleaseFixture("1.2.3");
  const calls: string[] = [];
  const timeouts: number[] = [];
  const runner = fakeOnlineRunner({
    npmAuth: true,
    npmPublished: true
  });
  const readiness = evaluateReleaseReadiness({
    root,
    online: true,
    runner: (command, args = [], options) => {
      calls.push([command, ...args].join(" "));
      if (options?.timeoutMs) timeouts.push(options.timeoutMs);
      return runner(command, args, options);
    }
  });

  assert.equal(readiness.checks.find((check) => check.name === "latest GitHub CI")?.status, "pass");
  assert.ok(calls.includes("gh run list --workflow CI --limit 1 --json headSha,conclusion,status"));
  assert.ok(timeouts.some((timeout) => timeout >= 60_000));
});

test("online release readiness includes command failure details", () => {
  const root = makeReleaseFixture("1.2.3");
  const readiness = evaluateReleaseReadiness({
    root,
    online: true,
    runner: (command, args = [], options) => {
      const joined = [command, ...args].join(" ");
      if (joined === "git status --short") return { status: 0, stdout: "", stderr: "" };
      if (joined === "git rev-parse HEAD") return { status: 0, stdout: "abc123\n", stderr: "" };
      if (joined.startsWith("gh release view")) return { status: 1, stdout: "", stderr: "network timeout" };
      if (joined.startsWith("gh run list")) return { status: 1, stdout: "", stderr: "proxy denied" };
      if (joined === "npm whoami") return { status: 0, stdout: "maintainer\n", stderr: "" };
      if (joined.startsWith("npm view")) return { status: 1, stdout: "", stderr: "E404" };
      return cleanGitRunner(command, args, options);
    }
  });

  assert.match(readiness.checks.find((check) => check.name === "GitHub release")?.detail || "", /network timeout/);
  assert.match(readiness.checks.find((check) => check.name === "latest GitHub CI")?.detail || "", /proxy denied/);
});

test("v1 release readiness surfaces evidence blockers", () => {
  const root = makeReleaseFixture("1.2.3");
  const readiness = evaluateReleaseReadiness({
    root,
    v1: true,
    runner: cleanGitRunner
  });

  assert.equal(readiness.ok, false);
  assert.equal(readiness.v1, true);
  assert.equal(readiness.checks.find((check) => check.name === "v1 online release gate")?.status, "fail");
  assert.equal(readiness.checks.find((check) => check.name === "real recovery case study")?.status, "fail");
  assert.equal(readiness.checks.find((check) => check.name === "public visual demo")?.status, "fail");
  assert.match(readiness.nextActions.join("\n"), /real compact-failure recovery/);
});

test("v1 host validation reports must be platform-matched and healthy", () => {
  const root = makeReleaseFixture("1.2.3");
  fs.mkdirSync(path.join(root, "docs", "assets"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "assets", "relay-baton-demo.png"), "png");
  fs.writeFileSync(path.join(root, "docs", "case-study-codex-compact-failure.md"), "Evidence status: complete\n");

  writeHostReport(root, "macos", { os: "darwin" });
  writeHostReport(root, "linux", { os: "darwin" });
  writeHostReport(root, "windows", { os: "win32", monitorLoaded: false });

  const readiness = evaluateReleaseReadiness({
    root,
    v1: true,
    online: true,
    runner: fakeOnlineRunner({
      npmAuth: true,
      npmPublished: true
    })
  });

  assert.equal(readiness.ok, false);
  assert.equal(readiness.checks.find((check) => check.name === "macOS host validation report")?.status, "pass");
  assert.equal(readiness.checks.find((check) => check.name === "Linux host validation report")?.status, "fail");
  assert.match(readiness.checks.find((check) => check.name === "Linux host validation report")?.detail || "", /platform\.os must be linux/);
  assert.equal(readiness.checks.find((check) => check.name === "Windows host validation report")?.status, "fail");
  assert.match(readiness.checks.find((check) => check.name === "Windows host validation report")?.detail || "", /summary\.monitorLoaded must be true/);

  writeHostReport(root, "linux", { os: "linux" });
  writeHostReport(root, "windows", { os: "win32" });
  const fixed = evaluateReleaseReadiness({
    root,
    v1: true,
    online: true,
    runner: fakeOnlineRunner({
      npmAuth: true,
      npmPublished: true
    })
  });

  assert.equal(fixed.ok, true);
});

function makeReleaseFixture(version: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "relay-baton-release-"));
  fs.mkdirSync(path.join(root, "dist"), { recursive: true });
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.mkdirSync(path.join(root, ".github", "workflows"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({
    name: "codex-relay-baton-guardian",
    version,
    bin: {
      "relay-baton": "bin/relay-baton.js"
    }
  }, null, 2));
  fs.writeFileSync(path.join(root, "package-lock.json"), JSON.stringify({
    name: "codex-relay-baton-guardian",
    version,
    packages: {
      "": {
        name: "codex-relay-baton-guardian",
        version
      }
    }
  }, null, 2));
  fs.writeFileSync(path.join(root, "CHANGELOG.md"), `# Changelog\n\n## ${version} - 2026-05-28\n\n- Ready.\n`);
  fs.writeFileSync(path.join(root, "dist", "cli.js"), "console.log('ok');\n");
  fs.writeFileSync(path.join(root, "README.md"), [
    "npm install -g github:guorunjie/codex-relay-baton-guardian",
    "npm install -g codex-relay-baton-guardian"
  ].join("\n"));
  fs.writeFileSync(path.join(root, "docs", "v1-upgrade-roadmap.md"), "# v1\n");
  fs.writeFileSync(path.join(root, "docs", "v1-launch-audit.md"), [
    "# v1 Launch Audit",
    "## Requirement Matrix",
    "## Stable CLI Surface",
    "doctor recover validate host",
    "## v1.0 Blockers",
    "## Evidence Pack For Release Notes"
  ].join("\n"));
  fs.writeFileSync(path.join(root, "docs", "competitive-analysis.md"), "# Competitive\n");
  fs.writeFileSync(path.join(root, "docs", "validation-report-guide.md"), "# Validation Report Guide\n");
  fs.mkdirSync(path.join(root, ".github", "ISSUE_TEMPLATE"), { recursive: true });
  fs.writeFileSync(path.join(root, ".github", "ISSUE_TEMPLATE", "bug_report.md"), [
    "relay-baton validate host",
    "VALIDATION_REPORT.json",
    "relay-baton audit"
  ].join("\n"));
  fs.writeFileSync(path.join(root, ".github", "workflows", "ci.yml"), [
    "os: [ubuntu-latest, macos-latest, windows-latest]",
    "Smoke test packed CLI",
    "npm publish --dry-run"
  ].join("\n"));
  fs.writeFileSync(path.join(root, ".github", "workflows", "publish-npm.yml"), [
    "workflow_dispatch:",
    "npm publish --provenance",
    "NODE_AUTH_TOKEN"
  ].join("\n"));
  fs.writeFileSync(path.join(root, ".github", "workflows", "host-validation.yml"), [
    "workflow_dispatch:",
    "runs-on: ${{ matrix.os }}",
    "ubuntu-latest",
    "windows-latest",
    "relay-baton validate host",
    "actions/upload-artifact"
  ].join("\n"));
  return root;
}

function writeHostReport(
  root: string,
  platform: "macos" | "linux" | "windows",
  options: {
    os: NodeJS.Platform;
    schemaVersion?: number;
    ok?: boolean;
    doctorOk?: boolean;
    monitorInstalled?: boolean;
    monitorLoaded?: boolean;
  }
): void {
  const reportDir = path.join(root, "docs", "validation-reports", platform);
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, "VALIDATION_REPORT.json"), JSON.stringify({
    schemaVersion: options.schemaVersion ?? 1,
    platform: {
      os: options.os
    },
    summary: {
      ok: options.ok ?? true,
      doctorOk: options.doctorOk ?? true,
      monitorInstalled: options.monitorInstalled ?? true,
      monitorLoaded: options.monitorLoaded ?? true
    }
  }, null, 2));
}

const cleanGitRunner: CommandRunner = (command) => {
  if (command === "git") return { status: 0, stdout: "", stderr: "" };
  return { status: 1, stdout: "", stderr: "unexpected command" };
};

function fakeOnlineRunner(options: { npmAuth: boolean; npmPublished: boolean }): CommandRunner {
  return (command, args = []) => {
    const joined = [command, ...args].join(" ");
    if (joined === "git status --short") return { status: 0, stdout: "", stderr: "" };
    if (joined === "git rev-parse HEAD") return { status: 0, stdout: "abc123\n", stderr: "" };
    if (joined.startsWith("gh release view")) return { status: 0, stdout: "{}", stderr: "" };
    if (joined.startsWith("gh run list")) {
      return {
        status: 0,
        stdout: JSON.stringify([{ headSha: "abc123", status: "completed", conclusion: "success" }]),
        stderr: ""
      };
    }
    if (joined === "npm whoami") {
      return options.npmAuth
        ? { status: 0, stdout: "maintainer\n", stderr: "" }
        : { status: 1, stdout: "", stderr: "ENEEDAUTH" };
    }
    if (joined.startsWith("npm view")) {
      return options.npmPublished
        ? { status: 0, stdout: "1.2.3\n", stderr: "" }
        : { status: 1, stdout: "", stderr: "E404" };
    }
    return { status: 1, stdout: "", stderr: `unexpected command: ${joined}` };
  };
}
