import { getDb } from "../index";
import { holdings, statements } from "../schema";
import { desc, eq } from "drizzle-orm";
import type { HoldingRow } from "@/lib/types";

export function getHoldingsForMonth(month: string): HoldingRow[] {
  const db = getDb();
  if (!db) return [];

  const rows = db
    .select({
      id: holdings.id,
      ticker: holdings.ticker,
      name: holdings.name,
      marketValue: holdings.marketValue,
      quantity: holdings.quantity,
      price: holdings.price,
      category: holdings.category,
      brokerage: statements.brokerage,
      statementDate: statements.statementDate,
    })
    .from(holdings)
    .innerJoin(statements, eq(holdings.statementId, statements.id))
    .where(eq(statements.statementDate, month))
    .all();

  return rows.map((r) => ({
    id: r.id,
    ticker: r.ticker,
    name: r.name || "",
    brokerage: r.brokerage as any,
    category: r.category as any,
    marketValue: r.marketValue,
    quantity: r.quantity || 0,
    price: r.price || 0,
    statementDate: r.statementDate,
  }));
}

export function getLatestMonth(): string | null {
  const db = getDb();
  if (!db) return null;

  const row = db
    .select({ month: statements.statementDate })
    .from(statements)
    .orderBy(desc(statements.statementDate))
    .limit(1)
    .get();

  return row?.month ?? null;
}

export function getAllMonths(): string[] {
  const db = getDb();
  if (!db) return [];

  const rows = db
    .selectDistinct({ month: statements.statementDate })
    .from(statements)
    .orderBy(desc(statements.statementDate))
    .all();

  return rows.map(r => r.month);
}
