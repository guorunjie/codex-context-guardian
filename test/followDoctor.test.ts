import test from "node:test";
import assert from "node:assert/strict";
import { buildFollowDoctorReport, formatFollowDoctorReport } from "../src/followDoctor.ts";

test("follow doctor reports ready monitor with no activity yet", () => {
  const report = buildFollowDoctorReport({
    doctor: [
      { name: "codex cli", ok: true, detail: "ok" },
      { name: "relay-baton compact hooks", ok: true, detail: "hooks.json" }
    ],
    monitor: {
      label: "com.relay-baton.monitor",
      plistPath: "/tmp/monitor.plist",
      installed: true,
      loaded: true,
      detail: "running",
      recoveryStatePath: "/tmp/recovery-state.json"
    },
    activity: { schemaVersion: 1, updatedAt: 0, threads: {} },
    recovery: { lastSeenLogId: 0, threads: {} }
  });

  assert.equal(report.ok, true);
  assert.equal(report.status, "ready");
  assert.match(report.nextActions.join("\n"), /No Codex hook activity/);
  assert.match(formatFollowDoctorReport(report), /Relay Baton follow doctor: ready/);
});

test("follow doctor explains missing hooks and stopped monitor", () => {
  const report = buildFollowDoctorReport({
    doctor: [
      { name: "codex cli", ok: true, detail: "ok" },
      { name: "relay-baton compact hooks", ok: false, detail: "hooks.json missing" }
    ],
    monitor: {
      label: "com.relay-baton.monitor",
      plistPath: "/tmp/monitor.plist",
      installed: false,
      loaded: false,
      detail: "missing",
      recoveryStatePath: "/tmp/recovery-state.json"
    },
    activity: {
      schemaVersion: 1,
      updatedAt: 123,
      threads: {
        "thread-1": {
          threadId: "thread-1",
          lastEventAt: 123,
          lastEventName: "UserPromptSubmit",
          activeTurnStartedAt: 123,
          recentEvents: []
        }
      }
    },
    recovery: { lastSeenLogId: 42, threads: { "thread-1": { lastRecoveryAt: 123, consecutiveRecoveries: 1, lastLogId: 42, fallbackAttempts: 0 } } }
  });

  assert.equal(report.ok, false);
  assert.equal(report.status, "needs-attention");
  assert.deepEqual(report.failedDoctorChecks, ["relay-baton compact hooks"]);
  assert.equal(report.activityThreads, 1);
  assert.equal(report.activeThreads, 1);
  assert.equal(report.recoveryThreads, 1);
  assert.match(report.nextActions.join("\n"), /follow install/);
  assert.match(formatFollowDoctorReport(report), /hooks: missing/);
});
