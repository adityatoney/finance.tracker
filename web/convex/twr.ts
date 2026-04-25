import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAuth } from "./lib/auth";

// ── Shared helper: compute TWR from snapshot data (used by mutations and rebuildMonthInternal) ──

type SnapshotRow = { month: string; category: string; totalValue: number; netDeposits: number };

export async function computeTwrForScope(
  ctx: { db: any },
  dataSpaceId: string,
  scope: string,
  allSnapshots: SnapshotRow[],
): Promise<void> {
  const monthData = new Map<string, { totalValue: number; netDeposits: number }>();

  if (scope === "portfolio") {
    for (const snap of allSnapshots) {
      const existing = monthData.get(snap.month);
      if (existing) {
        existing.totalValue += snap.totalValue;
        existing.netDeposits += snap.netDeposits;
      } else {
        monthData.set(snap.month, { totalValue: snap.totalValue, netDeposits: snap.netDeposits });
      }
    }
  } else {
    for (const snap of allSnapshots) {
      if (snap.category !== scope) continue;
      const existing = monthData.get(snap.month);
      if (existing) {
        existing.totalValue += snap.totalValue;
        existing.netDeposits += snap.netDeposits;
      } else {
        monthData.set(snap.month, { totalValue: snap.totalValue, netDeposits: snap.netDeposits });
      }
    }
  }

  const months = Array.from(monthData.keys()).sort();
  if (months.length < 2) return;

  const subPeriodReturns: Array<{
    month: string; startValue: number; endValue: number; cashFlow: number; subPeriodReturn: number;
  }> = [];

  for (let i = 1; i < months.length; i++) {
    const prevData = monthData.get(months[i - 1])!;
    const currData = monthData.get(months[i])!;
    const startValue = prevData.totalValue;
    const endValue = currData.totalValue;
    const cashFlow = currData.netDeposits;
    const denominator = startValue + cashFlow;
    const subPeriodReturn = denominator <= 0 ? 0 : (endValue - startValue - cashFlow) / denominator;
    subPeriodReturns.push({ month: months[i], startValue, endValue, cashFlow, subPeriodReturn });
  }

  let cumulativeProduct = 1;
  for (const sp of subPeriodReturns) cumulativeProduct *= 1 + sp.subPeriodReturn;
  const twrCumulative = cumulativeProduct - 1;

  const numMonths = subPeriodReturns.length;
  let twrAnnualized: number | undefined;
  if (numMonths > 12) {
    twrAnnualized = Math.pow(1 + twrCumulative, 1 / numMonths * 12) - 1;
  }

  // Delete existing
  const existing = await ctx.db
    .query("twrSnapshots")
    .withIndex("by_dataSpace_scope", (q: any) =>
      q.eq("dataSpaceId", dataSpaceId).eq("scope", scope)
    )
    .collect();
  for (const row of existing) await ctx.db.delete(row._id);

  await ctx.db.insert("twrSnapshots", {
    dataSpaceId,
    scope,
    twrCumulative,
    twrAnnualized,
    periodStart: months[0],
    periodEnd: months[months.length - 1],
    subPeriodReturns,
    calculatedAt: new Date().toISOString(),
  });
}

/**
 * Recalculate all TWR snapshots for a data space. Called from rebuildMonthInternal.
 */
export async function recalculateAllTwrInternal(ctx: { db: any }, dataSpaceId: string) {
  const allSnapshots = await ctx.db
    .query("monthlySnapshots")
    .withIndex("by_dataSpace_month", (q: any) => q.eq("dataSpaceId", dataSpaceId))
    .collect();

  if (allSnapshots.length === 0) return;

  // Portfolio-level
  await computeTwrForScope(ctx, dataSpaceId, "portfolio", allSnapshots);

  // Per-category
  const categories = new Set<string>();
  for (const snap of allSnapshots) categories.add(snap.category);
  for (const category of categories) {
    await computeTwrForScope(ctx, dataSpaceId, category, allSnapshots);
  }
}

/**
 * Calculate Time-Weighted Return for a given scope.
 *
 * TWR eliminates the effect of cash flows (deposits/withdrawals) so you can
 * measure pure investment performance.  Each month-over-month interval is a
 * "sub-period"; the cumulative TWR is the geometric chain of those returns.
 */
