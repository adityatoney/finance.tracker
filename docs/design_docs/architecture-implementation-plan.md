# Finance Tracker — Architecture & Implementation Plan

## Context

Build a **local-first, fully offline** financial dashboard that tracks total assets month-over-month (MoM) across three brokerages (Fidelity, Robinhood, Betterment). The user uploads monthly PDF/CSV statements; the app parses holdings, encrypts PII, categorizes assets into 5 buckets, and visualizes growth — distinguishing market gains from contributions.

**Architecture: Hybrid Python + Next.js** — Python FastAPI handles PDF parsing + PII encryption (where Python is unmatched), Next.js handles the dashboard UI (leveraging user's existing expertise with shadcn/ui, Tailwind, TanStack Query).

Project root: `/Users/adityat/Documents/Projects/finance.tracker`

---

## Tech Stack Summary

| Layer | Technology | Rationale |
|---|---|---|
| **Frontend** | Next.js 14+ (App Router), TypeScript | SSR for fast dashboard loads, user's existing expertise |
| **UI Components** | shadcn/ui + Tailwind CSS | Accessible, customizable, beautiful data tables/modals |
| **Charts** | Recharts | Composable (supports waterfall via stacked bars), pairs with shadcn without design conflicts |
| **Frontend State** | TanStack Query | Mutations to Python API; cache invalidation via `router.refresh()` |
| **Frontend DB Reads** | better-sqlite3 + Drizzle ORM | Direct read-only SQLite access in Server Components (sub-ms) |
| **Backend** | FastAPI (Python) + uvicorn | Handles all writes, parsing, encryption |
| **PDF Parsing** | pdfplumber | Best-in-class table extraction, tunable for Betterment's layouts, fully offline |
| **Encryption** | Fernet (cryptography lib) | Authenticated symmetric encryption, highest-level Python API |
| **Database** | SQLite (WAL mode) | Zero-setup, shared file between both services |
| **Schema Mgmt** | Alembic (Python owns migrations) | Single source of truth; Drizzle mirrors read-only |
| **Dev Tooling** | Docker Compose | `docker compose up` runs both services; plugs into existing Docker infrastructure |

---

## Project Structure

```
finance.tracker/
├── .env                          # ENCRYPTION_KEY, DB_PATH
├── .env.example
├── .gitignore
├── docker-compose.yml            # Orchestrates api + web + shared DB volume
│
├── api/
│   ├── Dockerfile                # Python 3.12-slim + uvicorn
│   ...
├── web/
│   ├── Dockerfile                # Node 20-slim + next dev
│   ...
├── data/                         # (Docker volume mount point, gitignored)
│   ├── .gitkeep
│   └── finance.db                # Shared SQLite (created at runtime)
│
├── api/                          # ── PYTHON BACKEND ──
│   ├── pyproject.toml
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py               # FastAPI app, CORS, lifespan
│   │   ├── config.py             # pydantic-settings (.env loading)
│   │   ├── database.py           # SQLite engine, WAL mode, session factory
│   │   ├── models.py             # SQLAlchemy ORM (schema source of truth)
│   │   ├── schemas.py            # Pydantic request/response models
│   │   ├── routers/
│   │   │   ├── parse.py          # POST /api/parse, POST /api/commit
│   │   │   ├── snapshots.py      # POST /api/snapshots/rebuild
│   │   │   ├── tickers.py        # GET/PUT/DELETE /api/tickers
│   │   │   └── health.py         # GET /api/health
│   │   ├── services/
│   │   │   ├── parsers/
│   │   │   │   ├── base.py       # BaseParser ABC + PDF/CSV mixins
│   │   │   │   ├── fidelity.py   # Fidelity PDF + CSV parser
│   │   │   │   ├── robinhood.py  # Robinhood PDF + CSV parser
│   │   │   │   └── betterment.py # Betterment PDF parser
│   │   │   ├── parser_registry.py
│   │   │   ├── encryption.py     # Fernet encrypt/decrypt
│   │   │   ├── pii_detector.py   # Regex PII detection
│   │   │   ├── snapshot_builder.py
│   │   │   └── ticker_mapper.py
│   │   └── seed/
│   │       └── default_ticker_map.json
│   └── tests/
│       ├── conftest.py
│       ├── test_parsers.py
│       ├── test_encryption.py
│       ├── test_snapshot_builder.py
│       └── fixtures/             # Sample anonymized PDFs/CSVs
│
├── web/                          # ── NEXT.JS FRONTEND ──
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   ├── components.json           # shadcn/ui config
│   ├── drizzle.config.ts
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx        # Root layout: sidebar + QueryProvider
│   │   │   ├── page.tsx          # Redirect to /dashboard
│   │   │   ├── dashboard/
│   │   │   │   ├── page.tsx      # Server Component: KPIs + charts
│   │   │   │   └── loading.tsx   # Skeleton loaders
│   │   │   ├── upload/
│   │   │   │   └── page.tsx      # Client Component: upload + dry run
│   │   │   ├── holdings/
│   │   │   │   └── page.tsx      # Server Component: holdings table
│   │   │   ├── ticker-map/
│   │   │   │   └── page.tsx      # Hybrid: read + edit mappings
│   │   │   └── settings/
│   │   │       └── page.tsx      # DB stats, encryption status
│   │   ├── components/
│   │   │   ├── ui/               # shadcn/ui primitives
│   │   │   ├── layout/
│   │   │   │   ├── sidebar.tsx
│   │   │   │   └── top-bar.tsx
│   │   │   ├── charts/
│   │   │   │   ├── category-area-chart.tsx    # Stacked area (5 categories)
│   │   │   │   ├── waterfall-chart.tsx        # Contributions vs market gain
│   │   │   │   ├── allocation-donut-chart.tsx # Category allocation
│   │   │   │   ├── total-assets-line-chart.tsx
│   │   │   │   └── kpi-card.tsx               # Metric card with delta
│   │   │   ├── upload/
│   │   │   │   ├── file-dropzone.tsx
│   │   │   │   ├── dry-run-results.tsx
│   │   │   │   ├── unknown-ticker-row.tsx
│   │   │   │   └── commit-dialog.tsx
│   │   │   └── data-table/
│   │   │       ├── data-table.tsx             # Generic TanStack Table
│   │   │       └── data-table-toolbar.tsx
│   │   ├── lib/
│   │   │   ├── db/
│   │   │   │   ├── index.ts      # better-sqlite3 singleton (READ-ONLY)
│   │   │   │   ├── schema.ts     # Drizzle schema (mirrors SQLAlchemy)
│   │   │   │   └── queries/      # Pre-built read queries
│   │   │   │       ├── snapshots.ts
│   │   │   │       ├── holdings.ts
│   │   │   │       └── statements.ts
│   │   │   ├── api/
│   │   │   │   ├── client.ts     # Typed fetch wrapper for Python API
│   │   │   │   └── hooks/        # TanStack Query mutation hooks
│   │   │   │       ├── use-parse.ts
│   │   │   │       ├── use-commit.ts
│   │   │   │       └── use-tickers.ts
│   │   │   ├── types/
│   │   │   │   └── index.ts      # All TypeScript interfaces
│   │   │   ├── constants/
│   │   │   │   └── categories.ts # Category names, colors, order
│   │   │   └── utils/
│   │   │       └── format.ts     # Currency, percentage formatters
│   │   └── providers/
│   │       └── query-provider.tsx # TanStack Query client boundary
│   └── scripts/
│       └── generate-api-types.ts # OpenAPI → TypeScript codegen
```

---

## Database Access Pattern (Critical Architecture Decision)

```
              Docker Compose Network
    ┌─────────────────────────────────────────┐
    │                                         │
    │    ┌──────────────────────────────┐      │
    │    │   db-data volume             │      │
    │    │   finance.db (WAL mode)      │      │
    │    └────────────┬─────────────────┘      │
    │                 │                        │
    │    ┌────────────┼────────────┐           │
    │    │                        │            │
    │  ┌─┴──────────┐    ┌───────┴────────┐   │
    │  │ api (py)   │    │ web (node)     │   │
    │  │ :8000      │    │ :3000          │   │
    │  │ READ+WRITE │    │ READ-ONLY      │   │
    │  │            │    │ (volume :ro)   │   │
    │  │ Mutations: │    │                │   │
    │  │ • parse    │    │ Server         │   │
    │  │ • commit   │    │ Components     │   │
    │  │ • encrypt  │    │ via better-    │   │
    │  │ • rebuild  │    │ sqlite3 +      │   │
    │  │   snapshots│    │ Drizzle        │   │
    │  └────────────┘    └────────────────┘   │
    │                                         │
    └─────────────────────────────────────────┘
```

**Why split reads/writes?**
- Dashboard reads are the hot path — direct SQLite via better-sqlite3 is sub-millisecond, vs ~20-50ms through the Python API
- SQLite WAL mode supports unlimited concurrent readers + one writer safely
- Next.js Server Components can pre-render dashboards with zero client-side loading spinners
- Python only handles infrequent write operations (uploads, commits, rebuilds)

**Rules:**
1. Next.js opens DB with `{ readonly: true }` — enforced at connection level
2. All INSERT/UPDATE/DELETE goes through FastAPI endpoints
3. After mutations: `router.refresh()` re-runs Server Components to pick up fresh data

---

## Database Schema

Owned by Python via SQLAlchemy + Alembic. Drizzle mirrors it read-only.

**`statements`** — One row per uploaded statement file

| Column | Type | Notes |
|---|---|---|
| id | TEXT (UUID) | Primary key |
| brokerage | TEXT | "fidelity" / "robinhood" / "betterment" |
| statement_date | TEXT | YYYY-MM |
| file_name | TEXT | Original filename |
| file_hash | TEXT (UNIQUE) | SHA-256 for dedup |
| account_number_enc | TEXT | Fernet-encrypted |
| owner_name_enc | TEXT | Fernet-encrypted |
| total_value | REAL | Total account value |
| net_deposits | REAL | Contributions in this period |
| uploaded_at | TEXT | ISO 8601 timestamp |

**`holdings`** — Individual positions per statement

| Column | Type | Notes |
|---|---|---|
| id | TEXT (UUID) | Primary key |
| statement_id | TEXT | FK → statements |
| ticker | TEXT | e.g., "VTI", "NVDA" |
| name | TEXT | Full holding name |
| quantity | REAL | Shares |
| price | REAL | Price per share |
| market_value | REAL | Total value |
| category | TEXT | Resolved at commit time |

**`ticker_map`** — Ticker → category mappings

| Column | Type | Notes |
|---|---|---|
| ticker | TEXT | Primary key |
| category | TEXT | foundational/value/growth/emergency_fund/btc_crypto |
| source | TEXT | "seed" or "user" |
| updated_at | TEXT | Last modified |

**`monthly_snapshots`** — Pre-computed aggregates for fast dashboards

| Column | Type | Notes |
|---|---|---|
| id | TEXT (UUID) | Primary key |
| month | TEXT | YYYY-MM |
| category | TEXT | Asset category |
| total_value | REAL | Sum of holdings |
| net_deposits | REAL | Contributions that month |
| market_gain | REAL | total_value - prev_value - net_deposits |
| UNIQUE | | (month, category) |

**`pii_audit_log`** — Tracks every encryption event

---

## FastAPI Endpoints

### `POST /api/parse` — Dry Run
Uploads a file, parses it, returns structured preview. Does NOT write to DB.

```
Request:  multipart/form-data { file, brokerage, statement_date }
Response: {
  brokerage, statement_date,
  accounts: [{ account_number_masked, holdings: [{ ticker, name, value, category }] }],
  deposits: [{ amount, description }],
  unknown_tickers: ["PLTR", "SOFI"],
  raw_text_preview: "first 500 chars...",
  warnings: ["Could not find deposits section"],
  confidence: { total_value: 1.0, deposits: 0.0 }
}
```

### `POST /api/commit` — Encrypt + Store
Takes confirmed parse result + user's ticker overrides, encrypts PII, writes to DB, rebuilds snapshots.

```
Request:  { brokerage, statement_date, accounts, deposits, ticker_overrides: [{ticker, category}] }
Response: { statement_id, holdings_created, snapshots_rebuilt: ["2026-03"] }
```

### `POST /api/snapshots/rebuild` — Recompute Snapshots
```
Request:  { months: ["2026-03"] | null }  // null = rebuild all
Response: { months_rebuilt, total_snapshots }
```

### `GET /api/tickers` — List All Mappings
### `PUT /api/tickers/{ticker}` — Create/Update Mapping
### `DELETE /api/tickers/{ticker}` — Remove Mapping
### `GET /api/health` — Service Status

---

## Parser Architecture (Python)

### Class Hierarchy
```
BaseParser (ABC)
├── PDFParserMixin (pdfplumber extraction)
├── CSVParserMixin (pandas extraction)
│
├── FidelityPDFParser(PDFParserMixin, BaseParser)
├── FidelityCSVParser(CSVParserMixin, BaseParser)
├── RobinhoodPDFParser(PDFParserMixin, BaseParser)
├── RobinhoodCSVParser(CSVParserMixin, BaseParser)
└── BettermentPDFParser(PDFParserMixin, BaseParser)
```

### Template Method Flow
```python
def parse(self, file, dry_run=False):
    raw_text, raw_tables = self._extract_raw(file)     # mixin provides
    parsed = self._parse_extracted(raw_text, raw_tables) # subclass implements
    if dry_run:
        return DryRunResult(raw_text, parsed, self._build_field_sources(), self._compute_confidence())
    return parsed
```

### Brokerage-Specific Strategies

| Brokerage | PDF Strategy | Contributions Source | Notes |
|---|---|---|---|
| **Fidelity** | Well-structured tables, default pdfplumber settings | "Contributions"/"Money In" line | Fallback: regex on raw text |
| **Robinhood** | Single-column, position blocks via regex | "Deposits"/"Transfers In" line | Less tabular, more text-based |
| **Betterment** | Multi-column, goal-based layout, `table_settings={vertical_strategy: "lines_strict", snap_tolerance: 5}` | "Net Deposits" AND "Market Returns" (both explicit!) | Hardest parser, confidence discounted 15% |

### Auto-Detection
Fingerprint strings in first page ("Fidelity Investments", "Robinhood Securities", "Betterment LLC"). Falls back to manual brokerage selection in UI if detection fails.

---

## PII Protection

### Two-Tier Detection
1. **Structural** (primary): `account_number` and `owner_name` fields → always encrypt
2. **Regex scanning** (secondary): scan raw text for SSN (`\d{3}-\d{2}-\d{4}`), masked accounts (`\*{2,4}-?\d{4,7}`), phone numbers

### Encryption
- Fernet symmetric encryption via `cryptography` library
- Key stored as `ENCRYPTION_KEY` in `.env`; auto-generated on first run via `setup_key.py`
- Encrypted values stored as base64 strings in SQLite TEXT columns
- Decrypt-on-demand in Settings page (calls Python API)

---

## Delta Calculation

```
market_gain = end_balance - start_balance - net_deposits
```

- **Fidelity/Robinhood**: Extract `net_deposits` from statement; compute `market_gain`
- **Betterment**: Extract both `net_deposits` AND `market_gain` directly (Betterment provides both)
- **Missing contributions**: Warn user, default to 0 (entire change = market gain)

---

## Next.js Frontend Pages

### Layout: Persistent left sidebar (collapsible)
- Nav items: Dashboard, Upload, Holdings, Ticker Map, Settings
- Category color scheme: Foundational=#3B82F6, Value=#F59E0B, Growth=#10B981, Emergency=#64748B, BTC=#F97316

### Dashboard (`/dashboard`) — Server Component
- **KPI cards row**: 5 `shadcn Card` + `Badge` (one per category, value + MoM delta)
- **Stacked area chart**: Recharts `AreaChart` with 5 stacked series over time
- **Two-column row**: Waterfall chart (contributions vs market gain) + Donut chart (allocation)
- **Total assets line chart**: Single line with gradient fill
- **Month range filter**: URL search params → Server Component re-renders with filtered data

### Upload (`/upload`) — Client Component
- **File dropzone**: `react-dropzone` + shadcn Card
- **Brokerage selector**: shadcn Select (Fidelity/Robinhood/Betterment)
- **Month picker**: shadcn Popover + custom month grid
- **Dry Run Results** (two columns):
  - Left: Raw extracted text in ScrollArea
  - Right: Parsed fields with confidence Badges (high/green, medium/yellow, low/red)
  - Warnings as shadcn Alerts
  - Unknown tickers with inline category Select dropdowns
  - PII detection panel showing what will be encrypted
- **Commit Dialog**: shadcn Dialog with summary → confirms → calls `POST /api/commit`
- **State machine**: IDLE → FILE_SELECTED → PARSING → DRY_RUN → COMMITTING → COMMITTED

### Holdings (`/holdings`) — Server Component
- TanStack Table via shadcn DataTable
- Filterable by brokerage, category, month
- Sortable, searchable, CSV export

### Ticker Map (`/ticker-map`) — Hybrid
- Editable table (source: default/user)
- Add/edit/delete via TanStack Query mutations to Python API
- Re-categorize triggers snapshot rebuild

### Settings (`/settings`)
- Encryption key status Badge
- DB stats (statement count, date range, size)
- Statement list with decrypt-on-demand
- "Recalculate Snapshots" button
- Delete statement with confirmation Dialog

---

## Data Fetching Pattern

| What | How | Why |
|---|---|---|
| Dashboard data | Server Component → Drizzle → SQLite | Pre-rendered, zero loading spinners |
| Holdings table | Server Component → Drizzle → SQLite | Fast initial load, client-side sort/filter |
| Ticker mappings | Server Component → Drizzle (initial) + TanStack Query (mutations) | Read fast, write through API |
| File upload + parse | TanStack Query mutation → Python API | Python handles pdfplumber |
| Commit to DB | TanStack Query mutation → Python API | Python handles encryption |
| After any mutation | `router.refresh()` | Re-runs Server Components with fresh SQLite data |

---

## Type Synchronization

Python (FastAPI) is the source of truth for API types:
1. FastAPI auto-generates OpenAPI schema at `/openapi.json`
2. `npx openapi-typescript` generates `web/src/types/api.ts`
3. Drizzle schema in `web/src/lib/db/schema.ts` manually mirrors SQLAlchemy models (comment references authoritative source)

---

## Dev Tooling — Docker Compose

Both services run as containers, sharing a named volume for the SQLite database. This plugs into existing Docker infrastructure and keeps the dev environment reproducible.

### `docker-compose.yml`
```yaml
services:
  api:
    build:
      context: ./api
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    volumes:
      - ./api:/app                  # Live reload via uvicorn --reload
      - db-data:/data               # Shared SQLite volume
    env_file: .env
    environment:
      - DB_PATH=/data/finance.db
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  web:
    build:
      context: ./web
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    volumes:
      - ./web/src:/app/src          # Live reload for source changes
      - db-data:/data:ro            # Shared SQLite volume (READ-ONLY mount)
    env_file: .env
    environment:
      - DB_PATH=/data/finance.db
      - NEXT_PUBLIC_API_URL=http://localhost:8000
    depends_on:
      api:
        condition: service_healthy

  # One-off service for DB migrations and seeding
  migrate:
    build:
      context: ./api
      dockerfile: Dockerfile
    volumes:
      - db-data:/data
    env_file: .env
    environment:
      - DB_PATH=/data/finance.db
    command: >
      sh -c "alembic upgrade head && python -m app.seed_tickers"
    profiles: ["tools"]             # Only runs when explicitly invoked

volumes:
  db-data:                          # Named volume persists between restarts
```

### `api/Dockerfile`
```dockerfile
FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
COPY pyproject.toml .
RUN pip install --no-cache-dir -e ".[dev]"
COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
```

### `web/Dockerfile`
```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0", "--port", "3000"]
```

### Common Commands
```bash
# Start everything (first run auto-builds images)
docker compose up

# Run DB migrations + seed data
docker compose run --rm migrate

# Rebuild after dependency changes
docker compose build

# Generate TypeScript types from OpenAPI
docker compose exec web npx openapi-typescript http://api:8000/openapi.json -o src/types/api.ts

# Run Python tests
docker compose exec api pytest

# View logs for one service
docker compose logs -f api

# Stop everything (data persists in db-data volume)
docker compose down

# Full reset (destroys DB volume)
docker compose down -v
```

### Key Docker Design Decisions
- **Named volume `db-data`** rather than a bind mount for the SQLite file — avoids filesystem permission issues across macOS/Linux, and the volume persists independently of containers
- **Read-only mount for web** — `db-data:/data:ro` enforces at the Docker level that Next.js can never write to the DB
- **`depends_on` with healthcheck** — web container waits for API to be healthy before starting, ensuring the DB is migrated before the frontend tries to read it
- **`migrate` in `tools` profile** — doesn't run with `docker compose up`; explicitly invoked via `docker compose run --rm migrate`
- **Source volumes for live reload** — `./api:/app` and `./web/src:/app/src` enable hot reload in both services without rebuilding images
- **Internal networking** — within Docker, `web` calls the API at `http://api:8000` (service name resolution). The browser calls `http://localhost:8000` via the exposed port. `NEXT_PUBLIC_API_URL` is set to `localhost:8000` for client-side fetches

### Next.js Config
```typescript
// next.config.ts — required for better-sqlite3 native addon
{ serverExternalPackages: ["better-sqlite3"] }
```

---

## Implementation Phases

### Phase 1: Foundation (scaffold both services)
- Create full directory structure
- **Python**: `pyproject.toml`, `Dockerfile`, FastAPI app skeleton, SQLAlchemy models, Alembic init + first migration, `GET /api/health`
- **Next.js**: `create-next-app`, `Dockerfile`, shadcn/ui init, install deps (recharts, better-sqlite3, drizzle, tanstack-query, react-dropzone)
- `docker-compose.yml` with `api`, `web`, and `migrate` services + shared `db-data` volume
- Drizzle schema mirroring SQLAlchemy
- Read-only DB connection in `web/src/lib/db/index.ts`
- `.env.example`, `.gitignore`, `setup_key.py`
- **Verify**: `docker compose run --rm migrate && docker compose up` — both services start, dashboard shows "No data yet"

### Phase 2: Parser Infrastructure + Encryption
- BaseParser ABC + PDF/CSV mixins
- Fidelity parser (CSV first — simpler, then PDF)
- Fernet encryption service
- PII regex detector
- `POST /api/parse` endpoint (dry run)
- Seed `default_ticker_map.json` (~30 common tickers)
- **Verify**: `curl -F file=@sample.csv POST localhost:8000/api/parse` returns parsed JSON

### Phase 3: Upload Page + Dry Run UI
- File dropzone component
- Brokerage selector + month picker
- `use-parse` TanStack mutation hook
- Dry run results display (raw text + parsed fields + confidence + warnings)
- Unknown ticker inline categorization
- PII detection panel
- **Verify**: Upload a Fidelity CSV in browser → see parsed dry run results

### Phase 4: Commit Flow
- `POST /api/commit` endpoint (encrypt PII, insert to DB, update ticker_map)
- Commit dialog component
- `use-commit` TanStack mutation hook
- Snapshot builder service (delta calculation)
- Auto-rebuild snapshots on commit
- **Verify**: Commit a statement → data appears in SQLite → `router.refresh()` updates UI

### Phase 5: Dashboard Charts
- Drizzle read queries (snapshots, KPIs, allocations)
- KPI cards component
- Stacked area chart (Recharts)
- Waterfall chart (composed BarChart)
- Allocation donut chart
- Total assets line chart
- Month range filter via URL search params
- **Verify**: Upload 2-3 months of statements → dashboard shows MoM trends

### Phase 6: Remaining Parsers
- Robinhood parser (PDF + CSV)
- Betterment parser (PDF with custom table_settings)
- Auto-detection via fingerprints
- `tests/test_parsers.py` with fixture files
- **Verify**: Parse one statement from each brokerage successfully

### Phase 7: Holdings + Ticker Map Pages
- Holdings page: TanStack Table with sort/filter/search/export
- Ticker map page: editable table, add/edit/delete via API
- `GET/PUT/DELETE /api/tickers` endpoints
- Unknown ticker banner on dashboard
- **Verify**: Edit a ticker mapping → snapshots recalculate → dashboard updates

### Phase 8: Settings + Polish
- Settings page: encryption status, DB stats, statement list, danger zone
- Decrypt-on-demand for account numbers
- `POST /api/snapshots/rebuild` endpoint
- Error boundaries, toast notifications (sonner)
- Loading skeletons for all pages
- OpenAPI → TypeScript type generation script
- **Verify**: Full end-to-end flow with all 3 brokerages

---

## Python Dependencies (`api/pyproject.toml`)

```
fastapi, uvicorn[standard], sqlalchemy, alembic, pdfplumber,
cryptography, python-dotenv, python-multipart, pandas, pydantic-settings
```

## Node Dependencies (`web/package.json`)

```
next, react, typescript, tailwindcss, @shadcn/ui,
recharts, @tanstack/react-query, @tanstack/react-table,
better-sqlite3, drizzle-orm, react-dropzone
```

---

## Verification Plan

1. **Unit tests**: `docker compose exec api pytest` — parser extraction, encryption round-trip, delta calculation, snapshot builder
2. **Dry run**: Upload a PDF for each brokerage → verify parsed fields, confidence scores, PII detection
3. **Commit flow**: Commit a statement → inspect SQLite directly → confirm encrypted PII, correct holdings, snapshots built
4. **Dashboard**: Upload 3+ months → stacked area shows category growth, waterfall shows gain vs contributions, KPIs show correct deltas
5. **Unknown ticker**: Upload with new ticker → UI prompts → categorize → persists on next upload
6. **Dedup**: Re-upload same file → rejected via `file_hash` UNIQUE constraint
7. **Offline check**: Disconnect network → entire app still works (no external API calls)
