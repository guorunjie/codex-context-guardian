import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeDemoBundle } from "../src/demo.ts";

test("writes auditable demo bundle", () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-baton-demo-"));
  const result = writeDemoBundle({ outputDir });

  assert.equal(result.bundleDir, outputDir);
  assert.equal(result.audit.ok, true);
  assert.equal(fs.existsSync(path.join(outputDir, "HANDOFF_MEMORY.json")), true);
  assert.equal(fs.existsSync(path.join(outputDir, "RECENT_THREAD_CONTEXT.md")), true);
  assert.equal(fs.existsSync(path.join(outputDir, "RECOVERY.md")), true);
});
