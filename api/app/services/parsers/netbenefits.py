"""Fidelity NetBenefits 401(k) statement parser (PDF only).

Extracts the "Your Account Summary" section from a Retirement Savings Statement:
- Beginning Balance, Ending Balance
- Your Contributions, Employer Contributions
- Change on Market Value
- Plan name, owner name, statement period
"""

import re
from app.schemas import ParseResult, AccountParsed, DepositParsed
from app.services.parsers.base import BaseParser, PDFParserMixin
from app.services.pii_detector import mask_account_number


class NetBenefitsPDFParser(PDFParserMixin, BaseParser):
    brokerage = "netbenefits"

    table_settings = {
        "vertical_strategy": "text",
        "horizontal_strategy": "text",
    }

    # ── Regex patterns ──────────────────────────────────────────────────────

    # Statement Period: 01/01/2026 to 01/31/2026  (handles varied whitespace/line breaks)
    RE_PERIOD = re.compile(
        r"Statement\s+Period\s*:?\s*(\d{2}/\d{2}/\d{4})\s+to\s+(\d{2}/\d{2}/\d{4})",
        re.IGNORECASE,
    )
    # Fallback: just find any two MM/DD/YYYY dates near each other
    RE_DATE_PAIR = re.compile(
        r"(\d{2}/\d{2}/\d{4})\s+to\s+(\d{2}/\d{2}/\d{4})",
        re.IGNORECASE,
    )

    # Dollar amounts — handles "$505,847.79" and negative "-$1,234.56"
    RE_BEGINNING = re.compile(
        r"Beginning\s+Balance\s+\$?([\d,]+\.\d{2})", re.IGNORECASE
    )
    RE_ENDING = re.compile(
        r"Ending\s+Balance\s+\$?([\d,]+\.\d{2})", re.IGNORECASE
    )
    RE_YOUR_CONTRIB = re.compile(
        r"Your\s+Contributions?\s+\$?([\d,]+\.\d{2})", re.IGNORECASE
    )
    RE_EMPLOYER_CONTRIB = re.compile(
        r"Employer\s+Contributions?\s+\$?([\d,]+\.\d{2})", re.IGNORECASE
    )
    RE_MARKET_CHANGE = re.compile(
        r"Change\s+(?:on|in)\s+Market\s+Value\s+-?\$?([\d,]+\.\d{2})", re.IGNORECASE
    )

    # Owner name — all-caps line like "ADITYA H TONEY"
    RE_OWNER = re.compile(r"\n([A-Z]{2,}(?:\s+[A-Z]{1,2})?\s+[A-Z]{2,})\n")

    # Plan name — e.g. "Microsoft Corporation Savings Plus 401(k) Plan"
    RE_PLAN = re.compile(r"(.+?(?:401\s*\(k\)|403\s*\(b\)|457|Pension)\s*Plan)", re.IGNORECASE)

    # Vested Balance
    RE_VESTED = re.compile(
        r"Vested\s+Balance\s+\$?([\d,]+\.\d{2})", re.IGNORECASE
    )

    def _parse_extracted(self, raw_text: str, raw_tables: list[list[list[str]]]) -> ParseResult:
        warnings: list[str] = []

        # ── Statement period ──
        m = self.RE_PERIOD.search(raw_text)
        if not m:
            m = self.RE_DATE_PAIR.search(raw_text)  # fallback
        period_start = ""
        period_end = ""
        if m:
            period_start = m.group(1)  # MM/DD/YYYY
            period_end = m.group(2)    # MM/DD/YYYY
        else:
            warnings.append("Could not detect statement period dates")

        # ── Detect annual vs monthly ──
        # Annual statements span a full year (e.g., 01/01/2024 to 12/31/2024)
        is_annual = False
        if period_start and period_end:
            try:
                from datetime import datetime
                start_dt = datetime.strptime(period_start, "%m/%d/%Y")
                end_dt = datetime.strptime(period_end, "%m/%d/%Y")
                days = (end_dt - start_dt).days
                # Annual if: spans 360+ days OR ends on Dec 31 (partial first year)
                is_annual = days >= 360 or (end_dt.month == 12 and end_dt.day == 31 and days >= 180)
            except ValueError:
                pass

        # Always include period info for frontend
        if period_start:
            warnings.append(f"period_start:{period_start}")
        if period_end:
            warnings.append(f"period_end:{period_end}")
        warnings.append(f"period_days:{(end_dt - start_dt).days if period_start and period_end else 'unknown'}")

        if is_annual:
            warnings.append("annual_statement:true")

        # ── Balances ──
        m = self.RE_BEGINNING.search(raw_text)
        beginning_balance = self._parse_dollar(m.group(1)) if m else 0.0
        if not m:
            warnings.append("Could not detect beginning balance")

        m = self.RE_ENDING.search(raw_text)
        ending_balance = self._parse_dollar(m.group(1)) if m else 0.0
        if not m:
            warnings.append("Could not detect ending balance")

        # ── Contributions ──
        m = self.RE_YOUR_CONTRIB.search(raw_text)
        your_contrib = self._parse_dollar(m.group(1)) if m else 0.0

        m = self.RE_EMPLOYER_CONTRIB.search(raw_text)
        employer_contrib = self._parse_dollar(m.group(1)) if m else 0.0

        total_contrib = your_contrib + employer_contrib

        # ── Market change ──
        m = self.RE_MARKET_CHANGE.search(raw_text)
        market_change = self._parse_dollar(m.group(0).split("$")[-1]) if m else None
        # Handle negative: check if there's a minus sign before the dollar
        if m and "-" in m.group(0).split("$")[0]:
            market_change = -(market_change or 0.0)

        # ── Owner name ──
        m = self.RE_OWNER.search(raw_text)
        owner_name = m.group(1).strip().title() if m else ""

        # ── Vested balance ──
        m = self.RE_VESTED.search(raw_text)
        vested_balance = self._parse_dollar(m.group(1)) if m else None
        if is_annual and vested_balance is not None:
            warnings.append(f"vested_balance:{vested_balance}")

        # ── Plan name / account type ──
        m = self.RE_PLAN.search(raw_text)
        plan_name = m.group(1).strip() if m else "401(k)"
        if is_annual:
            warnings.append(f"plan_name:{plan_name}")
            warnings.append(f"your_contributions:{your_contrib}")
            warnings.append(f"employer_contributions:{employer_contrib}")
            warnings.append(f"market_gain:{market_change or 0.0}")

        # ── Build account ──
        # NetBenefits doesn't list individual holdings — it's always aggregate
        account = AccountParsed(
            account_number="",
            account_number_masked="",
            account_type=plan_name,
            owner_name=owner_name,
            holdings=[],  # No individual holdings — will use aggregate tracking
            total_value=ending_balance,
            beginning_value=beginning_balance,
            ending_value=ending_balance,
            change_in_investment=market_change,
            tracking_mode="detailed",  # Let user choose in UI
        )

        # ── Deposits — YOUR contributions ONLY ──
        # Employer contributions are tracked in warnings metadata but NOT as deposits.
        # This ensures netDeposits on the statement and snapshots reflect only your money.
        deposits: list[DepositParsed] = []
        if your_contrib > 0:
            deposits.append(DepositParsed(amount=your_contrib, description="Your Contributions"))
        # Employer contributions intentionally excluded from deposits list.
        # They're recorded in warnings as "employer_contributions:XXXX" for reference.

        return ParseResult(
            accounts=[account],
            deposits=deposits,
            warnings=warnings,
        )
