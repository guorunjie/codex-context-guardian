import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { formatDiagnose, runDiagnose } from "../src/diagnose.ts";

test("diagnose explains skipped compact signals and non-tty monitor failures", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "relay-baton-diagnose-"));
  createThreadDb(home);
  createLogsDb(home);
  fs.mkdirSync(path.join(home, "relay-baton", "logs"), { recursive: true });
  fs.writeFileSync(path.join(home, "relay-baton", "recovery-state.json"), JSON.stringify({
    lastSeenLogId: 1000,
    threads: {
      "thread-1": {
        lastRecoveryAt: Date.now(),
        consecutiveRecoveries: 3,
        lastLogId: 10,
        lastFailureLogId: 10,
        fallbackAttempts: 2,
        forkHandoffCreated: true,
        lastRecoveryError: "interactive Codex recovery requires a TTY",
        manualHandoffRequired: true
      }
    }
  }, null, 2));
  fs.writeFileSync(path.join(home, "relay-baton", "logs", "monitor.err.log"), "Error: stdin is not a terminal\n");

  const report = await runDiagnose({
    home,
    threadId: "thread-1",
    lookbackMs: 60 * 60 * 1000
  });

  assert.equal(report.threadId, "thread-1");
  assert.equal(report.logs.signal?.kind, "compact_failed");
  assert.equal(report.logs.signalSkippedByLastSeen, true);
  assert.equal(report.activity.present, false);
  assert.equal(report.runtime.monitorHasTtyErrors, true);
  assert.match(report.whyNotRescued.join("\n"), /lastSeenLogId/);
  assert.match(report.whyNotRescued.join("\n"), /no lifecycle hook activity/);
  assert.match(formatDiagnose(report), /Why not rescued/);
});

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
    values ('thread-1', 'Recover RPA task', '/tmp/project', 'gpt-5.5', 'openai', 123, 456, 0);
  `;
  const result = spawnSync("sqlite3", [db, sql], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

function createLogsDb(home: string): void {
  const db = path.join(home, "logs_2.sqlite");
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
    values (10, ${Date.now()}, 'ERROR', 'codex_core::compact_remote',
      'remote compaction failed: stream disconnected before completion: error sending request for url (https://chatgpt.com/backend-api/codex/responses/compact)',
      'thread-1');
  `;
  const result = spawnSync("sqlite3", [db, sql], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}
