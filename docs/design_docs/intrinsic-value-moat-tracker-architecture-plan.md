# Intrinsic Value "Moat" Tracker — Architecture Plan

## Context

The Finance Tracker has a mature Watchlist feature that tracks stock prices via Yahoo Finance. This plan extends it with two new capabilities grounded in Buffett/Graham value investing:

1. **Quantitative Valuation Engine** — DCF model, Margin of Safety, Time-Weighted Returns
2. **Qualitative Moat Analysis** — AI-powered competitive advantage scoring from SEC filings

The existing stack (Convex backend, Next.js 16 frontend, FastAPI parser service) is preserved. All new logic follows established patterns in `watchlist.ts` (actions for external APIs, internal mutations for storage, queries for reads).

---

## Part 1: Quantitative Valuation Engine

### 1.1 Data Source — Financial Modeling Prep (FMP) API

FMP free tier (250 requests/day). Four endpoints per ticker:

| Endpoint | Data |
|----------|------|
| `/v3/cash-flow-statement/{ticker}?period=annual&limit=10` | 10Y FCF, operating cash flow, capex |
| `/v3/income-statement/{ticker}?period=annual&limit=10` | 10Y revenue, net income |
| `/v3/profile/{ticker}` | Beta, shares outstanding, currency |
| `/v3/balance-sheet-statement/{ticker}?period=annual&limit=1` | Total debt, cash |

Store `FMP_API_KEY` as a Convex environment variable.

### 1.2 New Convex Tables

Add to `web/convex/schema.ts`:

**`fundamentals`** — Raw financial data (tenant-agnostic, shared across users since AAPL financials are the same for everyone):
```
ticker, fcfHistory[{year, freeCashFlow, revenue, netIncome, operatingCashFlow, capitalExpenditure}],
revenueGrowth3y?, revenueGrowth5y?, fcfGrowth3y?, fcfGrowth5y?,
sharesOutstanding, totalDebt?, cashAndEquivalents?, beta?,
currency?, fiscalYearEnd?, lastUpdated
Index: by_ticker
```

**`valuations`** — Computed DCF results (tenant-scoped, users may want custom assumptions later):
```
ticker, dataSpaceId?, scenario ("conservative"|"moderate"|"optimistic"),
projectionYears, discountRate, terminalGrowthRate, fcfGrowthRate,
intrinsicValuePerShare, totalPresentValueFCF, terminalValue, enterpriseValue,
marketPrice, marginOfSafety, classification ("deep_value"|"value"|"fair"|"overvalued"),
calculatedAt, baseFcf
Indexes: by_ticker, by_dataSpace_ticker
```

**`twrSnapshots`** — Cached TWR computations:
```
dataSpaceId?, scope ("portfolio"|category|ticker),
twrCumulative, twrAnnualized?,
periodStart, periodEnd,
subPeriodReturns[{month, startValue, endValue, cashFlow, subPeriodReturn}],
calculatedAt
Index: by_dataSpace_scope
```

**Extend `watchlistData`** with 4 optional denormalized fields:
```
intrinsicValue?, marginOfSafety?, valuationClass?, valuationUpdated?
```

### 1.3 DCF Calculation Logic

All implemented in TypeScript within Convex actions (`web/convex/valuation.ts`). No Python needed.

**Step 1 — Base FCF**: Use most recent fiscal year FCF if positive. If negative, average of last 3 positive-FCF years. If none positive in 5 years → "DCF not applicable."

**Step 2 — Growth rates** (3 scenarios from historical FCF CAGR):

| Scenario | Formula | Cap |
|----------|---------|-----|
| Conservative | `min(CAGR * 0.5, 5%)` | 5% |
| Moderate | `min(CAGR * 0.75, 10%)` | 10% |
| Optimistic | `min(CAGR, 15%)` | 15% |

If historical CAGR is negative: 0% / 2% / 5%.

**Step 3 — WACC**:
```
costOfEquity = riskFreeRate(4.25% default) + beta * equityRiskPremium(5.5%)
WACC = (E/V) * costOfEquity + (D/V) * costOfDebt(5%) * (1 - 0.21)
```
If no debt data, use costOfEquity as discount rate.

**Step 4 — Project FCF** for 10 years at scenario growth rate.

**Step 5 — Discount** projected FCFs at WACC.

**Step 6 — Terminal Value** (Gordon Growth): `lastFCF * (1 + 2.5%) / (WACC - 2.5%)`. If WACC <= terminal rate, fallback to 15x FCF exit multiple.

**Step 7 — Intrinsic Value**: `(PV of FCFs + PV of Terminal - Debt + Cash) / Shares Outstanding`

**Margin of Safety**: `(intrinsicValue - marketPrice) / intrinsicValue * 100`
- \>40% → Deep Value (green)
- 20-40% → Value (blue)
- 0-20% → Fair (gray)
- <0% → Overvalued (red)

