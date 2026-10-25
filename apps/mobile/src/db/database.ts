/**
 * SQLite handle.
 *
 * One connection, opened lazily and reused. `expo-sqlite`'s synchronous API is
 * used deliberately: the queries here are small and local, and keeping them
 * synchronous removes a whole class of interleaving bugs from the store layer.
 */

import * as SQLite from "expo-sqlite";
import { CREATE_STATEMENTS, SCHEMA_VERSION } from "./schema";

let database: SQLite.SQLiteDatabase | null = null;

export function getDatabase(): SQLite.SQLiteDatabase {
  if (database) return database;
  const db = SQLite.openDatabaseSync("tradevault.db");
  for (const statement of CREATE_STATEMENTS) {
    db.execSync(statement);
  }
  // Record the schema version so a future migration can tell what it is
  // upgrading from.
  db.runSync(
    `INSERT INTO app_meta (key, value) VALUES ('schema_version', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [String(SCHEMA_VERSION)]
  );
  database = db;
  return db;
}

/** Close the handle. Used by tests and by a full local wipe. */
export function closeDatabase(): void {
  if (!database) return;
  database.closeSync();
  database = null;
}

/* ------------------------------------------------------------------ */
/* Small typed helpers                                                */
/* ------------------------------------------------------------------ */

export function run(sql: string, params: SQLite.SQLiteBindValue[] = []): void {
  getDatabase().runSync(sql, params);
}

export function all<T>(sql: string, params: SQLite.SQLiteBindValue[] = []): T[] {
  return getDatabase().getAllSync<T>(sql, params);
}

export function one<T>(sql: string, params: SQLite.SQLiteBindValue[] = []): T | null {
  return getDatabase().getFirstSync<T>(sql, params) ?? null;
}

/** Run several statements atomically. */
export function transaction(work: () => void): void {
  const db = getDatabase();
  db.execSync("BEGIN");
  try {
    work();
    db.execSync("COMMIT");
  } catch (error) {
    db.execSync("ROLLBACK");
    throw error;
  }
}
