import test from "node:test";
import assert from "node:assert/strict";
import { evaluateHandoffMemory } from "../src/handoffQuality.ts";
import type { HandoffMemory } from "../src/threadContext.ts";

test("blocks handoff memory that only contains turn-aborted intent", () => {
  const quality = evaluateHandoffMemory(memory({
    latestUserIntent: "The user interrupted the previous turn on purpose. Treat the interrupted work as incomplete.",
    latestAssistantProgress: null,
    recentTail: [{
      timestamp: "2026-05-28T01:00:00Z",
      role: "system",
      kind: "turn_aborted",
      text: "The previous turn was interrupted by the user. Reason: interrupted."
    }],
    interrupted: true,
    nextAction: "Inspect git status, git diff, and current files before editing because the source turn was interrupted."
  }));

  assert.equal(quality.ok, false);
  assert.equal(quality.grade, "blocked");
  assert.match(quality.blockers.join("\n"), /turn-aborted marker/);
});

test("accepts handoff memory anchored on latest user intent and assistant progress", () => {
  const quality = evaluateHandoffMemory(memory({
    latestUserIntent: "按照方案 B：Meituan Ops 自己控制内置浏览器开发落地",
    latestAssistantProgress: "我选定下一段迁移：活动报名/报名试点。",
    recentTail: [{
      timestamp: "2026-05-28T01:00:00Z",
      role: "user",
      kind: "message",
      text: "Active goal objective:\n按照方案 B：Meituan Ops 自己控制内置浏览器开发落地"
    }],
    interrupted: true,
    nextAction: "Inspect git status, git diff, and current files before editing, then continue 活动报名/报名试点."
  }));

  assert.equal(quality.ok, true);
  assert.equal(quality.grade, "excellent");
});

function memory(input: {
  latestUserIntent: string | null;
  latestAssistantProgress: string | null;
  recentTail: HandoffMemory["recentTail"];
  interrupted: boolean;
  nextAction: string;
}): HandoffMemory {
  return {
    schemaVersion: 2,
    generatedAt: "2026-05-28T00:00:00Z",
    source: {
      threadId: "source",
      title: "source",
      cwd: "/tmp/project",
      rolloutPath: "/tmp/rollout.jsonl",
      model: "gpt-5.5",
      tokensUsed: 1
    },
    latestGoal: {
      objective: "按照方案 B：Meituan Ops 自己控制内置浏览器开发落地",
      status: "active",
      confidence: "high",
      evidence: []
    },
    latestUserIntent: input.latestUserIntent ? {
      summary: input.latestUserIntent,
      confidence: "medium",
      evidence: []
    } : null,
    latestAssistantProgress: input.latestAssistantProgress ? {
      summary: input.latestAssistantProgress,
      confidence: "high",
      evidence: []
    } : null,
    progressSinceLatestUser: [],
    currentTaskState: {
      summary: "summary",
      interrupted: input.interrupted,
      confidence: "medium",
      evidence: []
    },
    recentTail: input.recentTail,
    supersededDirections: [],
    completed: [],
    pending: [],
    blockers: [],
    nextAction: {
      summary: input.nextAction,
      confidence: "medium",
      evidence: []
    },
    handoffDirective: {
      summary: input.nextAction,
      confidence: "medium",
      evidence: []
    },
    telemetry: {
      messageCount: input.recentTail.length,
      recentTailCount: input.recentTail.length,
      warningsCount: 0,
      rolloutAvailable: true
    },
    warnings: []
  };
}
