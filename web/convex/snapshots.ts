import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("monthlySnapshots").collect();
  },
});

export const listForMonth = query({
  args: { month: v.string() },
  handler: async (ctx, { month }) => {
    return await ctx.db
      .query("monthlySnapshots")
      .withIndex("by_month", (q) => q.eq("month", month))
      .collect();
  },
});

// Rebuild snapshots for a specific month (callable from client)
export const rebuildMonth = mutation({
  args: { month: v.string() },
  handler: async (ctx, { month }) => {
    const CATEGORIES = ["foundational", "value", "growth", "emergency_fund", "btc_crypto"];

    function prevMonth(m: string): string {
      const [y, mo] = m.split("-").map(Number);
      if (mo === 1) return `${y - 1}-12`;
      return `${y}-${String(mo - 1).padStart(2, "0")}`;
    }

    // Get statements for this month
    const stmts = await ctx.db
      .query("statements")
      .withIndex("by_date", (q) => q.eq("statementDate", month))
      .collect();

    // Delete existing snapshots for this month
    const existing = await ctx.db
      .query("monthlySnapshots")
      .withIndex("by_month", (q) => q.eq("month", month))
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
      totalDeposits += deposits.reduce((s, d) => s + d.amount, 0);
    }

    const totalValueAll = Object.values(categoryTotals).reduce((s, v) => s + v, 0) || 1;

    // Get previous month
    const prev = prevMonth(month);
    const prevSnapshots: Record<string, number> = {};
    const prevRows = await ctx.db
      .query("monthlySnapshots")
      .withIndex("by_month", (q) => q.eq("month", prev))
      .collect();
    for (const s of prevRows) prevSnapshots[s.category] = s.totalValue;

    // Create new snapshots
    for (const category of CATEGORIES) {
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
      });
    }

    return { rebuilt: true };
  },
});
