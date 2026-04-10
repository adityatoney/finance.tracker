"""Snapshot rebuild endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import RebuildRequest, RebuildResult
from app.services.snapshot_builder import rebuild_month, get_all_months

router = APIRouter()


@router.post("/api/snapshots/rebuild", response_model=RebuildResult)
async def rebuild_snapshots(
    body: RebuildRequest,
    db: Session = Depends(get_db),
) -> RebuildResult:
    """Recompute monthly snapshots. If months is None, rebuild all."""
    months = body.months or get_all_months(db)
    all_rebuilt = []
    total = 0

    for month in months:
        rebuilt = rebuild_month(db, month)
        all_rebuilt.extend(rebuilt)
        total += len(rebuilt)

    return RebuildResult(
        months_rebuilt=list(set(all_rebuilt)),
        total_snapshots=total,
    )
