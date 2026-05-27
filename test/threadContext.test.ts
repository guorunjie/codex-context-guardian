import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { latestGoalObjective, readRecentThreadContext, renderRecentThreadContext } from "../src/threadContext.ts";

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
  const rendered = renderRecentThreadContext(context);

  assert.equal(latestGoalObjective(context), "方案 B：接力最新任务");
  assert.match(rendered, /方案 B：接力最新任务/);
  assert.match(rendered, /弃用旧方案/);
  assert.match(rendered, /previous turn was interrupted/);
});
