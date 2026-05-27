import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeRecoveryBundle } from "../src/bundle.ts";

test("writes recovery bundle with selected project files", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "guardian-bundle-home-"));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "guardian-bundle-project-"));
  fs.mkdirSync(path.join(project, "src"));
  fs.writeFileSync(path.join(project, "README.md"), "# Demo\n");
  fs.writeFileSync(path.join(project, "src", "index.ts"), "console.log('ok');\n");

  const dir = writeRecoveryBundle({
    home,
    projectRoot: project,
    thread: {
      id: "thread-1",
      title: "Demo",
      cwd: project,
      model: "gpt-5.5",
      modelProvider: "openai",
      tokensUsed: 10,
      updatedAt: 20
    },
    signal: {
      kind: "compact_failed",
      confidence: "medium",
      reason: "test"
    },
    prompt: "continue task"
  });

  assert.equal(fs.existsSync(path.join(dir, "RECOVERY.md")), true);
  assert.match(fs.readFileSync(path.join(dir, "project-files.txt"), "utf8"), /README\.md/);
  assert.match(fs.readFileSync(path.join(dir, "selected-files.md"), "utf8"), /console\.log/);
});
