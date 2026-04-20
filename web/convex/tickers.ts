import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAuth } from "./lib/auth";

// Default ticker mappings — seeded on first access if table is empty
const DEFAULT_TICKERS: Record<string, string> = {
  VTI: "foundational", VTSAX: "foundational", VOO: "foundational", SPY: "foundational",
  IVV: "foundational", BND: "foundational", AGG: "foundational", VXUS: "foundational",
  VEA: "foundational", VWO: "foundational", TLT: "foundational", VBR: "foundational",
  VBTLX: "foundational",
  "BRK.B": "value", VTV: "value", SCHV: "value", VYM: "value", SCHD: "value",
  DVY: "value", DGRO: "value", JNJ: "value", PG: "value", KO: "value",
  PEP: "value", MCD: "value",
  QQQ: "growth", ARKK: "growth", NVDA: "growth", TSLA: "growth", AAPL: "growth",
  MSFT: "growth", GOOGL: "growth", GOOG: "growth", AMZN: "growth", META: "growth",
  AMD: "growth", CRM: "growth", AVGO: "growth", VGT: "growth", XLK: "growth",
  SOXX: "growth",
  SPAXX: "emergency_fund", VMFXX: "emergency_fund", SWVXX: "emergency_fund",
  SGOV: "emergency_fund", BIL: "emergency_fund", SHV: "emergency_fund",
  IBIT: "btc_crypto", FBTC: "btc_crypto", GBTC: "btc_crypto", BITO: "btc_crypto",
  MSTR: "btc_crypto", COIN: "btc_crypto",
};

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { dataSpaceId } = await requireAuth(ctx);
    const mappings = await ctx.db
      .query("tickerMap")
      .filter((q) => q.eq(q.field("dataSpaceId"), dataSpaceId))
      .collect();
    return mappings.sort((a, b) => a.ticker.localeCompare(b.ticker));
  },
});

export const getCategory = query({
  args: { ticker: v.string() },
  handler: async (ctx, { ticker }) => {
    const { dataSpaceId } = await requireAuth(ctx);
    const mapping = await ctx.db
      .query("tickerMap")
      .withIndex("by_dataSpace_ticker", (q) =>
        q.eq("dataSpaceId", dataSpaceId).eq("ticker", ticker.toUpperCase())
      )
      .first();
    return mapping;
  },
});

export const upsert = mutation({
  args: { ticker: v.string(), category: v.string(), source: v.optional(v.string()) },
  handler: async (ctx, { ticker, category, source }) => {
    const { dataSpaceId } = await requireAuth(ctx);
    const tickerUpper = ticker.toUpperCase().trim();
    const existing = await ctx.db
      .query("tickerMap")
      .withIndex("by_dataSpace_ticker", (q) =>
        q.eq("dataSpaceId", dataSpaceId).eq("ticker", tickerUpper)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { category, source: source ?? "user" });
      return existing._id;
    } else {
      return await ctx.db.insert("tickerMap", {
        ticker: tickerUpper,
        category,
        source: source ?? "user",
        dataSpaceId,
      });
    }
  },
});

export const remove = mutation({
  args: { ticker: v.string() },
  handler: async (ctx, { ticker }) => {
    const { dataSpaceId } = await requireAuth(ctx);
    const existing = await ctx.db
      .query("tickerMap")
      .withIndex("by_dataSpace_ticker", (q) =>
        q.eq("dataSpaceId", dataSpaceId).eq("ticker", ticker.toUpperCase())
      )
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

// Seed default tickers if the data space has none
export const seedDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    const { dataSpaceId } = await requireAuth(ctx);
    const existing = await ctx.db
      .query("tickerMap")
      .filter((q) => q.eq(q.field("dataSpaceId"), dataSpaceId))
      .collect();
    if (existing.length > 0) return { seeded: 0 };

    let seeded = 0;
    for (const [ticker, category] of Object.entries(DEFAULT_TICKERS)) {
      await ctx.db.insert("tickerMap", { ticker, category, source: "seed", dataSpaceId });
      seeded++;
    }
    return { seeded };
  },
});

// Resolve categories for a list of tickers
export const resolveCategories = query({
  args: { tickers: v.array(v.string()) },
  handler: async (ctx, { tickers }) => {
    const { dataSpaceId } = await requireAuth(ctx);
    const result: Record<string, { category: string; source: string } | null> = {};
    for (const ticker of tickers) {
      const mapping = await ctx.db
        .query("tickerMap")
        .withIndex("by_dataSpace_ticker", (q) =>
          q.eq("dataSpaceId", dataSpaceId).eq("ticker", ticker.toUpperCase())
        )
        .first();
      result[ticker] = mapping ? { category: mapping.category, source: mapping.source } : null;
    }
    return result;
  },
});
