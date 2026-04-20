import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAuth } from "./lib/auth";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { dataSpaceId } = await requireAuth(ctx);
    return await ctx.db
      .query("monthlySnapshots")
      .filter((q) => q.eq(q.field("dataSpaceId"), dataSpaceId))
      .collect();
  },
});

// Validate that holdings totals match snapshot totals for each month
export const validateTotals = query({
  args: {},
  handler: async (ctx) => {
    const { dataSpaceId } = await requireAuth(ctx);
    const stmts = await ctx.db
      .query("statements")
      .withIndex("by_dataSpace_date", (q) => q.eq("dataSpaceId", dataSpaceId))
      .collect();
    const snapshots = await ctx.db
      .query("monthlySnapshots")
      .filter((q) => q.eq(q.field("dataSpaceId"), dataSpaceId))
      .collect();

    const months = [...new Set(stmts.map((s) => s.statementDate))].sort();
    const results: Array<{
      month: string;
      holdingsTotal: number;
      snapshotTotal: number;
      statementTotal: number;
      match: boolean;
      diff: number;
    }> = [];

    for (const month of months) {
      // 1. Holdings total: sum all holdings for this month's statements
      const monthStmts = stmts.filter((s) => s.statementDate === month);
      let holdingsTotal = 0;
      for (const stmt of monthStmts) {
        const holdings = await ctx.db
          .query("holdings")
          .withIndex("by_statement", (q) => q.eq("statementId", stmt._id))
          .collect();
        holdingsTotal += holdings.reduce((s, h) => s + h.marketValue, 0);
      }

      // 2. Snapshot total: sum all snapshot categories for this month
      const monthSnaps = snapshots.filter((s) => s.month === month);
      const snapshotTotal = monthSnaps.reduce((s, snap) => s + snap.totalValue, 0);

      // 3. Statement total: sum statement.totalValue for this month
      const statementTotal = monthStmts.reduce((s, stmt) => s + stmt.totalValue, 0);

      const diff = Math.abs(holdingsTotal - snapshotTotal);
      results.push({
        month,
        holdingsTotal: Math.round(holdingsTotal * 100) / 100,
        snapshotTotal: Math.round(snapshotTotal * 100) / 100,
        statementTotal: Math.round(statementTotal * 100) / 100,
        match: diff < 0.02, // tolerance for rounding
        diff: Math.round(diff * 100) / 100,
      });
    }

    return results;
  },
});

// Get YOUR deposits per month (excludes employer contributions)
export const depositsByMonth = query({
  args: {},
  handler: async (ctx) => {
    const { dataSpaceId } = await requireAuth(ctx);
    const allDeposits = await ctx.db
      .query("deposits")
      .filter((q) => q.eq(q.field("dataSpaceId"), dataSpaceId))
      .collect();
    const stmts = await ctx.db
      .query("statements")
      .withIndex("by_dataSpace_date", (q) => q.eq("dataSpaceId", dataSpaceId))
      .collect();

    // Map statementId → month
    const stmtMonthMap = new Map<string, string>();
    for (const s of stmts) {
      stmtMonthMap.set(s._id, s.statementDate);
    }

    // Sum only YOUR deposits (exclude employer)
    const result: Record<string, number> = {};
    for (const d of allDeposits) {
      const desc = (d.description || "").toLowerCase();
      if (desc.includes("employer")) continue; // Skip employer contributions

      const month = stmtMonthMap.get(d.statementId);
      if (month) {
        result[month] = (result[month] ?? 0) + d.amount;
      }
    }
    return result;
  },
});

export const listForMonth = query({
  args: { month: v.string() },
  handler: async (ctx, { month }) => {
    const { dataSpaceId } = await requireAuth(ctx);
    return await ctx.db
      .query("monthlySnapshots")
      .withIndex("by_dataSpace_month", (q) =>
        q.eq("dataSpaceId", dataSpaceId).eq("month", month)
      )
      .collect();
  },
});

