import { v } from "convex/values";
import { query, mutation, action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAuth, requireIdentity } from "./lib/auth";

// ═══════════════════════════════════════════════════════════════════
// Prompt Templates
// ═══════════════════════════════════════════════════════════════════

const EXTRACTION_SYSTEM_PROMPT = `You are an expert value investing analyst specializing in competitive advantage (moat) analysis, trained in the methodology of Warren Buffett, Pat Dorsey, and Michael Porter.

Your task is to analyze a financial document (SEC filing or earnings transcript) and extract evidence of competitive advantages across four moat categories.

For each category, extract:
1. Direct quotes that demonstrate the presence or absence of that moat source
2. Rate the strength of evidence on a scale of 0-100
3. Assess sentiment: "positive" (moat strengthening), "negative" (moat weakening), or "neutral"
4. Provide brief context explaining why this quote matters

Categories to analyze:
- **switching_costs**: Customer lock-in, high migration costs, proprietary integrations, long-term contracts, regulatory barriers to switching
- **network_effects**: Platform dynamics, user growth driving value, marketplace liquidity, data network effects, ecosystem stickiness
- **cost_leadership**: Scale advantages, process efficiencies, proprietary technology reducing costs, structural cost advantages, supply chain leverage
- **intangible_assets**: Brand strength, patents, regulatory licenses, trade secrets, proprietary data, reputation advantages

Also assess the overall management tone regarding competitive position: "confident", "cautious", "defensive", or "neutral".

Return ONLY valid JSON matching this exact schema (no markdown, no explanation):
{
  "evidence": [
    {
      "category": "switching_costs|network_effects|cost_leadership|intangible_assets",
      "quote": "exact quote from the document",
      "context": "why this quote is significant for moat analysis",
      "sentiment": "positive|negative|neutral",
      "strength": 0-100
    }
  ],
  "management_tone": "confident|cautious|defensive|neutral"
}

If you find no evidence for a category, omit it. Focus on the most impactful 3-5 pieces of evidence per category. Prioritize quality over quantity.`;

const SYNTHESIS_SYSTEM_PROMPT = `You are a senior value investing analyst producing a definitive moat assessment. You have been given extracted evidence from multiple SEC filings and earnings transcripts for a company.

Your task is to synthesize all evidence into a final moat score and assessment. Apply these principles:

1. **Weight recent filings higher** — a 10-K from this year matters more than one from 3 years ago
2. **Look for consistency** — moats that appear across multiple filings are more durable
3. **Identify deterioration** — declining evidence strength over time signals moat erosion
4. **Be skeptical** — management claims without supporting data should be discounted
5. **Consider industry context** — some moats matter more in certain industries

Scoring guidelines:
- **Overall moat score (1-100)**: Composite score weighted across all four categories
- **Category scores (0-100)**: Individual scores for each moat source
- **Confidence (0-100)**: How confident you are in the assessment given the evidence quality and quantity
- **Moat type**: "wide" (score >= 67), "narrow" (score 34-66), "none" (score < 34)
- **Trend**: "improving" (evidence getting stronger in recent filings), "stable", or "declining"

Return ONLY valid JSON matching this exact schema (no markdown, no explanation):
{
  "overall_moat_score": 1-100,
  "switching_costs_score": 0-100,
  "network_effects_score": 0-100,
  "cost_leadership_score": 0-100,
  "intangible_assets_score": 0-100,
  "confidence": 0-100,
  "moat_type": "wide|narrow|none",
  "trend": "improving|stable|declining",
  "summary": "2-3 paragraph Buffett-style assessment of the company's competitive position. Be specific about what drives the moat and what could erode it. Write as if explaining to a sophisticated investor.",
  "key_risks": ["risk 1", "risk 2", "risk 3"],
  "management_tone": "confident|cautious|defensive|neutral"
}`;

// ═══════════════════════════════════════════════════════════════════
// Gemini API Helper
// ═══════════════════════════════════════════════════════════════════

