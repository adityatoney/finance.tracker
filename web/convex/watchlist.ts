import { v } from "convex/values";
import { query, mutation, action } from "./_generated/server";
import { api } from "./_generated/api";

// ── Queries ──

export const list = query({
  args: {},
  handler: async (ctx) => {
    const items = await ctx.db.query("watchlist").collect();
    const result = [];

    for (const item of items) {
      const data = await ctx.db
        .query("watchlistData")
        .withIndex("by_ticker", (q) => q.eq("ticker", item.ticker))
        .first();

      result.push({
        ...item,
        data: data ?? null,
      });
    }

    return result;
  },
});

// ── Mutations ──

export const add = mutation({
  args: { ticker: v.string(), notes: v.optional(v.string()) },
  handler: async (ctx, { ticker, notes }) => {
    const upper = ticker.toUpperCase().trim();
    const existing = await ctx.db
      .query("watchlist")
      .withIndex("by_ticker", (q) => q.eq("ticker", upper))
      .first();

    if (existing) throw new Error(`${upper} is already in your watchlist`);

    return await ctx.db.insert("watchlist", {
      ticker: upper,
      addedAt: new Date().toISOString(),
      notes,
    });
  },
});

export const remove = mutation({
  args: { ticker: v.string() },
  handler: async (ctx, { ticker }) => {
    const upper = ticker.toUpperCase().trim();

    const item = await ctx.db
      .query("watchlist")
      .withIndex("by_ticker", (q) => q.eq("ticker", upper))
      .first();
    if (item) await ctx.db.delete(item._id);

    const data = await ctx.db
      .query("watchlistData")
      .withIndex("by_ticker", (q) => q.eq("ticker", upper))
      .first();
    if (data) await ctx.db.delete(data._id);
  },
});

export const updateNote = mutation({
  args: { ticker: v.string(), notes: v.string() },
  handler: async (ctx, { ticker, notes }) => {
    const item = await ctx.db
      .query("watchlist")
      .withIndex("by_ticker", (q) => q.eq("ticker", ticker.toUpperCase()))
      .first();
    if (item) await ctx.db.patch(item._id, { notes });
  },
});

// Internal mutation to upsert watchlist data
export const upsertData = mutation({
  args: {
    ticker: v.string(),
    name: v.optional(v.string()),
    marketCap: v.optional(v.string()),
    price: v.optional(v.float64()),
    change: v.optional(v.float64()),
    changePct: v.optional(v.float64()),
    high52w: v.optional(v.float64()),
    low52w: v.optional(v.float64()),
    pctInRange: v.optional(v.float64()),
    change1m: v.optional(v.float64()),
    change6m: v.optional(v.float64()),
    change1y: v.optional(v.float64()),
    change3y: v.optional(v.float64()),
    change5y: v.optional(v.float64()),
    sector: v.optional(v.string()),
    lastUpdated: v.string(),
    lastHistoryUpdate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("watchlistData")
      .withIndex("by_ticker", (q) => q.eq("ticker", args.ticker))
      .first();

    if (existing) {
      const patch: Record<string, unknown> = { lastUpdated: args.lastUpdated };
      for (const [key, val] of Object.entries(args)) {
        if (val !== undefined && key !== "ticker") {
          patch[key] = val;
        }
      }
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("watchlistData", args);
    }
  },
});

// ── Actions (Yahoo Finance — daily data, matches Google Finance exactly) ──

/**
 * Refresh a single ticker from Yahoo Finance.
 *
 * Uses daily interval over 5Y range to get exact close prices from
 * 30/183/365/1095/1825 days ago — matches GOOGLEFINANCE() methodology.
 * Uses unadjusted close prices (same as Google Finance).
 *
 * No API key needed. No rate limits for reasonable usage.
 */
