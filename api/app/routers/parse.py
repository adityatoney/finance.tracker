"""Upload, parse (dry run), and commit statement endpoints."""

import hashlib
from fastapi import APIRouter, UploadFile, Query, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import (
    ParseResult,
    CommitRequest,
    CommitResult,
    ConfidenceScores,
)
from app.services.parser_registry import get_parser
from app.services.ticker_mapper import TickerMapper
from app.services.encryption import encrypt_pii
from app.services.pii_detector import detect_pii_in_text
from app.services.snapshot_builder import rebuild_month
from app.models import Statement, Holding, Deposit, TickerMap, PIIAuditLog, generate_uuid, utc_now_iso

router = APIRouter()


@router.post("/api/parse", response_model=ParseResult)
async def parse_statement(
    file: UploadFile,
    brokerage: str = Query(pattern=r"^(fidelity|robinhood|betterment)$"),
    statement_date: str = Query(pattern=r"^\d{4}-\d{2}$"),
    db: Session = Depends(get_db),
) -> ParseResult:
    """Parse an uploaded file (dry run). Returns structured data without writing to DB."""
    file_bytes = await file.read()

    # Compute hash for dedup check
    file_hash = hashlib.sha256(file_bytes).hexdigest()
    existing = db.query(Statement).filter(Statement.file_hash == file_hash).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"This file has already been uploaded (statement {existing.id}, {existing.statement_date})",
        )

    # Get the appropriate parser and parse
    parser = get_parser(brokerage, file.filename or "unknown")
    result = parser.parse(file_bytes, file.filename or "unknown")

    # Map tickers to categories
    mapper = TickerMapper(db)
    unknown_tickers = []
    for account in result.accounts:
        for holding in account.holdings:
            mapping = mapper.get_category(holding.ticker)
            if mapping:
                holding.category = mapping.category
                holding.category_source = mapping.source
            else:
                unknown_tickers.append(holding.ticker)

    result.unknown_tickers = list(set(unknown_tickers))
    result.brokerage = brokerage
    result.statement_date = statement_date

    # Detect PII in raw text
    pii_findings = detect_pii_in_text(result.raw_text_preview)
    if pii_findings:
        result.warnings.append(
            f"PII detected in raw text: {', '.join(pii_findings.keys())}. "
            "These fields will be encrypted on commit."
        )

    # Store file hash in result for commit
    # (client sends it back so we don't re-read the file)

    return result


@router.post("/api/commit", response_model=CommitResult)
async def commit_statement(
    body: CommitRequest,
    db: Session = Depends(get_db),
) -> CommitResult:
    """Encrypt PII and persist parsed statement data to the database."""
    try:
        return _do_commit(body, db)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Commit failed: {e}") from e


