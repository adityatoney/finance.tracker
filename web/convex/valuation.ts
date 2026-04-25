import { v } from "convex/values";
import { query, action, internalMutation, internalQuery, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";
import { requireAuth, requireIdentity } from "./lib/auth";

// Read at call time, not module load time (Convex env vars aren't available at top level)
function getFmpApiKey(): string {
  return process.env.FMP_API_KEY ?? "";
}

// Return type for fetchFundamentals (explicit to break circular type inference)
type FundamentalsResult = {
  ticker: string;
  fcfHistory: {
    year: string;
    freeCashFlow: number;
    revenue: number;
    netIncome: number;
    operatingCashFlow: number;
    capitalExpenditure: number;
  }[];
  sharesOutstanding: number;
  lastUpdated: string;
  revenueGrowth3y?: number;
  revenueGrowth5y?: number;
  fcfGrowth3y?: number;
  fcfGrowth5y?: number;
  totalDebt?: number;
  cashAndEquivalents?: number;
  beta?: number;
  currency?: string;
  fiscalYearEnd?: string;
  source: "cache" | "fetched";
};

// ── Helper: CAGR calculation ──

function calcCAGR(
  values: { year: string; value: number }[],
  years: number
): number | undefined {
  if (values.length < 2) return undefined;
  const sorted = [...values].sort((a, b) => a.year.localeCompare(b.year));
  const end = sorted[sorted.length - 1];
  const targetYear = parseInt(end.year) - years;
  let start = sorted[0];
  for (const entry of sorted) {
    if (parseInt(entry.year) <= targetYear) {
      start = entry;
    }
  }
  const actualYears = parseInt(end.year) - parseInt(start.year);
  if (actualYears <= 0 || start.value <= 0 || end.value <= 0) return undefined;
  return Math.pow(end.value / start.value, 1 / actualYears) - 1;
}

// ── Helper: run DCF for a single ticker (shared by calculateDcf and calculateDcfInternal) ──

interface DcfParams {
  fundamentals: {
    fcfHistory: {
      year: string;
      freeCashFlow: number;
      revenue: number;
      netIncome: number;
      operatingCashFlow: number;
      capitalExpenditure: number;
    }[];
    sharesOutstanding: number;
    totalDebt?: number;
    cashAndEquivalents?: number;
    beta?: number;
  };
  price: number;
  ticker: string;
}

interface DcfScenarioResult {
  scenario: string;
  intrinsicValuePerShare: number;
  marginOfSafety: number;
  classification: string;
  projectionYears: number;
  discountRate: number;
  terminalGrowthRate: number;
  fcfGrowthRate: number;
  totalPresentValueFCF: number;
  terminalValue: number;
  enterpriseValue: number;
  marketPrice: number;
  baseFcf: number;
}

function runDcfEngine(params: DcfParams): {
  scenarios: DcfScenarioResult[];
  wacc: number;
  baseFcf: number;
} {
  const { fundamentals, price, ticker } = params;
  const sharesOutstanding = fundamentals.sharesOutstanding;
  const totalDebt = fundamentals.totalDebt ?? 0;
  const cashAndEquivalents = fundamentals.cashAndEquivalents ?? 0;
  const beta = fundamentals.beta ?? 1.0;
  const fcfHistory = [...fundamentals.fcfHistory].sort((a, b) =>
    a.year.localeCompare(b.year)
  );

  // a. Select base FCF: most recent year if positive, else average of last 3 positive years
  let baseFcf: number;
  const mostRecent = fcfHistory[fcfHistory.length - 1];
  if (mostRecent && mostRecent.freeCashFlow > 0) {
    baseFcf = mostRecent.freeCashFlow;
  } else {
    const positiveYears = fcfHistory
      .filter((h) => h.freeCashFlow > 0)
      .slice(-3);
    if (positiveYears.length === 0) {
      throw new Error(
        `DCF not applicable for ${ticker}: no positive free cash flow in history`
      );
    }
    baseFcf =
      positiveYears.reduce((sum, h) => sum + h.freeCashFlow, 0) /
      positiveYears.length;
  }

  // b. Calculate historical FCF CAGR using first and last POSITIVE FCF values
  const positiveFcfEntries = fcfHistory.filter((h) => h.freeCashFlow > 0);
  let historicalCagr = 0;
  if (positiveFcfEntries.length >= 2) {
    const first = positiveFcfEntries[0];
    const last = positiveFcfEntries[positiveFcfEntries.length - 1];
    const years = parseInt(last.year) - parseInt(first.year);
    if (years > 0 && first.freeCashFlow > 0 && last.freeCashFlow > 0) {
      historicalCagr =
        Math.pow(last.freeCashFlow / first.freeCashFlow, 1 / years) - 1;
    }
  }

  // c. WACC calculation
  // Cost of equity = risk-free rate (4.25%) + beta * equity risk premium (5.5%)
  const costOfEquity = 0.0425 + beta * 0.055;

  let wacc: number;
  if (totalDebt > 0) {
    const equityValue = sharesOutstanding * price;
    const debtValue = totalDebt;
    const totalValue = equityValue + debtValue;
    if (totalValue > 0) {
      // WACC = (E/V) * costOfEquity + (D/V) * 5.0% * (1 - 21%)
      wacc =
        (equityValue / totalValue) * costOfEquity +
        (debtValue / totalValue) * 0.05 * (1 - 0.21);
    } else {
      wacc = costOfEquity;
    }
  } else {
    wacc = costOfEquity;
  }

  const terminalGrowthRate = 0.025; // 2.5%
  const projectionYears = 10;

  // Scenario growth rates
  type ScenarioConfig = { name: string; growthRate: number };
  const scenarioConfigs: ScenarioConfig[] = [];

  if (historicalCagr < 0) {
    // Negative CAGR: conservative=0%, moderate=2%, optimistic=5%
    scenarioConfigs.push(
      { name: "conservative", growthRate: 0 },
      { name: "moderate", growthRate: 0.02 },
      { name: "optimistic", growthRate: 0.05 }
    );
  } else {
    scenarioConfigs.push(
      { name: "conservative", growthRate: Math.min(historicalCagr * 0.5, 0.05) },
      { name: "moderate", growthRate: Math.min(historicalCagr * 0.75, 0.10) },
      { name: "optimistic", growthRate: Math.min(historicalCagr, 0.15) }
    );
  }

  const scenarios: DcfScenarioResult[] = [];

  for (const config of scenarioConfigs) {
    // Project FCF for 10 years
    const projectedFcfs: number[] = [];
    for (let year = 1; year <= projectionYears; year++) {
      projectedFcfs.push(baseFcf * Math.pow(1 + config.growthRate, year));
    }

    // Discount projected FCFs at WACC
    let totalPresentValueFCF = 0;
    for (let i = 0; i < projectedFcfs.length; i++) {
      totalPresentValueFCF += projectedFcfs[i] / Math.pow(1 + wacc, i + 1);
    }

    // Terminal value
    let terminalValue: number;
    const lastProjectedFcf = projectedFcfs[projectedFcfs.length - 1];

    if (wacc > terminalGrowthRate + 0.0001) {
      // Gordon Growth Model: TV = FCF_{n+1} / (WACC - g)
      const terminalFcf = lastProjectedFcf * (1 + terminalGrowthRate);
      terminalValue = terminalFcf / (wacc - terminalGrowthRate);
    } else {
      // Exit multiple: 15x FCF
      terminalValue = lastProjectedFcf * 15;
    }

    // Present value of terminal value
    const pvTerminal = terminalValue / Math.pow(1 + wacc, projectionYears);

    // Enterprise value = PV of FCFs + PV of Terminal
    const enterpriseValue = totalPresentValueFCF + pvTerminal;

    // Equity value = EV - debt + cash
    const equityValue = enterpriseValue - totalDebt + cashAndEquivalents;

    // Intrinsic value per share
    const intrinsicValuePerShare =
      sharesOutstanding > 0
        ? Math.max(equityValue / sharesOutstanding, 0)
        : 0;

    // Margin of Safety = (intrinsic - price) / intrinsic * 100
    const marginOfSafety =
      intrinsicValuePerShare > 0
        ? ((intrinsicValuePerShare - price) / intrinsicValuePerShare) * 100
        : -100;

    // Classification
    let classification: string;
    if (marginOfSafety > 40) {
      classification = "deep_value";
    } else if (marginOfSafety >= 20) {
      classification = "value";
    } else if (marginOfSafety >= 0) {
      classification = "fair";
    } else {
      classification = "overvalued";
    }

    scenarios.push({
      scenario: config.name,
      intrinsicValuePerShare,
      marginOfSafety,
      classification,
      projectionYears,
      discountRate: wacc,
      terminalGrowthRate,
      fcfGrowthRate: config.growthRate,
      totalPresentValueFCF,
      terminalValue,
      enterpriseValue,
      marketPrice: price,
      baseFcf,
    });
  }

  return { scenarios, wacc, baseFcf };
}

// ── Helper: fetch and parse FMP data ──

async function fetchAndParseFmpData(ticker: string) {
  const apiKey = getFmpApiKey();
  if (!apiKey) {
    throw new Error("FMP_API_KEY is not configured");
  }

  const headers = { "User-Agent": "FinanceTracker/1.0" };

  // Fetch endpoints sequentially to respect FMP free tier rate limits
  const base = "https://financialmodelingprep.com/stable";
  // Strip exchange prefix (e.g., "NYSE:TSM" → "TSM") — FMP uses plain ticker symbols
  const plainTicker = ticker.includes(":") ? ticker.split(":").pop()! : ticker;
  const sym = encodeURIComponent(plainTicker);
  const profileRes = await fetch(`${base}/profile?symbol=${sym}&apikey=${apiKey}`, { headers });
  const cashFlowRes = await fetch(`${base}/cash-flow-statement?symbol=${sym}&period=annual&limit=5&apikey=${apiKey}`, { headers });
  const incomeRes = await fetch(`${base}/income-statement?symbol=${sym}&period=annual&limit=5&apikey=${apiKey}`, { headers });
  const balanceRes = await fetch(`${base}/balance-sheet-statement?symbol=${sym}&period=annual&limit=1&apikey=${apiKey}`, { headers });

  // Profile is required; financial statements may be unavailable for ETFs
  if (!profileRes.ok) {
    throw new Error(`FMP profile API returned ${profileRes.status} for ${ticker}`);
  }
  if (!cashFlowRes.ok || !incomeRes.ok) {
    const cfStatus = cashFlowRes.status;
    const incStatus = incomeRes.status;
    const cfBody = !cashFlowRes.ok ? await cashFlowRes.text().catch(() => "") : "";
    const incBody = !incomeRes.ok ? await incomeRes.text().catch(() => "") : "";
    if (cfStatus === 429 || incStatus === 429) {
      throw new Error(`FMP rate limit hit for ${ticker}. Try again in a few minutes.`);
    }
    throw new Error(`FMP failed for ${ticker}: cash-flow=${cfStatus} income=${incStatus} body=${(cfBody || incBody).substring(0, 200)}`);
  }
  if (!balanceRes.ok) {
    // Balance sheet is optional — continue without debt/cash data
    console.error(`FMP balance-sheet API returned ${balanceRes.status} for ${ticker}, continuing without it`);
  }

  const cashFlowData = await cashFlowRes.json();
  const incomeData = await incomeRes.json();
  const profileData = await profileRes.json();
  const balanceData = balanceRes.ok ? await balanceRes.json() : [];

  if (!Array.isArray(cashFlowData) || cashFlowData.length === 0) {
    throw new Error(`No cash flow data found for ${ticker}`);
  }

  // Build a map of income data by year
  const incomeByYear: Record<string, any> = {};
  if (Array.isArray(incomeData)) {
    for (const item of incomeData) {
      const year = item.calendarYear ?? item.date?.substring(0, 4);
      if (year) incomeByYear[year] = item;
    }
  }

  // Build fcfHistory by merging cash flow + income by year
  const fcfHistory: {
    year: string;
    freeCashFlow: number;
    revenue: number;
    netIncome: number;
    operatingCashFlow: number;
    capitalExpenditure: number;
  }[] = [];

  for (const cf of cashFlowData) {
    const year = cf.calendarYear ?? cf.date?.substring(0, 4);
    if (!year) continue;

    const income = incomeByYear[year];

    fcfHistory.push({
      year,
      freeCashFlow: cf.freeCashFlow ?? 0,
      revenue: income?.revenue ?? 0,
      netIncome: income?.netIncome ?? 0,
      operatingCashFlow: cf.operatingCashFlow ?? 0,
      capitalExpenditure: cf.capitalExpenditures ?? cf.capitalExpenditure ?? 0,
    });
  }

  // Sort by year ascending
  fcfHistory.sort((a, b) => a.year.localeCompare(b.year));

  // Extract profile info
  const profile = Array.isArray(profileData) ? profileData[0] : profileData;
  const sharesOutstanding =
    profile?.marketCap && profile?.price
      ? Math.round(profile.marketCap / profile.price)
      : profile?.mktCap && profile?.price
        ? Math.round(profile.mktCap / profile.price)
        : profile?.sharesOutstanding ?? 0;
  const beta: number | undefined = profile?.beta ?? undefined;
  const currency: string | undefined = profile?.currency ?? undefined;
  const fiscalYearEnd: string | undefined = profile?.ipoDate ? undefined : undefined;

  // Extract balance sheet info
  const balance = Array.isArray(balanceData) ? balanceData[0] : balanceData;
  const totalDebt: number | undefined = balance?.totalDebt ?? undefined;
  const cashAndEquivalents: number | undefined =
    balance?.cashAndCashEquivalents ??
    balance?.cashAndShortTermInvestments ??
    undefined;

  // Revenue growth CAGRs
  const revenueValues = fcfHistory
    .filter((h) => h.revenue > 0)
    .map((h) => ({ year: h.year, value: h.revenue }));
  const revenueGrowth3y = calcCAGR(revenueValues, 3);
  const revenueGrowth5y = calcCAGR(revenueValues, 5);

  // FCF growth CAGRs
  const fcfValues = fcfHistory
    .filter((h) => h.freeCashFlow > 0)
    .map((h) => ({ year: h.year, value: h.freeCashFlow }));
  const fcfGrowth3y = calcCAGR(fcfValues, 3);
  const fcfGrowth5y = calcCAGR(fcfValues, 5);

  return {
    fcfHistory,
    sharesOutstanding,
    totalDebt,
    cashAndEquivalents,
    beta,
    currency,
    fiscalYearEnd,
    revenueGrowth3y,
    revenueGrowth5y,
    fcfGrowth3y,
    fcfGrowth5y,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Internal Queries
// ══════════════════════════════════════════════════════════════════════════════

export const getFundamentalsInternal = internalQuery({
  args: { ticker: v.string() },
  handler: async (ctx, { ticker }) => {
    return await ctx.db
      .query("fundamentals")
      .withIndex("by_ticker", (q) => q.eq("ticker", ticker))
      .first();
  },
});

export const getWatchlistPriceInternal = internalQuery({
  args: { ticker: v.string() },
  handler: async (ctx, { ticker }) => {
    return await ctx.db
      .query("watchlistData")
      .withIndex("by_ticker", (q) => q.eq("ticker", ticker))
      .first();
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// Internal Mutations
// ══════════════════════════════════════════════════════════════════════════════

export const upsertFundamentalsInternal = internalMutation({
  args: {
    ticker: v.string(),
    fcfHistory: v.array(
      v.object({
        year: v.string(),
        freeCashFlow: v.float64(),
        revenue: v.float64(),
        netIncome: v.float64(),
        operatingCashFlow: v.float64(),
        capitalExpenditure: v.float64(),
      })
    ),
    revenueGrowth3y: v.optional(v.float64()),
    revenueGrowth5y: v.optional(v.float64()),
    fcfGrowth3y: v.optional(v.float64()),
    fcfGrowth5y: v.optional(v.float64()),
    sharesOutstanding: v.float64(),
    totalDebt: v.optional(v.float64()),
    cashAndEquivalents: v.optional(v.float64()),
    beta: v.optional(v.float64()),
    currency: v.optional(v.string()),
    fiscalYearEnd: v.optional(v.string()),
    lastUpdated: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("fundamentals")
      .withIndex("by_ticker", (q) => q.eq("ticker", args.ticker))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        fcfHistory: args.fcfHistory,
        revenueGrowth3y: args.revenueGrowth3y,
        revenueGrowth5y: args.revenueGrowth5y,
        fcfGrowth3y: args.fcfGrowth3y,
        fcfGrowth5y: args.fcfGrowth5y,
        sharesOutstanding: args.sharesOutstanding,
        totalDebt: args.totalDebt,
        cashAndEquivalents: args.cashAndEquivalents,
        beta: args.beta,
        currency: args.currency,
        fiscalYearEnd: args.fiscalYearEnd,
        lastUpdated: args.lastUpdated,
      });
    } else {
      await ctx.db.insert("fundamentals", args);
    }
  },
});

export const upsertValuationInternal = internalMutation({
  args: {
    ticker: v.string(),
    dataSpaceId: v.optional(v.string()),
    scenario: v.string(),
    projectionYears: v.float64(),
    discountRate: v.float64(),
    terminalGrowthRate: v.float64(),
    fcfGrowthRate: v.float64(),
    intrinsicValuePerShare: v.float64(),
    totalPresentValueFCF: v.float64(),
    terminalValue: v.float64(),
    enterpriseValue: v.float64(),
    marketPrice: v.float64(),
    marginOfSafety: v.float64(),
    classification: v.string(),
    calculatedAt: v.string(),
    baseFcf: v.float64(),
  },
  handler: async (ctx, args) => {
    // Delete existing matching records for this ticker + scenario + dataSpaceId
    const existing = await ctx.db
      .query("valuations")
      .withIndex("by_dataSpace_ticker", (q) =>
        q.eq("dataSpaceId", args.dataSpaceId).eq("ticker", args.ticker)
      )
      .collect();

    for (const record of existing) {
      if (record.scenario === args.scenario) {
        await ctx.db.delete(record._id);
      }
    }

    await ctx.db.insert("valuations", args);
  },
});

export const updateWatchlistValuation = internalMutation({
  args: {
    ticker: v.string(),
    intrinsicValue: v.float64(),
    marginOfSafety: v.float64(),
    valuationClass: v.string(),
    valuationUpdated: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("watchlistData")
      .withIndex("by_ticker", (q) => q.eq("ticker", args.ticker))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        intrinsicValue: args.intrinsicValue,
        marginOfSafety: args.marginOfSafety,
        valuationClass: args.valuationClass,
        valuationUpdated: args.valuationUpdated,
      });
    }
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// Public Queries
// ══════════════════════════════════════════════════════════════════════════════

export const getValuation = query({
  args: { ticker: v.string() },
  handler: async (ctx, { ticker }) => {
    const { dataSpaceId } = await requireAuth(ctx);
    const upper = ticker.toUpperCase().trim();

    return await ctx.db
      .query("valuations")
      .withIndex("by_dataSpace_ticker", (q) =>
        q.eq("dataSpaceId", dataSpaceId).eq("ticker", upper)
      )
      .collect();
  },
});

export const listValuations = query({
  args: {},
  handler: async (ctx) => {
    const { dataSpaceId } = await requireAuth(ctx);

    const all = await ctx.db
      .query("valuations")
      .withIndex("by_dataSpace_ticker", (q) =>
        q.eq("dataSpaceId", dataSpaceId)
      )
      .collect();

    // Return only moderate-scenario valuations
    return all.filter((val) => val.scenario === "moderate");
  },
});

export const getFundamentals = query({
  args: { ticker: v.string() },
  handler: async (ctx, { ticker }) => {
    await requireAuth(ctx);
    const upper = ticker.toUpperCase().trim();

    return await ctx.db
      .query("fundamentals")
      .withIndex("by_ticker", (q) => q.eq("ticker", upper))
      .first();
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// Actions
// ══════════════════════════════════════════════════════════════════════════════

export const fetchFundamentals = action({
  args: { ticker: v.string() },
  handler: async (ctx, { ticker }): Promise<FundamentalsResult> => {
    await requireIdentity(ctx);

    const upper = ticker.toUpperCase().trim();

    // Check cache: if fundamentals exist and lastUpdated < 24h ago, skip
    const cached: Doc<"fundamentals"> | null = await ctx.runQuery(
      internal.valuation.getFundamentalsInternal,
      { ticker: upper }
    );
    if (cached) {
      const lastUpdated = new Date(cached.lastUpdated).getTime();
      const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
      if (lastUpdated > twentyFourHoursAgo) {
        return {
          ticker: cached.ticker,
          fcfHistory: cached.fcfHistory,
          sharesOutstanding: cached.sharesOutstanding,
          lastUpdated: cached.lastUpdated,
          revenueGrowth3y: cached.revenueGrowth3y,
          revenueGrowth5y: cached.revenueGrowth5y,
          fcfGrowth3y: cached.fcfGrowth3y,
          fcfGrowth5y: cached.fcfGrowth5y,
          totalDebt: cached.totalDebt,
          cashAndEquivalents: cached.cashAndEquivalents,
          beta: cached.beta,
          currency: cached.currency,
          fiscalYearEnd: cached.fiscalYearEnd,
          source: "cache" as const,
        };
      }
    }

    const data = await fetchAndParseFmpData(upper);
    const now = new Date().toISOString();

    await ctx.runMutation(internal.valuation.upsertFundamentalsInternal, {
      ticker: upper,
      fcfHistory: data.fcfHistory,
      revenueGrowth3y: data.revenueGrowth3y,
      revenueGrowth5y: data.revenueGrowth5y,
      fcfGrowth3y: data.fcfGrowth3y,
      fcfGrowth5y: data.fcfGrowth5y,
      sharesOutstanding: data.sharesOutstanding,
      totalDebt: data.totalDebt,
      cashAndEquivalents: data.cashAndEquivalents,
      beta: data.beta,
      currency: data.currency,
      fiscalYearEnd: data.fiscalYearEnd,
      lastUpdated: now,
    });

    return {
      ticker: upper,
      fcfHistory: data.fcfHistory,
      sharesOutstanding: data.sharesOutstanding,
      lastUpdated: now,
      revenueGrowth3y: data.revenueGrowth3y,
      revenueGrowth5y: data.revenueGrowth5y,
      fcfGrowth3y: data.fcfGrowth3y,
      fcfGrowth5y: data.fcfGrowth5y,
      totalDebt: data.totalDebt,
      cashAndEquivalents: data.cashAndEquivalents,
      beta: data.beta,
      currency: data.currency,
      fiscalYearEnd: data.fiscalYearEnd,
      source: "fetched" as const,
    };
  },
});

export const fetchAllFundamentals = action({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);

    const user = await ctx.runQuery(internal.users.getUserByAuthId, {
      authId: identity.subject,
    });
    if (!user) throw new Error("Unauthorized");

    const items = await ctx.runQuery(internal.watchlist.listInternal, {
      dataSpaceId: user.dataSpaceId,
    });

    let fetched = 0;
    let errors = 0;

    for (const item of items) {
      try {
        await ctx.runAction(api.valuation.fetchFundamentals, {
          ticker: item.ticker,
        });
        fetched++;
        // Politeness delay between API calls
        await new Promise((r) => setTimeout(r, 500));
      } catch (err) {
        console.error(`Failed to fetch fundamentals for ${item.ticker}:`, err);
        errors++;
      }
    }

    return { fetched, errors, timestamp: new Date().toISOString() };
  },
});

export const calculateDcf = action({
  args: { ticker: v.string() },
  handler: async (ctx, { ticker }) => {
    const identity = await requireIdentity(ctx);

    const user = await ctx.runQuery(internal.users.getUserByAuthId, {
      authId: identity.subject,
    });
    if (!user) throw new Error("Unauthorized");

    const upper = ticker.toUpperCase().trim();

    // Read fundamentals
    const fundamentals = await ctx.runQuery(
      internal.valuation.getFundamentalsInternal,
      { ticker: upper }
    );
    if (!fundamentals) {
      throw new Error(
        `No fundamentals data for ${upper}. Fetch fundamentals first.`
      );
    }

    // Read current price from watchlistData
    const watchlistData = await ctx.runQuery(
      internal.valuation.getWatchlistPriceInternal,
      { ticker: upper }
    );
    if (!watchlistData || !watchlistData.price || watchlistData.price <= 0) {
      throw new Error(
        `No market price for ${upper}. Refresh watchlist data first.`
      );
    }

    const price = watchlistData.price;
    const now = new Date().toISOString();

    // Run the DCF engine
    const { scenarios, wacc, baseFcf } = runDcfEngine({
      fundamentals,
      price,
      ticker: upper,
    });

    // Store all 3 scenarios
    for (const scenario of scenarios) {
      await ctx.runMutation(internal.valuation.upsertValuationInternal, {
        ticker: upper,
        dataSpaceId: user.dataSpaceId,
        scenario: scenario.scenario,
        projectionYears: scenario.projectionYears,
        discountRate: scenario.discountRate,
        terminalGrowthRate: scenario.terminalGrowthRate,
        fcfGrowthRate: scenario.fcfGrowthRate,
        intrinsicValuePerShare: scenario.intrinsicValuePerShare,
        totalPresentValueFCF: scenario.totalPresentValueFCF,
        terminalValue: scenario.terminalValue,
        enterpriseValue: scenario.enterpriseValue,
        marketPrice: scenario.marketPrice,
        marginOfSafety: scenario.marginOfSafety,
        classification: scenario.classification,
        calculatedAt: now,
        baseFcf: scenario.baseFcf,
      });
    }

    // Update watchlistData with moderate scenario
    const moderate = scenarios.find((s) => s.scenario === "moderate");
    if (moderate) {
      await ctx.runMutation(internal.valuation.updateWatchlistValuation, {
        ticker: upper,
        intrinsicValue: moderate.intrinsicValuePerShare,
        marginOfSafety: moderate.marginOfSafety,
        valuationClass: moderate.classification,
        valuationUpdated: now,
      });
    }

    return {
      ticker: upper,
      scenarios: scenarios.map((s) => ({
        scenario: s.scenario,
        intrinsicValuePerShare: s.intrinsicValuePerShare,
        marginOfSafety: s.marginOfSafety,
        classification: s.classification,
      })),
      wacc,
      baseFcf,
      calculatedAt: now,
    };
  },
});

export const calculateAllDcf = action({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);

    const user = await ctx.runQuery(internal.users.getUserByAuthId, {
      authId: identity.subject,
    });
    if (!user) throw new Error("Unauthorized");

    const items = await ctx.runQuery(internal.watchlist.listInternal, {
      dataSpaceId: user.dataSpaceId,
    });

    // Fetch fundamentals and calculate DCF inline (avoid nested action calls)
    let calculated = 0;
    let errors = 0;
    const failures: { ticker: string; error: string }[] = [];

    for (const item of items) {
      const upper = item.ticker.toUpperCase().trim();
      try {
        // Check cache first
        const cached = await ctx.runQuery(
          internal.valuation.getFundamentalsInternal,
          { ticker: upper }
        );
        const needsFetch = !cached || (Date.now() - new Date(cached.lastUpdated).getTime() > 24 * 60 * 60 * 1000);

        if (needsFetch) {
          const data = await fetchAndParseFmpData(upper);
          const now = new Date().toISOString();
          await ctx.runMutation(internal.valuation.upsertFundamentalsInternal, {
            ticker: upper,
            fcfHistory: data.fcfHistory,
            revenueGrowth3y: data.revenueGrowth3y,
            revenueGrowth5y: data.revenueGrowth5y,
            fcfGrowth3y: data.fcfGrowth3y,
            fcfGrowth5y: data.fcfGrowth5y,
            sharesOutstanding: data.sharesOutstanding,
            totalDebt: data.totalDebt,
            cashAndEquivalents: data.cashAndEquivalents,
            beta: data.beta,
            currency: data.currency,
            fiscalYearEnd: data.fiscalYearEnd,
            lastUpdated: now,
          });
          // Respect FMP free tier rate limits (5 requests/sec)
          await new Promise((r) => setTimeout(r, 2000));
        }

        // Now calculate DCF
        await ctx.runAction(api.valuation.calculateDcf, {
          ticker: item.ticker,
        });
        calculated++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Failed DCF for ${upper}: ${message}`);
        failures.push({ ticker: upper, error: message });
        errors++;

        // Write skip reason to watchlistData so the UI can show it
        let skipClass = "error";
        if (message.includes("no financial statements") || message.includes("ETF")) {
          skipClass = "etf_skip";
        } else if (message.includes("402") || message.includes("not available under your current subscription")) {
          skipClass = "restricted";
        } else if (message.includes("429") || message.includes("rate limit")) {
          skipClass = "rate_limited";
        }
        try {
          await ctx.runMutation(internal.valuation.updateWatchlistValuation, {
            ticker: item.ticker,
            intrinsicValue: 0,
            marginOfSafety: 0,
            valuationClass: skipClass,
            valuationUpdated: new Date().toISOString(),
          });
        } catch {
          // Best effort — don't fail the loop
        }
      }
    }

    return {
      calculated,
      errors,
      failures,
      timestamp: new Date().toISOString(),
    };
  },
});

// Internal action for CLI testing — no auth required
export const testFetchFundamentals = internalAction({
  args: { ticker: v.string() },
  handler: async (ctx, { ticker }) => {
    const upper = ticker.toUpperCase().trim();
    const data = await fetchAndParseFmpData(upper);
    const now = new Date().toISOString();
    await ctx.runMutation(internal.valuation.upsertFundamentalsInternal, {
      ticker: upper,
      fcfHistory: data.fcfHistory,
      revenueGrowth3y: data.revenueGrowth3y,
      revenueGrowth5y: data.revenueGrowth5y,
      fcfGrowth3y: data.fcfGrowth3y,
      fcfGrowth5y: data.fcfGrowth5y,
      sharesOutstanding: data.sharesOutstanding,
      totalDebt: data.totalDebt,
      cashAndEquivalents: data.cashAndEquivalents,
      beta: data.beta,
      currency: data.currency,
      fiscalYearEnd: data.fiscalYearEnd,
      lastUpdated: now,
    });
    return { ticker: upper, fcfYears: data.fcfHistory.length, sharesOutstanding: data.sharesOutstanding };
  },
});