async function callGemini(
  model: string,
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Gemini API returned ${response.status}: ${errorBody}`,
    );
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini API returned empty content");
  }

  return text;
}

// ═══════════════════════════════════════════════════════════════════
// Internal Queries
// ═══════════════════════════════════════════════════════════════════

export const getExistingAnalysis = internalQuery({
  args: {
    ticker: v.string(),
    dataSpaceId: v.string(),
  },
  handler: async (ctx, { ticker, dataSpaceId }) => {
    return await ctx.db
      .query("moatAnalyses")
      .withIndex("by_dataSpace_ticker", (q) =>
        q.eq("dataSpaceId", dataSpaceId).eq("ticker", ticker),
      )
      .first();
  },
});

export const getFilingCache = internalQuery({
  args: {
    accessionNumber: v.string(),
  },
  handler: async (ctx, { accessionNumber }) => {
    return await ctx.db
      .query("secFilingCache")
      .withIndex("by_accession", (q) =>
        q.eq("accessionNumber", accessionNumber),
      )
      .first();
  },
});

// ═══════════════════════════════════════════════════════════════════
// Internal Mutations
// ═══════════════════════════════════════════════════════════════════

export const upsertAnalysisInternal = internalMutation({
  args: {
    ticker: v.string(),
    companyName: v.string(),
    cik: v.optional(v.string()),
    overallScore: v.float64(),
    moatType: v.string(),
    confidence: v.float64(),
    trend: v.string(),
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
    status: v.string(),
    errorMessage: v.optional(v.string()),
    dataSpaceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = args.dataSpaceId
      ? await ctx.db
          .query("moatAnalyses")
          .withIndex("by_dataSpace_ticker", (q) =>
            q
              .eq("dataSpaceId", args.dataSpaceId!)
              .eq("ticker", args.ticker),
          )
          .first()
      : await ctx.db
          .query("moatAnalyses")
          .withIndex("by_ticker", (q) => q.eq("ticker", args.ticker))
          .first();

    if (existing) {
      const patch: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(args)) {
        if (val !== undefined) {
          patch[key] = val;
        }
      }
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    } else {
      return await ctx.db.insert("moatAnalyses", {
        ticker: args.ticker,
        companyName: args.companyName,
        cik: args.cik,
        overallScore: args.overallScore,
        moatType: args.moatType,
        confidence: args.confidence,
        trend: args.trend,
        switchingCostsScore: args.switchingCostsScore,
        networkEffectsScore: args.networkEffectsScore,
        costLeadershipScore: args.costLeadershipScore,
        intangibleAssetsScore: args.intangibleAssetsScore,
        summary: args.summary,
        keyRisks: args.keyRisks,
        managementTone: args.managementTone,
        filingsAnalyzed: args.filingsAnalyzed,
        analyzedAt: args.analyzedAt,
        modelUsed: args.modelUsed,
        status: args.status,
        errorMessage: args.errorMessage,
        dataSpaceId: args.dataSpaceId,
      });
    }
  },
});

export const insertEvidenceInternal = internalMutation({
  args: {
    analysisId: v.id("moatAnalyses"),
    ticker: v.string(),
    category: v.string(),
    quote: v.string(),
    context: v.string(),
    sentiment: v.string(),
    filingType: v.string(),
    filingDate: v.string(),
    strength: v.float64(),
    dataSpaceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("moatEvidence", args);
  },
});

export const insertScoreHistoryInternal = internalMutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("moatScoreHistory", args);
  },
});

export const updateStatusInternal = internalMutation({
  args: {
    analysisId: v.id("moatAnalyses"),
    status: v.string(),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, { analysisId, status, errorMessage }) => {
    const patch: Record<string, unknown> = { status };
    if (errorMessage !== undefined) {
      patch.errorMessage = errorMessage;
    }
    await ctx.db.patch(analysisId, patch);
  },
});

export const cacheFilingInternal = internalMutation({
  args: {
    ticker: v.string(),
    cik: v.string(),
    filingType: v.string(),
    filingDate: v.string(),
    accessionNumber: v.string(),
    filingUrl: v.string(),
    extractedSections: v.optional(v.string()),
    extractedAt: v.optional(v.string()),
    evidenceExtracted: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("secFilingCache")
      .withIndex("by_accession", (q) =>
        q.eq("accessionNumber", args.accessionNumber),
      )
      .first();

    if (existing) {
      const patch: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(args)) {
        if (val !== undefined) {
          patch[key] = val;
        }
      }
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    } else {
      return await ctx.db.insert("secFilingCache", args);
    }
  },
});

export const deleteEvidenceForAnalysis = internalMutation({
  args: {
    analysisId: v.id("moatAnalyses"),
  },
  handler: async (ctx, { analysisId }) => {
    const evidence = await ctx.db
      .query("moatEvidence")
      .withIndex("by_analysis", (q) => q.eq("analysisId", analysisId))
      .collect();

    for (const item of evidence) {
      await ctx.db.delete(item._id);
    }

    return evidence.length;
  },
});

// ═══════════════════════════════════════════════════════════════════
// Public Queries
// ═══════════════════════════════════════════════════════════════════

export const getAnalysis = query({
  args: { ticker: v.string() },
  handler: async (ctx, { ticker }) => {
    const { dataSpaceId } = await requireAuth(ctx);
    const upper = ticker.toUpperCase().trim();

    return await ctx.db
      .query("moatAnalyses")
      .withIndex("by_dataSpace_ticker", (q) =>
        q.eq("dataSpaceId", dataSpaceId).eq("ticker", upper),
      )
      .first();
  },
});

export const listAnalyses = query({
  args: {},
  handler: async (ctx) => {
    const { dataSpaceId } = await requireAuth(ctx);

    const analyses = await ctx.db
      .query("moatAnalyses")
      .filter((q) => q.eq(q.field("dataSpaceId"), dataSpaceId))
      .collect();

    // Sort by overallScore descending
    analyses.sort((a, b) => b.overallScore - a.overallScore);

    return analyses;
  },
});

export const getEvidence = query({
  args: { analysisId: v.id("moatAnalyses") },
  handler: async (ctx, { analysisId }) => {
    // Verify the analysis belongs to the user's dataSpace
    await requireAuth(ctx);

    return await ctx.db
      .query("moatEvidence")
      .withIndex("by_analysis", (q) => q.eq("analysisId", analysisId))
      .collect();
  },
});

export const getScoreHistory = query({
  args: { ticker: v.string() },
  handler: async (ctx, { ticker }) => {
    const { dataSpaceId } = await requireAuth(ctx);
    const upper = ticker.toUpperCase().trim();

    const history = await ctx.db
      .query("moatScoreHistory")
      .withIndex("by_dataSpace_ticker", (q) =>
        q.eq("dataSpaceId", dataSpaceId).eq("ticker", upper),
      )
      .collect();

    // Sort by recordedAt ascending
    history.sort(
      (a, b) =>
        new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
    );

    return history;
  },
});

// ═══════════════════════════════════════════════════════════════════
// Public Mutations
// ═══════════════════════════════════════════════════════════════════

export const deleteAnalysis = mutation({
  args: { ticker: v.string() },
  handler: async (ctx, { ticker }) => {
    const { dataSpaceId } = await requireAuth(ctx);
    const upper = ticker.toUpperCase().trim();

    // Find and delete the analysis
    const analysis = await ctx.db
      .query("moatAnalyses")
      .withIndex("by_dataSpace_ticker", (q) =>
        q.eq("dataSpaceId", dataSpaceId).eq("ticker", upper),
      )
      .first();

    if (!analysis) return;

    // Delete all evidence for this analysis
    const evidence = await ctx.db
      .query("moatEvidence")
      .withIndex("by_analysis", (q) => q.eq("analysisId", analysis._id))
      .collect();

    for (const item of evidence) {
      await ctx.db.delete(item._id);
    }

    // Delete all score history for this ticker in this dataSpace
    const history = await ctx.db
      .query("moatScoreHistory")
      .withIndex("by_dataSpace_ticker", (q) =>
        q.eq("dataSpaceId", dataSpaceId).eq("ticker", upper),
      )
      .collect();

    for (const item of history) {
      await ctx.db.delete(item._id);
    }

    // Delete the analysis itself
    await ctx.db.delete(analysis._id);
  },
});

// ═══════════════════════════════════════════════════════════════════
// Actions
// ═══════════════════════════════════════════════════════════════════

export const analyzeTicker = action({
  args: { ticker: v.string() },
  handler: async (ctx, { ticker }) => {
    // ── Auth ──
    const identity = await requireIdentity(ctx);
    const user = await ctx.runQuery(internal.users.getUserByAuthId, {
      authId: identity.subject,
    });
    if (!user) throw new Error("Unauthorized");

    const upper = ticker.toUpperCase().trim();
    const dataSpaceId = user.dataSpaceId;
    const now = new Date().toISOString();

    // Create initial analysis record with status "analyzing"
    const analysisId = await ctx.runMutation(
      internal.moat.upsertAnalysisInternal,
      {
        ticker: upper,
        companyName: upper, // placeholder until we resolve it
        overallScore: 0,
        moatType: "none",
        confidence: 0,
        trend: "stable",
        switchingCostsScore: 0,
        networkEffectsScore: 0,
        costLeadershipScore: 0,
        intangibleAssetsScore: 0,
        summary: "",
        keyRisks: [],
        managementTone: "neutral",
        filingsAnalyzed: 0,
        analyzedAt: now,
        modelUsed: "gemini-2.5-flash",
        status: "analyzing",
        dataSpaceId,
      },
    );

    // Delete any existing evidence from a prior analysis run
    await ctx.runMutation(internal.moat.deleteEvidenceForAnalysis, {
      analysisId,
    });

    try {
      const secUserAgent =
        process.env.SEC_EDGAR_USER_AGENT ||
        "FinanceTracker/1.0 (finance@example.com)";
      const apiUrl =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:10611";

      // ── Step 1: Resolve CIK from SEC EDGAR ──
      let cik: string | null = null;
      let companyName = upper;

      try {
        const tickersRes = await fetch(
          "https://www.sec.gov/files/company_tickers.json",
          { headers: { "User-Agent": secUserAgent } },
        );

        if (tickersRes.ok) {
          const tickersData = await tickersRes.json();
          // company_tickers.json has format: { "0": { "cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc." }, ... }
          for (const key of Object.keys(tickersData)) {
            const entry = tickersData[key];
            if (
              entry.ticker &&
              entry.ticker.toUpperCase() === upper
            ) {
              cik = String(entry.cik_str);
              companyName = entry.title || upper;
              break;
            }
          }
        }
      } catch (err) {
        console.error("Failed to fetch company tickers JSON:", err);
      }

      // Fallback: try EDGAR full-text search if CIK not found
      if (!cik) {
        try {
          const searchRes = await fetch(
            `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(upper)}%22&forms=10-K`,
            { headers: { "User-Agent": secUserAgent } },
          );
          if (searchRes.ok) {
            const searchData = await searchRes.json();
            const hits = searchData?.hits?.hits;
            if (hits && hits.length > 0) {
              const firstHit = hits[0]._source || hits[0];
              cik =
                firstHit.entity_id ||
                firstHit.cik ||
                String(firstHit.ciks?.[0] || "");
              companyName =
                firstHit.entity_name ||
                firstHit.display_names?.[0] ||
                companyName;
            }
          }
        } catch (err) {
          console.error("EDGAR search fallback failed:", err);
        }
      }

      if (!cik) {
        throw new Error(
          `Could not resolve CIK for ticker ${upper}. Verify the ticker symbol is correct.`,
        );
      }

      // Pad CIK to 10 digits
      const cikPadded = cik.padStart(10, "0");

      // ── Step 2: Fetch filing list from EDGAR submissions API ──
      const submissionsRes = await fetch(
        `https://data.sec.gov/submissions/CIK${cikPadded}.json`,
        { headers: { "User-Agent": secUserAgent } },
      );

      if (!submissionsRes.ok) {
        throw new Error(
          `EDGAR submissions API returned ${submissionsRes.status} for CIK ${cikPadded}`,
        );
      }

      const submissionsData = await submissionsRes.json();

      // Extract recent filings from the submissions data
      const recentFilings = submissionsData.filings?.recent;
      if (!recentFilings) {
        throw new Error("No filings found in EDGAR submissions data");
      }

      const threeYearsAgo = new Date();
      threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
      const threeYearsAgoStr = threeYearsAgo.toISOString().split("T")[0];

      interface FilingInfo {
        filingType: string;
        filingDate: string;
        accessionNumber: string;
        primaryDocument: string;
        filingUrl: string;
      }

      const selectedFilings: FilingInfo[] = [];
      let tenKCount = 0;
      let tenQCount = 0;

      const formTypes: string[] = recentFilings.form || [];
      const filingDates: string[] = recentFilings.filingDate || [];
      const accessionNumbers: string[] =
        recentFilings.accessionNumber || [];
      const primaryDocuments: string[] =
        recentFilings.primaryDocument || [];

      for (let i = 0; i < formTypes.length; i++) {
        const form = formTypes[i];
        const date = filingDates[i];
        const accNum = accessionNumbers[i];
        const primaryDoc = primaryDocuments[i];

        if (!form || !date || !accNum) continue;
        if (date < threeYearsAgoStr) continue;

        const isAnnual = form === "10-K" || form === "10-K/A";
        const isQuarterly = form === "10-Q" || form === "10-Q/A";

        if (!isAnnual && !isQuarterly) continue;

        if (isAnnual && tenKCount >= 1) continue;
        if (isQuarterly && tenQCount >= 2) continue;

        // Build filing URL
        const accNumNoDashes = accNum.replace(/-/g, "");
        const filingUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${accNumNoDashes}/${primaryDoc}`;

        selectedFilings.push({
          filingType: isAnnual ? "10-K" : "10-Q",
          filingDate: date,
          accessionNumber: accNum,
          primaryDocument: primaryDoc,
          filingUrl,
        });

        if (isAnnual) tenKCount++;
        if (isQuarterly) tenQCount++;

        if (tenKCount >= 1 && tenQCount >= 2) break;
      }

      if (selectedFilings.length === 0) {
        throw new Error(
          `No 10-K or 10-Q filings found for ${upper} in the last 3 years`,
        );
      }

      // ── Step 3: Extract filing text via FastAPI ──
      interface DocumentForAnalysis {
        text: string;
        filingType: string;
        filingDate: string;
        source: string;
      }

      const documents: DocumentForAnalysis[] = [];

      for (const filing of selectedFilings) {
        // Check cache first
        const cached = await ctx.runQuery(
          internal.moat.getFilingCache,
          { accessionNumber: filing.accessionNumber },
        );

        if (cached && cached.extractedSections) {
          // Convert cached JSON to readable text if needed
          let cachedText = cached.extractedSections;
          try {
            const parsed = JSON.parse(cachedText);
            if (parsed.sections && typeof parsed.sections === "object") {
              cachedText = Object.entries(parsed.sections)
                .filter(([, text]) => typeof text === "string" && (text as string).length > 0)
                .map(([name, text]) => `## ${name.replace(/_/g, " ").toUpperCase()}\n\n${text}`)
                .join("\n\n---\n\n");
            }
          } catch {
            // Already plain text, use as-is
          }
          documents.push({
            text: cachedText,
            filingType: filing.filingType,
            filingDate: filing.filingDate,
            source: `SEC EDGAR ${filing.filingType} (${filing.filingDate})`,
          });
          continue;
        }

        // Extract via FastAPI
        try {
          const extractRes = await fetch(
            `${apiUrl}/api/sec/extract-filing`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                url: filing.filingUrl,
                filingType: filing.filingType,
              }),
            },
          );

          if (extractRes.ok) {
            const extractData = await extractRes.json();
            // Convert structured sections into readable text for LLM analysis
            let sections: string;
            if (typeof extractData === "string") {
              sections = extractData;
            } else if (extractData.sections && typeof extractData.sections === "object") {
              sections = Object.entries(extractData.sections)
                .filter(([, text]) => typeof text === "string" && (text as string).length > 0)
                .map(([name, text]) => `## ${name.replace(/_/g, " ").toUpperCase()}\n\n${text}`)
                .join("\n\n---\n\n");
            } else {
              sections = JSON.stringify(extractData);
            }

            // Cache the extracted filing
            await ctx.runMutation(internal.moat.cacheFilingInternal, {
              ticker: upper,
              cik,
              filingType: filing.filingType,
              filingDate: filing.filingDate,
              accessionNumber: filing.accessionNumber,
              filingUrl: filing.filingUrl,
              extractedSections: sections,
              extractedAt: new Date().toISOString(),
              evidenceExtracted: false,
            });

            documents.push({
              text: sections,
              filingType: filing.filingType,
              filingDate: filing.filingDate,
              source: `SEC EDGAR ${filing.filingType} (${filing.filingDate})`,
            });
          } else {
            console.error(
              `Failed to extract filing ${filing.accessionNumber}: ${extractRes.status}`,
            );
          }
        } catch (err) {
          console.error(
            `Error extracting filing ${filing.accessionNumber}:`,
            err,
          );
        }
      }

      // ── Step 4: Fetch earnings transcripts from FMP ──
      const fmpApiKey = process.env.FMP_API_KEY;
      if (fmpApiKey) {
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1; // 1-12

        // Determine last 2 quarters
        const quartersToFetch: { year: number; quarter: number }[] = [];
        let qYear = currentYear;
        let qQuarter = Math.ceil(currentMonth / 3);

        // Go back one quarter since current may not have transcript yet
        for (let i = 0; i < 3 && quartersToFetch.length < 2; i++) {
          qQuarter--;
          if (qQuarter <= 0) {
            qQuarter = 4;
            qYear--;
          }
          quartersToFetch.push({ year: qYear, quarter: qQuarter });
        }

        for (const { year, quarter } of quartersToFetch) {
          try {
            const transcriptRes = await fetch(
              `https://financialmodelingprep.com/stable/earning-call-transcript?symbol=${upper}&quarter=${quarter}&year=${year}&apikey=${fmpApiKey}`,
            );

            if (transcriptRes.ok) {
              const transcriptData = await transcriptRes.json();
              if (
                Array.isArray(transcriptData) &&
                transcriptData.length > 0
              ) {
                const transcript = transcriptData[0];
                const transcriptText =
                  transcript.content || JSON.stringify(transcript);

                // Truncate very long transcripts to avoid token limits
                const maxLen = 30000;
                const trimmedText =
                  transcriptText.length > maxLen
                    ? transcriptText.substring(0, maxLen) +
                      "\n\n[TRANSCRIPT TRUNCATED]"
                    : transcriptText;

                documents.push({
                  text: trimmedText,
                  filingType: "earnings_transcript",
                  filingDate: `${year}-${String(quarter * 3).padStart(2, "0")}-01`,
                  source: `Earnings Call Q${quarter} ${year}`,
                });
              }
            }
          } catch (err) {
            console.error(
              `Failed to fetch earnings transcript Q${quarter} ${year}:`,
              err,
            );
          }
        }
      }

      if (documents.length === 0) {
        throw new Error(
          `No documents could be extracted for ${upper}. Check that the FastAPI service is running at ${apiUrl}.`,
        );
      }

      // ── Step 5: Pass 1 — Evidence Extraction (Claude Haiku) ──
      interface ExtractedEvidence {
        category: string;
        quote: string;
        context: string;
        sentiment: string;
        strength: number;
        filingType: string;
        filingDate: string;
      }

      const allEvidence: ExtractedEvidence[] = [];
      let overallManagementTone = "neutral";

      for (let i = 0; i < documents.length; i++) {
        const doc = documents[i];

        // Truncate individual documents if they exceed reasonable size
        const maxDocLen = 50000;
        const docText =
          doc.text.length > maxDocLen
            ? doc.text.substring(0, maxDocLen) + "\n\n[TRUNCATED]"
            : doc.text;

        const userMessage = `Analyze the following ${doc.filingType} filing dated ${doc.filingDate} for ${companyName} (${upper}) for competitive advantage evidence.\n\nSource: ${doc.source}\n\n---\n\n${docText}`;

        try {
          const rawResponse = await callGemini(
            "gemini-2.5-flash",
            EXTRACTION_SYSTEM_PROMPT,
            userMessage,
          );

          // Parse JSON response — handle potential markdown wrapping
          let cleanedResponse = rawResponse.trim();
          if (cleanedResponse.startsWith("```")) {
            cleanedResponse = cleanedResponse
              .replace(/^```(?:json)?\n?/, "")
              .replace(/\n?```$/, "");
          }

          const parsed = JSON.parse(cleanedResponse);

          if (parsed.evidence && Array.isArray(parsed.evidence)) {
            for (const ev of parsed.evidence) {
              allEvidence.push({
                category: ev.category || "intangible_assets",
                quote: ev.quote || "",
                context: ev.context || "",
                sentiment: ev.sentiment || "neutral",
                strength:
                  typeof ev.strength === "number" ? ev.strength : 50,
                filingType: doc.filingType,
                filingDate: doc.filingDate,
              });
            }
          }

          if (parsed.management_tone) {
            overallManagementTone = parsed.management_tone;
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(
            `Evidence extraction failed for ${doc.source}: ${errMsg}`,
          );
          // If it's a quota/rate limit error, throw immediately instead of continuing
          if (errMsg.includes("429") || errMsg.includes("quota") || errMsg.includes("RESOURCE_EXHAUSTED")) {
            throw new Error(`Gemini API rate limit exceeded. Please wait a minute and try again. Details: ${errMsg}`);
          }
          // Continue with remaining documents for other errors
        }

        // Politeness delay between API calls
        if (i < documents.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }

      // Store all extracted evidence
      for (const ev of allEvidence) {
        await ctx.runMutation(internal.moat.insertEvidenceInternal, {
          analysisId,
          ticker: upper,
          category: ev.category,
          quote: ev.quote,
          context: ev.context,
          sentiment: ev.sentiment,
          filingType: ev.filingType,
          filingDate: ev.filingDate,
          strength: ev.strength,
          dataSpaceId,
        });
      }

      // Mark cached filings as evidence-extracted
      for (const filing of selectedFilings) {
        await ctx.runMutation(internal.moat.cacheFilingInternal, {
          ticker: upper,
          cik,
          filingType: filing.filingType,
          filingDate: filing.filingDate,
          accessionNumber: filing.accessionNumber,
          filingUrl: filing.filingUrl,
          evidenceExtracted: true,
        });
      }

      // ── Step 6: Pass 2 — Synthesis ──
      console.log(`${upper}: ${documents.length} documents processed, ${allEvidence.length} evidence items extracted`);

      if (allEvidence.length === 0) {
        // No evidence found — mark as complete with zero scores
        await ctx.runMutation(internal.moat.upsertAnalysisInternal, {
          ticker: upper,
          companyName,
          cik,
          overallScore: 0,
          moatType: "none",
          confidence: 0,
          trend: "stable",
          switchingCostsScore: 0,
          networkEffectsScore: 0,
          costLeadershipScore: 0,
          intangibleAssetsScore: 0,
          summary:
            "Insufficient evidence to perform moat analysis. No relevant competitive advantage indicators were found in the available filings.",
          keyRisks: [
            "Unable to assess — insufficient filing data available",
          ],
          managementTone: "neutral",
          filingsAnalyzed: documents.length,
          analyzedAt: now,
          modelUsed: "gemini-2.5-flash",
          status: "complete",
          dataSpaceId,
        });

        return {
          ticker: upper,
          score: 0,
          moatType: "none" as const,
        };
      }

      // Build evidence summary for synthesis
      const evidenceByCat: Record<string, ExtractedEvidence[]> = {};
      for (const ev of allEvidence) {
        if (!evidenceByCat[ev.category]) {
          evidenceByCat[ev.category] = [];
        }
        evidenceByCat[ev.category].push(ev);
      }

      let evidenceSummary = `Company: ${companyName} (${upper})\n`;
      evidenceSummary += `Documents Analyzed: ${documents.length}\n`;
      evidenceSummary += `Filing Types: ${Array.from(new Set(documents.map((d) => d.filingType))).join(", ")}\n`;
      evidenceSummary += `Date Range: ${documents.map((d) => d.filingDate).sort()[0]} to ${documents.map((d) => d.filingDate).sort().pop()}\n\n`;

      for (const [category, items] of Object.entries(evidenceByCat)) {
        evidenceSummary += `\n## ${category.replace(/_/g, " ").toUpperCase()}\n\n`;
        for (const item of items) {
          evidenceSummary += `### Source: ${item.filingType} (${item.filingDate}) | Strength: ${item.strength}/100 | Sentiment: ${item.sentiment}\n`;
          evidenceSummary += `Quote: "${item.quote}"\n`;
          evidenceSummary += `Context: ${item.context}\n\n`;
        }
      }

      const synthesisUserMessage = `Synthesize the following moat evidence for ${companyName} (${upper}) into a final assessment.\n\n${evidenceSummary}`;

      let synthesis: {
        overall_moat_score: number;
        switching_costs_score: number;
        network_effects_score: number;
        cost_leadership_score: number;
        intangible_assets_score: number;
        confidence: number;
        moat_type: string;
        trend: string;
        summary: string;
        key_risks: string[];
        management_tone: string;
      };

      const rawSynthesis = await callGemini(
        "gemini-2.5-flash",
        SYNTHESIS_SYSTEM_PROMPT,
        synthesisUserMessage,
      );

      // Parse JSON response — handle potential markdown wrapping
      let cleanedSynthesis = rawSynthesis.trim();
      if (cleanedSynthesis.startsWith("```")) {
        cleanedSynthesis = cleanedSynthesis
          .replace(/^```(?:json)?\n?/, "")
          .replace(/\n?```$/, "");
      }

      synthesis = JSON.parse(cleanedSynthesis);

      // Validate and clamp scores
      const clamp = (val: unknown, min: number, max: number): number => {
        const num = typeof val === "number" ? val : 0;
        return Math.max(min, Math.min(max, num));
      };

      const overallScore = clamp(synthesis.overall_moat_score, 1, 100);
      const switchingCostsScore = clamp(
        synthesis.switching_costs_score,
        0,
        100,
      );
      const networkEffectsScore = clamp(
        synthesis.network_effects_score,
        0,
        100,
      );
      const costLeadershipScore = clamp(
        synthesis.cost_leadership_score,
        0,
        100,
      );
      const intangibleAssetsScore = clamp(
        synthesis.intangible_assets_score,
        0,
        100,
      );
      const confidence = clamp(synthesis.confidence, 0, 100);

      // Determine moat type from score
      let moatType: string;
      if (overallScore >= 67) {
        moatType = "wide";
      } else if (overallScore >= 34) {
        moatType = "narrow";
      } else {
        moatType = "none";
      }

      // Map old labels to new ones for backwards compat, then validate
      let rawTrend = synthesis.trend;
      if (rawTrend === "strengthening") rawTrend = "improving";
      if (rawTrend === "weakening") rawTrend = "declining";
      const trend = ["improving", "stable", "declining"].includes(rawTrend)
        ? rawTrend
        : "stable";

      const managementTone = [
        "confident",
        "cautious",
        "defensive",
        "neutral",
      ].includes(synthesis.management_tone)
        ? synthesis.management_tone
        : overallManagementTone;

      const keyRisks = Array.isArray(synthesis.key_risks)
        ? synthesis.key_risks
            .filter((r: unknown) => typeof r === "string")
            .slice(0, 5)
        : [];

      const summary =
        typeof synthesis.summary === "string" && synthesis.summary.length > 0
          ? synthesis.summary
          : "Analysis complete but no summary was generated.";

      // ── Step 7: Persist results ──
      await ctx.runMutation(internal.moat.upsertAnalysisInternal, {
        ticker: upper,
        companyName,
        cik,
        overallScore,
        moatType,
        confidence,
        trend,
        switchingCostsScore,
        networkEffectsScore,
        costLeadershipScore,
        intangibleAssetsScore,
        summary,
        keyRisks,
        managementTone,
        filingsAnalyzed: documents.length,
        analyzedAt: now,
        modelUsed: "gemini-2.5-flash",
        status: "complete",
        dataSpaceId,
      });

      // Insert score history
      await ctx.runMutation(internal.moat.insertScoreHistoryInternal, {
        ticker: upper,
        overallScore,
        switchingCostsScore,
        networkEffectsScore,
        costLeadershipScore,
        intangibleAssetsScore,
        confidence,
        recordedAt: now,
        triggerFiling: selectedFilings.length > 0
          ? `${selectedFilings[0].filingType} (${selectedFilings[0].filingDate})`
          : undefined,
        dataSpaceId,
      });

      return { ticker: upper, score: overallScore, moatType };
    } catch (err) {
      // Update status to error
      const errorMessage =
        err instanceof Error ? err.message : String(err);

      await ctx.runMutation(internal.moat.updateStatusInternal, {
        analysisId,
        status: "error",
        errorMessage,
      });

      throw err;
    }
  },
});
