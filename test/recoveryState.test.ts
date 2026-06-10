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

test("records fork handoff and skips only already-covered failures", () => {
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
    maxConsecutiveRecoveries: 10,
    failureLogId: 99
  }), { ok: false, reason: "existing handoff already covers this failure" });
  assert.deepEqual(canRecoverThread(state, "source-1", 1_000_000, {
    cooldownMs: 1,
    maxConsecutiveRecoveries: 10,
    failureLogId: 100
  }), { ok: true });
});

test("allows newer handoff upgrade even when prior recovery count reached limit", () => {
  const state: GuardianRecoveryState = {
    lastSeenLogId: 0,
    threads: {
      "source-1": {
        lastRecoveryAt: 2000,
        consecutiveRecoveries: 3,
        lastLogId: 99,
        lastFailureLogId: 99,
        fallbackAttempts: 2,
        forkHandoffCreated: true
      }
    }
  };

  assert.deepEqual(canRecoverThread(state, "source-1", 2500, {
    cooldownMs: 10_000,
    maxConsecutiveRecoveries: 3,
    failureLogId: 100
  }), { ok: true });
});

test("allows one dedupe-key migration for old handoff state at recovery limit", () => {
  const state: GuardianRecoveryState = {
    lastSeenLogId: 0,
    threads: {
      "source-1": {
        lastRecoveryAt: 2000,
        consecutiveRecoveries: 114,
        lastLogId: 99,
        lastFailureLogId: 99,
        fallbackAttempts: 2,
        queuedHandoffCreated: true
      }
    }
  };

  assert.deepEqual(canRecoverThread(state, "source-1", 2500, {
    cooldownMs: 10_000,
    maxConsecutiveRecoveries: 3,
    failureDedupeKey: "turn_stalled:source-1:123:turn-1"
  }), { ok: true });
});
