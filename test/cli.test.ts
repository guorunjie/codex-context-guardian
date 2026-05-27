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
