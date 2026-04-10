"""Robinhood statement parsers (PDF and CSV).

PDF parser auto-detects two statement types:
  1. Crypto Statement — labeled fields, no individual holdings (aggregate)
  2. Stock Portfolio — account summary + securities table with per-holding detail
"""

import re
from app.schemas import ParseResult, AccountParsed, DepositParsed, HoldingParsed
from app.services.parsers.base import BaseParser, PDFParserMixin, CSVParserMixin
from app.services.pii_detector import mask_account_number


class RobinhoodPDFParser(PDFParserMixin, BaseParser):
    brokerage = "robinhood"

    table_settings = {
        "vertical_strategy": "text",
        "horizontal_strategy": "text",
    }

    # ── Shared patterns (labeled fields at top of both statement types) ──

    # Labeled fields: "ACCOUNT NUMBER  311044540821"
    RE_NAME = re.compile(r"NAME\s+(.+)", re.IGNORECASE)
    RE_ACCOUNT_NUM = re.compile(r"ACCOUNT\s+NUMBER\s+([\d]+)", re.IGNORECASE)
    RE_PERIOD_START = re.compile(r"PERIOD\s+START\s+(\d{4}-\d{2}-\d{2})", re.IGNORECASE)
    RE_PERIOD_END = re.compile(r"PERIOD\s+END\s+(\d{4}-\d{2}-\d{2})", re.IGNORECASE)
    RE_OPENING = re.compile(r"OPENING\s+BALANCE\s+\$?([\d,.]+)", re.IGNORECASE)
    RE_CLOSING = re.compile(r"CLOSING\s+BALANCE\s+\$?([\d,.]+)", re.IGNORECASE)

    # ── Stock-specific patterns ──

    # Account Summary section: "Portfolio Value  $15,105.44  $14,187.01"
    RE_PORTFOLIO_VALUE = re.compile(
        r"Portfolio\s+Value\s+\$?([\d,]+\.\d{2})\s+\$?([\d,]+\.\d{2})",
        re.IGNORECASE,
    )
    # Total Priced Portfolio  $14,187.01
    RE_TOTAL_PRICED = re.compile(
        r"Total\s+Priced\s+Portfolio\s+\$?([\d,]+\.\d{2})",
        re.IGNORECASE,
    )
    # Brokerage Cash Balance  $45.63
    RE_CASH_BALANCE = re.compile(
        r"Brokerage\s+Cash\s+Balance\s+\$?([\d,]+\.\d{2})",
        re.IGNORECASE,
    )

    def _parse_extracted(self, raw_text: str, raw_tables: list[list[list[str]]]) -> ParseResult:
        # Auto-detect statement type
        is_crypto = bool(re.search(r"Crypto\s+Statement", raw_text, re.IGNORECASE))

        if is_crypto:
            return self._parse_crypto(raw_text)
        else:
            return self._parse_stock(raw_text, raw_tables)

    # ── Crypto Statement ─────────────────────────────────────────────────

    def _parse_crypto(self, raw_text: str) -> ParseResult:
        warnings: list[str] = []

        # Extract labeled fields
        m = self.RE_NAME.search(raw_text)
        owner_name = m.group(1).strip() if m else ""

        m = self.RE_ACCOUNT_NUM.search(raw_text)
        account_number = m.group(1).strip() if m else ""
        if not account_number:
            warnings.append("Could not detect account number")

        m = self.RE_OPENING.search(raw_text)
        opening = self._parse_dollar(m.group(1)) if m else 0.0
        if not m:
            warnings.append("Could not detect opening balance")

        m = self.RE_CLOSING.search(raw_text)
        closing = self._parse_dollar(m.group(1)) if m else 0.0
        if not m:
            warnings.append("Could not detect closing balance")

        change = closing - opening

        account = AccountParsed(
            account_number=account_number,
            account_number_masked=mask_account_number(account_number),
            account_type="Crypto",
            owner_name=owner_name,
            holdings=[],  # No individual holdings — UI will force aggregate
            total_value=closing,
            beginning_value=opening,
            ending_value=closing,
            change_in_investment=change,
        )

        return ParseResult(
            accounts=[account],
            deposits=[],
            warnings=warnings,
        )

    # ── Stock Portfolio Statement ─────────────────────────────────────────

    def _parse_stock(self, raw_text: str, raw_tables: list[list[list[str]]]) -> ParseResult:
        warnings: list[str] = []

        # Account number
        m = self.RE_ACCOUNT_NUM.search(raw_text)
        account_number = m.group(1).strip() if m else ""
        if not account_number:
            warnings.append("Could not detect account number")

        # Owner name
        m = self.RE_NAME.search(raw_text)
        owner_name = m.group(1).strip() if m else ""

        # Account-level opening/closing from "Portfolio Value" row
        opening = 0.0
        closing = 0.0
        m = self.RE_PORTFOLIO_VALUE.search(raw_text)
        if m:
            opening = self._parse_dollar(m.group(1))
            closing = self._parse_dollar(m.group(2))
        else:
            # Fallback: try Total Priced Portfolio for closing only
            m = self.RE_TOTAL_PRICED.search(raw_text)
            if m:
                closing = self._parse_dollar(m.group(1))
            warnings.append("Could not detect full account summary (opening/closing)")

        change = closing - opening if opening > 0 else None

        # Parse holdings from tables
        holdings = self._extract_securities_table(raw_tables)
        if not holdings:
            # Fallback: regex-based extraction from text
            holdings = self._extract_securities_text(raw_text)

        if not holdings:
            warnings.append("Could not extract individual holdings")

        # Cash balance
        m = self.RE_CASH_BALANCE.search(raw_text)
        if m:
            cash_val = self._parse_dollar(m.group(1))
            if cash_val > 0:
                holdings.append(HoldingParsed(
                    ticker="CASH:RH",
                    name="Brokerage Cash Balance",
                    quantity=1,
                    price=cash_val,
                    market_value=cash_val,
                ))

        # Use closing balance as total, or sum holdings as fallback
        total_value = closing if closing > 0 else sum(h.market_value for h in holdings)

        account = AccountParsed(
            account_number=account_number,
            account_number_masked=mask_account_number(account_number),
            account_type="Brokerage",
            owner_name=owner_name,
            holdings=holdings,
            total_value=total_value,
            beginning_value=opening if opening > 0 else None,
            ending_value=closing if closing > 0 else None,
            change_in_investment=change,
        )

        return ParseResult(
            accounts=[account],
            deposits=[],
            warnings=warnings,
        )

    def _extract_securities_table(self, tables: list[list[list[str]]]) -> list[HoldingParsed]:
        """Extract holdings from the 'Securities Held in Account' table."""
        holdings: list[HoldingParsed] = []

        for table in tables:
            if len(table) < 2:
                continue

            header = [cell.strip().lower() for cell in table[0]]

            # Find the securities table by checking for key columns
            sym_col = self._find_col(header, ["sym/cusip", "sym", "cusip", "symbol", "ticker"])
            val_col = self._find_col(header, ["mkt value", "market value", "value"])
            qty_col = self._find_col(header, ["qty", "quantity", "shares"])
            price_col = self._find_col(header, ["price", "last price"])

            if sym_col is None or val_col is None:
                continue

            for row in table[1:]:
                if len(row) <= max(sym_col, val_col):
                    continue

                ticker = self._normalize_ticker(row[sym_col])
                if not ticker or not re.match(r"^[A-Z]{1,5}$", ticker):
                    continue

                market_value = self._parse_dollar(row[val_col])
                if market_value <= 0:
                    continue

                quantity = self._parse_dollar(row[qty_col]) if qty_col is not None and qty_col < len(row) else None
                price = self._parse_dollar(row[price_col]) if price_col is not None and price_col < len(row) else None

                # Extract name from the first column (usually "Securities Held in Account")
                name_col = self._find_col(header, ["securities held", "name", "description"])
                name = row[name_col].strip().split("\n")[0] if name_col is not None and name_col < len(row) else ""

                holdings.append(HoldingParsed(
                    ticker=ticker,
                    name=name,
                    quantity=quantity if quantity and quantity > 0 else None,
                    price=price if price and price > 0 else None,
                    market_value=market_value,
                ))

            if holdings:
                break  # Found the securities table

        return holdings

    def _extract_securities_text(self, raw_text: str) -> list[HoldingParsed]:
        """Fallback: extract holdings via regex from raw text.

        Looks for lines like:
          Apple                    AAPL     Margin    7.869987   $253.79000   $1,997.32
        """
        holdings: list[HoldingParsed] = []
        # Match: Name ... TICKER ... Qty ... $Price ... $MktValue
        pattern = re.compile(
            r"([A-Z]{1,5})\s+(?:Margin|Cash)\s+([\d,.]+)\s+\$?([\d,.]+)\s+\$?([\d,.]+)",
        )
        for m in pattern.finditer(raw_text):
            ticker = self._normalize_ticker(m.group(1))
            quantity = self._parse_dollar(m.group(2))
            price = self._parse_dollar(m.group(3))
            market_value = self._parse_dollar(m.group(4))
            if market_value > 0:
                holdings.append(HoldingParsed(
                    ticker=ticker,
                    quantity=quantity if quantity > 0 else None,
                    price=price if price > 0 else None,
                    market_value=market_value,
                ))
        return holdings