// Rebuild snapshots for a specific month (callable from client)
export const rebuildMonth = mutation({
  args: { month: v.string() },
  handler: async (ctx, { month }) => {
    const { dataSpaceId } = await requireAuth(ctx);
    const CATEGORIES = ["foundational", "value", "growth", "emergency_fund", "btc_crypto"];

    function prevMonth(m: string): string {
      const [y, mo] = m.split("-").map(Number);
      if (mo === 1) return `${y - 1}-12`;
      return `${y}-${String(mo - 1).padStart(2, "0")}`;
    }

    // Get statements for this month in this data space
    const stmts = await ctx.db
      .query("statements")
      .withIndex("by_dataSpace_date", (q) =>
        q.eq("dataSpaceId", dataSpaceId).eq("statementDate", month)
      )
      .collect();

    // Delete existing snapshots for this month + data space
    const existing = await ctx.db
      .query("monthlySnapshots")
      .withIndex("by_dataSpace_month", (q) =>
        q.eq("dataSpaceId", dataSpaceId).eq("month", month)
      )
      .collect();
    for (const s of existing) await ctx.db.delete(s._id);

    if (stmts.length === 0) return { rebuilt: false };

    // Get all holdings for these statements
    const allHoldings = [];
    for (const stmt of stmts) {
      const holdings = await ctx.db
        .query("holdings")
        .withIndex("by_statement", (q) => q.eq("statementId", stmt._id))
        .collect();
      allHoldings.push(...holdings);
    }

    // Aggregate by category
    const categoryTotals: Record<string, number> = {};
    for (const h of allHoldings) {
      const cat = (h.category || "uncategorized").toLowerCase();
      categoryTotals[cat] = (categoryTotals[cat] ?? 0) + h.marketValue;
    }

    // Get total deposits
    let totalDeposits = 0;
    for (const stmt of stmts) {
      const deposits = await ctx.db
        .query("deposits")
        .withIndex("by_statement", (q) => q.eq("statementId", stmt._id))
        .collect();
      totalDeposits += deposits
        .filter((d) => !(d.description || "").toLowerCase().includes("employer"))
        .reduce((s, d) => s + d.amount, 0);
    }

    const totalValueAll = Object.values(categoryTotals).reduce((s, v) => s + v, 0) || 1;

    // Get previous month
    const prev = prevMonth(month);
    const prevSnapshots: Record<string, number> = {};
    const prevRows = await ctx.db
      .query("monthlySnapshots")
      .withIndex("by_dataSpace_month", (q) =>
        q.eq("dataSpaceId", dataSpaceId).eq("month", prev)
      )
      .collect();
    for (const s of prevRows) prevSnapshots[s.category] = s.totalValue;

    // Create new snapshots — include ALL categories that have holdings
    const allCategories = new Set([...CATEGORIES, ...Object.keys(categoryTotals)]);
    for (const category of allCategories) {
      const currentValue = categoryTotals[category] ?? 0;
      const prevValue = prevSnapshots[category] ?? 0;
      const proportion = currentValue / totalValueAll;
      const catDeposits = totalDeposits * proportion;
      const marketGain = currentValue - prevValue - catDeposits;

      await ctx.db.insert("monthlySnapshots", {
        month,
        category,
        totalValue: currentValue,
        netDeposits: catDeposits,
        marketGain,
        dataSpaceId,
      });
    }

    return { rebuilt: true };
  },
});

// Rebuild ALL snapshots for every month that has statements
export const rebuildAll = mutation({
  args: {},
  handler: async (ctx) => {
    const { dataSpaceId } = await requireAuth(ctx);
    const CATEGORIES = ["foundational", "value", "growth", "emergency_fund", "btc_crypto"];

    function prevMonthStr(m: string): string {
      const [y, mo] = m.split("-").map(Number);
      if (mo === 1) return `${y - 1}-12`;
      return `${y}-${String(mo - 1).padStart(2, "0")}`;
    }

    // Get all unique months from statements, sorted chronologically
    const stmts = await ctx.db
      .query("statements")
      .withIndex("by_dataSpace_date", (q) => q.eq("dataSpaceId", dataSpaceId))
      .collect();
    const months = [...new Set(stmts.map((s) => s.statementDate))].sort();

    if (months.length === 0) {
      // Delete all snapshots for this data space
      const all = await ctx.db
        .query("monthlySnapshots")
        .filter((q) => q.eq(q.field("dataSpaceId"), dataSpaceId))
        .collect();
      for (const s of all) await ctx.db.delete(s._id);
      return { monthsRebuilt: 0 };
    }

    // Rebuild each month in chronological order (so prev-month lookups work)
    for (const month of months) {
      // Get statements for this month
      const monthStmts = stmts.filter((s) => s.statementDate === month);

      // Get all holdings
      const allHoldings = [];
      for (const stmt of monthStmts) {
        const h = await ctx.db
          .query("holdings")
          .withIndex("by_statement", (q) => q.eq("statementId", stmt._id))
          .collect();
        allHoldings.push(...h);
      }

      // Aggregate by category
      const categoryTotals: Record<string, number> = {};
      for (const h of allHoldings) {
        const cat = (h.category || "uncategorized").toLowerCase();
        categoryTotals[cat] = (categoryTotals[cat] ?? 0) + h.marketValue;
      }

      // Deposits (your contributions only)
      let totalDeposits = 0;
      for (const stmt of monthStmts) {
        const deposits = await ctx.db
          .query("deposits")
          .withIndex("by_statement", (q) => q.eq("statementId", stmt._id))
          .collect();
        totalDeposits += deposits
          .filter((d) => !(d.description || "").toLowerCase().includes("employer"))
          .reduce((s, d) => s + d.amount, 0);
      }

      const totalValueAll = Object.values(categoryTotals).reduce((s, v) => s + v, 0) || 1;

      // Previous month
      const prev = prevMonthStr(month);
      const prevSnapshots: Record<string, number> = {};
      const prevRows = await ctx.db
        .query("monthlySnapshots")
        .withIndex("by_dataSpace_month", (q) =>
          q.eq("dataSpaceId", dataSpaceId).eq("month", prev)
        )
        .collect();
      for (const s of prevRows) prevSnapshots[s.category] = s.totalValue;

      // Delete existing snapshots for this month
      const existing = await ctx.db
        .query("monthlySnapshots")
        .withIndex("by_dataSpace_month", (q) =>
          q.eq("dataSpaceId", dataSpaceId).eq("month", month)
        )
        .collect();
      for (const s of existing) await ctx.db.delete(s._id);

      // Create snapshots for ALL categories with holdings
      const allCategories = new Set([...CATEGORIES, ...Object.keys(categoryTotals)]);
      for (const category of allCategories) {
        const currentValue = categoryTotals[category] ?? 0;
        const prevValue = prevSnapshots[category] ?? 0;
        const proportion = currentValue / totalValueAll;
        const catDeposits = totalDeposits * proportion;
        const marketGain = currentValue - prevValue - catDeposits;

        await ctx.db.insert("monthlySnapshots", {
          month,
          category,
          totalValue: currentValue,
          netDeposits: catDeposits,
          marketGain,
          dataSpaceId,
        });
      }
    }

    return { monthsRebuilt: months.length };
  },
});