export const calculateTwr = mutation({
  args: { scope: v.string() },
  handler: async (ctx, { scope }) => {
    const { dataSpaceId } = await requireAuth(ctx);

    // ── 1. Fetch all monthly snapshots for this data space ──
    const allSnapshots = await ctx.db
      .query("monthlySnapshots")
      .withIndex("by_dataSpace_month", (q) => q.eq("dataSpaceId", dataSpaceId))
      .collect();

    if (allSnapshots.length === 0) return null;

    // ── 2. Build per-month aggregates depending on scope ──
    // monthData maps month → { totalValue, netDeposits }
    const monthData = new Map<string, { totalValue: number; netDeposits: number }>();

    if (scope === "portfolio") {
      // Sum across all categories for each month
      for (const snap of allSnapshots) {
        const existing = monthData.get(snap.month);
        if (existing) {
          existing.totalValue += snap.totalValue;
          existing.netDeposits += snap.netDeposits;
        } else {
          monthData.set(snap.month, {
            totalValue: snap.totalValue,
            netDeposits: snap.netDeposits,
          });
        }
      }
    } else {
      // Filter to a specific category
      for (const snap of allSnapshots) {
        if (snap.category !== scope) continue;
        const existing = monthData.get(snap.month);
        if (existing) {
          existing.totalValue += snap.totalValue;
          existing.netDeposits += snap.netDeposits;
        } else {
          monthData.set(snap.month, {
            totalValue: snap.totalValue,
            netDeposits: snap.netDeposits,
          });
        }
      }
    }

    // ── 3. Sort months chronologically ──
    const months = Array.from(monthData.keys()).sort();

    if (months.length < 2) return null; // Need at least 2 data points

    // ── 4. Compute sub-period returns ──
    const subPeriodReturns: Array<{
      month: string;
      startValue: number;
      endValue: number;
      cashFlow: number;
      subPeriodReturn: number;
    }> = [];

    for (let i = 1; i < months.length; i++) {
      const prevData = monthData.get(months[i - 1])!;
      const currData = monthData.get(months[i])!;

      const startValue = prevData.totalValue;
      const endValue = currData.totalValue;
      const cashFlow = currData.netDeposits;

      let subPeriodReturn: number;
      const denominator = startValue + cashFlow;
      if (denominator <= 0) {
        subPeriodReturn = 0;
      } else {
        subPeriodReturn = (endValue - startValue - cashFlow) / denominator;
      }

      subPeriodReturns.push({
        month: months[i],
        startValue,
        endValue,
        cashFlow,
        subPeriodReturn,
      });
    }

    // ── 5. Chain sub-period returns into cumulative TWR ──
    let cumulativeProduct = 1;
    for (const sp of subPeriodReturns) {
      cumulativeProduct *= 1 + sp.subPeriodReturn;
    }
    const twrCumulative = cumulativeProduct - 1;

    // ── 6. Annualize if period > 12 months ──
    const numMonths = subPeriodReturns.length;
    let twrAnnualized: number | undefined;
    if (numMonths > 12) {
      const years = numMonths / 12;
      twrAnnualized = Math.pow(1 + twrCumulative, 1 / years) - 1;
    }

    // ── 7. Delete existing snapshot for this scope + dataSpaceId ──
    const existing = await ctx.db
      .query("twrSnapshots")
      .withIndex("by_dataSpace_scope", (q) =>
        q.eq("dataSpaceId", dataSpaceId).eq("scope", scope)
      )
      .collect();
    for (const row of existing) {
      await ctx.db.delete(row._id);
    }

    // ── 8. Insert new TWR snapshot ──
    const periodStart = months[0];
    const periodEnd = months[months.length - 1];

    await ctx.db.insert("twrSnapshots", {
      dataSpaceId,
      scope,
      twrCumulative,
      twrAnnualized,
      periodStart,
      periodEnd,
      subPeriodReturns,
      calculatedAt: new Date().toISOString(),
    });

    return {
      scope,
      twrCumulative,
      twrAnnualized,
      periodStart,
      periodEnd,
      subPeriods: subPeriodReturns.length,
    };
  },
});

/**
 * Recalculate TWR for the entire portfolio and every category that has data.
 */
