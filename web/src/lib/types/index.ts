// Asset categories
export type AssetCategory = "foundational" | "value" | "growth" | "emergency_fund" | "btc_crypto";

export type Brokerage = "fidelity" | "netbenefits" | "robinhood" | "betterment";

export interface CategoryMeta {
  key: AssetCategory;
  label: string;
  color: string;
  tailwindBg: string;
  tailwindText: string;
}

// Snapshot data
export interface MonthlySnapshot {
  id: string;
  month: string;
  category: AssetCategory;
  totalValue: number;
  netDeposits: number;
  marketGain: number;
}

// KPI card data
export interface KpiData {
  category: AssetCategory;
  label: string;
  currentValue: number;
  previousValue: number;
  momDelta: number;
  momDeltaPercent: number;
  color: string;
}

// Holdings
export interface HoldingRow {
  id: string;
  ticker: string;
  name: string;
  brokerage: Brokerage;
  category: AssetCategory;
  marketValue: number;
  quantity: number;
  price: number;
  statementDate: string;
}

// Ticker mapping
export interface TickerMapping {
  ticker: string;
  category: AssetCategory;
  source: "seed" | "user";
  updatedAt: string;
}

// Parse API response
export interface HoldingParsed {
  ticker: string;
  name: string;
  quantity: number | null;
  price: number | null;
  market_value: number;
  beginning_value: number | null;
  ending_value: number | null;
  cost_basis: number | null;
  category: string | null;
  category_source: string | null;
}

export type TrackingMode = "detailed" | "aggregate";

export interface AccountParsed {
  account_number: string;
  account_number_masked: string;
  account_type: string;
  owner_name: string;
  holdings: HoldingParsed[];
  total_value: number;
  beginning_value: number | null;
  ending_value: number | null;
  change_in_investment: number | null;
  tracking_mode: TrackingMode;
}

export interface DepositParsed {
  amount: number;
  description: string;
  date: string | null;
}

export interface ConfidenceScores {
  total_value: number;
  account_number: number;
  holdings: number;
  deposits: number;
  owner_name: number;
}

export interface ParseResult {
  brokerage: string;
  statement_date: string;
  accounts: AccountParsed[];
  deposits: DepositParsed[];
  unknown_tickers: string[];
  raw_text_preview: string;
  warnings: string[];
  confidence: ConfidenceScores;
}

export interface CommitRequest {
  brokerage: string;
  statement_date: string;
  accounts: AccountParsed[];
  deposits: DepositParsed[];
  ticker_overrides: { ticker: string; category: string }[];
  file_hash: string;
  file_name: string;
}

export interface CommitResult {
  statement_id: string;
  holdings_created: number;
  deposits_created: number;
  ticker_mappings_added: number;
  snapshots_rebuilt: string[];
}

// Chart data shapes
export interface StackedAreaDataPoint {
  month: string;
  foundational: number;
  value: number;
  growth: number;
  emergency_fund: number;
  btc_crypto: number;
  total: number;
}

export interface WaterfallDataPoint {
  month: string;
  startValue: number;
  contribution: number;
  marketGain: number;
  endValue: number;
}

export interface AllocationSlice {
  category: AssetCategory;
  label: string;
  value: number;
  percentage: number;
  color: string;
}

// Statement metadata
export interface StatementMeta {
  id: string;
  brokerage: Brokerage;
  statementDate: string;
  fileName: string;
  totalValue: number;
  netDeposits: number;
  uploadedAt: string;
}

// Database stats
export interface DatabaseStats {
  statementCount: number;
  holdingsCount: number;
  tickerMapCount: number;
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
}
