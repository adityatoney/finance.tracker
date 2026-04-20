import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAuth } from "./lib/auth";

export const listByStatement = query({
  args: { statementId: v.id("statements") },
  handler: async (ctx, { statementId }) => {
    const { dataSpaceId } = await requireAuth(ctx);

    // Verify statement belongs to this data space
    const stmt = await ctx.db.get(statementId);
    if (!stmt || stmt.dataSpaceId !== dataSpaceId) return [];

    return await ctx.db
      .query("holdings")
      .withIndex("by_statement", (q) => q.eq("statementId", statementId))
      .collect();
  },
});

export const listForMonth = query({
  args: { month: v.string() },
  handler: async (ctx, { month }) => {
    const { dataSpaceId } = await requireAuth(ctx);

    // Get statement IDs for this month in this data space
    const stmts = await ctx.db
      .query("statements")
      .withIndex("by_dataSpace_date", (q) =>
        q.eq("dataSpaceId", dataSpaceId).eq("statementDate", month)
      )
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
    const { dataSpaceId } = await requireAuth(ctx);
    const stmts = await ctx.db
      .query("statements")
      .withIndex("by_dataSpace_date", (q) => q.eq("dataSpaceId", dataSpaceId))
      .order("desc")
      .collect();
    return stmts[0]?.statementDate ?? null;
  },
});

export const getAllMonths = query({
  args: {},
  handler: async (ctx) => {
    const { dataSpaceId } = await requireAuth(ctx);
    const stmts = await ctx.db
      .query("statements")
      .withIndex("by_dataSpace_date", (q) => q.eq("dataSpaceId", dataSpaceId))
      .collect();
    const months = [...new Set(stmts.map((s) => s.statementDate))].sort().reverse();
    return months;
  },
});

// Update category on a single holding by ID
export const updateCategory = mutation({
  args: { holdingId: v.id("holdings"), category: v.string() },
  handler: async (ctx, { holdingId, category }) => {
    const { dataSpaceId } = await requireAuth(ctx);
    const holding = await ctx.db.get(holdingId);
    if (!holding) throw new Error("Holding not found");
    if (holding.dataSpaceId !== dataSpaceId) throw new Error("Not authorized");

    await ctx.db.patch(holdingId, { category });

    const stmt = await ctx.db.get(holding.statementId);
    return { updated: true, month: stmt?.statementDate };
  },
});

// Recategorize a ticker across all holdings in this data space
export const recategorize = mutation({
  args: { ticker: v.string(), category: v.string() },
  handler: async (ctx, { ticker, category }) => {
    const { dataSpaceId } = await requireAuth(ctx);
    const tickerUpper = ticker.toUpperCase();

    // Update the ticker map for this data space
    const existing = await ctx.db
      .query("tickerMap")
      .withIndex("by_dataSpace_ticker", (q) =>
        q.eq("dataSpaceId", dataSpaceId).eq("ticker", tickerUpper)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { category, source: "user" });
    } else {
      await ctx.db.insert("tickerMap", {
        ticker: tickerUpper,
        category,
        source: "user",
        dataSpaceId,
      });
    }

    // Update all holdings with this ticker in this data space
    const holdings = await ctx.db
      .query("holdings")
      .withIndex("by_dataSpace_ticker", (q) =>
        q.eq("dataSpaceId", dataSpaceId).eq("ticker", tickerUpper)
      )
      .collect();

    for (const h of holdings) {
      await ctx.db.patch(h._id, { category });
    }

    // Return affected months so the client can trigger rebuilds
    const affectedStmtIds = [...new Set(holdings.map((h) => h.statementId))];
    const affectedMonths = new Set<string>();
    for (const stmtId of affectedStmtIds) {
      const stmt = await ctx.db.get(stmtId);
      if (stmt) affectedMonths.add(stmt.statementDate);
    }

    return { updated: holdings.length, affectedMonths: [...affectedMonths] };
  },
});
