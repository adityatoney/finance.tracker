"""Regex-based PII detection in raw text."""

import re

# Patterns for different PII types
PII_PATTERNS = {
    "ssn": re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
    "masked_ssn": re.compile(r"[*Xx]{3}[-\s][*Xx]{2}[-\s]\d{4}"),
    "account_number": re.compile(r"\*{2,4}[-]?\d{4,7}"),
    "full_account": re.compile(r"\b[A-Z]?\d{2,3}[-]\d{5,8}\b"),
    "phone": re.compile(r"\(?\d{3}\)?[-\s.]\d{3}[-\s.]\d{4}"),
}


def detect_pii_in_text(text: str) -> dict[str, list[str]]:
    """Scan raw text for PII patterns.

    Returns:
        Dict mapping PII type name to list of matched strings found.
    """
    if not text:
        return {}

    results: dict[str, list[str]] = {}
    for pii_type, pattern in PII_PATTERNS.items():
        matches = pattern.findall(text)
        if matches:
            results[pii_type] = matches

    return results


def mask_account_number(account_number: str) -> str:
    """Mask an account number for display, showing only last 4 digits."""
    if not account_number:
        return ""
    if len(account_number) <= 4:
        return account_number
    return "***-" + account_number[-4:]