export const calculateAllTwr = mutation({
  args: {},
  handler: async (ctx) => {
    const { dataSpaceId } = await requireAuth(ctx);

    // ── 1. Fetch all monthly snapshots ──
    const allSnapshots = await ctx.db
      .query("monthlySnapshots")
      .withIndex("by_dataSpace_month", (q) => q.eq("dataSpaceId", dataSpaceId))
      .collect();

    if (allSnapshots.length === 0) return { calculated: [] };

    // ── 2. Collect unique categories ──
    const categories = new Set<string>();
    for (const snap of allSnapshots) {
      categories.add(snap.category);
    }

    // ── 3. Helper: compute & store TWR for a scope ──
    const computeAndStore = async (scope: string) => {
      const monthData = new Map<string, { totalValue: number; netDeposits: number }>();

      if (scope === "portfolio") {
        for (const snap of allSnapshots) {
          const existing = monthData.get(snap.month);
          if (existing) {
            existing.totalValue += snap.totalValue;
            existing.netDeposits += snap.netDeposits;
          } else {
            monthData.set(snap.month, {
              totalValue: snap.totalValue,
              netDeposits: snap.netDeposits,
            });
          }
        }
      } else {
        for (const snap of allSnapshots) {
          if (snap.category !== scope) continue;
          const existing = monthData.get(snap.month);
          if (existing) {
            existing.totalValue += snap.totalValue;
            existing.netDeposits += snap.netDeposits;
          } else {
            monthData.set(snap.month, {
              totalValue: snap.totalValue,
              netDeposits: snap.netDeposits,
            });
          }
        }
      }

      const months = Array.from(monthData.keys()).sort();
      if (months.length < 2) return null;

      const subPeriodReturns: Array<{
        month: string;
        startValue: number;
        endValue: number;
        cashFlow: number;
        subPeriodReturn: number;
      }> = [];

      for (let i = 1; i < months.length; i++) {
        const prevData = monthData.get(months[i - 1])!;
        const currData = monthData.get(months[i])!;

        const startValue = prevData.totalValue;
        const endValue = currData.totalValue;
        const cashFlow = currData.netDeposits;

        let subPeriodReturn: number;
        const denominator = startValue + cashFlow;
        if (denominator <= 0) {
          subPeriodReturn = 0;
        } else {
          subPeriodReturn = (endValue - startValue - cashFlow) / denominator;
        }

        subPeriodReturns.push({
          month: months[i],
          startValue,
          endValue,
          cashFlow,
          subPeriodReturn,
        });
      }

      let cumulativeProduct = 1;
      for (const sp of subPeriodReturns) {
        cumulativeProduct *= 1 + sp.subPeriodReturn;
      }
      const twrCumulative = cumulativeProduct - 1;

      const numMonths = subPeriodReturns.length;
      let twrAnnualized: number | undefined;
      if (numMonths > 12) {
        const years = numMonths / 12;
        twrAnnualized = Math.pow(1 + twrCumulative, 1 / years) - 1;
      }

      // Delete existing
      const existing = await ctx.db
        .query("twrSnapshots")
        .withIndex("by_dataSpace_scope", (q) =>
          q.eq("dataSpaceId", dataSpaceId).eq("scope", scope)
        )
        .collect();
      for (const row of existing) {
        await ctx.db.delete(row._id);
      }

      const periodStart = months[0];
      const periodEnd = months[months.length - 1];

      await ctx.db.insert("twrSnapshots", {
        dataSpaceId,
        scope,
        twrCumulative,
        twrAnnualized,
        periodStart,
        periodEnd,
        subPeriodReturns,
        calculatedAt: new Date().toISOString(),
      });

      return { scope, twrCumulative, twrAnnualized };
    };

    // ── 4. Run portfolio-level + each category ──
    const results: Array<{ scope: string; twrCumulative: number; twrAnnualized?: number }> = [];

    const portfolioResult = await computeAndStore("portfolio");
    if (portfolioResult) results.push(portfolioResult);

    for (const category of Array.from(categories)) {
      const catResult = await computeAndStore(category);
      if (catResult) results.push(catResult);
    }

    return { calculated: results };
  },
});

/**
 * Get the TWR snapshot for a specific scope.
 */
export const getTwr = query({
  args: { scope: v.string() },
  handler: async (ctx, { scope }) => {
    const { dataSpaceId } = await requireAuth(ctx);
    return await ctx.db
      .query("twrSnapshots")
      .withIndex("by_dataSpace_scope", (q) =>
        q.eq("dataSpaceId", dataSpaceId).eq("scope", scope)
      )
      .first();
  },
});

/**
 * List all TWR snapshots for this data space.
 */
export const listTwr = query({
  args: {},
  handler: async (ctx) => {
    const { dataSpaceId } = await requireAuth(ctx);
    return await ctx.db
      .query("twrSnapshots")
      .withIndex("by_dataSpace_scope", (q) =>
        q.eq("dataSpaceId", dataSpaceId)
      )
      .collect();
  },
});
