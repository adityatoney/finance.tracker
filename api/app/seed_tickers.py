"""Seed the ticker_map table with default mappings from JSON."""

import json
from pathlib import Path

from app.database import SessionLocal
from app.models import TickerMap, utc_now_iso

SEED_FILE = Path(__file__).parent / "seed" / "default_ticker_map.json"


def seed_if_empty():
    """Load default ticker mappings into the database if the table is empty."""
    db = SessionLocal()
    try:
        count = db.query(TickerMap).count()
        if count > 0:
            return  # Already seeded

        with open(SEED_FILE) as f:
            mappings = json.load(f)

        for ticker, category in mappings.items():
            db.add(TickerMap(
                ticker=ticker.upper(),
                category=category,
                source="seed",
                updated_at=utc_now_iso(),
            ))

        db.commit()
        print(f"Seeded {len(mappings)} default ticker mappings")
    except Exception as e:
        db.rollback()
        print(f"Error seeding ticker mappings: {e}")
    finally:
        db.close()


if __name__ == "__main__":
    seed_if_empty()
