import { v } from "convex/values";
import { query, mutation, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

// ── PII Encryption (AES-256-GCM via Web Crypto API) ──
// Key from environment variable, set in Convex dashboard
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? "";

// Helper: base64 encode/decode for Convex V8 runtime
function toBase64(buf: Uint8Array): string {
  let binary = "";
  for (const byte of buf) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(str: string): Uint8Array {
  // Convert URL-safe base64 (- _ no padding) to standard base64 (+ / =)
  let std = str.replace(/-/g, "+").replace(/_/g, "/");
  while (std.length % 4) std += "=";
  const binary = atob(std);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf;
}

async function getKey(): Promise<CryptoKey> {
  const raw = fromBase64(ENCRYPTION_KEY).slice(0, 32);
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encrypt(plaintext: string): Promise<string> {
  if (!plaintext || !ENCRYPTION_KEY) return "";
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  // Web Crypto appends the auth tag to the ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return toBase64(combined);
}

async function decrypt(ciphertext: string): Promise<string> {
  if (!ciphertext || !ENCRYPTION_KEY) return "";
  const key = await getKey();
  const buf = fromBase64(ciphertext);
  const iv = buf.slice(0, 12);
  const encrypted = buf.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted);
  return new TextDecoder().decode(decrypted);
}

function maskAccountNumber(acct: string): string {
  if (!acct || acct.length <= 4) return acct;
  return "***-" + acct.slice(-4);
}

// ── Queries ──

export const list = query({
  args: {},
  handler: async (ctx) => {
    const stmts = await ctx.db.query("statements").order("desc").collect();
    return stmts.map((s) => ({
      ...s,
      // Never send encrypted PII to the client in list view
      accountNumberEnc: undefined,
      ownerNameEnc: undefined,
    }));
  },
});

export const getById = query({
  args: { id: v.id("statements") },
  handler: async (ctx, { id }) => {
    const stmt = await ctx.db.get(id);
    if (!stmt) return null;
    return {
      ...stmt,
      accountNumberEnc: undefined,
      ownerNameEnc: undefined,
    };
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const stmts = await ctx.db.query("statements").collect();
    const holdings = await ctx.db.query("holdings").collect();
    const tickers = await ctx.db.query("tickerMap").collect();

    const dates = stmts.map((s) => s.statementDate).sort();

    return {
      statementCount: stmts.length,
      holdingsCount: holdings.length,
      tickerMapCount: tickers.length,
      dateRangeStart: dates[0] ?? null,
      dateRangeEnd: dates[dates.length - 1] ?? null,
    };
  },
});

// ── Mutations ──

export const commit = mutation({
  args: {
    brokerage: v.string(),
    statementDate: v.string(),
    fileName: v.string(),
    fileHash: v.string(),
    accounts: v.array(
      v.object({
        account_number: v.string(),
        account_number_masked: v.string(),
        account_type: v.optional(v.string()),
        owner_name: v.optional(v.string()),
        total_value: v.float64(),
        beginning_value: v.optional(v.float64()),
        ending_value: v.optional(v.float64()),
        change_in_investment: v.optional(v.float64()),
        tracking_mode: v.string(),
        aggregate_category: v.optional(v.string()),
        holdings: v.array(
          v.object({
            ticker: v.string(),
            name: v.optional(v.string()),
            quantity: v.optional(v.float64()),
            price: v.optional(v.float64()),
            market_value: v.float64(),
            beginning_value: v.optional(v.float64()),
            ending_value: v.optional(v.float64()),
            cost_basis: v.optional(v.float64()),
            category: v.optional(v.string()),
          })
        ),
      })
    ),
    deposits: v.array(
      v.object({
        amount: v.float64(),
        description: v.optional(v.string()),
        date: v.optional(v.string()),
      })
    ),
    tickerOverrides: v.array(
      v.object({ ticker: v.string(), category: v.string() })
    ),
  },
  handler: async (ctx, args) => {
    // Check for duplicate
    if (args.fileHash) {
      const existing = await ctx.db
        .query("statements")
        .withIndex("by_hash", (q) => q.eq("fileHash", args.fileHash))
        .first();
      if (existing) throw new Error("This file has already been uploaded.");
    }

    // Apply ticker overrides
    let tickerMappingsAdded = 0;
    for (const override of args.tickerOverrides) {
      const tickerUpper = override.ticker.toUpperCase();
      const existing = await ctx.db
        .query("tickerMap")
        .withIndex("by_ticker", (q) => q.eq("ticker", tickerUpper))
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, { category: override.category, source: "user" });
      } else {
        await ctx.db.insert("tickerMap", {
          ticker: tickerUpper,
          category: override.category,
          source: "user",
        });
      }
      tickerMappingsAdded++;
    }

    // Compute totals
    const totalValue = args.accounts.reduce((s, a) => s + a.total_value, 0);
    const totalDeposits = args.deposits.reduce((s, d) => s + d.amount, 0);

    // Encrypt PII from the first account
    const primaryAcct = args.accounts[0];
    const accountNumberEnc = await encrypt(primaryAcct?.account_number ?? "");
    const ownerNameEnc = await encrypt(primaryAcct?.owner_name ?? "");

    // Create statement
    const statementId = await ctx.db.insert("statements", {
      brokerage: args.brokerage,
      statementDate: args.statementDate,
      fileName: args.fileName,
      fileHash: args.fileHash || globalThis.crypto.randomUUID(),
      accountNumberEnc,
      ownerNameEnc,
      totalValue,
      netDeposits: totalDeposits,
      accounts: args.accounts.map((a) => ({
        accountNumber: a.account_number,
        accountNumberMasked: a.account_number_masked,
        accountType: a.account_type ?? "",
        totalValue: a.total_value,
        beginningValue: a.beginning_value,
        endingValue: a.ending_value,
        changeInInvestment: a.change_in_investment,
        trackingMode: a.tracking_mode,
      })),
    });

    // Log PII encryption
    if (primaryAcct?.account_number) {
      await ctx.db.insert("piiAuditLog", {
        statementId,
        fieldName: "account_number",
        piiType: "account_number",
        action: "encrypted",
      });
    }

    // Create holdings
    let holdingsCreated = 0;
    for (const account of args.accounts) {
      if (account.tracking_mode === "aggregate") {
        // Single aggregate holding for this account
        await ctx.db.insert("holdings", {
          statementId,
          ticker: `ACCT:${account.account_number_masked || (account.account_type?.match(/401\s*\(k\)/i) ? "401k" : account.account_type?.split(/\s+/)[0]) || account.account_number.slice(-4) || "AGG"}`,
          name: `${account.account_type || "Account"} (aggregate)`,
          quantity: 1,
          price: account.total_value,
          marketValue: account.total_value,
          category: account.aggregate_category || "uncategorized",
          brokerage: args.brokerage,
          accountNumber: account.account_number,
        });
        holdingsCreated++;
      } else {
        for (const h of account.holdings) {
          // Resolve category
          let category = h.category ?? "";
          if (!category) {
            const mapping = await ctx.db
              .query("tickerMap")
              .withIndex("by_ticker", (q) => q.eq("ticker", h.ticker.toUpperCase()))
              .first();
            category = mapping?.category ?? "uncategorized";
          }

          await ctx.db.insert("holdings", {
            statementId,
            ticker: h.ticker,
            name: h.name ?? "",
            quantity: h.quantity ?? 0,
            price: h.price ?? 0,
            marketValue: h.market_value,
            beginningValue: h.beginning_value,
            endingValue: h.ending_value,
            costBasis: h.cost_basis,
            category,
            brokerage: args.brokerage,
            accountNumber: account.account_number,
          });
          holdingsCreated++;
        }
      }
    }

    // Create deposits
    let depositsCreated = 0;
    for (const d of args.deposits) {
      await ctx.db.insert("deposits", {
        statementId,
        amount: d.amount,
        description: d.description ?? "",
        date: d.date,
      });
      depositsCreated++;
    }

    // Rebuild snapshots for the affected month
    await rebuildMonthInternal(ctx, args.statementDate);

    return {
      statementId,
      holdingsCreated,
      depositsCreated,
      tickerMappingsAdded,
      snapshotsRebuilt: [args.statementDate],
    };
  },
});

