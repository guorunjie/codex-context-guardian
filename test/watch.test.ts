import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { chooseAutoRecoveryStrategy, resolveRecoveryThreadId } from "../src/watch.ts";
import type { GuardianRecoveryState } from "../src/recoveryState.ts";
import type { ActivityState } from "../src/activity.ts";

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

test("resolves compact failure to newer related activity thread when source already has a handoff", () => {
  const home = makeHome();
  createThreadDb(home);
  const recoveryState: GuardianRecoveryState = {
    lastSeenLogId: 0,
    threads: {
      "source-thread": {
        lastRecoveryAt: 1000,
        consecutiveRecoveries: 3,
        lastLogId: 10,
        lastFailureLogId: 10,
        fallbackAttempts: 2,
        forkHandoffCreated: true
      }
    }
  };
  const activityState: ActivityState = {
    schemaVersion: 1,
    updatedAt: 2000,
    threads: {
      "visible-thread": {
        threadId: "visible-thread",
        title: "Confirm Codex can edit RPA workflows",
        cwd: "/tmp/project-a",
        model: "gpt-5.5",
        lastEventAt: 2000,
        lastEventName: "PreCompact",
        compactInFlight: true,
        recentEvents: []
      }
    }
  };

  assert.equal(resolveRecoveryThreadId({
    kind: "compact_failed",
    confidence: "high",
    reason: "stream disconnected",
    sourceLogId: 11,
    threadId: "source-thread"
  }, activityState, recoveryState, home), "visible-thread");
});

test("keeps source thread when related activity belongs to another cwd", () => {
  const home = makeHome();
  createThreadDb(home);
  const recoveryState: GuardianRecoveryState = {
    lastSeenLogId: 0,
    threads: {}
  };
  const activityState: ActivityState = {
    schemaVersion: 1,
    updatedAt: 2000,
    threads: {
      "other-thread": {
        threadId: "other-thread",
        title: "Confirm Codex can edit RPA workflows",
        cwd: "/tmp/project-b",
        model: "gpt-5.5",
        lastEventAt: 2000,
        lastEventName: "PreCompact",
        compactInFlight: true,
        recentEvents: []
      }
    }
  };

  assert.equal(resolveRecoveryThreadId({
    kind: "compact_failed",
    confidence: "high",
    reason: "stream disconnected",
    sourceLogId: 11,
    threadId: "source-thread"
  }, activityState, recoveryState, home), "source-thread");
});

function makeHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "guardian-watch-test-"));
}

function createThreadDb(home: string): void {
  const db = path.join(home, "state_5.sqlite");
  const sql = `
    create table threads (
      id text primary key,
      title text not null,
      cwd text not null,
      model text,
      model_provider text,
      tokens_used integer not null default 0,
      updated_at integer not null,
      archived integer not null default 0
    );
    insert into threads (id, title, cwd, model, model_provider, tokens_used, updated_at, archived)
    values
      ('source-thread', 'Confirm Codex can edit RPA workflows', '/tmp/project-a', 'gpt-5.5', 'openai', 123, 900, 0),
      ('visible-thread', 'Confirm Codex can edit RPA workflows', '/tmp/project-a', 'gpt-5.5', 'openai', 123, 2000, 0);
  `;
  const result = spawnSync("sqlite3", [db, sql], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}
