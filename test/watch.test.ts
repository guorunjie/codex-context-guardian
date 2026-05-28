import test from "node:test";
import assert from "node:assert/strict";
import { chooseAutoRecoveryStrategy } from "../src/watch.ts";
import type { GuardianRecoveryState } from "../src/recoveryState.ts";

test("auto recovery uses fallback model before fork handoff", () => {
  const state: GuardianRecoveryState = {
    lastSeenLogId: 0,
    threads: {
      "thread-1": {
        lastRecoveryAt: 0,
        consecutiveRecoveries: 0,
        lastLogId: 0,
        fallbackAttempts: 0
      }
    }
  };

  assert.equal(chooseAutoRecoveryStrategy(state, "thread-1", { fallbackAttempts: 2, autoDestination: "fork" }), "fallback-model");
  state.threads["thread-1"].fallbackAttempts = 1;
  assert.equal(chooseAutoRecoveryStrategy(state, "thread-1", { fallbackAttempts: 2, autoDestination: "fork" }), "fallback-model");
  state.threads["thread-1"].fallbackAttempts = 2;
  assert.equal(chooseAutoRecoveryStrategy(state, "thread-1", { fallbackAttempts: 2, autoDestination: "fork" }), "fork");
});

test("auto recovery can still route final handoff to cli new session", () => {
  const state: GuardianRecoveryState = {
    lastSeenLogId: 0,
    threads: {
      "thread-1": {
        lastRecoveryAt: 0,
        consecutiveRecoveries: 0,
        lastLogId: 0,
        fallbackAttempts: 2
      }
    }
  };

  assert.equal(chooseAutoRecoveryStrategy(state, "thread-1", { fallbackAttempts: 2, autoDestination: "cli" }), "new-session");
});

test("auto recovery skips fallback and uses last healthy fork for context overflow", () => {
  const state: GuardianRecoveryState = {
    lastSeenLogId: 0,
    threads: {
      "thread-1": {
        lastRecoveryAt: 0,
        consecutiveRecoveries: 0,
        lastLogId: 0,
        fallbackAttempts: 0
      }
    }
  };

  assert.equal(chooseAutoRecoveryStrategy(state, "thread-1", {
    fallbackAttempts: 2,
    autoDestination: "fork",
    signal: {
      kind: "context_overflow",
      confidence: "high",
      reason: "Codex ran out of room"
    }
  }), "last-healthy-fork");
});