class RobinhoodCSVParser(CSVParserMixin, BaseParser):
    brokerage = "robinhood"

    def _parse_extracted(self, raw_text: str, raw_tables: list[list[list[str]]]) -> ParseResult:
        warnings = []

        if not raw_tables or not raw_tables[0] or len(raw_tables[0]) < 2:
            return ParseResult(warnings=["Empty CSV file"])

        table = raw_tables[0]
        header = [h.strip() for h in table[0]]
        rows = table[1:]

        col_map = {h: i for i, h in enumerate(header)}

        holdings = []
        total = 0.0

        for row in rows:
            def get_col(name: str) -> str:
                idx = col_map.get(name)
                if idx is not None and idx < len(row):
                    return row[idx].strip()
                return ""

            # Robinhood CSV column names
            ticker = self._normalize_ticker(
                get_col("Instrument") or get_col("Symbol") or get_col("Ticker")
            )
            if not ticker:
                continue

            value = self._parse_dollar(
                get_col("Market Value") or get_col("Equity") or get_col("Current Value")
            )
            quantity = self._parse_dollar(
                get_col("Quantity") or get_col("Shares")
            )
            price = self._parse_dollar(
                get_col("Average Cost") or get_col("Last Price") or get_col("Price")
            )

            if value > 0 or quantity > 0:
                holdings.append(HoldingParsed(
                    ticker=ticker,
                    name=get_col("Name") or get_col("Description") or "",
                    quantity=quantity or None,
                    price=price or None,
                    market_value=value if value > 0 else (quantity * price if quantity and price else 0.0),
                ))
                total += holdings[-1].market_value

        account = AccountParsed(
            holdings=holdings,
            total_value=total,
        )

        if not holdings:
            warnings.append("No holdings found in CSV")
        warnings.append("CSV export does not contain contributions data")

        return ParseResult(
            accounts=[account],
            warnings=warnings,
        )
