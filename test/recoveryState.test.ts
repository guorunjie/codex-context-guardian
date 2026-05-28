import test from "node:test";
import assert from "node:assert/strict";
import { normalizeThreadState, recordDesktopHandoff, type GuardianRecoveryState } from "../src/recoveryState.ts";

test("records desktop handoff quality and bundle metadata", () => {
  const state: GuardianRecoveryState = {
    lastSeenLogId: 0,
    threads: {}
  };

  recordDesktopHandoff(state, "source-1", 42, 1000, "desktop-1", {
    bundleDir: "/tmp/bundle",
    qualityScore: 90,
    qualityOk: true
  });

  const threadState = normalizeThreadState(state.threads["source-1"]);
  assert.equal(threadState.desktopHandoffCreated, true);
  assert.equal(threadState.lastDesktopHandoffThreadId, "desktop-1");
  assert.equal(threadState.lastDesktopHandoffBundleDir, "/tmp/bundle");
  assert.equal(threadState.lastDesktopHandoffQualityScore, 90);
  assert.equal(threadState.lastDesktopHandoffQualityOk, true);
  assert.equal(state.lastSeenLogId, 42);
});
