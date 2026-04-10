"""Fidelity statement parsers (PDF and CSV)."""

import re
from app.schemas import ParseResult, AccountParsed, DepositParsed, HoldingParsed
from app.services.parsers.base import BaseParser, PDFParserMixin, CSVParserMixin
from app.services.pii_detector import mask_account_number


class FidelityPDFParser(PDFParserMixin, BaseParser):
    brokerage = "fidelity"

    table_settings = {
        "vertical_strategy": "text",
        "horizontal_strategy": "text",
    }

    RE_ACCOUNT = re.compile(r"Account\s*#?\s*[:\-]?\s*([\w\-*]+\d{4})", re.IGNORECASE)
    RE_DATE = re.compile(
        r"(?:Statement\s+(?:Period|Date)|as\s+of)\s*[:\-]?\s*(\w+\s+\d{1,2},?\s+\d{4})",
        re.IGNORECASE,
    )
    RE_TOTAL_VALUE = re.compile(
        r"(?:Total\s+(?:Account\s+)?Value|Ending\s+(?:Account\s+)?Value)\s*\$?([\d,]+\.\d{2})",
        re.IGNORECASE,
    )
    RE_CONTRIBUTIONS = re.compile(
        r"(?:Contributions?|Deposits?|Money\s+In)\s*\$?([\d,]+\.\d{2})",
        re.IGNORECASE,
    )
    RE_OWNER = re.compile(r"(?:Account\s+Owner|Name)\s*[:\-]?\s*([A-Z][a-z]+ [A-Z][a-z]+)")

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
            warnings.append("Could not detect total account value")

        # Contributions
        m = self.RE_CONTRIBUTIONS.search(raw_text)
        contributions = self._parse_dollar(m.group(1)) if m else 0.0
        if not m:
            warnings.append("Could not detect contributions/deposits")

        # Owner name
        m = self.RE_OWNER.search(raw_text)
        owner_name = m.group(1) if m else ""

        # Holdings: try tables first, then regex fallback
        holdings = self._extract_holdings_from_tables(raw_tables)
        if not holdings:
            holdings = self._extract_holdings_from_text(raw_text)
            if not holdings:
                warnings.append("Could not extract individual holdings")

        account = AccountParsed(
            account_number=account_number,
            account_number_masked=mask_account_number(account_number),
            owner_name=owner_name,
            holdings=holdings,
            total_value=total_value,
        )

        deposits = []
        if contributions > 0:
            deposits.append(DepositParsed(amount=contributions, description="Contributions"))

        return ParseResult(
            accounts=[account],
            deposits=deposits,
            warnings=warnings,
        )

    def _extract_holdings_from_tables(self, tables: list[list[list[str]]]) -> list[HoldingParsed]:
        """Extract holdings from pdfplumber table data."""
        holdings = []
        for table in tables:
            if len(table) < 2:
                continue
            header = [cell.lower().strip() for cell in table[0]]
            sym_idx = self._find_col(header, ["symbol", "ticker"])
            name_idx = self._find_col(header, ["description", "name", "security"])
            qty_idx = self._find_col(header, ["quantity", "shares", "qty"])
            val_idx = self._find_col(header, ["value", "market value", "current value"])

            if sym_idx is not None and val_idx is not None:
                for row in table[1:]:
                    if len(row) <= max(i for i in [sym_idx, name_idx, qty_idx, val_idx] if i is not None):
                        continue
                    ticker = self._normalize_ticker(row[sym_idx])
                    if not ticker or not re.match(r"^[A-Z.]{1,6}$", ticker):
                        continue
                    holdings.append(HoldingParsed(
                        ticker=ticker,
                        name=row[name_idx].strip() if name_idx is not None else "",
                        quantity=self._parse_dollar(row[qty_idx]) if qty_idx is not None else None,
                        market_value=self._parse_dollar(row[val_idx]),
                    ))
        return holdings

    def _extract_holdings_from_text(self, raw_text: str) -> list[HoldingParsed]:
        """Fallback: regex-based extraction."""
        pattern = re.compile(
            r"([A-Z]{1,5})\s+(.+?)\s+([\d,.]+)\s+\$?([\d,]+\.\d{2})"
        )
        holdings = []
        for m in pattern.finditer(raw_text):
            holdings.append(HoldingParsed(
                ticker=self._normalize_ticker(m.group(1)),
                name=m.group(2).strip(),
                quantity=self._parse_dollar(m.group(3)),
                market_value=self._parse_dollar(m.group(4)),
            ))
        return holdings

