import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { installHooks } from "../src/hooks.ts";

test("installs compact hooks and avoids duplicates", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "guardian-hooks-"));
  const first = installHooks({ home, guardianBin: "/tmp/guardian.js" });
  const second = installHooks({ home, guardianBin: "/tmp/guardian.js" });
  const hooks = JSON.parse(fs.readFileSync(path.join(home, "hooks.json"), "utf8"));

  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.equal(hooks.hooks.PreCompact.length, 1);
  assert.equal(hooks.hooks.PostCompact.length, 1);
  assert.match(hooks.hooks.PreCompact[0].hooks[0].command, /precompact/);
});
