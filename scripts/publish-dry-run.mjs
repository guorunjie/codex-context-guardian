#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const packageJsonPath = path.join(root, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const packageName = packageJson.name;
const version = packageJson.version;

const view = spawnSync("npm", ["view", `${packageName}@${version}`, "version"], {
  cwd: root,
  encoding: "utf8"
});

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

const publish = spawnSync("npm", ["publish", "--dry-run", "--json"], {
  cwd: root,
  stdio: "inherit"
});

process.exit(publish.status ?? 1);
