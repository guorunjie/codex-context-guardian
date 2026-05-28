import test from "node:test";
import assert from "node:assert/strict";
import {
  canRecoverThread,
  normalizeThreadState,
  recordDesktopHandoff,
  recordForkHandoff,
  type GuardianRecoveryState
} from "../src/recoveryState.ts";

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

test("records fork handoff and blocks duplicate source recovery", () => {
  const state: GuardianRecoveryState = {
    lastSeenLogId: 0,
    threads: {}
  };

  recordForkHandoff(state, "source-1", 99, 2000, {
    bundleDir: "/tmp/fork-bundle"
  });

  const threadState = normalizeThreadState(state.threads["source-1"]);
  assert.equal(threadState.forkHandoffCreated, true);
  assert.equal(threadState.lastForkHandoffBundleDir, "/tmp/fork-bundle");
  assert.equal(state.lastSeenLogId, 99);
  assert.deepEqual(canRecoverThread(state, "source-1", 1_000_000, {
    cooldownMs: 1,
    maxConsecutiveRecoveries: 10
  }), { ok: false, reason: "fork handoff already created" });
});