### 1.4 TWR Calculation

Uses existing `monthlySnapshots` and deposits data. No external API calls — implemented as a Convex mutation in `web/convex/twr.ts`.

```
For each consecutive month pair:
  subPeriodReturn = (endValue - startValue - cashFlow) / (startValue + cashFlow)

TWR = product of (1 + Ri) - 1
Annualized = (1 + TWR)^(1/years) - 1
```

Auto-recalculated when `rebuildMonthInternal` runs (after statement upload/delete).

### 1.5 Convex Function Architecture — `web/convex/valuation.ts`

| Function | Type | Purpose |
|----------|------|---------|
| `fetchFundamentals({ticker})` | action | Fetch FMP data, store via internal mutation |
| `fetchAllFundamentals()` | action | Batch fetch for all watchlist tickers |
| `calculateDcf({ticker})` | action | Compute 3 DCF scenarios, store results, update watchlistData |
| `calculateAllDcf()` | action | Batch DCF for all watchlist tickers |
| `upsertFundamentalsInternal` | internalMutation | Persist raw FMP data |
| `upsertValuationInternal` | internalMutation | Persist DCF results |
| `updateWatchlistValuation` | internalMutation | Denormalize MoS to watchlistData |
| `getFundamentalsInternal({ticker})` | internalQuery | Read fundamentals (for actions) |
| `getValuation({ticker})` | query | Return all 3 scenarios for a ticker |
| `listValuations()` | query | Return moderate-scenario valuations for all tickers |
| `getFundamentals({ticker})` | query | Return fundamentals for detail view |

`web/convex/twr.ts`:

| Function | Type | Purpose |
|----------|------|---------|
| `calculateTwr({scope})` | mutation | Compute TWR from snapshots + deposits |
| `getTwr({scope})` | query | Return cached TWR |
| `listTwr()` | query | Return all TWR snapshots |

### 1.6 Caching Strategy

| Data | Refresh | Rationale |
|------|---------|-----------|
| Fundamentals | Max 1x/day, skip if <24h old | Quarterly financials |
| Valuations | On fundamentals refresh or user request | Derived from fundamentals + price |
| watchlistData denorm fields | On valuation recalculation | Always synced |
| TWR | On snapshot rebuild | Triggered by statement upload/delete |

---

## Part 2: Qualitative Moat Analysis

### 2.1 Architecture Decision

- **Convex actions** orchestrate the workflow and call Claude API (keeps API keys in Convex env vars)
- **FastAPI service** handles heavy SEC filing HTML parsing (add `beautifulsoup4`, `lxml`)
- **Two-pass Claude chain** (not full LangGraph agent — simpler, cheaper, predictable)

### 2.2 Data Pipeline

```
User clicks "Analyze Moat" →
  [Convex action: moat.analyzeTicker]
    → (1) Check cache for existing analysis
    → (2) Resolve SEC CIK from EDGAR company search
    → (3) Fetch filing URLs from EDGAR (most recent 10-K + 2 10-Qs)
    → (4) For each filing: POST to FastAPI /api/sec/extract-filing
           → returns cleaned text sections (MD&A, Risk Factors, Business, Competition)
    → (5) Fetch earnings transcripts from FMP API (last 2 quarters)
    → (6) Pass 1: Claude Haiku per document — extract evidence by moat category
    → (7) Pass 2: Claude Sonnet once — synthesize overall Moat Score
    → (8) Persist results via internal mutations
```

SEC EDGAR requirements: User-Agent header with contact email, 150ms between requests.

### 2.3 New FastAPI Endpoints

Add to `api/app/routers/sec.py` (new file):

- `POST /api/sec/extract-filing` — Fetches SEC filing HTML by URL, extracts sections (Item 1, 1A, 7), strips tables/exhibits, returns clean text
- `POST /api/sec/extract-transcript` — Segments transcript into management commentary vs Q&A

New service: `api/app/services/sec_extractor.py` — BeautifulSoup HTML parsing.

New dependencies: `beautifulsoup4>=4.12.0`, `lxml>=5.0.0`

### 2.4 Claude Prompt Strategy

**Pass 1 — Evidence Extraction** (Claude Haiku, per document):
- Extract direct quotes for each moat category: Switching Costs, Network Effects, Cost Leadership, Intangible Assets
- Rate strength (0-100), sentiment (positive/negative/neutral), trend
- Assess management tone and forward-looking statements

**Pass 2 — Synthesis** (Claude Sonnet, once with all evidence):
- Weight recent filings higher (0.85x decay per quarter)
- Compute overall Moat Score (1-100) + per-category scores
- Classify moat type: Wide (67+) / Narrow (34-66) / None (<34)
- Generate 2-3 paragraph Buffett-style assessment
- Identify top 3 moat deterioration risks