export const refreshTicker = action({
  args: { ticker: v.string() },
  handler: async (ctx, { ticker }) => {
    const upper = ticker.toUpperCase().trim();
    // Normalize for Yahoo:
    //   NYSE:BRK.B → BRK-B (strip exchange prefix, replace . with -)
    //   NYSE:TSM → TSM (strip exchange prefix)
    //   BRK.B → BRK-B (replace . with -)
    let yahooTicker = upper.includes(":") ? upper.split(":").pop()! : upper;
    yahooTicker = yahooTicker.replace(".", "-");
    const now = new Date().toISOString();
    const nowMs = Date.now();
    const DAY_MS = 86400000;

    // Fetch 5Y of daily data (unadjusted close)
    const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}?range=5y&interval=1d&includePrePost=false`;
    const chartRes = await fetch(chartUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
    });

    if (!chartRes.ok) {
      throw new Error(`Yahoo Finance returned ${chartRes.status} for ${upper}. Check the ticker symbol.`);
    }

    const chartJson = await chartRes.json();
    const result = chartJson?.chart?.result?.[0];

    if (!result) {
      throw new Error(`No data found for ${upper}. Check the ticker symbol.`);
    }

    const meta = result.meta || {};
    const timestamps: number[] = result.timestamp || [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close || [];

    const price = meta.regularMarketPrice ?? 0;
    const name = meta.shortName || meta.longName || meta.symbol || upper;
    const high52w = meta.fiftyTwoWeekHigh ?? undefined;
    const low52w = meta.fiftyTwoWeekLow ?? undefined;

    // % in 52W range
    let pctInRange: number | undefined;
    if (high52w && low52w && high52w > low52w) {
      pctInRange = ((price - low52w) / (high52w - low52w)) * 100;
    }

    // Find the close price from exactly N calendar days ago (nearest trading day)
    const findClose = (daysAgo: number): number | undefined => {
      if (timestamps.length === 0) return undefined;
      const targetMs = nowMs - daysAgo * DAY_MS;
      let bestIdx = 0;
      let bestDiff = Math.abs(timestamps[0] * 1000 - targetMs);
      for (let j = 1; j < timestamps.length; j++) {
        const diff = Math.abs(timestamps[j] * 1000 - targetMs);
        if (diff < bestDiff) { bestDiff = diff; bestIdx = j; }
      }
      const val = closes[bestIdx];
      return val && val > 0 ? val : undefined;
    };

    const pctChange = (daysAgo: number): number | undefined => {
      const past = findClose(daysAgo);
      if (!past || !price) return undefined;
      return ((price - past) / past) * 100;
    };

    // Daily change: current price vs PREVIOUS TRADING DAY close
    // Use the second-to-last data point (last is today/current, second-to-last is prev close)
    let change: number | undefined;
    let changePct: number | undefined;
    if (closes.length >= 2) {
      // Walk backwards to find the last two valid closes
      let currentClose: number | undefined;
      let prevClose: number | undefined;
      for (let i = closes.length - 1; i >= 0; i--) {
        if (closes[i] && closes[i]! > 0) {
          if (!currentClose) {
            currentClose = closes[i]!;
          } else {
            prevClose = closes[i]!;
            break;
          }
        }
      }
      // Use regularMarketPrice (real-time) vs previous trading day close
      if (prevClose && prevClose > 0) {
        change = price - prevClose;
        changePct = (change / prevClose) * 100;
      }
    }

    // Historical % changes — exact calendar day matching
    const change1m = pctChange(30);
    const change6m = pctChange(183);
    const change1y = pctChange(365);
    const change3y = pctChange(1095);
    const change5y = pctChange(1825);

    // Save to Convex
    await ctx.runMutation(api.watchlist.upsertData, {
      ticker: upper,
      name,
      price,
      change,
      changePct,
      high52w,
      low52w,
      pctInRange,
      change1m,
      change6m,
      change1y,
      change3y,
      change5y,
      lastUpdated: now,
      lastHistoryUpdate: now,
    });

    return { ticker: upper, price, name };
  },
});

/**
 * Refresh ALL watchlist tickers from Yahoo Finance.
 * No rate limits — just a small politeness delay between requests.
 */
export const refreshAll = action({
  args: {},
  handler: async (ctx): Promise<{ updated: number; errors: number; timestamp: string }> => {
    const items = await ctx.runQuery(api.watchlist.list, {});

    let updated = 0;
    let errors = 0;

    for (const item of items) {
      try {
        await ctx.runAction(api.watchlist.refreshTicker, { ticker: item.ticker });
        updated++;
        // Small politeness delay
        await new Promise((r) => setTimeout(r, 300));
      } catch (err) {
        console.error(`Failed to refresh ${item.ticker}:`, err);
        errors++;
      }
    }

    return { updated, errors, timestamp: new Date().toISOString() };
  },
});
