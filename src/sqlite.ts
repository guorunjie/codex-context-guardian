import { runCommand, shellQuote } from "./exec.ts";

export type SqliteRow = Record<string, unknown>;

export function queryJson(dbPath: string, sql: string): SqliteRow[] {
  const result = runCommand("sqlite3", ["-json", dbPath, sql], { timeoutMs: 10000 });
  if (result.status !== 0) {
    throw new Error(`sqlite3 query failed: ${result.stderr.trim() || result.stdout.trim()}`);
  }
  const text = result.stdout.trim();
  if (!text) return [];
  return JSON.parse(text);
}

export function tableExists(dbPath: string, table: string): boolean {
  const escaped = table.replaceAll("'", "''");
  const rows = queryJson(dbPath, `select name from sqlite_master where type='table' and name='${escaped}' limit 1;`);
  return rows.length > 0;
}

export function sqliteLiteral(value: string): string {
  return shellQuote(value).slice(1, -1).replaceAll("''", "'");
}
