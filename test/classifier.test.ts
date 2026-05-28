import test from "node:test";
import assert from "node:assert/strict";
import { classifyLogs, classifyText } from "../src/classifier.ts";

test("classifies model compact unsupported errors", () => {
  const signal = classifyText("POST /responses/compact failed: not supported on this model gpt-5.5");
  assert.equal(signal?.kind, "model_compact_unsupported");
  assert.equal(signal?.confidence, "high");
});

test("classifies general compaction failures", () => {
  const signal = classifyText("Context compaction failed while running run_compact_task");
  assert.equal(signal?.kind, "compact_failed");
});

test("classifies context overflow", () => {
  const signal = classifyText("context_length_exceeded: maximum context window reached");
  assert.equal(signal?.kind, "context_overflow");
});

test("classifies Codex ran out of room context window message", () => {
  const signal = classifyText("Codex ran out of room in the model's context window. Start a new thread or clear earlier history before retrying.");
  assert.equal(signal?.kind, "context_overflow");
  assert.equal(signal?.confidence, "high");
});

test("selects newest matching log signal", () => {
  const signal = classifyLogs([
    {
      id: 1,
      ts: 1,
      level: "INFO",
      target: "codex",
      body: "context compaction failed",
      threadId: "thread-1"
    },
    {
      id: 2,
      ts: 2,
      level: "ERROR",
      target: "codex",
      body: "responses/compact not supported on this model",
      threadId: "thread-2"
    }
  ]);

  assert.equal(signal?.kind, "model_compact_unsupported");
  assert.equal(signal?.sourceLogId, 2);
  assert.equal(signal?.threadId, "thread-2");
});

test("ignores prompt echoes in trace logs", () => {
  const signal = classifyLogs([
    {
      id: 1,
      ts: 1,
      level: "TRACE",
      target: "codex_api::sse::responses",
      body: 'SSE event: {"type":"response.created","instructions":"research not supported on this model compact failure"}',
      threadId: "thread-1"
    }
  ]);

  assert.equal(signal, null);
});

test("ignores trace response metadata with null error", () => {
  const signal = classifyLogs([
    {
      id: 1,
      ts: 1,
      level: "TRACE",
      target: "codex_api::sse::responses",
      body: 'SSE event: {"type":"response.created","status":"in_progress","error":null,"instructions":"not supported on this model"}',
      threadId: "thread-1"
    }
  ]);

  assert.equal(signal, null);
});
