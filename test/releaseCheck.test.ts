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
  fs.writeFileSync(path.join(root, "docs", "competitive-analysis.md"), "# Competitive\n");
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
  return root;
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
