import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const listByStatement = query({
  args: { statementId: v.id("statements") },
  handler: async (ctx, { statementId }) => {
    return await ctx.db
      .query("holdings")
      .withIndex("by_statement", (q) => q.eq("statementId", statementId))
      .collect();
  },
});

export const listForMonth = query({
  args: { month: v.string() },
  handler: async (ctx, { month }) => {
    // Get statement IDs for this month
    const stmts = await ctx.db
      .query("statements")
      .withIndex("by_date", (q) => q.eq("statementDate", month))
      .collect();

    if (stmts.length === 0) return [];

    const holdings = [];
    for (const stmt of stmts) {
      const h = await ctx.db
        .query("holdings")
        .withIndex("by_statement", (q) => q.eq("statementId", stmt._id))
        .collect();
      holdings.push(
        ...h.map((row) => ({
          ...row,
          brokerage: row.brokerage ?? stmt.brokerage,
          statementDate: stmt.statementDate,
        }))
      );
    }

    return holdings;
  },
});

export const getLatestMonth = query({
  args: {},
  handler: async (ctx) => {
    const stmt = await ctx.db.query("statements").order("desc").first();
    return stmt?.statementDate ?? null;
  },
});

export const getAllMonths = query({
  args: {},
  handler: async (ctx) => {
    const stmts = await ctx.db.query("statements").collect();
    const months = [...new Set(stmts.map((s) => s.statementDate))].sort().reverse();
    return months;
  },
});

// Update category on a single holding by ID
export const updateCategory = mutation({
  args: { holdingId: v.id("holdings"), category: v.string() },
  handler: async (ctx, { holdingId, category }) => {
    const holding = await ctx.db.get(holdingId);
    if (!holding) throw new Error("Holding not found");

    await ctx.db.patch(holdingId, { category });

    // Rebuild snapshots for the affected month
    const stmt = await ctx.db.get(holding.statementId);
    if (stmt) {
      // Import inline to avoid circular deps
      const snapshots = await ctx.db
        .query("monthlySnapshots")
        .withIndex("by_month", (q) => q.eq("month", stmt.statementDate))
        .collect();
      // We'll let the client call rebuildMonth separately if needed
    }

    return { updated: true, month: stmt?.statementDate };
  },
});

// Recategorize a ticker across all holdings
export const recategorize = mutation({
  args: { ticker: v.string(), category: v.string() },
  handler: async (ctx, { ticker, category }) => {
    const tickerUpper = ticker.toUpperCase();

    // Update the ticker map
    const existing = await ctx.db
      .query("tickerMap")
      .withIndex("by_ticker", (q) => q.eq("ticker", tickerUpper))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { category, source: "user" });
    } else {
      await ctx.db.insert("tickerMap", { ticker: tickerUpper, category, source: "user" });
    }

    // Update all holdings with this ticker
    const holdings = await ctx.db
      .query("holdings")
      .withIndex("by_ticker", (q) => q.eq("ticker", tickerUpper))
      .collect();

    for (const h of holdings) {
      await ctx.db.patch(h._id, { category });
    }

    // Rebuild snapshots for all affected months
    const affectedStmtIds = [...new Set(holdings.map((h) => h.statementId))];
    const affectedMonths = new Set<string>();
    for (const stmtId of affectedStmtIds) {
      const stmt = await ctx.db.get(stmtId);
      if (stmt) affectedMonths.add(stmt.statementDate);
    }

    // Note: snapshot rebuild happens via the rebuildMonth mutation called separately
    // Return the affected months so the client can trigger rebuilds
    return { updated: holdings.length, affectedMonths: [...affectedMonths] };
  },
});