class FidelityCSVParser(BaseParser):
    """Parser for Fidelity monthly statement CSVs.

    Fidelity statements have a two-section hierarchical format:

    SECTION 1 — Account Summary
      Header: Account Type, Account, Beginning mkt Value, Change in Investment, Ending mkt Value
      One row per account.

    SECTION 2 — Holdings Detail
      Header: Symbol/CUSIP, Description, Quantity, Price, Beginning Value, Ending Value, Cost Basis
      Hierarchical: account numbers appear as standalone rows, followed by
      asset class headers ("Stocks", "Mutual Funds", "Core Account"), then
      holding rows, then "Subtotal of ..." rows.

    This parser bypasses pandas entirely (raw csv.reader) to avoid column-count
    errors between the two sections.
    """

    brokerage = "fidelity"

    # Asset class header rows to skip in Section 2
    _ASSET_CLASS_HEADERS = {
        "stocks", "mutual funds", "core account", "etfs", "bonds",
        "options", "other", "short-term investments", "cash",
        "exchange traded funds", "fixed income",
    }

    # Junk tickers / subtotal patterns to skip
    _SKIP_TICKERS = {
        "", "NAN", "CASH", "PENDING ACTIVITY", "FCASH", "TOTAL", "ACCOUNT TOTAL",
    }

    def _extract_raw(self, file_bytes: bytes, file_name: str) -> tuple[str, list[list[list[str]]]]:
        """Bypass pandas — parse raw CSV lines to handle the two-section format."""
        import csv
        from io import StringIO

        text = file_bytes.decode("utf-8", errors="replace")
        reader = csv.reader(StringIO(text))
        all_rows = list(reader)

        # Return raw text for preview + the rows as a single "table"
        return text[:2000], [all_rows]

    def _parse_extracted(self, raw_text: str, raw_tables: list[list[list[str]]]) -> ParseResult:
        warnings: list[str] = []

        if not raw_tables or not raw_tables[0]:
            return ParseResult(warnings=["Empty CSV file"])

        all_rows = raw_tables[0]

        # ── Phase 1: Find and parse Section 1 (Account Summary) ──
        section1_header_idx = None
        section2_header_idx = None

        for i, row in enumerate(all_rows):
            joined = ",".join(c.strip().lower() for c in row if c.strip())
            if "account type" in joined and "account" in joined and ("beginning" in joined or "ending" in joined):
                section1_header_idx = i
            if "symbol" in joined and ("cusip" in joined or "description" in joined) and ("beginning" in joined or "ending" in joined):
                section2_header_idx = i

        # Parse Section 1 account summaries
        account_summaries: dict[str, dict] = {}  # acct_num → {type, begin, change, end}

        if section1_header_idx is not None:
            s1_header = [c.strip().lower() for c in all_rows[section1_header_idx]]
            type_idx = self._find_col(s1_header, ["account type", "type"])

            # For the "Account" column, we need an exact match to avoid colliding
            # with "Account Type" (which also contains "account" as a substring).
            acct_idx = None
            for i, h in enumerate(s1_header):
                if h == "account" or h == "account number" or h == "account #":
                    acct_idx = i
                    break

            begin_idx = self._find_col(s1_header, ["beginning mkt value", "beginning market value", "beginning value"])
            change_idx = self._find_col(s1_header, ["change in investment", "change"])
            end_idx = self._find_col(s1_header, ["ending mkt value", "ending market value", "ending value"])

            for row in all_rows[section1_header_idx + 1:]:
                # Stop at blank row or Section 2 header
                if not any(c.strip() for c in row):
                    break
                joined = ",".join(c.strip().lower() for c in row if c.strip())
                if "symbol" in joined and "cusip" in joined:
                    break

                def s1_get(idx: int | None) -> str:
                    if idx is not None and idx < len(row):
                        return row[idx].strip()
                    return ""

                acct_num = s1_get(acct_idx)
                if not acct_num or not any(c.isalnum() for c in acct_num):
                    continue

                account_summaries[acct_num] = {
                    "account_type": s1_get(type_idx),
                    "beginning_value": self._parse_dollar(s1_get(begin_idx)),
                    "change_in_investment": self._parse_dollar(s1_get(change_idx)),
                    "ending_value": self._parse_dollar(s1_get(end_idx)),
                }
        else:
            warnings.append("Could not find Section 1 (Account Summary) header")

        # ── Phase 2: Find and parse Section 2 (Holdings Detail) ──
        holdings_by_account: dict[str, list[HoldingParsed]] = {a: [] for a in account_summaries}
        known_accounts = set(account_summaries.keys())

        if section2_header_idx is not None:
            s2_header = [c.strip().lower() for c in all_rows[section2_header_idx]]
            sym_idx = self._find_col(s2_header, ["symbol/cusip", "symbol", "ticker"])
            desc_idx = self._find_col(s2_header, ["description", "name"])
            qty_idx = self._find_col(s2_header, ["quantity", "shares"])
            price_idx = self._find_col(s2_header, ["price"])
            bv_idx = self._find_col(s2_header, ["beginning value"])
            ev_idx = self._find_col(s2_header, ["ending value"])
            cb_idx = self._find_col(s2_header, ["cost basis"])

            current_account: str | None = None

            for row in all_rows[section2_header_idx + 1:]:
                # Skip blank rows
                if not any(c.strip() for c in row):
                    continue

                first_cell = row[0].strip() if row else ""
                first_lower = first_cell.lower()

                # Check if first cell is a known account number
                if first_cell in known_accounts:
                    current_account = first_cell
                    # Ensure this account has a holdings list
                    if current_account not in holdings_by_account:
                        holdings_by_account[current_account] = []
                    continue

                # Skip asset class headers
                if first_lower in self._ASSET_CLASS_HEADERS:
                    continue

                # Skip subtotal rows
                if first_lower.startswith("subtotal"):
                    continue

                # Skip footer/disclaimer rows
                if first_lower.startswith("the data and information") or first_lower.startswith("for informational"):
                    break

                # No current account set yet — skip
                if current_account is None:
                    continue

                # Parse as a holding row
                def s2_get(idx: int | None) -> str:
                    if idx is not None and idx < len(row):
                        v = row[idx].strip()
                        return "" if v.lower() == "nan" else v
                    return ""

                ticker = self._normalize_ticker(s2_get(sym_idx))

                # Skip junk
                if ticker in self._SKIP_TICKERS or not ticker:
                    continue
                if len(ticker) > 8:
                    continue

                ending_value = self._parse_dollar(s2_get(ev_idx))
                beginning_value = self._parse_dollar(s2_get(bv_idx))
                cost_basis_raw = s2_get(cb_idx)
                cost_basis = None if "not applicable" in cost_basis_raw.lower() or not cost_basis_raw else self._parse_dollar(cost_basis_raw)

                holdings_by_account[current_account].append(HoldingParsed(
                    ticker=ticker,
                    name=s2_get(desc_idx),
                    quantity=self._parse_dollar(s2_get(qty_idx)) or None,
                    price=self._parse_dollar(s2_get(price_idx)) or None,
                    market_value=ending_value,
                    beginning_value=beginning_value if beginning_value else None,
                    ending_value=ending_value if ending_value else None,
                    cost_basis=cost_basis,
                ))
        else:
            warnings.append("Could not find Section 2 (Holdings Detail) header")

        # ── Phase 3: Merge into AccountParsed objects ──
        accounts: list[AccountParsed] = []
        for acct_num, summary in account_summaries.items():
            acct_holdings = holdings_by_account.get(acct_num, [])
            ending = summary["ending_value"]

            accounts.append(AccountParsed(
                account_number=acct_num,
                account_number_masked=mask_account_number(acct_num),
                account_type=summary["account_type"],
                holdings=acct_holdings,
                total_value=ending,
                beginning_value=summary["beginning_value"] or None,
                ending_value=ending or None,
                change_in_investment=summary["change_in_investment"],
            ))

        # Sort by ending value descending
        accounts.sort(key=lambda a: a.total_value, reverse=True)

        if not accounts:
            warnings.append("No accounts found in CSV")
        elif all(len(a.holdings) == 0 for a in accounts):
            warnings.append("No holdings found in Section 2")

        return ParseResult(
            accounts=accounts,
            warnings=warnings,
        )
