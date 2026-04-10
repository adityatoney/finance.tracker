"""Betterment statement parser (PDF only — complex multi-column layout)."""

import re
from app.schemas import ParseResult, AccountParsed, DepositParsed, HoldingParsed, ConfidenceScores
from app.services.parsers.base import BaseParser, PDFParserMixin
from app.services.pii_detector import mask_account_number


class BettermentPDFParser(PDFParserMixin, BaseParser):
    brokerage = "betterment"

    # Betterment needs aggressive table detection for complex layouts
    table_settings = {
        "vertical_strategy": "lines_strict",
        "horizontal_strategy": "lines_strict",
        "snap_tolerance": 5,
    }

    RE_ACCOUNT = re.compile(r"Account\s*[:\-]?\s*([\w\-*]+\d{4})", re.IGNORECASE)
    RE_DATE = re.compile(
        r"(?:as\s+of|Statement\s+Date)\s*[:\-]?\s*(\w+ \d{1,2},? \d{4})",
        re.IGNORECASE,
    )
    RE_TOTAL_VALUE = re.compile(
        r"(?:Total\s+Balance|Portfolio\s+Value|Total\s+Value)\s*\$?([\d,]+\.\d{2})",
        re.IGNORECASE,
    )
    RE_CONTRIBUTIONS = re.compile(
        r"(?:Net\s+Deposits?|Contributions?)\s*\$?([\d,]+\.\d{2})",
        re.IGNORECASE,
    )
    RE_MARKET_GAIN = re.compile(
        r"(?:Market\s+(?:Gains?|Returns?|Change)|Earnings?)\s*[:\-]?\s*\$?([\d,]+\.\d{2})",
        re.IGNORECASE,
    )
    RE_OWNER = re.compile(r"(?:Account\s+(?:Owner|Holder)|Name)\s*[:\-]?\s*([A-Z][a-z]+ [A-Z][a-z]+)")

    # Betterment goal sections: "Safety Net", "General Investing", etc.
    RE_GOAL_SECTION = re.compile(
        r"(Safety Net|General Investing|Retirement|[\w\s]+Goal)\s*\n.*?Balance\s*\$?([\d,]+\.\d{2})",
        re.DOTALL | re.IGNORECASE,
    )

    # ETF allocations within goals
    RE_ETF_ALLOCATION = re.compile(
        r"([A-Z]{2,5})\s+(.+?)\s+([\d.]+)%\s+\$?([\d,]+\.\d{2})",
    )

    def _parse_extracted(self, raw_text: str, raw_tables: list[list[list[str]]]) -> ParseResult:
        warnings = []

        # Account number
        m = self.RE_ACCOUNT.search(raw_text)
        account_number = m.group(1) if m else ""
        if not m:
            warnings.append("Could not detect account number")

        # Total value
        m = self.RE_TOTAL_VALUE.search(raw_text)
        total_value = self._parse_dollar(m.group(1)) if m else 0.0
        if not m:
            warnings.append("Could not detect total balance")

        # Contributions — Betterment usually provides this explicitly
        m = self.RE_CONTRIBUTIONS.search(raw_text)
        contributions = self._parse_dollar(m.group(1)) if m else 0.0
        if not m:
            warnings.append("Could not detect contributions/deposits")

        # Market gain — Betterment usually provides this explicitly too
        m = self.RE_MARKET_GAIN.search(raw_text)
        market_gain = self._parse_dollar(m.group(1)) if m else None
        if not m:
            warnings.append("Could not detect market gain/returns")

        # Owner
        m = self.RE_OWNER.search(raw_text)
        owner_name = m.group(1) if m else ""

        # Holdings: try ETF allocations first, then tables
        holdings = self._extract_etf_allocations(raw_text)
        if not holdings:
            holdings = self._extract_from_tables(raw_tables)
        if not holdings:
            warnings.append("Could not extract individual holdings/allocations")

        account = AccountParsed(
            account_number=account_number,
            account_number_masked=mask_account_number(account_number),
            owner_name=owner_name,
            holdings=holdings,
            total_value=total_value,
        )

        deposits = []
        if contributions > 0:
            deposits.append(DepositParsed(amount=contributions, description="Net Deposits"))
        if market_gain is not None and market_gain > 0:
            # Store market gain as a special deposit entry with negative amount (info only)
            deposits.append(DepositParsed(
                amount=0,
                description=f"Market Returns: ${market_gain:,.2f}",
            ))

        return ParseResult(
            accounts=[account],
            deposits=deposits,
            warnings=warnings,
        )

    def _extract_etf_allocations(self, raw_text: str) -> list[HoldingParsed]:
        """Extract ETF allocations from Betterment's goal-based layout."""
        holdings = []
        for m in self.RE_ETF_ALLOCATION.finditer(raw_text):
            holdings.append(HoldingParsed(
                ticker=self._normalize_ticker(m.group(1)),
                name=m.group(2).strip(),
                market_value=self._parse_dollar(m.group(4)),
            ))
        return holdings

    def _extract_from_tables(self, tables: list[list[list[str]]]) -> list[HoldingParsed]:
        """Fallback: extract from pdfplumber tables."""
        holdings = []
        for table in tables:
            if len(table) < 2:
                continue
            header = [cell.lower().strip() for cell in table[0]]

            # Look for ticker/fund and value columns
            ticker_idx = None
            value_idx = None
            for i, h in enumerate(header):
                if any(kw in h for kw in ["ticker", "symbol", "fund", "etf"]):
                    ticker_idx = i
                if any(kw in h for kw in ["value", "balance", "amount"]):
                    value_idx = i

            if ticker_idx is not None and value_idx is not None:
                for row in table[1:]:
                    if len(row) <= max(ticker_idx, value_idx):
                        continue
                    ticker = self._normalize_ticker(row[ticker_idx])
                    if ticker and re.match(r"^[A-Z]{2,5}$", ticker):
                        holdings.append(HoldingParsed(
                            ticker=ticker,
                            market_value=self._parse_dollar(row[value_idx]),
                        ))
        return holdings

    def _compute_confidence(self, result: ParseResult) -> ConfidenceScores:
        """Override: Betterment parsing is inherently less reliable — discount 15%."""
        scores = super()._compute_confidence(result)
        scores.total_value *= 0.85
        scores.account_number *= 0.85
        scores.holdings *= 0.85
        scores.deposits *= 0.85
        scores.owner_name *= 0.85
        return scores
