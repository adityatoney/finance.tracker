"""Health check and database inspection endpoints."""

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.config import settings
from app.schemas import HealthResponse
from app.database import get_db

router = APIRouter()


@router.get("/api/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    return HealthResponse(
        status="ok",
        db_path=str(settings.db_path),
        db_exists=settings.db_path_resolved.exists(),
        encryption_key_set=bool(settings.encryption_key),
    )


@router.get("/api/db/dump")
async def dump_database(db: Session = Depends(get_db)) -> dict:
    """Return all tables as JSON for debugging/inspection."""
    tables = {}

    for table_name in ["statements", "holdings", "deposits", "ticker_map", "monthly_snapshots", "pii_audit_log"]:
        try:
            rows = db.execute(text(f"SELECT * FROM {table_name}")).mappings().all()
            tables[table_name] = [dict(row) for row in rows]
        except Exception as e:
            tables[table_name] = {"error": str(e)}

    return {
        "db_path": str(settings.db_path),
        "tables": tables,
        "summary": {
            table: len(rows) if isinstance(rows, list) else 0
            for table, rows in tables.items()
        },
    }


@router.get("/api/db/download")
async def download_database():
    """Download the SQLite database file directly."""
    path = settings.db_path_resolved
    if not path.exists():
        return {"detail": "Database file not found"}
    return FileResponse(
        path=str(path),
        media_type="application/x-sqlite3",
        filename="finance.db",
    )