export const remove = mutation({
  args: { statementId: v.id("statements") },
  handler: async (ctx, { statementId }) => {
    const stmt = await ctx.db.get(statementId);
    if (!stmt) throw new Error("Statement not found");

    const month = stmt.statementDate;

    // Delete related records
    const holdings = await ctx.db
      .query("holdings")
      .withIndex("by_statement", (q) => q.eq("statementId", statementId))
      .collect();
    for (const h of holdings) await ctx.db.delete(h._id);

    const deposits = await ctx.db
      .query("deposits")
      .withIndex("by_statement", (q) => q.eq("statementId", statementId))
      .collect();
    for (const d of deposits) await ctx.db.delete(d._id);

    const auditLogs = await ctx.db
      .query("piiAuditLog")
      .filter((q) => q.eq(q.field("statementId"), statementId))
      .collect();
    for (const a of auditLogs) await ctx.db.delete(a._id);

    await ctx.db.delete(statementId);

    // Rebuild snapshots
    await rebuildMonthInternal(ctx, month);

    return { deleted: statementId, monthRebuilt: month };
  },
});

// ── Snapshot Rebuild (shared logic) ──

const CATEGORIES = ["foundational", "value", "growth", "emergency_fund", "btc_crypto"];

function prevMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, "0")}`;
}

async function rebuildMonthInternal(ctx: any, month: string) {
  // Get all statement IDs for this month
  const stmts = await ctx.db
    .query("statements")
    .withIndex("by_date", (q: any) => q.eq("statementDate", month))
    .collect();

  if (stmts.length === 0) {
    // Delete existing snapshots for this month
    const existing = await ctx.db
      .query("monthlySnapshots")
      .withIndex("by_month", (q: any) => q.eq("month", month))
      .collect();
    for (const s of existing) await ctx.db.delete(s._id);
    return;
  }

  const stmtIds = new Set(stmts.map((s: any) => s._id));

  // Get all holdings for these statements
  const allHoldings = [];
  for (const stmt of stmts) {
    const holdings = await ctx.db
      .query("holdings")
      .withIndex("by_statement", (q: any) => q.eq("statementId", stmt._id))
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
      .withIndex("by_statement", (q: any) => q.eq("statementId", stmt._id))
      .collect();
    totalDeposits += deposits.reduce((s: number, d: any) => s + d.amount, 0);
  }

  const totalValueAll = Object.values(categoryTotals).reduce((s, v) => s + v, 0) || 1;

  // Get previous month snapshots
  const prev = prevMonth(month);
  const prevSnapshots: Record<string, number> = {};
  const prevRows = await ctx.db
    .query("monthlySnapshots")
    .withIndex("by_month", (q: any) => q.eq("month", prev))
    .collect();
  for (const s of prevRows) prevSnapshots[s.category] = s.totalValue;

  // Delete existing snapshots for this month
  const existingSnapshots = await ctx.db
    .query("monthlySnapshots")
    .withIndex("by_month", (q: any) => q.eq("month", month))
    .collect();
  for (const s of existingSnapshots) await ctx.db.delete(s._id);

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
}
