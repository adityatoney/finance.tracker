"""SEC EDGAR filing text extractor.

Fetches SEC filing HTML and extracts key sections for moat analysis.
"""
import re
import httpx
from bs4 import BeautifulSoup
from typing import Optional


SEC_HEADERS = {
    "User-Agent": "FinanceTracker/1.0 (finance-tracker@example.com)",
    "Accept-Encoding": "gzip, deflate",
}

# Section heading patterns for 10-K filings
SECTION_PATTERNS = {
    "business": [
        r"item\s*1[.\s]*[\u2014\u2013\-\u2014\u2013]?\s*business",
        r"item\s*1\b(?!\s*[a-z0-9])",
    ],
    "risk_factors": [
        r"item\s*1a[.\s]*[\u2014\u2013\-\u2014\u2013]?\s*risk\s*factors",
        r"item\s*1a\b",
    ],
    "mda": [
        r"item\s*7[.\s]*[\u2014\u2013\-\u2014\u2013]?\s*management",
        r"item\s*7\b(?!\s*[a-z0-9])",
    ],
    "competition": [
        r"competition",
        r"competitive\s*(landscape|environment|position)",
    ],
}


async def fetch_filing_html(url: str) -> str:
    """Fetch SEC filing HTML content."""
    async with httpx.AsyncClient(timeout=30.0, headers=SEC_HEADERS) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.text


def clean_html_text(html: str) -> str:
    """Strip HTML tags, normalize whitespace, remove tables and exhibits."""
    soup = BeautifulSoup(html, "lxml")

    # Remove script, style, table elements
    for tag in soup.find_all(["script", "style", "table", "img"]):
        tag.decompose()

    text = soup.get_text(separator="\n")

    # Normalize whitespace
    lines = []
    for line in text.split("\n"):
        line = line.strip()
        if line:
            lines.append(line)

    return "\n".join(lines)


def extract_section(text: str, section_name: str, max_chars: int = 50000) -> Optional[str]:
    """Extract a specific section from filing text by header pattern matching."""
    patterns = SECTION_PATTERNS.get(section_name, [])

    # Find section start
    start_idx = None
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            start_idx = match.start()
            break

    if start_idx is None:
        return None

    # Find next "Item N" heading as section end
    remaining = text[start_idx + 100:]  # skip past the heading itself
    next_item = re.search(r"\bitem\s+\d+[a-z]?\b", remaining, re.IGNORECASE)

    if next_item:
        end_idx = start_idx + 100 + next_item.start()
    else:
        end_idx = min(start_idx + max_chars, len(text))

    section_text = text[start_idx:end_idx].strip()

    # Truncate if too long
    if len(section_text) > max_chars:
        section_text = section_text[:max_chars] + "\n[... truncated]"

    return section_text


async def extract_filing_sections(url: str, filing_type: str = "10-K") -> dict:
    """Fetch and extract key sections from an SEC filing.

    Returns:
        dict with keys: business, risk_factors, mda, competition, metadata
    """
    html = await fetch_filing_html(url)
    full_text = clean_html_text(html)

    sections = {}
    for section_name in SECTION_PATTERNS:
        extracted = extract_section(full_text, section_name)
        if extracted:
            sections[section_name] = extracted

    # If no sections extracted, return first 50k chars as fallback
    if not sections:
        sections["full_text"] = full_text[:50000]

    return {
        "sections": sections,
        "metadata": {
            "filing_type": filing_type,
            "url": url,
            "total_chars": len(full_text),
            "sections_found": list(sections.keys()),
        },
    }


def segment_transcript(text: str) -> dict:
    """Segment an earnings call transcript into management commentary and Q&A."""
    # Common patterns separating prepared remarks from Q&A
    qa_patterns = [
        r"question[- ]and[- ]answer\s*(session|segment|portion)?",
        r"q\s*&\s*a\s*(session|segment|portion)?",
        r"operator.*(?:first|our first)\s+question",
    ]

    split_idx = None
    for pattern in qa_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            split_idx = match.start()
            break

    if split_idx:
        return {
            "management_commentary": text[:split_idx].strip(),
            "qa_section": text[split_idx:].strip(),
            "metadata": {
                "has_qa": True,
                "management_chars": split_idx,
                "qa_chars": len(text) - split_idx,
            },
        }

    return {
        "management_commentary": text.strip(),
        "qa_section": "",
        "metadata": {
            "has_qa": False,
            "total_chars": len(text),
        },
    }
