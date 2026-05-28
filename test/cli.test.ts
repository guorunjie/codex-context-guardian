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

test("parses global help without treating it as a command", () => {
  const parsed = parseArgs(["--help"]);
  assert.equal(parsed.command, "");
  assert.equal(parsed.flags.help, true);
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

test("parses status command and follow repair", () => {
  const status = parseArgs(["status", "--json"]);
  assert.equal(status.command, "status");
  assert.equal(status.flags.json, true);

  const repair = parseArgs(["follow", "repair", "--dry-run"]);
  assert.equal(repair.command, "follow");
  assert.deepEqual(repair.positional, ["repair"]);
  assert.equal(repair.flags.dryRun, true);
});

test("parses audit command", () => {
  const parsed = parseArgs(["audit", "/tmp/bundle", "--json"]);
  assert.equal(parsed.command, "audit");
  assert.deepEqual(parsed.positional, ["/tmp/bundle"]);
  assert.equal(parsed.flags.json, true);
});

test("parses demo command", () => {
  const parsed = parseArgs(["demo", "--output", "/tmp/demo", "--json"]);
  assert.equal(parsed.command, "demo");
  assert.equal(parsed.flags.output, "/tmp/demo");
  assert.equal(parsed.flags.json, true);
});

test("parses release check command", () => {
  const parsed = parseArgs(["release", "check", "--online", "--root", "/tmp/repo", "--json"]);
  assert.equal(parsed.command, "release");
  assert.deepEqual(parsed.positional, ["check"]);
  assert.equal(parsed.flags.online, true);
  assert.equal(parsed.flags.root, "/tmp/repo");
  assert.equal(parsed.flags.json, true);
});
