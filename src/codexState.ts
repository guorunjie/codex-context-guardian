import fs from "node:fs";
import { logsDbPath, stateDbPath } from "./paths.ts";
import { queryJson } from "./sqlite.ts";

export type ThreadInfo = {
  id: string;
  rolloutPath?: string;
  title: string;
  cwd: string;
  model: string;
  modelProvider: string;
  tokensUsed: number;
  updatedAt: number;
};

export type LogRow = {
  id: number;
  ts: number;
  level: string;
  target: string;
  body: string;
  threadId: string;
};

export function getThread(threadId: string, home?: string): ThreadInfo | null {
  const db = stateDbPath(home);
  if (!fs.existsSync(db)) return null;
  const escaped = threadId.replaceAll("'", "''");
  const rolloutSelect = columnExists(db, "threads", "rollout_path") ? "rollout_path as rolloutPath," : "null as rolloutPath,";
  const rows = queryJson(db, `
    select id, ${rolloutSelect} title, cwd, model, model_provider as modelProvider,
           tokens_used as tokensUsed, updated_at as updatedAt
    from threads
    where id = '${escaped}'
    limit 1;
  `);
  return rows[0] ? normalizeThread(rows[0]) : null;
}

export function getLatestThread(home?: string): ThreadInfo | null {
  const db = stateDbPath(home);
  if (!fs.existsSync(db)) return null;
  const rolloutSelect = columnExists(db, "threads", "rollout_path") ? "rollout_path as rolloutPath," : "null as rolloutPath,";
  const rows = queryJson(db, `
    select id, ${rolloutSelect} title, cwd, model, model_provider as modelProvider,
           tokens_used as tokensUsed, updated_at as updatedAt
    from threads
    where archived = 0
    order by updated_at desc
    limit 1;
  `);
  return rows[0] ? normalizeThread(rows[0]) : null;
}

export function readRecentLogs(options: {
  home?: string;
  afterId?: number;
  sinceTs?: number;
  limit?: number;
  threadId?: string;
} = {}): LogRow[] {
  const db = logsDbPath(options.home);
  if (!fs.existsSync(db)) return [];
  const afterClause = options.afterId ? `and id > ${Number(options.afterId)}` : "";
  const sinceTs = Number(options.sinceTs || 0);
  const sinceClause = sinceTs ? `and (ts >= ${sinceTs} or ts >= ${Math.floor(sinceTs / 1000)})` : "";
  const threadClause = options.threadId ? `and thread_id = '${options.threadId.replaceAll("'", "''")}'` : "";
  const rows = queryJson(db, `
    select id, ts, level, target, substr(coalesce(feedback_log_body, ''), 1, 8000) as body,
           coalesce(thread_id, '') as threadId
    from logs
    where 1 = 1
      ${afterClause}
      ${sinceClause}
      ${threadClause}
      and (
        target like '%compact%'
        or target like '%responses%'
        or feedback_log_body like '%responses/compact%'
        or feedback_log_body like '%run_compact_task%'
        or feedback_log_body like '%compact_remote%'
        or feedback_log_body like '%remote compact%'
        or feedback_log_body like '%compaction failed%'
        or feedback_log_body like '%compact task failed%'
        or feedback_log_body like '%failed to compact%'
        or feedback_log_body like '%context_length_exceeded%'
        or feedback_log_body like '%ran out of room in the model%'
        or feedback_log_body like '%clear earlier history before retrying%'
        or feedback_log_body like '%model%not%supported%compact%'
      )
    order by id asc
    limit ${Number(options.limit || 200)};
  `);
  return rows.map(normalizeLogRow);
}

export function getMaxLogId(home?: string): number {
  const db = logsDbPath(home);
  if (!fs.existsSync(db)) return 0;
  const rows = queryJson(db, "select coalesce(max(id), 0) as id from logs;");
  return Number(rows[0]?.id || 0);
}

function normalizeThread(row: Record<string, unknown>): ThreadInfo {
  return {
    id: String(row.id || ""),
    rolloutPath: row.rolloutPath ? String(row.rolloutPath) : undefined,
    title: String(row.title || ""),
    cwd: String(row.cwd || process.cwd()),
    model: String(row.model || ""),
    modelProvider: String(row.modelProvider || ""),
    tokensUsed: Number(row.tokensUsed || 0),
    updatedAt: Number(row.updatedAt || 0)
  };
}

function columnExists(db: string, table: string, column: string): boolean {
  const escapedTable = table.replaceAll("'", "''");
  const escapedColumn = column.replaceAll("'", "''");
  const rows = queryJson(db, `pragma table_info('${escapedTable}');`);
  return rows.some((row) => String(row.name || "") === escapedColumn);
}

function normalizeLogRow(row: Record<string, unknown>): LogRow {
  return {
    id: Number(row.id || 0),
    ts: Number(row.ts || 0),
    level: String(row.level || ""),
    target: String(row.target || ""),
    body: String(row.body || ""),
    threadId: String(row.threadId || "")
  };
}
