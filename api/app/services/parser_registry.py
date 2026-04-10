"""Parser selection by brokerage name and file type."""

from app.services.parsers.base import BaseParser
from app.services.parsers.fidelity import FidelityPDFParser, FidelityCSVParser
from app.services.parsers.robinhood import RobinhoodPDFParser, RobinhoodCSVParser
from app.services.parsers.betterment import BettermentPDFParser
from app.services.parsers.netbenefits import NetBenefitsPDFParser

# Fingerprints for auto-detection
BROKERAGE_FINGERPRINTS: dict[str, list[str]] = {
    "fidelity": ["Fidelity Investments", "Fidelity Brokerage", "FMR LLC", "fidelity.com"],
    "robinhood": ["Robinhood", "Robinhood Securities", "Robinhood Markets", "robinhood.com"],
    "betterment": ["Betterment", "Betterment LLC", "Betterment Securities", "betterment.com"],
    "netbenefits": ["NetBenefits", "Retirement Savings Statement", "Savings Plus 401(k)"],
}

_PDF_PARSERS: dict[str, type[BaseParser]] = {
    "fidelity": FidelityPDFParser,
    "robinhood": RobinhoodPDFParser,
    "betterment": BettermentPDFParser,
    "netbenefits": NetBenefitsPDFParser,
}

_CSV_PARSERS: dict[str, type[BaseParser]] = {
    "fidelity": FidelityCSVParser,
    "robinhood": RobinhoodCSVParser,
}


def _detect_format(file_name: str) -> str:
    """Detect file format from extension."""
    ext = file_name.lower().rsplit(".", 1)[-1] if "." in file_name else ""
    if ext == "pdf":
        return "pdf"
    elif ext in ("csv", "tsv"):
        return "csv"
    raise ValueError(f"Unsupported file format: .{ext}")


def get_parser(brokerage: str, file_name: str) -> BaseParser:
    """Return the appropriate parser instance for the given brokerage and file type."""
    fmt = _detect_format(file_name)

    if fmt == "pdf":
        parser_cls = _PDF_PARSERS.get(brokerage)
    else:
        parser_cls = _CSV_PARSERS.get(brokerage)

    if parser_cls is None:
        raise ValueError(
            f"No {fmt.upper()} parser available for brokerage '{brokerage}'. "
            f"Available: {list(_PDF_PARSERS.keys() if fmt == 'pdf' else _CSV_PARSERS.keys())}"
        )

    return parser_cls()


def detect_brokerage(raw_text: str) -> str | None:
    """Auto-detect brokerage from text content using fingerprint strings."""
    text_lower = raw_text.lower()
    scores: dict[str, int] = {}

    for brokerage, fingerprints in BROKERAGE_FINGERPRINTS.items():
        scores[brokerage] = sum(1 for fp in fingerprints if fp.lower() in text_lower)

    best = max(scores, key=scores.get)  # type: ignore[arg-type]
    return best if scores[best] > 0 else None
