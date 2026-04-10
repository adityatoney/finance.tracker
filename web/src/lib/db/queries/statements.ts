import { getDb } from "../index";
import { statements, holdings, tickerMap, monthlySnapshots } from "../schema";
import { desc, sql } from "drizzle-orm";
import type { StatementMeta, DatabaseStats, TickerMapping } from "@/lib/types";

export function getStatements(): StatementMeta[] {
  const db = getDb();
  if (!db) return [];

  const rows = db
    .select()
    .from(statements)
    .orderBy(desc(statements.uploadedAt))
    .all();

  return rows.map(r => ({
    id: r.id,
    brokerage: r.brokerage as any,
    statementDate: r.statementDate,
    fileName: r.fileName,
    totalValue: r.totalValue,
    netDeposits: r.netDeposits,
    uploadedAt: r.uploadedAt,
  }));
}

export function getDatabaseStats(): DatabaseStats {
  const db = getDb();
  if (!db) {
    return { statementCount: 0, holdingsCount: 0, tickerMapCount: 0, dateRangeStart: null, dateRangeEnd: null };
  }

  const stmtCount = db.select({ count: sql<number>`count(*)` }).from(statements).get();
  const holdCount = db.select({ count: sql<number>`count(*)` }).from(holdings).get();
  const tickerCount = db.select({ count: sql<number>`count(*)` }).from(tickerMap).get();

  const dates = db
    .select({
      min: sql<string>`min(statement_date)`,
      max: sql<string>`max(statement_date)`,
    })
    .from(statements)
    .get();

  return {
    statementCount: stmtCount?.count ?? 0,
    holdingsCount: holdCount?.count ?? 0,
    tickerMapCount: tickerCount?.count ?? 0,
    dateRangeStart: dates?.min ?? null,
    dateRangeEnd: dates?.max ?? null,
  };
}

export function getTickerMappings(): TickerMapping[] {
  const db = getDb();
  if (!db) return [];

  return db
    .select()
    .from(tickerMap)
    .orderBy(tickerMap.ticker)
    .all()
    .map(r => ({
      ticker: r.ticker,
      category: r.category as any,
      source: r.source as any,
      updatedAt: r.updatedAt,
    }));
}
