"""Stateless parse endpoint — no DB, no encryption, no auth.

Receives a file, detects brokerage format, extracts data, returns JSON.
"""

import hashlib
from fastapi import APIRouter, UploadFile, Query, HTTPException

from app.schemas import ParseResult
from app.services.parser_registry import get_parser

router = APIRouter()


@router.post("/api/parse", response_model=ParseResult)
async def parse_statement(
    file: UploadFile,
    brokerage: str = Query(pattern=r"^(fidelity|robinhood|betterment|netbenefits)$"),
    statement_date: str = Query(pattern=r"^\d{4}(-\d{2})?$"),
) -> ParseResult:
    """Parse an uploaded file (dry run). Returns structured data. No DB writes."""
    file_bytes = await file.read()
    file_hash = hashlib.sha256(file_bytes).hexdigest()

    parser = get_parser(brokerage, file.filename or "unknown")
    result = parser.parse(file_bytes, file.filename or "unknown")

    result.brokerage = brokerage
    result.statement_date = statement_date

    # Attach file hash so the client can send it with the Convex commit
    # (stored in raw_text_preview suffix for transport — not ideal but simple)
    result.warnings = [f"file_hash:{file_hash}"] + result.warnings

    return result
