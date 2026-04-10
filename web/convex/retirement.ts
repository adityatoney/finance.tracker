import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("retirementStatements")
      .collect()
      .then((rows) => rows.sort((a, b) => a.year.localeCompare(b.year)));
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("retirementStatements").collect();
    if (rows.length === 0) return null;

    const sorted = rows.sort((a, b) => a.year.localeCompare(b.year));
    const latest = sorted[sorted.length - 1];

    const totalYourContrib = rows.reduce((s, r) => s + r.yourContributions, 0);
    const totalEmployerContrib = rows.reduce((s, r) => s + r.employerContributions, 0);
    const totalMarketGain = rows.reduce((s, r) => s + r.marketGain, 0);

    // Best year by market gain
    const bestYear = rows.reduce((best, r) =>
      r.marketGain > best.marketGain ? r : best
    , rows[0]);

    // Worst year by market gain
    const worstYear = rows.reduce((worst, r) =>
      r.marketGain < worst.marketGain ? r : worst
    , rows[0]);

    // Average annual return (modified Dietz, geometric mean)
    // Each year's return = marketGain / (beginningBalance + totalContributions * 0.5)
    let geoProduct = 1;
    let validYears = 0;
    for (const r of sorted) {
      const totalContrib = r.yourContributions + r.employerContributions;
      const avgCapital = r.beginningBalance + (totalContrib * 0.5);
      if (avgCapital > 0) {
        const yearReturn = r.marketGain / avgCapital;
        geoProduct *= (1 + yearReturn);
        validYears++;
      }
    }
    const avgAnnualReturn = validYears > 0
      ? (Math.pow(geoProduct, 1 / validYears) - 1) * 100
      : 0;

    return {
      currentBalance: latest.endingBalance,
      latestYear: latest.year,
      totalYourContributions: totalYourContrib,
      totalEmployerContributions: totalEmployerContrib,
      totalContributions: totalYourContrib + totalEmployerContrib,
      totalMarketGain,
      avgAnnualReturn,
      latestYourContributions: latest.yourContributions,
      latestEmployerContributions: latest.employerContributions,
      latestMarketGain: latest.marketGain,
      bestYear: { year: bestYear.year, gain: bestYear.marketGain },
      worstYear: { year: worstYear.year, gain: worstYear.marketGain },
      yearsTracked: rows.length,
      planName: latest.planName,
    };
  },
});

export const commit = mutation({
  args: {
    year: v.string(),
    planName: v.string(),
    beginningBalance: v.float64(),
    endingBalance: v.float64(),
    yourContributions: v.float64(),
    employerContributions: v.float64(),
    marketGain: v.float64(),
    vestedBalance: v.optional(v.float64()),
    periodStart: v.string(),
    periodEnd: v.string(),
    fileName: v.string(),
    fileHash: v.string(),
  },
  handler: async (ctx, args) => {
    // Dedup by fileHash
    if (args.fileHash) {
      const existing = await ctx.db
        .query("retirementStatements")
        .withIndex("by_hash", (q) => q.eq("fileHash", args.fileHash))
        .first();
      if (existing) throw new Error("This annual statement has already been uploaded.");
    }

    // Also check for duplicate year
    const existingYear = await ctx.db
      .query("retirementStatements")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .first();
    if (existingYear) throw new Error(`A statement for year ${args.year} already exists. Delete it first to re-upload.`);

    const id = await ctx.db.insert("retirementStatements", args);
    return { id, year: args.year };
  },
});

export const remove = mutation({
  args: { id: v.id("retirementStatements") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (!row) throw new Error("Statement not found");
    await ctx.db.delete(id);
    return { deleted: id, year: row.year };
  },
});
