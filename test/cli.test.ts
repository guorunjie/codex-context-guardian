import test from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "../src/cli.ts";

test("parses flags and positional args", () => {
  const parsed = parseArgs(["recover", "--thread", "abc", "--dry-run", "--strategy=auto", "extra"]);
  assert.equal(parsed.command, "recover");
  assert.equal(parsed.flags.thread, "abc");
  assert.equal(parsed.flags.dryRun, true);
  assert.equal(parsed.flags.strategy, "auto");
  assert.deepEqual(parsed.positional, ["extra"]);
});

test("parses desktop handoff mode flags", () => {
  const parsed = parseArgs([
    "handoff",
    "--thread",
    "thread-1",
    "--desktop",
    "--plan-mode",
    "--goal-mode",
    "--goal",
    "continue the task",
    "--goal-budget",
    "50000"
  ]);
  assert.equal(parsed.command, "handoff");
  assert.equal(parsed.flags.thread, "thread-1");
  assert.equal(parsed.flags.desktop, true);
  assert.equal(parsed.flags.planMode, true);
  assert.equal(parsed.flags.goalMode, true);
  assert.equal(parsed.flags.goal, "continue the task");
  assert.equal(parsed.flags.goalBudget, "50000");
});

test("parses monitor command flags", () => {
  const parsed = parseArgs(["monitor", "install", "--dry-run", "--home", "/tmp/codex-home"]);
  assert.equal(parsed.command, "monitor");
  assert.deepEqual(parsed.positional, ["install"]);
  assert.equal(parsed.flags.dryRun, true);
  assert.equal(parsed.flags.home, "/tmp/codex-home");
});
