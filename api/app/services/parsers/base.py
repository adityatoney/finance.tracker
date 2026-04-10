"""Abstract base parser and mixins for PDF/CSV extraction."""

from abc import ABC, abstractmethod
from decimal import Decimal, InvalidOperation
from io import BytesIO
from typing import Union
from pathlib import Path

from app.schemas import ParseResult, AccountParsed, DepositParsed, HoldingParsed, ConfidenceScores


class ParseError(Exception):
    """Raised when a statement cannot be parsed at all."""

    def __init__(self, message: str, raw_text: str = ""):
        super().__init__(message)
        self.raw_text = raw_text


class BaseParser(ABC):
    """Abstract base for all brokerage statement parsers."""

    brokerage: str = ""

    def parse(self, file_bytes: bytes, file_name: str) -> ParseResult:
        """Public entry point. Extracts data and returns a ParseResult."""
        raw_text, raw_tables = self._extract_raw(file_bytes, file_name)

        try:
            result = self._parse_extracted(raw_text, raw_tables)
        except Exception as e:
            raise ParseError(
                f"Failed to parse {self.brokerage} statement: {e}",
                raw_text=raw_text[:500],
            ) from e

        result.raw_text_preview = raw_text[:500]
        result.brokerage = self.brokerage
        result.confidence = self._compute_confidence(result)
        return result

    @abstractmethod
    def _extract_raw(self, file_bytes: bytes, file_name: str) -> tuple[str, list[list[list[str]]]]:
        """Extract raw text and tables from the file.

        Returns:
            (full_text, list_of_tables) where each table is list of rows,
            each row is list of cell strings.
        """
        ...

    @abstractmethod
    def _parse_extracted(self, raw_text: str, raw_tables: list[list[list[str]]]) -> ParseResult:
        """Parse the raw extracted data into a structured ParseResult."""
        ...

    def _compute_confidence(self, result: ParseResult) -> ConfidenceScores:
        """Compute confidence scores for each parsed field."""
        scores = ConfidenceScores()

        if result.accounts:
            account = result.accounts[0]
            scores.account_number = 1.0 if account.account_number else 0.0
            scores.total_value = 1.0 if account.total_value > 0 else 0.0
            scores.holdings = min(1.0, len(account.holdings) / 3) if account.holdings else 0.0
            scores.owner_name = 1.0 if account.owner_name else 0.0

        scores.deposits = 1.0 if result.deposits else 0.0
        return scores

    # ── Shared utility methods ──

    @staticmethod
    def _parse_dollar(text: str) -> float:
        """Parse '$1,234.56' or '(500.00)' into a float."""
        if not text:
            return 0.0
        cleaned = text.strip().replace("$", "").replace(",", "").replace(" ", "")
        if cleaned.startswith("(") and cleaned.endswith(")"):
            cleaned = "-" + cleaned[1:-1]
        try:
            return float(cleaned)
        except (ValueError, InvalidOperation):
            return 0.0

    @staticmethod
    def _normalize_ticker(raw: str) -> str:
        """Normalize ticker symbols: strip whitespace, uppercase."""
        return raw.strip().upper()

    @staticmethod
    def _find_col(header: list[str], keywords: list[str]) -> int | None:
        """Find the index of a column by matching any of the keywords in the header."""
        for i, cell in enumerate(header):
            for kw in keywords:
                if kw in cell:
                    return i
        return None


class PDFParserMixin:
    """Mixin providing pdfplumber-based raw extraction for PDF parsers."""

    # Subclasses can override these to tune table detection
    table_settings: dict = {}

    def _extract_raw(self, file_bytes: bytes, file_name: str) -> tuple[str, list[list[list[str]]]]:
        import pdfplumber

        pdf = pdfplumber.open(BytesIO(file_bytes))
        full_text_parts = []
        all_tables = []

        with pdf:
            for page in pdf.pages:
                full_text_parts.append(page.extract_text() or "")
                tables = page.extract_tables(table_settings=self.table_settings)
                for table in (tables or []):
                    cleaned = [
                        [cell if cell is not None else "" for cell in row]
                        for row in table
                    ]
                    all_tables.append(cleaned)

        return "\n".join(full_text_parts), all_tables


class CSVParserMixin:
    """Mixin providing pandas-based raw extraction for CSV parsers.

    Handles real-world brokerage CSV quirks:
    - Fidelity CSVs have preamble lines, footer summaries, and inconsistent column counts
    - Uses on_bad_lines='skip' to silently drop malformed rows
    - Tries to auto-detect the header row by scanning for known column names
    """

    # Subclasses can set these to help find the real header row
    _csv_header_markers: list[str] = ["Symbol", "Ticker", "Description", "Quantity"]

    def _extract_raw(self, file_bytes: bytes, file_name: str) -> tuple[str, list[list[list[str]]]]:
        import pandas as pd

        text = file_bytes.decode("utf-8", errors="replace")

        # Step 1: Find the actual header row by scanning for known column names.
        # Fidelity CSVs often have preamble lines like "Brokerage" before the header.
        lines = text.splitlines()
        header_row_idx = 0
        for i, line in enumerate(lines):
            if any(marker in line for marker in self._csv_header_markers):
                header_row_idx = i
                break

        # Step 2: Read with pandas, skipping preamble and tolerating bad rows
        try:
            df = pd.read_csv(
                BytesIO(file_bytes),
                skiprows=header_row_idx,
                on_bad_lines="skip",
                engine="python",
            )
        except Exception:
            # Last resort: read as raw lines and build table manually
            return text, [self._fallback_csv_parse(lines, header_row_idx)]

        # Drop rows that are entirely NaN (blank separator lines)
        df = df.dropna(how="all")

        raw_text = df.to_string(index=False)
        header = [str(c).strip() for c in df.columns.tolist()]
        data_rows = [[str(cell).strip() for cell in row] for row in df.values.tolist()]
        table = [header] + data_rows

        return raw_text, [table]

    @staticmethod
    def _fallback_csv_parse(lines: list[str], header_idx: int) -> list[list[str]]:
        """Manual CSV parse as fallback when pandas can't handle the file."""
        import csv
        from io import StringIO

        content = "\n".join(lines[header_idx:])
        reader = csv.reader(StringIO(content))
        rows = []
        expected_cols = 0
        for i, row in enumerate(reader):
            if i == 0:
                expected_cols = len(row)
                rows.append(row)
            elif len(row) == expected_cols:
                rows.append(row)
            # Skip rows with wrong column count (footers, summaries)
        return rows
