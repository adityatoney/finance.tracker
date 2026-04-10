"""Monthly snapshot computation — pre-aggregates holdings by category for fast dashboard reads."""

from sqlalchemy.orm import Session
from sqlalchemy import func, distinct

from app.models import (
    Statement,
    Holding,
    Deposit,
    MonthlySnapshot,
    generate_uuid,
    utc_now_iso,
)

CATEGORIES = ["foundational", "value", "growth", "emergency_fund", "btc_crypto"]


def get_all_months(db: Session) -> list[str]:
    """Return all distinct months that have statement data."""
    rows = db.query(distinct(Statement.statement_date)).order_by(Statement.statement_date).all()
    return [r[0] for r in rows]


def rebuild_month(db: Session, month: str) -> list[str]:
    """Rebuild monthly_snapshots for a given month.

    Algorithm:
    1. Sum holdings by category for this month across all brokerages.
    2. Sum deposits for this month.
    3. Look up previous month's snapshot to compute market_gain:
       market_gain = current_value - previous_value - net_deposits
    4. Upsert into monthly_snapshots.

    Returns list of months rebuilt.
    """
    # Get all statement IDs for this month
    stmt_ids = [
        r[0] for r in
        db.query(Statement.id).filter(Statement.statement_date == month).all()
    ]

    if not stmt_ids:
        return []

    # Aggregate holdings by category
    category_totals: dict[str, float] = {}
    rows = (
        db.query(Holding.category, func.sum(Holding.market_value))
        .filter(Holding.statement_id.in_(stmt_ids))
        .group_by(Holding.category)
        .all()
    )
    for category, total in rows:
        if category:
            category_totals[category.lower()] = total or 0.0

    # Aggregate deposits for this month
    total_deposits = 0.0
    deposit_rows = (
        db.query(func.sum(Deposit.amount))
        .filter(Deposit.statement_id.in_(stmt_ids))
        .scalar()
    )
    total_deposits = deposit_rows or 0.0

    # Distribute deposits proportionally across categories (simplification)
    total_value_all = sum(category_totals.values()) or 1.0

    # Get previous month (simple string decrement)
    prev_month = _prev_month(month)
    prev_snapshots: dict[str, float] = {}
    prev_rows = (
        db.query(MonthlySnapshot.category, MonthlySnapshot.total_value)
        .filter(MonthlySnapshot.month == prev_month)
        .all()
    )
    for cat, val in prev_rows:
        prev_snapshots[cat] = val or 0.0

    # Upsert snapshots for each category
    rebuilt = []
    for category in CATEGORIES:
        current_value = category_totals.get(category, 0.0)
        prev_value = prev_snapshots.get(category, 0.0)

        # Distribute deposits proportionally
        proportion = current_value / total_value_all if total_value_all > 0 else 0.0
        cat_deposits = total_deposits * proportion

        market_gain = current_value - prev_value - cat_deposits

        # Upsert
        existing = (
            db.query(MonthlySnapshot)
            .filter(
                MonthlySnapshot.month == month,
                MonthlySnapshot.category == category,
            )
            .first()
        )

        if existing:
            existing.total_value = current_value
            existing.net_deposits = cat_deposits
            existing.market_gain = market_gain
        else:
            db.add(MonthlySnapshot(
                id=generate_uuid(),
                month=month,
                category=category,
                total_value=current_value,
                net_deposits=cat_deposits,
                market_gain=market_gain,
            ))

    db.flush()
    rebuilt.append(month)
    return rebuilt


def _prev_month(month: str) -> str:
    """Given 'YYYY-MM', return the previous month string."""
    parts = month.split("-")
    year = int(parts[0])
    m = int(parts[1])
    if m == 1:
        return f"{year - 1}-12"
    return f"{year}-{m - 1:02d}"
