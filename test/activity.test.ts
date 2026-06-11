import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { detectActivityFailure, latestHealthyCheckpoint, loadActivityState, recordActivityEvent } from "../src/activity.ts";

test("records hook activity and tracks compact lifecycle", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "relay-baton-activity-"));

  recordActivityEvent({
    home,
    phase: "user-prompt-submit",
    payload: {
      session_id: "thread-activity",
      turn_id: "turn-1",
      hook_event_name: "UserPromptSubmit",
      cwd: home,
      model: "gpt-5.5"
    }
  });
  recordActivityEvent({
    home,
    phase: "precompact",
    payload: {
      session_id: "thread-activity",
      turn_id: "turn-1",
      hook_event_name: "PreCompact"
    }
  });
  recordActivityEvent({
    home,
    phase: "postcompact",
    payload: {
      session_id: "thread-activity",
      turn_id: "turn-1",
      hook_event_name: "PostCompact"
    }
  });

  const state = loadActivityState(home);
  const thread = state.threads["thread-activity"];
  assert.equal(thread.threadId, "thread-activity");
  assert.equal(thread.model, "gpt-5.5");
  assert.equal(thread.compactInFlight, false);
  assert.equal(thread.recentEvents.length, 3);
  assert.equal(thread.healthyCheckpoints?.length, 1);
  assert.equal(latestHealthyCheckpoint(state, "thread-activity")?.phase, "postcompact");
  assert.equal(fs.existsSync(path.join(home, "relay-baton", "activity-events.jsonl")), true);
});

test("records stop hooks as healthy checkpoints for last-healthy fork recovery", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "relay-baton-activity-"));

  recordActivityEvent({
    home,
    phase: "stop",
    payload: {
      session_id: "thread-stop",
      turn_id: "turn-healthy",
      hook_event_name: "Stop",
      transcript_path: "/tmp/rollout.jsonl",
      cwd: home,
      model: "gpt-5.5"
    }
  });

  const checkpoint = latestHealthyCheckpoint(loadActivityState(home), "thread-stop");
  assert.equal(checkpoint?.phase, "stop");
  assert.equal(checkpoint?.turnId, "turn-healthy");
  assert.equal(checkpoint?.transcriptPath, "/tmp/rollout.jsonl");
});

test("detects compact stalls from hook activity", () => {
  const now = Date.now();
  const signal = detectActivityFailure({
    schemaVersion: 1,
    updatedAt: now - 300_000,
    threads: {
      "thread-stalled": {
        threadId: "thread-stalled",
        lastEventAt: now - 300_000,
        lastEventName: "PreCompact",
        compactInFlight: true,
        lastCompactStartedAt: now - 300_000,
        recentEvents: []
      }
    }
  }, {
    now,
    compactTimeoutMs: 120_000,
    turnStallMs: 1_800_000
  });

  assert.equal(signal?.kind, "compact_stalled");
  assert.equal(signal?.threadId, "thread-stalled");
});

test("detects long-running turns without stop hooks", () => {
  const now = Date.now();
  const signal = detectActivityFailure({
    schemaVersion: 1,
    updatedAt: now - 3_600_000,
    threads: {
      "thread-turn": {
        threadId: "thread-turn",
        lastEventAt: now - 3_600_000,
        lastEventName: "UserPromptSubmit",
        activeTurnStartedAt: now - 3_600_000,
        recentEvents: []
      }
    }
  }, {
    now,
    compactTimeoutMs: 120_000,
    turnStallMs: 1_800_000
  });

  assert.equal(signal?.kind, "turn_stalled");
  assert.equal(signal?.threadId, "thread-turn");
});

test("does not mark a long-running turn stalled while tool activity is still progressing", () => {
  const now = Date.now();
  const signal = detectActivityFailure({
    schemaVersion: 1,
    updatedAt: now - 60_000,
    threads: {
      "thread-active": {
        threadId: "thread-active",
        lastEventAt: now - 60_000,
        lastEventName: "PostToolUse",
        activeTurnStartedAt: now - 3_600_000,
        recentEvents: []
      }
    }
  }, {
    now,
    compactTimeoutMs: 120_000,
    turnStallMs: 1_800_000,
    turnStallIdleMs: 900_000
  });

  assert.equal(signal, null);
});

test("ignores Relay Baton continuation threads for automatic activity recovery", () => {
  const now = Date.now();
  const signal = detectActivityFailure({
    schemaVersion: 1,
    updatedAt: now - 3_600_000,
    threads: {
      "relay-thread": {
        threadId: "relay-thread",
        title: "接力：查询github中data-analysis-agent项目",
        lastEventAt: now - 3_600_000,
        lastEventName: "UserPromptSubmit",
        activeTurnStartedAt: now - 3_600_000,
        recentEvents: []
      }
    }
  }, {
    now,
    compactTimeoutMs: 120_000,
    turnStallMs: 1_800_000,
    turnStallIdleMs: 900_000
  });

  assert.equal(signal, null);
});
