import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildHandoffMemory, latestGoalObjective, readRecentThreadContext, renderRecentThreadContext } from "../src/threadContext.ts";

test("extracts latest goal and recent rollout messages", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "guardian-rollout-"));
  const rollout = path.join(dir, "thread.jsonl");
  fs.writeFileSync(rollout, [
    JSON.stringify({
      timestamp: "2026-05-28T01:00:00Z",
      type: "event_msg",
      payload: {
        type: "thread_goal_updated",
        goal: {
          objective: "old direction",
          status: "active",
          tokensUsed: 100,
          timeUsedSeconds: 10,
          updatedAt: 1
        }
      }
    }),
    JSON.stringify({
      timestamp: "2026-05-28T01:05:00Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "弃用旧方案，改走方案 B。" }]
      }
    }),
    JSON.stringify({
      timestamp: "2026-05-28T01:10:00Z",
      type: "event_msg",
      payload: {
        type: "thread_goal_updated",
        goal: {
          objective: "方案 B：接力最新任务",
          status: "active",
          tokensUsed: 200,
          timeUsedSeconds: 20,
          updatedAt: 2
        }
      }
    }),
    JSON.stringify({
      timestamp: "2026-05-28T01:20:00Z",
      type: "event_msg",
      payload: {
        type: "turn_aborted",
        reason: "user_interrupted"
      }
    })
  ].join("\n"));

  const context = readRecentThreadContext({
    id: "thread-1",
    rolloutPath: rollout,
    title: "Original title",
    cwd: dir,
    model: "gpt-5.5",
    modelProvider: "openai",
    tokensUsed: 0,
    updatedAt: 0
  });
  const memory = buildHandoffMemory({
    id: "thread-1",
    rolloutPath: rollout,
    title: "Original title",
    cwd: dir,
    model: "gpt-5.5",
    modelProvider: "openai",
    tokensUsed: 0,
    updatedAt: 0
  }, context);
  const rendered = renderRecentThreadContext(context, memory);

  assert.equal(latestGoalObjective(context), "方案 B：接力最新任务");
  assert.equal(memory.schemaVersion, 2);
  assert.equal(memory.latestGoal?.objective, "方案 B：接力最新任务");
  assert.equal(memory.latestGoal?.timestamp, "2026-05-28T01:10:00Z");
  assert.equal(memory.currentTaskState.interrupted, true);
  assert.equal(memory.supersededDirections.length, 1);
  assert.equal(memory.supersededDirections[0].confidence, "high");
  assert.match(rendered, /方案 B：接力最新任务/);
  assert.match(rendered, /弃用旧方案/);
  assert.match(rendered, /Evidence blocks below are source-thread evidence only/);
  assert.match(rendered, /source turn was interrupted/);
});

test("does not treat long implementation specs as superseded directions", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "guardian-rollout-spec-"));
  const rollout = path.join(dir, "thread.jsonl");
  const longPlan = `PLEASE IMPLEMENT THIS PLAN:

## Key Changes

- Add HANDOFF_MEMORY.json and RECENT_THREAD_CONTEXT.md so new sessions do not revive abandoned early plans.

${"details ".repeat(220)}`;
  fs.writeFileSync(rollout, JSON.stringify({
    timestamp: "2026-05-28T02:00:00Z",
    type: "response_item",
    payload: {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: longPlan }]
    }
  }));

  const thread = {
    id: "thread-2",
    rolloutPath: rollout,
    title: "Implementation plan",
    cwd: dir,
    model: "gpt-5.5",
    modelProvider: "openai",
    tokensUsed: 0,
    updatedAt: 0
  };
  const context = readRecentThreadContext(thread);
  const memory = buildHandoffMemory(thread, context);

  assert.equal(memory.supersededDirections.length, 0);
});

test("uses assistant progress after the latest user request as the continuation point", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "guardian-rollout-progress-"));
  const rollout = path.join(dir, "thread.jsonl");
  fs.writeFileSync(rollout, [
    JSON.stringify({
      timestamp: "2026-05-28T03:00:00Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "PLEASE IMPLEMENT THIS PLAN: build the whole handoff memory system." }]
      }
    }),
    JSON.stringify({
      timestamp: "2026-05-28T03:10:00Z",
      type: "event_msg",
      payload: {
        type: "agent_message",
        phase: "commentary",
        message: "已完成 handoff memory 写入。接下来运行 npm test 并更新 README。"
      }
    })
  ].join("\n"));

  const thread = {
    id: "thread-3",
    rolloutPath: rollout,
    title: "Old title",
    cwd: dir,
    model: "gpt-5.5",
    modelProvider: "openai",
    tokensUsed: 0,
    updatedAt: 0
  };
  const context = readRecentThreadContext(thread);
  const memory = buildHandoffMemory(thread, context);
  const rendered = renderRecentThreadContext(context, memory);

  assert.match(memory.latestUserIntent?.summary || "", /PLEASE IMPLEMENT THIS PLAN/);
  assert.match(memory.latestAssistantProgress?.summary || "", /运行 npm test/);
  assert.equal(memory.progressSinceLatestUser.length, 1);
  assert.match(memory.nextAction.summary, /latest assistant progress/);
  assert.doesNotMatch(memory.nextAction.summary, /^PLEASE IMPLEMENT THIS PLAN/);
  assert.match(memory.handoffDirective.summary, /not from the older thread title/);
  assert.match(rendered, /Latest Assistant Progress/);
  assert.match(rendered, /Progress Since Latest User Request/);
});

