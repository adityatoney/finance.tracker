import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,

  // ── Auth & Multi-Tenancy ──
  authorizedUsers: defineTable({
    authId: v.string(), // Auth0 subject (e.g., "google-oauth2|123")
    email: v.string(),
    name: v.string(),
    picture: v.optional(v.string()),
    role: v.string(), // "owner" | "member"
    dataSpaceId: v.string(), // UUID — shared or isolated
    invitedBy: v.optional(v.string()), // authId of inviter
  })
    .index("by_authId", ["authId"])
    .index("by_dataSpace", ["dataSpaceId"])
    .index("by_email", ["email"]),

  invites: defineTable({
    token: v.string(), // UUID
    createdBy: v.string(), // authId of creator
    accessType: v.string(), // "shared" | "isolated"
    dataSpaceId: v.string(), // inviter's dataSpaceId (used for "shared")
    expiresAt: v.string(), // ISO date
    status: v.string(), // "pending" | "used" | "revoked"
    usedByEmail: v.optional(v.string()),
  }).index("by_token", ["token"]),

  // ── Financial Data ──
  statements: defineTable({
    brokerage: v.string(),
    statementDate: v.string(), // YYYY-MM
    fileName: v.string(),
    fileHash: v.string(),
    accountNumberEnc: v.string(), // AES-256-GCM encrypted
    ownerNameEnc: v.string(), // AES-256-GCM encrypted
    totalValue: v.float64(),
    netDeposits: v.float64(),
    dataSpaceId: v.optional(v.string()),
    // Per-account breakdown stored as JSON array
    accounts: v.optional(
      v.array(
        v.object({
          accountNumber: v.string(),
          accountNumberMasked: v.string(),
          accountType: v.string(),
          totalValue: v.float64(),
          beginningValue: v.optional(v.float64()),
          endingValue: v.optional(v.float64()),
          changeInInvestment: v.optional(v.float64()),
          trackingMode: v.string(), // "detailed" | "aggregate"
        })
      )
    ),
  })
    .index("by_date", ["statementDate"])
    .index("by_hash", ["fileHash"])
    .index("by_dataSpace_date", ["dataSpaceId", "statementDate"]),

  holdings: defineTable({
    statementId: v.id("statements"),
    ticker: v.string(),
    name: v.string(),
    quantity: v.float64(),
    price: v.float64(),
    marketValue: v.float64(),
    beginningValue: v.optional(v.float64()),
    endingValue: v.optional(v.float64()),
    costBasis: v.optional(v.float64()),
    category: v.string(),
    brokerage: v.optional(v.string()), // denormalized for fast queries
    accountNumber: v.optional(v.string()), // which account this belongs to
    dataSpaceId: v.optional(v.string()),
  })
    .index("by_statement", ["statementId"])
    .index("by_ticker", ["ticker"])
    .index("by_category", ["category"])
    .index("by_dataSpace_ticker", ["dataSpaceId", "ticker"]),

  deposits: defineTable({
    statementId: v.id("statements"),
    amount: v.float64(),
    description: v.string(),
    date: v.optional(v.string()),
    dataSpaceId: v.optional(v.string()),
  }).index("by_statement", ["statementId"]),

  tickerMap: defineTable({
    ticker: v.string(),
    category: v.string(), // foundational | value | growth | emergency_fund | btc_crypto
    source: v.string(), // "seed" | "user"
    dataSpaceId: v.optional(v.string()),
  })
    .index("by_ticker", ["ticker"])
    .index("by_dataSpace_ticker", ["dataSpaceId", "ticker"]),

  monthlySnapshots: defineTable({
    month: v.string(), // YYYY-MM
    category: v.string(),
    totalValue: v.float64(),
    netDeposits: v.float64(),
    marketGain: v.float64(),
    dataSpaceId: v.optional(v.string()),
  })
    .index("by_month", ["month"])
    .index("by_month_category", ["month", "category"])
    .index("by_dataSpace_month", ["dataSpaceId", "month"]),

  piiAuditLog: defineTable({
    statementId: v.optional(v.id("statements")),
    fieldName: v.string(),
    piiType: v.string(),
    action: v.string(),
    dataSpaceId: v.optional(v.string()),
  }),

  retirementStatements: defineTable({
    year: v.string(), // "2024"
    planName: v.string(),
    beginningBalance: v.float64(),
    endingBalance: v.float64(),
    yourContributions: v.float64(),
    employerContributions: v.float64(),
    marketGain: v.float64(),
    vestedBalance: v.optional(v.float64()),
    periodStart: v.string(), // "2024-01-01"
    periodEnd: v.string(), // "2024-12-31"
    fileName: v.string(),
    fileHash: v.string(),
    dataSpaceId: v.optional(v.string()),
  })
    .index("by_year", ["year"])
    .index("by_hash", ["fileHash"])
    .index("by_dataSpace_year", ["dataSpaceId", "year"]),

  // ── Stock Watchlist ──
  watchlist: defineTable({
    ticker: v.string(),
    addedAt: v.string(),
    notes: v.optional(v.string()),
    dataSpaceId: v.optional(v.string()),
  })
    .index("by_ticker", ["ticker"])
    .index("by_dataSpace_ticker", ["dataSpaceId", "ticker"]),

  watchlistData: defineTable({
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
    // Denormalized valuation fields (from DCF engine)
    intrinsicValue: v.optional(v.float64()),
    marginOfSafety: v.optional(v.float64()),
    valuationClass: v.optional(v.string()),
    valuationUpdated: v.optional(v.string()),
  }).index("by_ticker", ["ticker"]),

  // ── Fundamentals (tenant-agnostic — AAPL financials are universal) ──
  fundamentals: defineTable({
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
  }).index("by_ticker", ["ticker"]),

  // ── Valuations (tenant-scoped — users may customize assumptions) ──
  valuations: defineTable({
    ticker: v.string(),
    dataSpaceId: v.optional(v.string()),
    scenario: v.string(), // "conservative" | "moderate" | "optimistic"
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
    classification: v.string(), // "deep_value" | "value" | "fair" | "overvalued"
    calculatedAt: v.string(),
    baseFcf: v.float64(),
  })
    .index("by_ticker", ["ticker"])
    .index("by_dataSpace_ticker", ["dataSpaceId", "ticker"]),

  // ── Time-Weighted Return Snapshots ──
  twrSnapshots: defineTable({
    dataSpaceId: v.optional(v.string()),
    scope: v.string(), // "portfolio" | category name | ticker
    twrCumulative: v.float64(),
    twrAnnualized: v.optional(v.float64()),
    periodStart: v.string(),
    periodEnd: v.string(),
    subPeriodReturns: v.array(
      v.object({
        month: v.string(),
        startValue: v.float64(),
        endValue: v.float64(),
        cashFlow: v.float64(),
        subPeriodReturn: v.float64(),
      })
    ),
    calculatedAt: v.string(),
  }).index("by_dataSpace_scope", ["dataSpaceId", "scope"]),

  // ── Moat Analysis ──
  moatAnalyses: defineTable({
    ticker: v.string(),
    companyName: v.string(),
    cik: v.optional(v.string()),
    overallScore: v.float64(),
    moatType: v.string(), // "wide" | "narrow" | "none"
    confidence: v.float64(),
    trend: v.string(), // "strengthening" | "stable" | "weakening"
    switchingCostsScore: v.float64(),
    networkEffectsScore: v.float64(),
    costLeadershipScore: v.float64(),
    intangibleAssetsScore: v.float64(),
    summary: v.string(),
    keyRisks: v.array(v.string()),
    managementTone: v.string(),
    filingsAnalyzed: v.float64(),
    analyzedAt: v.string(),
    modelUsed: v.string(),
    status: v.string(), // "pending" | "analyzing" | "complete" | "error"
    errorMessage: v.optional(v.string()),
    dataSpaceId: v.optional(v.string()),
  })
    .index("by_dataSpace_ticker", ["dataSpaceId", "ticker"])
    .index("by_ticker", ["ticker"])
    .index("by_score", ["overallScore"]),

  moatEvidence: defineTable({
    analysisId: v.id("moatAnalyses"),
    ticker: v.string(),
    category: v.string(), // "switching_costs" | "network_effects" | "cost_leadership" | "intangible_assets"
    quote: v.string(),
    context: v.string(),
    sentiment: v.string(), // "positive" | "negative" | "neutral"
    filingType: v.string(), // "10-K" | "10-Q" | "earnings_transcript"
    filingDate: v.string(),
    strength: v.float64(),
    dataSpaceId: v.optional(v.string()),
  })
    .index("by_analysis", ["analysisId"])
    .index("by_ticker_category", ["ticker", "category"]),

  moatScoreHistory: defineTable({
    ticker: v.string(),
    overallScore: v.float64(),
    switchingCostsScore: v.float64(),
    networkEffectsScore: v.float64(),
    costLeadershipScore: v.float64(),
    intangibleAssetsScore: v.float64(),
    confidence: v.float64(),
    recordedAt: v.string(),
    triggerFiling: v.optional(v.string()),
    dataSpaceId: v.optional(v.string()),
  })
    .index("by_dataSpace_ticker", ["dataSpaceId", "ticker"])
    .index("by_ticker_date", ["ticker", "recordedAt"]),

  secFilingCache: defineTable({
    ticker: v.string(),
    cik: v.string(),
    filingType: v.string(), // "10-K" | "10-Q" | "8-K"
    filingDate: v.string(),
    accessionNumber: v.string(),
    filingUrl: v.string(),
    extractedSections: v.optional(v.string()), // JSON stringified sections
    extractedAt: v.optional(v.string()),
    evidenceExtracted: v.boolean(),
  })
    .index("by_ticker_type", ["ticker", "filingType"])
    .index("by_accession", ["accessionNumber"]),
});
