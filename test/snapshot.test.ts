import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeSnapshot } from "../src/snapshot.ts";

test("writes snapshot and redacts obvious secrets", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "guardian-snapshot-"));
  const file = writeSnapshot({
    home,
    phase: "precompact",
    payload: {
      token: "secret-token",
      nested: {
        apiKey: "secret-api-key"
      },
      safe: "visible"
    }
  });
  const snapshot = JSON.parse(fs.readFileSync(file, "utf8"));

  assert.equal(snapshot.phase, "precompact");
  assert.equal(snapshot.payload.token, "[redacted]");
  assert.equal(snapshot.payload.nested.apiKey, "[redacted]");
  assert.equal(snapshot.payload.safe, "visible");
});

test("uses session_id from hook payload as the source thread id", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "relay-baton-snapshot-session-"));
  const file = writeSnapshot({
    home,
    phase: "precompact",
    payload: {
      session_id: "thread-from-hook"
    }
  });

  assert.match(path.basename(file), /^thread-from-hook-/);
});
