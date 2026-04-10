/**
 * Drizzle ORM schema — READ-ONLY mirror of api/app/models.py
 * The Python side (SQLAlchemy + Alembic) owns all migrations.
 * If you modify the database schema, update api/app/models.py first.
 */

import { sqliteTable, text, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";

export const statements = sqliteTable("statements", {
  id: text("id").primaryKey(),
  brokerage: text("brokerage").notNull(),
  statementDate: text("statement_date").notNull(),
  fileName: text("file_name").notNull(),
  fileHash: text("file_hash").notNull(),
  accountNumberEnc: text("account_number_enc").notNull(),
  ownerNameEnc: text("owner_name_enc").notNull(),
  totalValue: real("total_value").notNull(),
  netDeposits: real("net_deposits").notNull(),
  uploadedAt: text("uploaded_at").notNull(),
});

export const holdings = sqliteTable("holdings", {
  id: text("id").primaryKey(),
  statementId: text("statement_id").notNull().references(() => statements.id),
  ticker: text("ticker").notNull(),
  name: text("name"),
  quantity: real("quantity"),
  price: real("price"),
  marketValue: real("market_value").notNull(),
  category: text("category").notNull(),
}, (table) => [
  index("idx_holdings_stmt").on(table.statementId),
  index("idx_holdings_ticker").on(table.ticker),
]);

export const deposits = sqliteTable("deposits", {
  id: text("id").primaryKey(),
  statementId: text("statement_id").notNull().references(() => statements.id),
  amount: real("amount").notNull(),
  description: text("description"),
  date: text("date"),
});

export const tickerMap = sqliteTable("ticker_map", {
  ticker: text("ticker").primaryKey(),
  category: text("category").notNull(),
  source: text("source").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const monthlySnapshots = sqliteTable("monthly_snapshots", {
  id: text("id").primaryKey(),
  month: text("month").notNull(),
  category: text("category").notNull(),
  totalValue: real("total_value").notNull(),
  netDeposits: real("net_deposits").notNull(),
  marketGain: real("market_gain").notNull(),
}, (table) => [
  index("idx_snapshots_month").on(table.month),
]);

export const piiAuditLog = sqliteTable("pii_audit_log", {
  id: text("id").primaryKey(),
  statementId: text("statement_id"),
  fieldName: text("field_name").notNull(),
  piiType: text("pii_type").notNull(),
  action: text("action").notNull(),
  createdAt: text("created_at").notNull(),
});
