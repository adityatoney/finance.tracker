I want to build a local-first financial dashboard using Python and Streamlit.

Goal: Track total assets month-over-month (MoM) by uploading monthly statements from Fidelity, Robinhood, and Betterment.

Categorization Logic:
- Assets must be mapped to three core buckets: Foundational (e.g., S&P 500, Bonds), Value (e.g., Dividend stocks, BRK.B), and Growth (e.g., Tech, AI, NVDA).
- Separate categories for Emergency Funds (Cash/HYSA) and BTC (Crypto).

Core Features:
- File Uploader: Support PDF and CSV uploads to parse data from brokerage statements.
- PII Protection: Encrypt sensitive data (account numbers, names, addresses) before saving to a local SQLite database or JSON file. The encryption key should be stored in a .env file.
- MoM Analysis: Calculate the change in value for each category. Distinguish between 'Market Gain' and 'Contributions' if the statement data allows.
- Visuals: Create dashboards with pretty visuals showing the growth of the three buckets + BTC + Emergency fund over time.
- Different parsing logic for individual brokerage accounts (Fidelity, Robinhood, Betterment).

You will need to navigate several technical hurdles. You should be prepared to provide feedback on these specific areas:

Statement "Brittleness"
- Brokerage PDF layouts change frequently. Betterment, in particular, is known for having complex, multi-column PDF layouts that are hard to scrape. Build a "Dry Run" mode where it shows you the extracted text/table so you can verify the parser found the "Total Value" and "Account Number" fields correctly.

PII Detection: 
- The agent needs to know what to encrypt. Use RegEx to identify patterns for account numbers (e.g., ***-1234) and social security numbers. It should also encrypt the "Statement Owner" name.

The "Matching" Problem
- If you buy VTI (Vanguard Total Stock Market) in Fidelity, it belongs in "Foundational." If you buy TSLA in Robinhood, it belongs in "Growth." The agent will need to build a Mapping Table. If it encounters a new ticker it doesn't recognize, it should prompt me in the UI to categorize it once, then remember that choice for future statements.

Managing "The Delta"
- A MoM dashboard is useless if it thinks your $1,000 deposit is a "100% market gain."The Fix: The agent must look for a "Contributions" or "Deposits" line item in the statement. It should calculate: $$Net Change = (End Balance - Start Balance) - Net Deposits$$

Please start by scaffolding the project structure and coming up with an architecture plan. 