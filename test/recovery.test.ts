import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { buildRecoveryPlan, chooseStrategy } from "../src/recovery.ts";
import type { FailureSignal } from "../src/classifier.ts";

test("chooses fallback model strategy for model compact unsupported", () => {
  const signal: FailureSignal = {
    kind: "model_compact_unsupported",
    confidence: "high",
    reason: "unsupported"
  };
  assert.equal(chooseStrategy("auto", signal, fakeThread()), "fallback-model");
});

test("chooses fork for readable thread on generic compact failure", () => {
  const signal: FailureSignal = {
    kind: "compact_failed",
    confidence: "medium",
    reason: "failed"
  };
  assert.equal(chooseStrategy("auto", signal, fakeThread()), "fork");
});

test("fork recovery carries a structured handoff bundle", () => {
  const home = makeHome();
  createThreadDb(home);
  const plan = buildRecoveryPlan({
    home,
    threadId: "019e6a4a-22e6-7962-862b-cfb5ad04ac41",
    signal: {
      kind: "compact_failed",
      confidence: "high",
      reason: "stream disconnected"
    }
  });

  assert.equal(plan.strategy, "fork");
  assert.ok(plan.bundleDir);
  assert.deepEqual(plan.steps[0].args.slice(0, 2), ["fork", "--model"]);
  assert.match(plan.prompt, /Recovery bundle:/);
  assert.match(plan.prompt, /HANDOFF_MEMORY\.json/);
});

test("fallback model recovery is a two-stage plan", () => {
  const home = makeHome();
  createThreadDb(home);
  fs.writeFileSync(path.join(home, "config.toml"), 'model = "gpt-5.5"\n');
  const plan = buildRecoveryPlan({
    home,
    threadId: "019e6a4a-22e6-7962-862b-cfb5ad04ac41",
    fallbackModel: "gpt-5.4",
    signal: {
      kind: "model_compact_unsupported",
      confidence: "high",
      reason: "unsupported compact"
    }
  });

  assert.equal(plan.strategy, "fallback-model");
  assert.equal(plan.steps.length, 2);
  assert.deepEqual(plan.steps[0].args.slice(0, 4), ["exec", "resume", "--model", "gpt-5.4"]);
  assert.deepEqual(plan.steps[1].args.slice(0, 2), ["resume", "--model"]);
  assert.match(plan.prompt, /Primary model stage/);
});

test("new session is used when no thread can be resolved", () => {
  const plan = buildRecoveryPlan({
    signal: {
      kind: "unknown",
      confidence: "low",
      reason: "no thread"
    },
    primaryModel: "gpt-5.5",
    cwd: "/tmp/example"
  });

  assert.equal(plan.strategy, "new-session");
  assert.ok(plan.bundleDir);
  assert.deepEqual(plan.steps[0].args.slice(0, 4), ["-C", "/tmp/example", "--model", "gpt-5.5"]);
  assert.match(plan.prompt, /Recovery bundle:/);
});

test("recovery plan uses configured codex binary", () => {
  const previous = process.env.GUARDIAN_CODEX_BIN;
  process.env.GUARDIAN_CODEX_BIN = "/opt/example/bin/codex";
  try {
    const plan = buildRecoveryPlan({
      signal: {
        kind: "unknown",
        confidence: "low",
        reason: "no thread"
      },
      primaryModel: "gpt-5.5",
      cwd: "/tmp/example"
    });

    assert.equal(plan.steps[0].command, "/opt/example/bin/codex");
  } finally {
    if (previous === undefined) delete process.env.GUARDIAN_CODEX_BIN;
    else process.env.GUARDIAN_CODEX_BIN = previous;
  }
});

function fakeThread() {
  return {
    id: "thread",
    title: "title",
    cwd: process.cwd(),
    model: "gpt-5.5",
    modelProvider: "openai",
    tokensUsed: 1,
    updatedAt: 1
  };
}

function makeHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "guardian-test-"));
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
    values ('019e6a4a-22e6-7962-862b-cfb5ad04ac41', 'Recover task', '${process.cwd().replaceAll("'", "''")}', 'gpt-5.5', 'openai', 123, 456, 0);
  `;
  const result = spawnSync("sqlite3", [db, sql], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}
