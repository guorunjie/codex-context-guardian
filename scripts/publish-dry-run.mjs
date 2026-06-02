#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const packageJsonPath = path.join(root, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const packageName = packageJson.name;
const version = packageJson.version;
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const spawnOptions = {
  cwd: root,
  shell: process.platform === "win32"
};

const view = spawnSync(npmCommand, ["view", `${packageName}@${version}`, "version"], {
  ...spawnOptions,
  encoding: "utf8"
});

if (view.error) {
  console.error(`Failed to run ${npmCommand} view: ${view.error.message}`);
  process.exit(1);
}

if (view.status === 0 && view.stdout.trim() === version) {
  console.log(JSON.stringify({
    ok: true,
    skipped: true,
    reason: "version_already_published",
    package: packageName,
    version,
    detail: "Skipping npm publish --dry-run because this exact version already exists on the registry."
  }, null, 2));
  process.exit(0);
}

const publish = spawnSync(npmCommand, ["publish", "--dry-run", "--json"], {
  ...spawnOptions,
  stdio: "inherit"
});

if (publish.error) {
  console.error(`Failed to run ${npmCommand} publish --dry-run: ${publish.error.message}`);
  process.exit(1);
}

process.exit(publish.status ?? 1);
