"""Pydantic request/response schemas for the FastAPI endpoints."""

from pydantic import BaseModel


# ── Parse (Dry Run) Response ──

class HoldingParsed(BaseModel):
    ticker: str
    name: str = ""
    quantity: float | None = None
    price: float | None = None
    market_value: float = 0.0          # = ending_value (used for categorization/snapshots)
    beginning_value: float | None = None
    ending_value: float | None = None
    cost_basis: float | None = None
    category: str | None = None
    category_source: str | None = None  # "seed" / "user" / None


class AccountParsed(BaseModel):
    account_number: str = ""  # raw, pre-encryption
    account_number_masked: str = ""  # e.g., "***-1234"
    account_type: str = ""  # e.g., "Individual - TOD", "ROTH IRA", "Health Savings Account"
    owner_name: str = ""
    holdings: list[HoldingParsed] = []
    total_value: float = 0.0           # = ending mkt value from section 1
    beginning_value: float | None = None
    ending_value: float | None = None
    change_in_investment: float | None = None
    tracking_mode: str = "detailed"  # "detailed" = track individual holdings, "aggregate" = track total only


class DepositParsed(BaseModel):
    amount: float = 0.0
    description: str = ""
    date: str | None = None


class ConfidenceScores(BaseModel):
    total_value: float = 0.0
    account_number: float = 0.0
    holdings: float = 0.0
    deposits: float = 0.0
    owner_name: float = 0.0


class ParseResult(BaseModel):
    brokerage: str = ""
    statement_date: str = ""
    accounts: list[AccountParsed] = []
    deposits: list[DepositParsed] = []
    unknown_tickers: list[str] = []
    raw_text_preview: str = ""
    warnings: list[str] = []
    confidence: ConfidenceScores = ConfidenceScores()


# ── Commit Request/Response ──

class TickerOverride(BaseModel):
    ticker: str
    category: str  # foundational/value/growth/emergency_fund/btc_crypto


class CommitRequest(BaseModel):
    brokerage: str
    statement_date: str
    accounts: list[AccountParsed] = []
    deposits: list[DepositParsed] = []
    ticker_overrides: list[TickerOverride] = []
    file_hash: str = ""
    file_name: str = ""


class CommitResult(BaseModel):
    statement_id: str
    holdings_created: int = 0
    deposits_created: int = 0
    ticker_mappings_added: int = 0
    snapshots_rebuilt: list[str] = []


# ── Snapshots ──

class RebuildRequest(BaseModel):
    months: list[str] | None = None  # None = rebuild all


class RebuildResult(BaseModel):
    months_rebuilt: list[str] = []
    total_snapshots: int = 0


# ── Ticker Mappings ──

class TickerMapping(BaseModel):
    ticker: str
    category: str
    source: str = "user"
    updated_at: str = ""


class TickerUpsert(BaseModel):
    category: str


# ── Health ──

class HealthResponse(BaseModel):
    status: str = "ok"
    db_path: str = ""
    db_exists: bool = False
    encryption_key_set: bool = False
