import test from "node:test";
import assert from "node:assert/strict";
import { chooseAutoRecoveryStrategy } from "../src/watch.ts";
import type { GuardianRecoveryState } from "../src/recoveryState.ts";

test("auto recovery uses fallback model before desktop handoff", () => {
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

  assert.equal(chooseAutoRecoveryStrategy(state, "thread-1", { fallbackAttempts: 2 }), "fallback-model");
  state.threads["thread-1"].fallbackAttempts = 1;
  assert.equal(chooseAutoRecoveryStrategy(state, "thread-1", { fallbackAttempts: 2 }), "fallback-model");
  state.threads["thread-1"].fallbackAttempts = 2;
  assert.equal(chooseAutoRecoveryStrategy(state, "thread-1", { fallbackAttempts: 2 }), "new-session");
});
