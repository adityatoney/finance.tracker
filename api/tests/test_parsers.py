"""Tests for brokerage parsers."""

import pytest
from app.services.parsers.fidelity import FidelityCSVParser


# ── The canonical two-section Fidelity CSV fixture ──
# Mirrors the real format: Section 1 (Account Summary) + Section 2 (Holdings Detail)

TWO_SECTION_CSV = """\
Account Type,Account,Beginning mkt Value,Change in Investment,Ending mkt Value
Individual - TOD,X84810689,841115.34,-222.05,840893.29
ROTH IRA,259505679,118671.45,3854.49,122525.94
Individual - TOD,Y81144735,199752.20,5387.57,205139.43

Symbol/CUSIP,Description,Quantity,Price,Beginning Value,Ending Value,Cost Basis


X84810689,,,,,,
Stocks,,,,,,
MSFT,MICROSOFT CORP,1621.0046,517.81,839599.33,839372.39,198249.92
Subtotal of Stocks,,,,,839372.39,198249.92

X84810689,,,,,,
Mutual Funds,,,,,,
FZDXX,FIDELITY MMKT PREMIUM,163.93,1,163.38,163.93,not applicable
Subtotal of Mutual Funds,,,,,163.93,

X84810689,,,,,,
Core Account,,,,,,
SPAXX,FIDELITY GOVERNMENT MM,1356.97,1,1352.63,1356.97,not applicable
Subtotal of Core Account,,,,,1356.97,

259505679,,,,,,
Stocks,,,,,,
VTI,VANGUARD TOTAL STOCK MKT,200,480.50,95000.00,96100.00,72000.00
VOO,VANGUARD S&P 500 ETF,50,528.52,25671.45,26425.94,20000.00
Subtotal of Stocks,,,,,122525.94,92000.00

Y81144735,,,,,,
Stocks,,,,,,
NVDA,NVIDIA CORP,150,1367.60,199752.20,205139.43,45000.00
Subtotal of Stocks,,,,,205139.43,45000.00

The data and information in this spreadsheet is provided to you,,,,,,,
"""


def test_fidelity_csv_two_section_format():
    """Test the canonical two-section Fidelity monthly statement format."""
    parser = FidelityCSVParser()
    result = parser.parse(TWO_SECTION_CSV.encode("utf-8"), "statement.csv")

    # Should find 3 accounts from Section 1
    assert len(result.accounts) == 3

    acct_map = {a.account_number: a for a in result.accounts}

    # ── Account X84810689 (Individual - TOD) ──
    x84 = acct_map["X84810689"]
    assert x84.account_type == "Individual - TOD"
    assert x84.beginning_value == pytest.approx(841115.34)
    assert x84.ending_value == pytest.approx(840893.29)
    assert x84.change_in_investment == pytest.approx(-222.05)
    assert x84.total_value == pytest.approx(840893.29)

    # Should have 3 holdings: MSFT, FZDXX, SPAXX
    assert len(x84.holdings) == 3
    x84_tickers = {h.ticker for h in x84.holdings}
    assert x84_tickers == {"MSFT", "FZDXX", "SPAXX"}

    # Check MSFT details
    msft = next(h for h in x84.holdings if h.ticker == "MSFT")
    assert msft.quantity == pytest.approx(1621.0046)
    assert msft.price == pytest.approx(517.81)
    assert msft.beginning_value == pytest.approx(839599.33)
    assert msft.ending_value == pytest.approx(839372.39)
    assert msft.market_value == pytest.approx(839372.39)  # market_value = ending_value
    assert msft.cost_basis == pytest.approx(198249.92)

    # FZDXX should have cost_basis = None ("not applicable")
    fzdxx = next(h for h in x84.holdings if h.ticker == "FZDXX")
    assert fzdxx.cost_basis is None

    # ── Account 259505679 (ROTH IRA) ──
    roth = acct_map["259505679"]
    assert roth.account_type == "ROTH IRA"
    assert roth.beginning_value == pytest.approx(118671.45)
    assert roth.ending_value == pytest.approx(122525.94)
    assert roth.change_in_investment == pytest.approx(3854.49)

    # Should have 2 holdings: VTI, VOO
    assert len(roth.holdings) == 2
    roth_tickers = {h.ticker for h in roth.holdings}
    assert roth_tickers == {"VTI", "VOO"}

    # ── Account Y81144735 (Individual - TOD) ──
    y81 = acct_map["Y81144735"]
    assert len(y81.holdings) == 1
    assert y81.holdings[0].ticker == "NVDA"
    assert y81.holdings[0].cost_basis == pytest.approx(45000.00)

    # ── Subtotal/header rows should NOT appear as holdings ──
    all_tickers = [h.ticker for a in result.accounts for h in a.holdings]
    assert "Subtotal of Stocks" not in all_tickers
    assert "Stocks" not in all_tickers
    assert "Mutual Funds" not in all_tickers
    assert "Core Account" not in all_tickers

    # ── Accounts sorted by ending value descending ──
    values = [a.total_value for a in result.accounts]
    assert values == sorted(values, reverse=True)

    # ── No footer text leaked into results ──
    assert not any("data and information" in (h.name or "") for a in result.accounts for h in a.holdings)


def test_fidelity_csv_empty():
    """Test Fidelity CSV parser with empty file."""
    csv_content = "Symbol/CUSIP,Description,Quantity,Price,Beginning Value,Ending Value,Cost Basis\n"

    parser = FidelityCSVParser()
    result = parser.parse(csv_content.encode("utf-8"), "empty.csv")

    # Should have warnings about no accounts found
    assert len(result.accounts) == 0
    assert any("No accounts" in w or "Could not find Section 1" in w for w in result.warnings)


def test_fidelity_csv_section1_only():
    """Test with Section 1 only (no holdings detail)."""
    csv_content = (
        "Account Type,Account,Beginning mkt Value,Change in Investment,Ending mkt Value\n"
        "Individual - TOD,X84810689,100000.00,500.00,100500.00\n"
    )
    parser = FidelityCSVParser()
    result = parser.parse(csv_content.encode("utf-8"), "summary_only.csv")

    # Should find the account but with no holdings
    assert len(result.accounts) == 1
    assert result.accounts[0].account_number == "X84810689"
    assert result.accounts[0].total_value == pytest.approx(100500.00)
    assert len(result.accounts[0].holdings) == 0
    assert any("Section 2" in w or "No holdings" in w for w in result.warnings)


def test_parser_registry():
    """Test parser selection by brokerage and format."""
    from app.services.parser_registry import get_parser

    parser = get_parser("fidelity", "statement.pdf")
    assert parser.brokerage == "fidelity"

    parser = get_parser("fidelity", "positions.csv")
    assert parser.brokerage == "fidelity"

    parser = get_parser("robinhood", "statement.pdf")
    assert parser.brokerage == "robinhood"

    parser = get_parser("betterment", "statement.pdf")
    assert parser.brokerage == "betterment"


def test_parser_registry_unsupported():
    from app.services.parser_registry import get_parser

    with pytest.raises(ValueError):
        get_parser("unknown_broker", "file.pdf")

    with pytest.raises(ValueError):
        get_parser("betterment", "file.csv")  # No CSV parser for Betterment
