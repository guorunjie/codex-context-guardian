import fs from "node:fs";
import { logsDbPath, stateDbPath } from "./paths.ts";
import { queryJson } from "./sqlite.ts";

export type ThreadInfo = {
  id: string;
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
  const rows = queryJson(db, `
    select id, title, cwd, model, model_provider as modelProvider,
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
  const rows = queryJson(db, `
    select id, title, cwd, model, model_provider as modelProvider,
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
  limit?: number;
  threadId?: string;
} = {}): LogRow[] {
  const db = logsDbPath(options.home);
  if (!fs.existsSync(db)) return [];
  const afterClause = options.afterId ? `and id > ${Number(options.afterId)}` : "";
  const threadClause = options.threadId ? `and thread_id = '${options.threadId.replaceAll("'", "''")}'` : "";
  const rows = queryJson(db, `
    select id, ts, level, target, coalesce(feedback_log_body, '') as body,
           coalesce(thread_id, '') as threadId
    from logs
    where 1 = 1
      ${afterClause}
      ${threadClause}
      and (
        feedback_log_body like '%compact%'
        or feedback_log_body like '%Compaction%'
        or feedback_log_body like '%context_length%'
        or feedback_log_body like '%model%not%supported%'
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
    title: String(row.title || ""),
    cwd: String(row.cwd || process.cwd()),
    model: String(row.model || ""),
    modelProvider: String(row.modelProvider || ""),
    tokensUsed: Number(row.tokensUsed || 0),
    updatedAt: Number(row.updatedAt || 0)
  };
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