def _do_commit(body: CommitRequest, db: Session) -> CommitResult:
    """Inner commit logic — separated so errors become clear HTTP 500s."""

    # Check for duplicate
    if body.file_hash:
        existing = db.query(Statement).filter(Statement.file_hash == body.file_hash).first()
        if existing:
            raise HTTPException(status_code=409, detail="Duplicate file")

    # Apply ticker overrides
    mapper = TickerMapper(db)
    mappings_added = 0
    for override in body.ticker_overrides:
        mapper.upsert(override.ticker, override.category, source="user")
        mappings_added += 1

    # Compute totals across accounts
    total_value = sum(a.total_value for a in body.accounts)
    total_deposits = sum(d.amount for d in body.deposits)

    # Encrypt PII from the first account (primary)
    account_number_raw = body.accounts[0].account_number if body.accounts else ""
    owner_name_raw = body.accounts[0].owner_name if body.accounts else ""

    account_number_enc = encrypt_pii(account_number_raw) if account_number_raw else ""
    owner_name_enc = encrypt_pii(owner_name_raw) if owner_name_raw else ""

    # Create statement
    statement = Statement(
        id=generate_uuid(),
        brokerage=body.brokerage,
        statement_date=body.statement_date,
        file_name=body.file_name or "unknown",
        file_hash=body.file_hash or hashlib.sha256(f"{body.brokerage}{body.statement_date}{utc_now_iso()}".encode()).hexdigest(),
        account_number_enc=account_number_enc,
        owner_name_enc=owner_name_enc,
        total_value=total_value,
        net_deposits=total_deposits,
        uploaded_at=utc_now_iso(),
    )
    db.add(statement)
    db.flush()  # Flush statement first so FK references from audit log / holdings work

    # Log PII encryption
    if account_number_raw:
        db.add(PIIAuditLog(
            statement_id=statement.id,
            field_name="account_number",
            pii_type="account_number",
            action="encrypted",
        ))
    if owner_name_raw:
        db.add(PIIAuditLog(
            statement_id=statement.id,
            field_name="owner_name",
            pii_type="name",
            action="encrypted",
        ))

    # Create holdings — respect tracking_mode per account
    holdings_created = 0
    for account in body.accounts:
        if account.tracking_mode == "aggregate":
            # Store as a single holding representing the whole account
            # Determine the dominant category from the account's holdings
            category_totals: dict[str, float] = {}
            for h in account.holdings:
                cat = h.category or ""
                if not cat:
                    m = mapper.get_category(h.ticker)
                    cat = m.category if m else "uncategorized"
                category_totals[cat] = category_totals.get(cat, 0.0) + h.market_value

            dominant_category = max(category_totals, key=category_totals.get) if category_totals else "uncategorized"  # type: ignore[arg-type]
            acct_label = account.account_type or account.account_number_masked or "Account"

            db.add(Holding(
                id=generate_uuid(),
                statement_id=statement.id,
                ticker=f"ACCT:{account.account_number_masked or account.account_number[-4:]}",
                name=f"{acct_label} (aggregate)",
                quantity=1.0,
                price=account.total_value,
                market_value=account.total_value,
                category=dominant_category,
            ))
            holdings_created += 1
        else:
            # "detailed" mode — store each individual holding
            for h in account.holdings:
                category = h.category or ""
                if not category:
                    m = mapper.get_category(h.ticker)
                    category = m.category if m else "uncategorized"

                db.add(Holding(
                    id=generate_uuid(),
                    statement_id=statement.id,
                    ticker=h.ticker,
                    name=h.name,
                    quantity=h.quantity or 0.0,
                    price=h.price or 0.0,
                    market_value=h.market_value,
                    category=category,
                ))
                holdings_created += 1

    # Create deposits
    deposits_created = 0
    for d in body.deposits:
        db.add(Deposit(
            id=generate_uuid(),
            statement_id=statement.id,
            amount=d.amount,
            description=d.description,
            date=d.date or "",
        ))
        deposits_created += 1

    db.flush()

    # Rebuild snapshots for the affected month
    snapshots_rebuilt = rebuild_month(db, body.statement_date)

    return CommitResult(
        statement_id=statement.id,
        holdings_created=holdings_created,
        deposits_created=deposits_created,
        ticker_mappings_added=mappings_added,
        snapshots_rebuilt=snapshots_rebuilt,
    )


@router.delete("/api/statements/{statement_id}")
async def delete_statement(
    statement_id: str,
    db: Session = Depends(get_db),
) -> dict:
    """Delete a statement and all its holdings, deposits, and audit logs. Rebuilds snapshots."""
    stmt = db.query(Statement).filter(Statement.id == statement_id).first()
    if not stmt:
        raise HTTPException(status_code=404, detail="Statement not found")

    month = stmt.statement_date

    # Cascade deletes are handled by SQLAlchemy relationship config
    db.query(Holding).filter(Holding.statement_id == statement_id).delete()
    db.query(Deposit).filter(Deposit.statement_id == statement_id).delete()
    db.query(PIIAuditLog).filter(PIIAuditLog.statement_id == statement_id).delete()
    db.delete(stmt)
    db.flush()

    # Rebuild snapshots for the affected month
    rebuild_month(db, month)

    return {"deleted": statement_id, "month_rebuilt": month}
