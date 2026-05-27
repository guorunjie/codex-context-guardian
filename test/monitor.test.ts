import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildMonitorPlist } from "../src/monitor.ts";

test("builds LaunchAgent plist for desktop auto monitor", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "guardian-monitor-home-"));
  const result = buildMonitorPlist({
    home,
    nodeBin: "/usr/local/bin/node",
    guardianBin: "/repo/bin/guardian.js"
  });

  assert.match(result.plist, /com\.codex-context-guardian\.monitor/);
  assert.match(result.plist, /<string>watch<\/string>/);
  assert.match(result.plist, /<string>--auto<\/string>/);
  assert.match(result.plist, /<string>--desktop<\/string>/);
  assert.match(result.plist, /<string>--goal-mode<\/string>/);
  assert.match(result.stdoutPath, /monitor\.out\.log$/);
  assert.match(result.stderrPath, /monitor\.err\.log$/);
});
