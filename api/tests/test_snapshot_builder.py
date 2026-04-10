"""Tests for snapshot building and delta calculation."""

import pytest
from app.models import Base, Statement, Holding, MonthlySnapshot, generate_uuid, utc_now_iso
from app.services.snapshot_builder import rebuild_month, _prev_month


def test_prev_month():
    assert _prev_month("2026-03") == "2026-02"
    assert _prev_month("2026-01") == "2025-12"
    assert _prev_month("2025-12") == "2025-11"


def test_rebuild_month_basic(db_session):
    """Test that rebuild_month creates snapshots from holdings."""
    # Create a statement with holdings
    stmt = Statement(
        id=generate_uuid(),
        brokerage="fidelity",
        statement_date="2026-03",
        file_name="test.csv",
        file_hash="abc123",
        total_value=50000,
        net_deposits=1000,
    )
    db_session.add(stmt)

    db_session.add(Holding(
        id=generate_uuid(),
        statement_id=stmt.id,
        ticker="VTI",
        market_value=30000,
        category="foundational",
    ))
    db_session.add(Holding(
        id=generate_uuid(),
        statement_id=stmt.id,
        ticker="NVDA",
        market_value=20000,
        category="growth",
    ))
    db_session.flush()

    # Rebuild
    rebuilt = rebuild_month(db_session, "2026-03")
    assert "2026-03" in rebuilt

    # Check snapshots were created
    snapshots = db_session.query(MonthlySnapshot).filter(
        MonthlySnapshot.month == "2026-03"
    ).all()
    assert len(snapshots) > 0

    # Find foundational snapshot
    foundational = next((s for s in snapshots if s.category == "foundational"), None)
    assert foundational is not None
    assert foundational.total_value == 30000

    growth = next((s for s in snapshots if s.category == "growth"), None)
    assert growth is not None
    assert growth.total_value == 20000


def test_rebuild_empty_month(db_session):
    """Test rebuild with no statements returns empty list."""
    rebuilt = rebuild_month(db_session, "2026-03")
    assert rebuilt == []
