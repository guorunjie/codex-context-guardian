import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildMonitorPlist, buildWindowsMonitorScript } from "../src/monitor.ts";

test("builds LaunchAgent plist for fork-first auto monitor", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "guardian-monitor-home-"));
  const result = buildMonitorPlist({
    home,
    nodeBin: "/usr/local/bin/node",
    guardianBin: "/repo/bin/relay-baton.js",
    codexBin: "/opt/homebrew/bin/codex",
    pathEnv: "/usr/bin:/bin"
  });

  assert.match(result.plist, /com\.relay-baton\.monitor/);
  assert.match(result.plist, /<string>watch<\/string>/);
  assert.match(result.plist, /<string>--auto<\/string>/);
  assert.match(result.plist, /<string>--fork<\/string>/);
  assert.match(result.plist, /<string>--goal-mode<\/string>/);
  assert.match(result.plist, /<key>PATH<\/key>/);
  assert.match(result.plist, /\/opt\/homebrew\/bin/);
  assert.match(result.plist, /<key>GUARDIAN_CODEX_BIN<\/key>/);
  assert.match(result.plist, /\/opt\/homebrew\/bin\/codex/);
  assert.match(result.stdoutPath, /monitor\.out\.log$/);
  assert.match(result.stderrPath, /monitor\.err\.log$/);
});

test("builds Windows scheduled task script for fork-first auto monitor", () => {
  const home = "C:\\Users\\me\\.codex";
  const result = buildWindowsMonitorScript({
    home,
    nodeBin: "C:\\Program Files\\nodejs\\node.exe",
    guardianBin: "C:\\repo\\bin\\relay-baton.js",
    codexBin: "C:\\Users\\me\\bin\\codex.cmd",
    pathEnv: "C:\\Windows\\System32"
  });

  assert.match(result.plist, /schtasks\.exe \/Create/);
  assert.match(result.plist, /RelayBatonMonitor/);
  assert.match(result.plist, /--fork/);
  assert.match(result.plist, /--goal-mode/);
  assert.match(result.plist, /monitor\.out\.log/);
  assert.match(result.plist, /monitor\.err\.log/);
  assert.match(result.plist, /GUARDIAN_CODEX_BIN/);
});
