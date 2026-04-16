# Stock Watchlist Feature

## Context

Build a Stock Watchlist within the Finance Tracker where the user can add any ticker, and the app fetches real-time market data (price, % changes across 6 timeframes, 52-week range, market cap). Data sourced from Alpha Vantage API (free tier, 25 requests/day). Watchlist tickers persisted in Convex.

---

## Architecture

```
User adds ticker "MSFT"
  → Saved to Convex `watchlist` table
  → Convex Action fetches data from Alpha Vantage API
  → Stores price snapshot in `watchlistData` table
  → UI renders table with all market data

On page load:
  → Read tickers from Convex `watchlist`
  → Read cached data from `watchlistData`
  → Optionally refresh stale data (>1 hour old) via Alpha Vantage
```

### Alpha Vantage Strategy (25 req/day limit)

- **GLOBAL_QUOTE** endpoint: Returns current price, open, high, low, volume, change, change% for one ticker. 1 request per ticker.
- **TIME_SERIES_MONTHLY** endpoint: Returns monthly close prices — compute 1M, 6M, 1Y, 3Y, 5Y changes from history. 1 request per ticker.
- With 19 tickers and 2 endpoints each = 38 requests. Exceeds 25/day limit.

**Solution: Batch refresh with caching.**
- Cache all data in Convex `watchlistData` table.
- On page load, show cached data instantly.
- "Refresh" button fetches latest for selected ticker(s) — user controls when to spend API quota.
- Show "Last updated: X hours ago" per ticker.
- `GLOBAL_QUOTE` for price + daily change (1 req)
- Compute 1M/6M/1Y/3Y/5Y from `TIME_SERIES_MONTHLY` (1 req) — cached longer since historical data doesn't change frequently.
- 52-week range: derived from `TIME_SERIES_DAILY` or monthly data.

**Alternative: Use single `OVERVIEW` endpoint** — returns market cap, 52W high/low, PE ratio, etc. Plus `GLOBAL_QUOTE` for current price. 2 requests per ticker total.

### Optimal API Usage

For each ticker, fetch TWO endpoints:
1. `GLOBAL_QUOTE` → current price, daily change
2. `OVERVIEW` → market cap, 52W high, 52W low, name, sector

For % changes over time (1M, 6M, 1Y, 3Y, 5Y):
3. `TIME_SERIES_MONTHLY_ADJUSTED` → monthly close prices, compute deltas

Cache strategy — **market-hours aware**:
- **During market hours** (Mon–Fri 9:30 AM – 4:00 PM ET): allow refresh, data may be stale
- **After market close**: cache is frozen — no need to refetch until next market open. Show "Market closed · Data as of 4:00 PM ET"
- **Weekends/holidays**: same as after close — show cached data from last close
- Price data (`GLOBAL_QUOTE`): refresh on demand during market hours only
- Company data (`OVERVIEW`): refresh weekly, rarely changes
- Monthly history: refresh monthly, compute % changes client-side
- Each ticker's `lastUpdated` timestamp determines staleness
- UI shows "Last updated: Today 4:00 PM" or "Last updated: Fri 4:00 PM" etc.
- Refresh button is disabled/dimmed when market is closed with tooltip "Market closed"

---

## Convex Schema

```typescript
// In schema.ts
watchlist: defineTable({
  ticker: v.string(),           // "MSFT", "BRK.B"
  addedAt: v.string(),          // ISO timestamp
  notes: v.optional(v.string()),
}).index("by_ticker", ["ticker"]),

watchlistData: defineTable({
  ticker: v.string(),
  name: v.optional(v.string()),
  marketCap: v.optional(v.string()),    // "2,919 B"
  price: v.optional(v.float64()),
  change: v.optional(v.float64()),       // daily $ change
  changePct: v.optional(v.float64()),    // daily % change
  high52w: v.optional(v.float64()),
  low52w: v.optional(v.float64()),
  pctInRange: v.optional(v.float64()),   // position in 52W range
  change1m: v.optional(v.float64()),     // % change 1 month
  change6m: v.optional(v.float64()),
  change1y: v.optional(v.float64()),
  change3y: v.optional(v.float64()),
  change5y: v.optional(v.float64()),
  sector: v.optional(v.string()),
  lastUpdated: v.string(),               // ISO timestamp
  lastHistoryUpdate: v.optional(v.string()), // when monthly history was last fetched
}).index("by_ticker", ["ticker"]),
```

