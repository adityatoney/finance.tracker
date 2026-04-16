import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  statements: defineTable({
    brokerage: v.string(),
    statementDate: v.string(), // YYYY-MM
    fileName: v.string(),
    fileHash: v.string(),
    accountNumberEnc: v.string(), // AES-256-GCM encrypted
    ownerNameEnc: v.string(), // AES-256-GCM encrypted
    totalValue: v.float64(),
    netDeposits: v.float64(),
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
    .index("by_hash", ["fileHash"]),

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
  })
    .index("by_statement", ["statementId"])
    .index("by_ticker", ["ticker"])
    .index("by_category", ["category"]),

  deposits: defineTable({
    statementId: v.id("statements"),
    amount: v.float64(),
    description: v.string(),
    date: v.optional(v.string()),
  }).index("by_statement", ["statementId"]),

  tickerMap: defineTable({
    ticker: v.string(),
    category: v.string(), // foundational | value | growth | emergency_fund | btc_crypto
    source: v.string(), // "seed" | "user"
  }).index("by_ticker", ["ticker"]),

  monthlySnapshots: defineTable({
    month: v.string(), // YYYY-MM
    category: v.string(),
    totalValue: v.float64(),
    netDeposits: v.float64(),
    marketGain: v.float64(),
  })
    .index("by_month", ["month"])
    .index("by_month_category", ["month", "category"]),

  piiAuditLog: defineTable({
    statementId: v.optional(v.id("statements")),
    fieldName: v.string(),
    piiType: v.string(),
    action: v.string(),
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
  })
    .index("by_year", ["year"])
    .index("by_hash", ["fileHash"]),

  // ── Stock Watchlist ──
  watchlist: defineTable({
    ticker: v.string(),
    addedAt: v.string(),
    notes: v.optional(v.string()),
  }).index("by_ticker", ["ticker"]),

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
  }).index("by_ticker", ["ticker"]),
});
