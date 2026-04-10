"""Ticker → category mapping engine with layered lookups."""

from sqlalchemy.orm import Session
from app.models import TickerMap, utc_now_iso


class TickerMapResult:
    def __init__(self, category: str, source: str):
        self.category = category
        self.source = source


class TickerMapper:
    """Resolves ticker symbols to asset categories.

    Lookup order:
    1. User overrides in DB (source='user')
    2. Seed defaults in DB (source='seed')
    """

    def __init__(self, db: Session):
        self._db = db
        self._cache: dict[str, TickerMapResult] = {}
        self._load_cache()

    def _load_cache(self):
        """Load all mappings into memory for fast lookups."""
        rows = self._db.query(TickerMap).all()
        for row in rows:
            self._cache[row.ticker.upper()] = TickerMapResult(
                category=row.category,
                source=row.source,
            )

    def get_category(self, ticker: str) -> TickerMapResult | None:
        """Return the category for a ticker, or None if unknown."""
        return self._cache.get(ticker.upper().strip())

    def get_unknown_tickers(self, tickers: list[str]) -> list[str]:
        """Return tickers not yet mapped."""
        return [t for t in tickers if self.get_category(t) is None]

    def upsert(self, ticker: str, category: str, source: str = "user"):
        """Create or update a ticker mapping in DB and cache."""
        ticker_upper = ticker.upper().strip()
        existing = self._db.query(TickerMap).filter(TickerMap.ticker == ticker_upper).first()

        if existing:
            existing.category = category
            existing.source = source
            existing.updated_at = utc_now_iso()
        else:
            self._db.add(TickerMap(
                ticker=ticker_upper,
                category=category,
                source=source,
                updated_at=utc_now_iso(),
            ))

        self._cache[ticker_upper] = TickerMapResult(category=category, source=source)
        self._db.flush()
