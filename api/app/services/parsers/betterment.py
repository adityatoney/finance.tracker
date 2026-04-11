"""Betterment monthly statement parser (PDF).

Parses per-account "Monthly Overview" sections. Tracks accounts as AGGREGATE
only (no individual ETF holdings). Only the "General Investing" account is
parsed; "Taxable Investing" is skipped.

Deposits track only YOUR contributions (not employer contributions — that
rule applies to NetBenefits, but the regex is kept here as a safety net).
"""

import re
from app.schemas import ParseResult, AccountParsed, DepositParsed, HoldingParsed, ConfidenceScores
from app.services.parsers.base import BaseParser, PDFParserMixin
from app.services.pii_detector import mask_account_number


class BettermentPDFParser(PDFParserMixin, BaseParser):
    brokerage = "betterment"

    table_settings = {
        "vertical_strategy": "text",
        "horizontal_strategy": "text",
    }

    # ── Account section detection ──
    # Matches lines like:
    #   "Taxable Investing Account Account #268011234144636"
    #   "General Investing - Automated Investing Account #8400125820211"
    # The account type is everything on the same line before "Account #"
    RE_ACCOUNT_SECTION = re.compile(
        r"^(.+?)\s+Account\s*#\s*(\d+)\s*$",
        re.IGNORECASE | re.MULTILINE,
    )

    # ── Monthly Overview fields ──
    RE_BEGINNING_BALANCE = re.compile(
        r"Beginning\s+Balance\s*\(([^)]+)\)\s+\$?([\d,]+\.\d{2})",
        re.IGNORECASE,
    )
    RE_ENDING_BALANCE = re.compile(
        r"Ending\s+Balance\s*\(([^)]+)\)\s+\$?([\d,]+\.\d{2})",
        re.IGNORECASE,
    )
    RE_DEPOSITS = re.compile(
        r"Deposits\s+\$?([\d,]+\.\d{2})",
        re.IGNORECASE,
    )
    RE_YOUR_CONTRIBUTIONS = re.compile(
        r"Your\s+Contributions?\s+\$?([\d,]+\.\d{2})",
        re.IGNORECASE,
    )
    RE_EMPLOYER_CONTRIBUTIONS = re.compile(
        r"Employer\s+Contributions?\s+\$?([\d,]+\.\d{2})",
        re.IGNORECASE,
    )
    RE_EARNINGS = re.compile(
        r"Earnings\s+\$?([\d,]+\.\d{2})",
        re.IGNORECASE,
    )
    RE_ADVISORY_FEES = re.compile(
        r"Advisory\s+Fees?\s+-?\$?([\d,]+\.\d{2})",
        re.IGNORECASE,
    )
    RE_WITHDRAWALS = re.compile(
        r"Withdrawals?\d?\s+\$?([\d,]+\.\d{2})",
        re.IGNORECASE,
    )

    # ── Page 1 metadata ──
    RE_OWNER = re.compile(
        r"ACCOUNT\s+HOLDER\s+([A-Z][a-z]+\s+[A-Z][a-z]+)",
        re.IGNORECASE,
    )

    # Account types to SKIP
    _SKIP_PATTERNS = ["taxable"]

    def _parse_extracted(self, raw_text: str, raw_tables: list[list[list[str]]]) -> ParseResult:
        warnings: list[str] = []

        # Owner name from page 1
        m = self.RE_OWNER.search(raw_text)
        owner_name = m.group(1).strip() if m else ""

        # Find all account sections
        sections = self._split_into_account_sections(raw_text)
        if not sections:
            warnings.append("Could not find any account sections in the PDF")
            return ParseResult(warnings=warnings)

        accounts: list[AccountParsed] = []
        all_deposits: list[DepositParsed] = []

        for acct_type, acct_number, section_text in sections:
            # Skip non-General Investing accounts
            if any(skip in acct_type.lower() for skip in self._SKIP_PATTERNS):
                continue

            acct, deposits, section_warnings = self._parse_account_section(
                acct_type, acct_number, section_text, owner_name,
            )
            accounts.append(acct)
            all_deposits.extend(deposits)
            warnings.extend(section_warnings)

        if not accounts:
            warnings.append("No General Investing accounts found (Taxable accounts were skipped)")

        return ParseResult(
            accounts=accounts,
            deposits=all_deposits,
            warnings=warnings,
        )

    def _split_into_account_sections(self, raw_text: str) -> list[tuple[str, str, str]]:
        """Split PDF text into per-account chunks.

        Returns: [(account_type, account_number, section_text), ...]
        """
        matches = list(self.RE_ACCOUNT_SECTION.finditer(raw_text))
        if not matches:
            return []

        sections = []
        for i, m in enumerate(matches):
            acct_type = m.group(1).strip()
            acct_number = m.group(2).strip()
            start = m.start()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(raw_text)
            sections.append((acct_type, acct_number, raw_text[start:end]))

        return sections

    def _parse_account_section(
        self,
        acct_type: str,
        acct_number: str,
        section_text: str,
        owner_name: str,
    ) -> tuple[AccountParsed, list[DepositParsed], list[str]]:
        """Parse a single account's Monthly Overview. No individual holdings."""
        warnings: list[str] = []

        # Beginning Balance
        m = self.RE_BEGINNING_BALANCE.search(section_text)
        beginning_balance = self._parse_dollar(m.group(2)) if m else 0.0
        if not m:
            warnings.append(f"[{acct_type}] Could not detect beginning balance")

        # Ending Balance
        m = self.RE_ENDING_BALANCE.search(section_text)
        ending_balance = self._parse_dollar(m.group(2)) if m else 0.0
        if not m:
            warnings.append(f"[{acct_type}] Could not detect ending balance")

        # Deposits — YOUR contributions only
        your_deposits = 0.0
        m = self.RE_YOUR_CONTRIBUTIONS.search(section_text)
        if m:
            your_deposits = self._parse_dollar(m.group(1))
        else:
            m = self.RE_DEPOSITS.search(section_text)
            if m:
                your_deposits = self._parse_dollar(m.group(1))

        # Employer contributions (tracked but NOT included in deposits)
        employer_deposits = 0.0
        m = self.RE_EMPLOYER_CONTRIBUTIONS.search(section_text)
        if m:
            employer_deposits = self._parse_dollar(m.group(1))

        # Earnings (market gain)
        m = self.RE_EARNINGS.search(section_text)
        earnings = self._parse_dollar(m.group(1)) if m else 0.0

        # Advisory Fees
        m = self.RE_ADVISORY_FEES.search(section_text)
        advisory_fees = self._parse_dollar(m.group(1)) if m else 0.0

        # Build account — AGGREGATE only, no individual holdings
        account = AccountParsed(
            account_number=acct_number,
            account_number_masked=mask_account_number(acct_number),
            account_type=acct_type,
            owner_name=owner_name,
            holdings=[],  # Aggregate — no individual ETFs
            total_value=ending_balance,
            beginning_value=beginning_balance if beginning_balance > 0 else None,
            ending_value=ending_balance if ending_balance > 0 else None,
            change_in_investment=earnings,  # Market gain only, NOT deposits
        )

        # Deposits — YOUR contributions only
        deposits: list[DepositParsed] = []
        if your_deposits > 0:
            deposits.append(DepositParsed(amount=your_deposits, description="Your Deposits"))

        # Metadata warnings for Convex commit
        warnings.append(f"your_contributions:{your_deposits:.2f}")
        if employer_deposits > 0:
            warnings.append(f"employer_contributions:{employer_deposits:.2f}")
        warnings.append(f"market_gain:{earnings:.2f}")
        if advisory_fees > 0:
            warnings.append(f"advisory_fees:{advisory_fees:.2f}")

        return account, deposits, warnings

    def _compute_confidence(self, result: ParseResult) -> ConfidenceScores:
        """Betterment has a clean layout — only slight discount."""
        scores = super()._compute_confidence(result)
        scores.total_value *= 0.9
        return scores