test("resolves the newest rollout file when thread metadata lacks rolloutPath", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "guardian-rollout-home-"));
  const oldDir = path.join(home, "sessions", "2026", "05", "27");
  const newDir = path.join(home, "sessions", "2026", "05", "28");
  fs.mkdirSync(oldDir, { recursive: true });
  fs.mkdirSync(newDir, { recursive: true });
  const threadId = "thread-4";
  fs.writeFileSync(path.join(oldDir, `rollout-2026-05-27T10-00-00-${threadId}.jsonl`), JSON.stringify({
    timestamp: "2026-05-27T10:00:00Z",
    type: "response_item",
    payload: {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "old rollout" }]
    }
  }));
  fs.writeFileSync(path.join(newDir, `rollout-2026-05-28T10-00-00-${threadId}.jsonl`), JSON.stringify({
    timestamp: "2026-05-28T10:00:00Z",
    type: "response_item",
    payload: {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "new rollout" }]
    }
  }));

  const context = readRecentThreadContext({
    id: threadId,
    title: "Thread without rollout path",
    cwd: home,
    model: "gpt-5.5",
    modelProvider: "openai",
    tokensUsed: 0,
    updatedAt: 0
  }, { home });

  assert.match(context.rolloutPath || "", /2026-05-28/);
  assert.equal(context.messages[0]?.text, "new rollout");
});

test("recent tail keeps the latest real user message as an anchor", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "guardian-rollout-tail-"));
  const rollout = path.join(dir, "thread.jsonl");
  const entries = [{
    timestamp: "2026-05-28T03:00:00Z",
    type: "response_item",
    payload: {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "最新任务：继续实现 Desktop 接力。" }]
    }
  }];
  for (let index = 0; index < 24; index += 1) {
    entries.push({
      timestamp: `2026-05-28T03:${String(index + 1).padStart(2, "0")}:00Z`,
      type: "event_msg",
      payload: {
        type: "agent_message",
        phase: "commentary",
        message: `progress ${index}`
      }
    });
  }
  fs.writeFileSync(rollout, entries.map((entry) => JSON.stringify(entry)).join("\n"));

  const thread = {
    id: "thread-3",
    rolloutPath: rollout,
    title: "Tail anchor",
    cwd: dir,
    model: "gpt-5.5",
    modelProvider: "openai",
    tokensUsed: 0,
    updatedAt: 0
  };
  const context = readRecentThreadContext(thread);
  const memory = buildHandoffMemory(thread, context);

  assert.match(memory.latestUserIntent?.summary || "", /最新任务/);
  assert.equal(memory.recentTail.length, 10);
  assert.equal(memory.recentTail[0].role, "user");
  assert.match(memory.recentTail[0].text, /最新任务/);
  assert.match(memory.recentTail.at(-1)?.text || "", /progress 23/);
});

test("turn_aborted response markers do not replace the latest real user intent", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "guardian-rollout-aborted-marker-"));
  const rollout = path.join(dir, "thread.jsonl");
  fs.writeFileSync(rollout, [
    JSON.stringify({
      timestamp: "2026-05-28T04:00:00Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "继续完成方案 B 的内置浏览器后台。" }]
      }
    }),
    JSON.stringify({
      timestamp: "2026-05-28T04:01:00Z",
      type: "event_msg",
      payload: {
        type: "agent_message",
        phase: "commentary",
        message: "已经开始检查 git 状态，下一步核对当前文件。"
      }
    }),
    JSON.stringify({
      timestamp: "2026-05-28T04:02:00Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "<turn_aborted></turn_aborted>" }]
      }
    }),
    JSON.stringify({
      timestamp: "2026-05-28T04:02:01Z",
      type: "event_msg",
      payload: {
        type: "turn_aborted",
        reason: "interrupted"
      }
    })
  ].join("\n"));

  const thread = {
    id: "thread-4",
    rolloutPath: rollout,
    title: "Interrupted marker",
    cwd: dir,
    model: "gpt-5.5",
    modelProvider: "openai",
    tokensUsed: 0,
    updatedAt: 0
  };
  const context = readRecentThreadContext(thread);
  const memory = buildHandoffMemory(thread, context);

  assert.match(memory.latestUserIntent?.summary || "", /方案 B/);
  assert.equal(memory.currentTaskState.interrupted, true);
  assert.equal(memory.recentTail[0].role, "user");
  assert.match(memory.recentTail[0].text, /方案 B/);
  assert.equal(memory.recentTail.at(-1)?.role, "system");
});
