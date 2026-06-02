import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDesktopHandoffPrompt,
  buildThreadForkParams,
  buildTurnStartParams,
  defaultDesktopTitle,
  defaultGoalObjective
} from "../src/appServer.ts";

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

test("app-server fork params default to excludeTurns for lightweight branch recovery", () => {
  const params = buildThreadForkParams({
    sourceThreadId: "source-thread",
    cwd: "/tmp/work",
    model: "gpt-5.5",
    prompt: "Recover",
    title: "Relay"
  });

  assert.equal(params.threadId, "source-thread");
  assert.equal(params.cwd, "/tmp/work");
  assert.equal(params.model, "gpt-5.5");
  assert.equal(params.excludeTurns, true);
  assert.deepEqual(params.runtimeWorkspaceRoots, ["/tmp/work"]);
  assert.equal(params.approvalPolicy, "never");
});

test("app-server turn/start params carry the recovery prompt and workspace", () => {
  const params = buildTurnStartParams({
    threadId: "fork-thread",
    cwd: "/tmp/work",
    model: "gpt-5.5",
    prompt: "Read HANDOFF_MEMORY.json first."
  });

  assert.equal(params.threadId, "fork-thread");
  assert.equal(params.cwd, "/tmp/work");
  assert.equal(params.model, "gpt-5.5");
  assert.deepEqual(params.runtimeWorkspaceRoots, ["/tmp/work"]);
  assert.equal((params.input as Array<{ text: string }>)[0].text, "Read HANDOFF_MEMORY.json first.");
});