**Deterministic fallback**: keyword-frequency scoring runs in TypeScript as a sanity check alongside Claude scores.

### 2.5 New Convex Tables

Add to `web/convex/schema.ts`:

**`moatAnalyses`** — Main analysis results:
```
ticker, companyName, cik?,
overallScore, moatType ("wide"|"narrow"|"none"), confidence, trend,
switchingCostsScore, networkEffectsScore, costLeadershipScore, intangibleAssetsScore,
summary, keyRisks[], managementTone,
filingsAnalyzed, analyzedAt, modelUsed,
status ("pending"|"analyzing"|"complete"|"error"), errorMessage?,
dataSpaceId?
Indexes: by_dataSpace_ticker, by_ticker, by_score
```

**`moatEvidence`** — Individual evidence items:
```
analysisId (ref moatAnalyses), ticker, category, quote, context,
sentiment, filingType, filingDate, strength, dataSpaceId?
Indexes: by_analysis, by_ticker_category
```

**`moatScoreHistory`** — Track score over time for trend detection:
```
ticker, overallScore, switchingCostsScore, networkEffectsScore,
costLeadershipScore, intangibleAssetsScore, confidence,
recordedAt, triggerFiling?, dataSpaceId?
Indexes: by_dataSpace_ticker, by_ticker_date
```

**`secFilingCache`** — Cache fetched/parsed filings:
```
ticker, cik, filingType, filingDate, accessionNumber,
filingUrl, extractedSections?, extractedAt?, evidenceExtracted
Indexes: by_ticker_type, by_accession
```

### 2.6 Convex Functions — `web/convex/moat.ts`

| Function | Type | Purpose |
|----------|------|---------|
| `analyzeTicker({ticker})` | action | Full orchestration (SEC + Claude + persist) |
| `getAnalysis({ticker})` | query | Latest moat analysis for a ticker |
| `listAnalyses()` | query | All analyses for user's data space |
| `getEvidence({analysisId, category?})` | query | Evidence items, filterable |
| `getScoreHistory({ticker})` | query | Historical scores for trend chart |
| `deleteAnalysis({ticker})` | mutation | Remove analysis + evidence |
| `upsertAnalysisInternal` | internalMutation | Persist analysis results |
| `insertEvidenceInternal` | internalMutation | Persist evidence items |
| `insertScoreHistoryInternal` | internalMutation | Record score snapshot |
| `updateStatusInternal` | internalMutation | Update analysis status |
| `cacheFilingInternal` | internalMutation | Cache parsed filing text |

### 2.7 Cost Per Ticker

| Component | Cost |
|-----------|------|
| Claude Haiku (Pass 1, ~5 docs x 25k tokens) | ~$0.03 |
| Claude Sonnet (Pass 2, synthesis) | ~$0.02 |
| SEC EDGAR | Free |
| FMP (transcripts) | Free tier |
| **Total per ticker** | **~$0.05** |

20 tickers analyzed quarterly = ~$4/year.

Environment variables: `ANTHROPIC_API_KEY`, `SEC_EDGAR_USER_AGENT`

---

## Part 3: UI Integration

### 3.1 Watchlist Page Enhancements (`web/src/app/watchlist/page.tsx`)

- **New "Valuation" column** between 52W Range and Actions: shows `Badge` with classification (Deep Value/Value/Fair/Overvalued) + intrinsic value & MoS% in small text. Uses denormalized fields on `watchlistData` — no extra query.
- **New "Moat" column**: small badge linking to moat detail if analysis exists, or "—"
- **"Run DCF" button** in header next to "Refresh All"
- **New filter pill**: "Undervalued" (MoS > 0)
- **New sort field**: `marginOfSafety`

### 3.2 Ticker Detail Sheet (new component)

`web/src/components/valuation/ticker-detail-sheet.tsx` — shadcn Sheet (slide-out panel) triggered by clicking a watchlist row:

- **Fundamentals tab**: Revenue/FCF history table, growth rates
- **DCF tab**: Three-column layout (Conservative / Moderate / Optimistic), sensitivity table (WACC vs Growth)
- **FCF chart**: Recharts BarChart — historical bars (solid) + projected (dotted/hatched)

### 3.3 Moat Analysis Page (`web/src/app/moat/page.tsx`)

New page in the Analysis nav group.

- **Header**: Ticker input + "Analyze" button (same pattern as watchlist add)
- **Score display**: Circular SVG gauge (0-100), colored by moat type
- **Category cards**: 2x2 grid — Switching Costs, Network Effects, Cost Leadership, Intangible Assets. Each shows score bar + top 2 evidence quotes.
- **Evidence accordion**: Expandable per-category, shows direct quotes with filing source and sentiment badge
- **Trend chart**: Recharts LineChart of moat score over time (using `moatScoreHistory`)
- **Risk card**: Top 3 moat deterioration risks
- **Analyzed tickers list**: Table with ticker, score, moat type, last analyzed, trend, actions

