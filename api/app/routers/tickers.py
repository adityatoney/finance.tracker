"""Ticker mapping CRUD endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import TickerMapping, TickerUpsert
from app.models import TickerMap, utc_now_iso

router = APIRouter()


@router.get("/api/tickers", response_model=list[TickerMapping])
async def list_tickers(db: Session = Depends(get_db)) -> list[TickerMapping]:
    """Return all ticker → category mappings."""
    rows = db.query(TickerMap).order_by(TickerMap.ticker).all()
    return [
        TickerMapping(
            ticker=r.ticker,
            category=r.category,
            source=r.source,
            updated_at=r.updated_at,
        )
        for r in rows
    ]


@router.put("/api/tickers/{ticker}", response_model=TickerMapping)
async def upsert_ticker(
    ticker: str,
    body: TickerUpsert,
    db: Session = Depends(get_db),
) -> TickerMapping:
    """Create or update a ticker mapping."""
    ticker_upper = ticker.upper().strip()
    existing = db.query(TickerMap).filter(TickerMap.ticker == ticker_upper).first()

    if existing:
        existing.category = body.category
        existing.source = "user"
        existing.updated_at = utc_now_iso()
        db.flush()
        return TickerMapping(
            ticker=existing.ticker,
            category=existing.category,
            source=existing.source,
            updated_at=existing.updated_at,
        )
    else:
        new_mapping = TickerMap(
            ticker=ticker_upper,
            category=body.category,
            source="user",
            updated_at=utc_now_iso(),
        )
        db.add(new_mapping)
        db.flush()
        return TickerMapping(
            ticker=new_mapping.ticker,
            category=new_mapping.category,
            source=new_mapping.source,
            updated_at=new_mapping.updated_at,
        )


@router.delete("/api/tickers/{ticker}")
async def delete_ticker(
    ticker: str,
    db: Session = Depends(get_db),
) -> dict:
    """Delete a ticker mapping."""
    ticker_upper = ticker.upper().strip()
    existing = db.query(TickerMap).filter(TickerMap.ticker == ticker_upper).first()
    if not existing:
        raise HTTPException(status_code=404, detail=f"Ticker {ticker_upper} not found")
    db.delete(existing)
    return {"deleted": ticker_upper}
