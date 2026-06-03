import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { chooseAutoRecoveryStrategy, resolveRecoveryThreadId, tick } from "../src/watch.ts";
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

test("app-server visible recovery skips interactive fallback attempts", () => {
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
    recoveryTransport: "app-server",
    signal: {
      kind: "compact_failed",
      confidence: "high",
      reason: "stream disconnected"
    }
  }), "fork");
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

test("keeps source thread when only cwd matches a different task", () => {
  const home = makeHome();
  createThreadDb(home);
  const recoveryState: GuardianRecoveryState = {
    lastSeenLogId: 0,
    threads: {
      "source-thread": {
        lastRecoveryAt: 1000,
        consecutiveRecoveries: 1,
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
      "other-thread": {
        threadId: "other-thread",
        title: "Publish a marketing website",
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
  }, activityState, recoveryState, home), "source-thread");
});

test("startup backfill queues a recent compact failure below lastSeenLogId without visible relay", async () => {
  const home = makeHome();
  createThreadDb(home);
  createLogsDb(home, 10);
  fs.mkdirSync(path.join(home, "relay-baton"), { recursive: true });
  fs.writeFileSync(path.join(home, "relay-baton", "recovery-state.json"), JSON.stringify({
    lastSeenLogId: 1000,
    threads: {}
  }, null, 2));

  const result = await tick({
    home,
    auto: true,
    dryRun: true,
    fork: true,
    appServer: true,
    backfill: true
  });

  assert.match(result, /recovery queue planned/);
});

test("app-server watch does not create visible relay unless explicitly enabled", async () => {
  const home = makeHome();
  createThreadDb(home);
  createLogsDb(home, 10);

  const result = await tick({
    home,
    auto: true,
    fork: true,
    appServer: true,
    backfill: true
  });

  assert.match(result, /recovery queued/);
  assert.match(result, /visible_relay=false/);
  const state = JSON.parse(fs.readFileSync(path.join(home, "relay-baton", "recovery-state.json"), "utf8"));
  assert.equal(state.threads["source-thread"].queuedHandoffCreated, true);
  assert.equal(Boolean(state.threads["source-thread"].forkHandoffCreated), false);
  assert.equal(state.threads["source-thread"].lastRecoveryTransport, "bundle");
});

test("watch ignores compact logs from archived threads", async () => {
  const home = makeHome();
  createThreadDb(home);
  createLogsDb(home, 10, "archived-thread");

  const result = await tick({
    home,
    auto: true,
    fork: true,
    backfill: true
  });

  assert.equal(result, "no failure signal");
});

test("watch ignores stalled compact activity from archived threads", async () => {
  const home = makeHome();
  createThreadDb(home);
  fs.mkdirSync(path.join(home, "relay-baton"), { recursive: true });
  fs.writeFileSync(path.join(home, "relay-baton", "activity-state.json"), JSON.stringify({
    schemaVersion: 1,
    updatedAt: Date.now() - 10 * 60 * 1000,
    threads: {
      "archived-thread": {
        threadId: "archived-thread",
        title: "Archived RPA task",
        cwd: "/tmp/project-a",
        model: "gpt-5.5",
        lastEventAt: Date.now() - 10 * 60 * 1000,
        lastEventName: "PreCompact",
        compactInFlight: true,
        lastCompactStartedAt: Date.now() - 10 * 60 * 1000,
        recentEvents: []
      }
    }
  }, null, 2));

  const result = await tick({
    home,
    auto: true,
    fork: true,
    backfill: true
  });

  assert.equal(result, "no failure signal");
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
      ('visible-thread', 'Confirm Codex can edit RPA workflows', '/tmp/project-a', 'gpt-5.5', 'openai', 123, 2000, 0),
      ('archived-thread', 'Archived RPA task', '/tmp/project-a', 'gpt-5.5', 'openai', 123, 3000, 1);
  `;
  const result = spawnSync("sqlite3", [db, sql], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

function createLogsDb(home: string, id: number, threadId = "source-thread"): void {
  const db = path.join(home, "logs_2.sqlite");
  const escapedThreadId = threadId.replaceAll("'", "''");
  const sql = `
    create table logs (
      id integer primary key,
      ts integer not null,
      level text not null,
      target text not null,
      feedback_log_body text,
      thread_id text
    );
    insert into logs (id, ts, level, target, feedback_log_body, thread_id)
    values (${id}, ${Date.now()}, 'ERROR', 'codex_core::compact_remote',
      'Error running remote compact task: stream disconnected before completion: error sending request for url (https://chatgpt.com/backend-api/codex/responses/compact)',
      '${escapedThreadId}');
  `;
  const result = spawnSync("sqlite3", [db, sql], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}
