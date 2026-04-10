import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "node:path";

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "..", "data", "finance.db");

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!_db) {
    try {
      const sqlite = new Database(DB_PATH, { readonly: true });
      sqlite.pragma("journal_mode = WAL");
      sqlite.pragma("busy_timeout = 5000");
      _db = drizzle(sqlite, { schema });
    } catch {
      // DB doesn't exist yet — return null-safe wrapper
      return null;
    }
  }
  return _db;
}