## Convex Functions

```
convex/watchlist.ts:
  - list: query — return all watchlist tickers + their cached data (join)
  - add: mutation — add ticker to watchlist
  - remove: mutation — remove ticker
  - updateNote: mutation — update notes for a ticker
  - refreshQuote: action — fetch GLOBAL_QUOTE + OVERVIEW from Alpha Vantage, update watchlistData
  - refreshHistory: action — fetch TIME_SERIES_MONTHLY, compute % changes, update watchlistData
  - refreshAll: action — refresh all tickers (with rate limiting)
```

## Files to Create/Modify

| File | Action |
|---|---|
| `web/convex/schema.ts` | Add `watchlist` and `watchlistData` tables |
| `web/convex/watchlist.ts` | New — CRUD + Alpha Vantage fetch actions |
| `web/src/app/watchlist/page.tsx` | New — watchlist page |
| `web/src/components/layout/sidebar.tsx` | Add "Watchlist" nav item to Analysis group |
| `web/.env.local` | Add `ALPHA_VANTAGE_API_KEY` |

## Page Design

### Header
```
📊 Watchlist
Track stocks and ETFs with market data from Alpha Vantage

[Add Ticker: ________ ] [+ Add]    [Refresh All] [Last updated: 2h ago]
```

### Filter Pills
```
[All 19] [Stocks 12] [ETFs 7] [▲ Gainers] [▼ Losers]    Search: [________]
```

### Table Columns (all sortable)

| Column | Content | Style |
|---|---|---|
| Ticker | Mono pill | `font-mono bg-muted/60` |
| Name | Full name | truncate |
| Mkt Cap | "2,919B" | muted for N/A |
| Price | $393.01 | right-aligned, tabular-nums |
| 1D | +$2.25 (+0.57%) | green/red |
| 1M | -1.74% | green/red |
| 6M | -23.48% | green/red |
| 1Y | +1.89% | green/red |
| 3Y | +36.08% | green/red |
| 5Y | +50.73% | green/red |
| 52W Range | Visual bar + % label | gradient bar red→green |
| Actions | Refresh ↻ / Remove 🗑 | icon buttons |

### 52-Week Range Bar
```
$355 ████░░░░░░░░░░░░░ $555
         18.7%
```
Thin bar showing position between 52W low and high. Color: position-based (red near low, yellow mid, green near high).

### Row Hover
On hover, show additional info: sector, last updated time, notes.

---

## Implementation Order

### Phase 1: Schema + Convex Functions
- Add tables to `convex/schema.ts`
- Create `convex/watchlist.ts` with all CRUD + API fetch functions
- Test with `npx convex dev`

### Phase 2: UI
- Add sidebar nav item
- Create watchlist page with:
  - Add ticker input
  - Watchlist table with all columns
  - Sortable headers
  - Filter pills
  - 52W range bar
  - Green/red change styling
  - Refresh button per ticker + refresh all
  - Remove ticker button
  - Search

### Phase 3: Polish
- Loading skeletons while fetching
- "Last updated" timestamps
- Error handling for API failures
- Rate limit awareness (show remaining quota)

## Environment Variable

```
# In web/.env.local
ALPHA_VANTAGE_API_KEY=your-key-here
```

The key is set as a Convex environment variable (via dashboard) since the fetch happens in a Convex Action (server-side).

## Verification

1. Add a ticker (e.g., "MSFT") → saved to Convex, appears in table
2. Click Refresh → fetches from Alpha Vantage, populates price/changes/range
3. All 6 timeframe columns show correct % changes
4. 52W range bar renders with correct position
5. Sort by any column works
6. Filter pills separate stocks from ETFs
7. Remove a ticker → disappears from table
8. Page reload → shows cached data instantly
9. `npx tsc --noEmit` — zero errors
