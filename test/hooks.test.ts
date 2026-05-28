import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { installHooks } from "../src/hooks.ts";

test("installs lifecycle hooks and avoids duplicates", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "guardian-hooks-"));
  const first = installHooks({ home, guardianBin: "/tmp/guardian.js" });
  const second = installHooks({ home, guardianBin: "/tmp/guardian.js" });
  const hooks = JSON.parse(fs.readFileSync(path.join(home, "hooks.json"), "utf8"));

  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.equal(hooks.hooks.SessionStart.length, 1);
  assert.equal(hooks.hooks.UserPromptSubmit.length, 1);
  assert.equal(hooks.hooks.PreToolUse.length, 1);
  assert.equal(hooks.hooks.PostToolUse.length, 1);
  assert.equal(hooks.hooks.Stop.length, 1);
  assert.equal(hooks.hooks.PreCompact.length, 1);
  assert.equal(hooks.hooks.PostCompact.length, 1);
  assert.match(hooks.hooks.PreCompact[0].hooks[0].command, /precompact/);
  assert.match(hooks.hooks.UserPromptSubmit[0].hooks[0].command, /user-prompt-submit/);
});

test("replaces legacy guardian compact hooks during lifecycle install", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "relay-baton-hooks-legacy-"));
  fs.writeFileSync(path.join(home, "hooks.json"), JSON.stringify({
    hooks: {
      PreCompact: [{
        hooks: [{
          type: "command",
          command: "node '/repo/bin/guardian.js' hook --phase precompact"
        }]
      }]
    }
  }, null, 2));

  installHooks({ home, guardianBin: "/repo/bin/relay-baton.js" });
  const hooks = JSON.parse(fs.readFileSync(path.join(home, "hooks.json"), "utf8"));
  const commands = hooks.hooks.PreCompact.flatMap((entry: any) => entry.hooks.map((hook: any) => hook.command));

  assert.equal(commands.some((command: string) => command.includes("bin/guardian.js")), false);
  assert.equal(commands.some((command: string) => command.includes("bin/relay-baton.js")), true);
});
