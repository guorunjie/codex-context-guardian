import test from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "../src/cli.ts";

test("parses handoff command flags", () => {
  const parsed = parseArgs(["handoff", "--thread", "abc", "--json"]);
  assert.equal(parsed.command, "handoff");
  assert.equal(parsed.flags.thread, "abc");
  assert.equal(parsed.flags.json, true);
});
