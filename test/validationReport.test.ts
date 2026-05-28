import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildHostValidationReport, renderHostValidationReport, writeHostValidationReport } from "../src/validationReport.ts";

test("builds host validation report from supplied evidence", () => {
  const report = buildHostValidationReport({
    generatedAt: "2026-05-28T00:00:00.000Z",
    home: "/tmp/codex-home",
    root: "/tmp/repo",
    doctor: [
      { name: "codex cli", ok: true, detail: "codex-cli 0.133.0" },
      { name: "sqlite3", ok: true, detail: "available" }
    ],
    monitor: {
      label: "com.relay-baton.monitor",
      plistPath: "/tmp/monitor.plist",
      installed: true,
      loaded: true,
      detail: "running",
      recoveryStatePath: "/tmp/recovery-state.json"
    },
    release: {
      ok: true,
      packageName: "codex-relay-baton-guardian",
      version: "1.0.0",
      tag: "v1.0.0",
      online: false,
      checks: [{ name: "package metadata", status: "pass", detail: "ok" }],
      nextActions: []
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
    recovery: {
      lastSeenLogId: 42,
      threads: {
        "thread-1": {
          lastRecoveryAt: 123,
          consecutiveRecoveries: 1,
          lastLogId: 42,
          fallbackAttempts: 0
        }
      }
    }
  });

  assert.equal(report.summary.ok, true);
  assert.equal(report.summary.releaseRequired, false);
  assert.equal(report.summary.activityThreads, 1);
  assert.equal(report.activity.activeThreadCount, 1);
  assert.equal(report.recovery.threadCount, 1);
  assert.match(renderHostValidationReport(report), /Relay Baton Host Validation Report/);
});

test("writes host validation report files", () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-baton-validation-"));
  const report = buildHostValidationReport({
    doctor: [],
    monitor: {
      label: "monitor",
      plistPath: "/tmp/monitor",
      installed: false,
      loaded: false,
      detail: "missing",
      recoveryStatePath: "/tmp/recovery"
    },
    release: {
      ok: false,
      packageName: "codex-relay-baton-guardian",
      version: "1.0.0",
      tag: "v1.0.0",
      online: false,
      checks: [],
      nextActions: ["Run release check online."]
    },
    activity: { schemaVersion: 1, updatedAt: 0, threads: {} },
    recovery: { lastSeenLogId: 0, threads: {} }
  });

  const written = writeHostValidationReport(report, outputDir);
  assert.equal(fs.existsSync(written.jsonFile), true);
  assert.equal(fs.existsSync(written.markdownFile), true);
  assert.match(fs.readFileSync(written.markdownFile, "utf8"), /Next Actions/);
});

test("host validation treats release gate as advisory unless required", () => {
  const base = {
    doctor: [{ name: "codex cli", ok: true, detail: "ok" }],
    monitor: {
      label: "monitor",
      plistPath: "/tmp/monitor",
      installed: true,
      loaded: true,
      detail: "running",
      recoveryStatePath: "/tmp/recovery"
    },
    release: {
      ok: false,
      packageName: "codex-relay-baton-guardian",
      version: "1.0.0",
      tag: "v1.0.0",
      online: false,
      checks: [],
      nextActions: ["Fix release gate."]
    },
    activity: { schemaVersion: 1 as const, updatedAt: 0, threads: {} },
    recovery: { lastSeenLogId: 0, threads: {} }
  };

  assert.equal(buildHostValidationReport(base).summary.ok, true);
  assert.equal(buildHostValidationReport({ ...base, strictRelease: true }).summary.ok, false);
});