### 3.4 Dashboard TWR Card (`web/src/app/dashboard/page.tsx`)

Add TWR `StatCard` to the existing KPI row:
- Primary value: cumulative TWR %
- Sub-value: annualized TWR
- Icon: TrendingUp/TrendingDown based on sign

### 3.5 Sidebar Update (`web/src/components/layout/sidebar.tsx`)

Add to Analysis group:
```typescript
{ href: "/moat", label: "Moat Analysis", icon: Shield },
```

---

## Part 4: Implementation Sequence

### Phase 1 — Schema & Data Layer
1. Add 7 new tables + 4 new fields to `web/convex/schema.ts`
2. Create `web/convex/valuation.ts` — fundamentals fetch + internal mutations + queries
3. Create `web/convex/twr.ts` — TWR computation + queries
4. Create `web/convex/moat.ts` — stubs for queries/mutations
5. Add env vars: `FMP_API_KEY`, `ANTHROPIC_API_KEY`, `SEC_EDGAR_USER_AGENT`

### Phase 2 — Quantitative Engine
6. Implement DCF calculation functions in `valuation.ts`
7. Implement `calculateDcf` action + denormalization to watchlistData
8. Update `watchlist.upsertDataInternal` to accept new optional valuation fields
9. Implement TWR logic in `twr.ts`, wire into `rebuildMonthInternal`

### Phase 3 — SEC Pipeline
10. Add `beautifulsoup4`, `lxml` to FastAPI deps
11. Create `api/app/services/sec_extractor.py`
12. Create `api/app/routers/sec.py` with extract-filing and extract-transcript endpoints
13. Register new router in `api/app/main.py`

### Phase 4 — Moat Analysis Engine
14. Implement `moat.analyzeTicker` action (SEC fetch → FastAPI extract → Claude → persist)
15. Implement Claude prompt templates for Pass 1 (extraction) and Pass 2 (synthesis)
16. Add deterministic keyword-frequency fallback scoring

### Phase 5 — UI
17. Add Valuation + Moat columns to watchlist table
18. Build `ticker-detail-sheet.tsx` component
19. Build `/moat` page with score gauge, evidence accordion, trend chart
20. Add TWR StatCard to dashboard
21. Update sidebar with Moat Analysis nav item

### Phase 6 — Polish
22. Add staleness banners ("New filings available", "Fundamentals >90 days old")
23. Add loading/progress states for async analysis
24. Update `.env.example` with new variables
25. Update `docker-compose.yml` if new FastAPI deps require rebuild

## Verification

1. **DCF**: Add AAPL to watchlist → Run DCF → Verify intrinsic value is in a reasonable range ($150-250) → Check all 3 scenarios appear in detail sheet
2. **Margin of Safety**: Compare intrinsic value vs current price → Verify badge color/classification is correct
3. **TWR**: Upload 2+ monthly statements → Verify TWR StatCard on dashboard shows non-zero value → Verify TWR differs from simple return (proving deposit-independence)
4. **Moat Analysis**: Run analysis on BRK-B → Verify evidence quotes are real excerpts from SEC filings → Verify moat score is high (Berkshire has wide moat) → Check score history records after re-analysis
5. **End-to-end**: Verify watchlist table shows both Valuation and Moat columns populated → Click ticker row → Detail sheet opens with DCF breakdown

## Critical Files

| File | Changes |
|------|---------|
| `web/convex/schema.ts` | +7 tables, +4 fields on watchlistData |
| `web/convex/valuation.ts` | **New** — DCF engine |
| `web/convex/twr.ts` | **New** — TWR computation |
| `web/convex/moat.ts` | **New** — Moat analysis orchestration |
| `web/convex/watchlist.ts` | Update `upsertDataInternal` for valuation fields |
| `web/convex/statements.ts` | Hook `rebuildMonthInternal` to trigger TWR recalc |
| `web/src/app/watchlist/page.tsx` | +Valuation column, +Moat badge, +Run DCF button, +filter/sort |
| `web/src/app/moat/page.tsx` | **New** — Moat analysis page |
| `web/src/components/valuation/ticker-detail-sheet.tsx` | **New** — DCF detail panel |
| `web/src/components/charts/moat-score-gauge.tsx` | **New** — SVG circular gauge |
| `web/src/app/dashboard/page.tsx` | +TWR StatCard |
| `web/src/components/layout/sidebar.tsx` | +Moat Analysis nav item |
| `api/app/routers/sec.py` | **New** — SEC filing extraction endpoints |
| `api/app/services/sec_extractor.py` | **New** — BeautifulSoup HTML parser |
| `api/app/main.py` | Register SEC router |
