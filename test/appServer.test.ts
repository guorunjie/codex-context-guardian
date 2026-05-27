import test from "node:test";
import assert from "node:assert/strict";
import { buildDesktopHandoffPrompt, defaultDesktopTitle, defaultGoalObjective } from "../src/appServer.ts";

test("builds desktop handoff prompt with source and bundle", () => {
  const prompt = buildDesktopHandoffPrompt({
    sourceThreadId: "thread-1",
    sourceTitle: "Original task",
    bundleDir: "/tmp/bundle",
    cwd: "/tmp/work",
    prompt: "Recover this task."
  });
  assert.match(prompt, /Desktop-visible continuation/);
  assert.match(prompt, /Source thread: thread-1/);
  assert.match(prompt, /Recovery bundle: \/tmp\/bundle/);
  assert.match(prompt, /HANDOFF_MEMORY\.json/);
  assert.match(prompt, /Do not revive directions listed as superseded/);
  assert.match(prompt, /Recover this task\./);
});

test("default desktop title is capped and prefixed", () => {
  const title = defaultDesktopTitle("a".repeat(200));
  assert.equal(title.startsWith("接力："), true);
  assert.equal(title.length, 80);
});

test("default goal objective includes source context", () => {
  const objective = defaultGoalObjective({
    sourceTitle: "确认影刀RPA编辑能力",
    sourceThreadId: "thread-xyz"
  });
  assert.match(objective, /确认影刀RPA编辑能力/);
  assert.match(objective, /thread-xyz/);
});
