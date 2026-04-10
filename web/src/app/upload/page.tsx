"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { FileDropzone } from "@/components/upload/file-dropzone";
import { DryRunResults } from "@/components/upload/dry-run-results";
import { CommitDialog } from "@/components/upload/commit-dialog";
import { BROKERAGES } from "@/lib/constants/categories";
import type { AssetCategory, ParseResult, TrackingMode } from "@/lib/types";
import { formatCurrency } from "@/lib/utils/format";
import {
  Loader2,
  CheckCircle2,
  RotateCcw,
  Upload,
  FileText,
  ArrowRight,
  CircleDot,
  Check,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const PARSER_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:10611";

async function parseFile(file: File, brokerage: string, statementDate: string): Promise<ParseResult> {
  const formData = new FormData();
  formData.append("file", file);
  const params = new URLSearchParams({ brokerage, statement_date: statementDate });
  const response = await fetch(`${PARSER_BASE}/api/parse?${params}`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: `API error: ${response.status}` }));
    throw new Error(error.detail || `API error: ${response.status}`);
  }
  return response.json();
}

type UploadState = "idle" | "file_selected" | "parsing" | "dry_run" | "committing" | "committed";

/* ── Step Progress Indicator ── */
function StepProgress({ currentStep }: { currentStep: number }) {
  const steps = [
    { number: 1, label: "Select File" },
    { number: 2, label: "Review Data" },
    { number: 3, label: "Commit" },
  ];

  return (
    <div className="flex items-center justify-center w-full max-w-lg mx-auto">
      {steps.map((step, idx) => {
        const isCompleted = currentStep > step.number;
        const isActive = currentStep === step.number;
        const isFuture = currentStep < step.number;

        return (
          <div key={step.number} className="flex items-center flex-1 last:flex-none">
            {/* Step circle + label */}
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors",
                  isCompleted && "bg-emerald-500 text-white",
                  isActive && "bg-primary text-primary-foreground",
                  isFuture && "bg-muted text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4" />
                ) : (
                  step.number
                )}
              </div>
              <span
                className={cn(
                  "text-xs whitespace-nowrap transition-colors",
                  isCompleted && "text-emerald-600 dark:text-emerald-400 font-medium",
                  isActive && "text-foreground font-semibold",
                  isFuture && "text-muted-foreground"
                )}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line (not after last step) */}
            {idx < steps.length - 1 && (
              <div
                className={cn(
                  "h-0.5 flex-1 mx-3 mt-[-1.25rem] rounded-full transition-colors",
                  currentStep > step.number ? "bg-emerald-500" : "bg-muted"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function UploadPage() {
  const router = useRouter();
  const [state, setState] = useState<UploadState>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [brokerage, setBrokerage] = useState<string>("");
  const [statementDate, setStatementDate] = useState<string>("");
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [tickerOverrides, setTickerOverrides] = useState<Record<string, string>>({});
  const [trackingModes, setTrackingModes] = useState<Record<string, TrackingMode>>({});
  const [aggregateCategories, setAggregateCategories] = useState<Record<string, string>>({});
  const [commitDialogOpen, setCommitDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commitMutation = useMutation(api.statements.commit);
  const retirementCommit = useMutation(api.retirement.commit);
  const existingStatements = useQuery(api.statements.list);
  const tickerMapData = useQuery(api.tickers.list);

  // Group existing statements by month for the month picker
  // Use a descriptive key: "robinhood_crypto" vs "robinhood" for stocks
  const existingMonths: Record<string, string[]> = {};
  if (existingStatements) {
    for (const s of existingStatements) {
      if (!existingMonths[s.statementDate]) existingMonths[s.statementDate] = [];
      const isCrypto = s.brokerage === "robinhood" &&
        (s as any).accounts?.some((a: any) => a.accountType === "Crypto");
      existingMonths[s.statementDate].push(isCrypto ? "robinhood_crypto" : s.brokerage);
    }
  }
  const sortedExistingMonths = Object.keys(existingMonths).sort().reverse();
  // Build a lookup: TICKER → category from the existing ticker map
  const tickerMapLookup: Record<string, string> = {};
  if (tickerMapData) {
    for (const m of tickerMapData) {
      tickerMapLookup[m.ticker] = m.category;
    }
  }

  const handleFileAccepted = (f: File) => {
    setFile(f);
    setState("file_selected");
    setError(null);
    setParseResult(null);
    setTickerOverrides({});
    setTrackingModes({});
    setAggregateCategories({});
  };

  const handleParse = async () => {
    if (!file || !brokerage || !statementDate) return;
    setState("parsing");
    setError(null);
    try {
      const result = await parseFile(file, brokerage, statementDate);
      setParseResult(result);
      // Default all accounts to "detailed" tracking
      const modes: Record<string, TrackingMode> = {};
      result.accounts.forEach((a) => {
        modes[a.account_number || a.account_number_masked] = "detailed";
      });
      setTrackingModes(modes);
      setState("dry_run");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Parse failed";
      const userMessage = message === "Load failed" || message === "Failed to fetch"
        ? "Unable to reach the API server. Please check that the API container is running on port 10611."
        : message;
      setError(userMessage);
      setState("file_selected");
    }
  };

  const handleTickerCategorize = (ticker: string, category: AssetCategory) => {
    setTickerOverrides((prev) => ({ ...prev, [ticker]: category }));
  };

  const handleAggregateCategoryChange = (accountKey: string, category: AssetCategory) => {
    setAggregateCategories((prev) => ({ ...prev, [accountKey]: category }));
  };

  const handleTrackingModeChange = (accountKey: string, mode: TrackingMode) => {
    setTrackingModes((prev) => ({ ...prev, [accountKey]: mode }));
  };

  // Build the commit payload with tracking modes applied
  const buildCommitAccounts = () => {
    if (!parseResult) return [];
    return parseResult.accounts.map((a, idx) => {
      const key = a.account_number || a.account_number_masked || `account-${idx}`;
      return { ...a, tracking_mode: trackingModes[key] || "detailed" };
    });
  };

  // Extract metadata from parse warnings (parser encodes key:value pairs)
  const extractWarningMeta = (key: string): string => {
    if (!parseResult) return "";
    for (const warning of parseResult.warnings) {
      if (warning.startsWith(`${key}:`)) {
        return warning.slice(key.length + 1);
      }
    }
    return "";
  };
  const extractFileHash = (): string => extractWarningMeta("file_hash");
  // Annual if: parser detected it OR user explicitly chose year-only input
  const isAnnualStatement = extractWarningMeta("annual_statement") === "true" || statementDate.length === 4;

  // ── Annual 401k commit handler ──
  const handleRetirementCommit = async () => {
    if (!parseResult) return;
    setState("committing");
    setError(null);
    try {
      const fileHash = extractFileHash();
      const periodEnd = extractWarningMeta("period_end");
      const periodStart = extractWarningMeta("period_start");
      const planName = extractWarningMeta("plan_name") || "401(k)";
      // Extract year from period end (MM/DD/YYYY → YYYY)
      const year = periodEnd ? periodEnd.split("/")[2] : statementDate.split("-")[0];

      const acct = parseResult.accounts[0];
      await retirementCommit({
        year,
        planName,
        beginningBalance: acct?.beginning_value ?? 0,
        endingBalance: acct?.ending_value ?? acct?.total_value ?? 0,
        yourContributions: parseFloat(extractWarningMeta("your_contributions")) || 0,
        employerContributions: parseFloat(extractWarningMeta("employer_contributions")) || 0,
        marketGain: parseFloat(extractWarningMeta("market_gain")) || 0,
        vestedBalance: parseFloat(extractWarningMeta("vested_balance")) || undefined,
        periodStart: periodStart || "",
        periodEnd: periodEnd || "",
        fileName: file?.name || "",
        fileHash,
      });
      setState("committed");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Commit failed";
      setError(message);
      setState("dry_run");
    }
  };

  const handleCommit = async () => {
    if (!parseResult) return;
    setState("committing");
    setError(null);
    try {
      const accounts = buildCommitAccounts();
      const fileHash = extractFileHash();
      await commitMutation({
        brokerage: parseResult.brokerage,
        statementDate: parseResult.statement_date,
        fileName: file?.name || "",
        fileHash,
        accounts: accounts.map((a, idx) => {
          const key = a.account_number || a.account_number_masked || `account-${idx}`;
          return {
          account_number: a.account_number,
          account_number_masked: a.account_number_masked,
          account_type: a.account_type || undefined,
          owner_name: a.owner_name || undefined,
          total_value: a.total_value,
          beginning_value: a.beginning_value ?? undefined,
          ending_value: a.ending_value ?? undefined,
          change_in_investment: a.change_in_investment ?? undefined,
          tracking_mode: a.tracking_mode,
          aggregate_category: aggregateCategories[key] || undefined,
          holdings: a.holdings.map((h) => ({
            ticker: h.ticker,
            name: h.name ?? undefined,
            quantity: h.quantity ?? undefined,
            price: h.price ?? undefined,
            market_value: h.market_value,
            beginning_value: h.beginning_value ?? undefined,
            ending_value: h.ending_value ?? undefined,
            cost_basis: h.cost_basis ?? undefined,
            category: h.category ?? undefined,
          })),
        };}),
        deposits: parseResult.deposits.map((d) => ({
          amount: d.amount,
          description: d.description || undefined,
          date: d.date ?? undefined,
        })),
        tickerOverrides: Object.entries(tickerOverrides).map(([ticker, category]) => ({
          ticker,
          category,
        })),
      });
      setState("committed");
      setCommitDialogOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Commit failed";
      setError(message);
      setCommitDialogOpen(false);
      setState("dry_run");
    }
  };

  const handleReset = () => {
    setState("idle");
    setFile(null);
    setBrokerage("");
    setStatementDate("");
    setParseResult(null);
    setTickerOverrides({});
    setTrackingModes({});
    setError(null);
  };

  const totalValue = parseResult?.accounts.reduce((s, a) => s + a.total_value, 0) ?? 0;
  const totalHoldings = parseResult?.accounts.reduce((s, a) => s + a.holdings.length, 0) ?? 0;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Upload className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Upload Statement</h1>
            <p className="text-muted-foreground text-sm">
              Import holdings from a brokerage statement
            </p>
          </div>
        </div>
        {state !== "idle" && state !== "committed" && (
          <Button variant="ghost" size="sm" onClick={handleReset} className="text-muted-foreground">
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
          </Button>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ── SUCCESS STATE ── */}
      {state === "committed" ? (
        <Card className="border-emerald-200 bg-gradient-to-b from-emerald-50/80 to-emerald-50/30 dark:border-emerald-900 dark:from-emerald-950/30 dark:to-emerald-950/10">
          <CardContent className="flex flex-col items-center justify-center py-20">
            <div className="rounded-full bg-emerald-100 dark:bg-emerald-900/60 p-5 mb-5">
              <CheckCircle2 className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-xl font-semibold">
              {isAnnualStatement ? "Saved to Retirement Tracker" : "Statement committed successfully"}
            </p>
            <p className="text-sm text-muted-foreground mt-1.5">
              {isAnnualStatement
                ? "Your 401(k) annual data has been recorded."
                : "Your holdings and snapshots have been updated."}
            </p>
            <div className="flex gap-3 mt-8">
              <Button variant="outline" onClick={handleReset}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Upload Another
              </Button>
              <Button onClick={() => router.push(isAnnualStatement ? "/retirement" : "/dashboard")}>
                {isAnnualStatement ? "View Retirement" : "View Dashboard"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ── STEP 1: FILE UPLOAD ── */}
          <Card>
            <CardContent className="pt-6 space-y-5">
              <FileDropzone
                onFileAccepted={handleFileAccepted}
                disabled={state === "parsing" || state === "committing"}
                selectedFile={file}
              />

              {/* Brokerage + Period + Parse button */}
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="space-y-2 sm:w-56">
                  <Label className="text-sm font-medium">Brokerage</Label>
                  <Select value={brokerage} onValueChange={(v) => v && setBrokerage(v)}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Select brokerage" />
                    </SelectTrigger>
                    <SelectContent>
                      {BROKERAGES.map((b) => (
                        <SelectItem key={b.value} value={b.value}>
                          {b.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-3">
                    <Label className="text-sm font-medium">Statement Period</Label>
                    {brokerage === "netbenefits" && (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => { if (statementDate.length !== 4) return; setStatementDate(""); }}
                          className={cn(
                            "rounded-full px-3 py-0.5 text-xs font-medium transition-colors",
                            statementDate.length !== 4
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          )}
                        >
                          Monthly
                        </button>
                        <button
                          type="button"
                          onClick={() => { if (statementDate.length === 4) return; setStatementDate(new Date().getFullYear().toString()); }}
                          className={cn(
                            "rounded-full px-3 py-0.5 text-xs font-medium transition-colors",
                            statementDate.length === 4
                              ? "bg-purple-600 text-white"
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          )}
                        >
                          Annual
                        </button>
                      </div>
                    )}
                  </div>
                  {statementDate.length === 4 ? (
                    <Input
                      type="number"
                      min="2000"
                      max="2099"
                      placeholder="e.g. 2024"
                      value={statementDate}
                      onChange={(e) => setStatementDate(e.target.value)}
                      className="h-10"
                    />
                  ) : (
                    <Input
                      type="month"
                      value={statementDate}
                      onChange={(e) => setStatementDate(e.target.value)}
                      className="h-10"
                    />
                  )}
                </div>

                <div className="flex items-end sm:w-44">
                  <Button
                    onClick={handleParse}
                    disabled={!file || !brokerage || !statementDate || state === "parsing" || state === "committing"}
                    className="w-full h-10"
                    size="lg"
                  >
                    {state === "parsing" ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Parsing...</>
                    ) : (
                      <><Upload className="mr-2 h-4 w-4" /> Parse</>
                    )}
                  </Button>
                </div>
              </div>

              {/* Existing months — full width below */}
              {sortedExistingMonths.length > 0 && (
                <div className="rounded-lg bg-muted/30 border px-4 py-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Uploaded Months</span>
                    <div className="flex items-center gap-3">
                      {(() => {
                        const colorMap: Record<string, string> = {
                          fidelity: "#10B981", robinhood: "#F59E0B", robinhood_crypto: "#F97316", netbenefits: "#8B5CF6", betterment: "#3B82F6",
                        };
                        const labelMap: Record<string, string> = {
                          fidelity: "Fidelity", robinhood: "Robinhood", robinhood_crypto: "Crypto", netbenefits: "401k", betterment: "Betterment",
                        };
                        const allBrokerages = [...new Set(sortedExistingMonths.flatMap((m) => existingMonths[m]))];
                        return allBrokerages.map((b) => (
                          <span key={b} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorMap[b] || "#9CA3AF" }} />
                            {labelMap[b] || b}
                          </span>
                        ));
                      })()}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {sortedExistingMonths.map((m) => {
                      const colorMap: Record<string, string> = {
                        fidelity: "#10B981", robinhood: "#F59E0B", robinhood_crypto: "#F97316", netbenefits: "#8B5CF6", betterment: "#3B82F6",
                      };
                      const labelMap: Record<string, string> = {
                        fidelity: "Fidelity", robinhood: "Robinhood", robinhood_crypto: "Crypto", netbenefits: "NetBenefits", betterment: "Betterment",
                      };
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setStatementDate(m)}
                          title={existingMonths[m].map((b) => labelMap[b] || b).join(", ")}
                          className={cn(
                            "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium tabular-nums transition-all",
                            statementDate === m
                              ? "border-primary bg-primary/10 text-primary shadow-sm"
                              : "border-transparent bg-background hover:border-muted-foreground/20 text-foreground hover:shadow-sm"
                          )}
                        >
                          {m}
                          <span className="flex gap-1">
                            {[...new Set(existingMonths[m])].map((b, i) => (
                              <span
                                key={i}
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: colorMap[b] || "#9CA3AF" }}
                              />
                            ))}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── STEP 2: DRY RUN RESULTS ── */}
          {parseResult && (state === "dry_run" || state === "committing") && isAnnualStatement && (
            <>
              {/* Annual 401k statement — simplified commit flow */}
              <Card className="border-purple-200 dark:border-purple-800">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 border-0">
                      Annual 401(k)
                    </Badge>
                    <CardTitle className="text-base">Retirement Statement Detected</CardTitle>
                  </div>
                  <CardDescription>
                    This annual statement will be saved to your Retirement tracker, not the main portfolio.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(() => {
                    const acct = parseResult.accounts[0];
                    const yourC = parseFloat(extractWarningMeta("your_contributions")) || 0;
                    const emplC = parseFloat(extractWarningMeta("employer_contributions")) || 0;
                    const mktGain = parseFloat(extractWarningMeta("market_gain")) || 0;
                    const periodEnd = extractWarningMeta("period_end");
                    const year = periodEnd ? periodEnd.split("/")[2] : statementDate.split("-")[0];
                    const planName = extractWarningMeta("plan_name") || "401(k)";

                    const rows = [
                      { label: "Year", value: year },
                      { label: "Plan", value: planName },
                      { label: "Beginning Balance", value: formatCurrency(acct?.beginning_value ?? 0) },
                      { label: "Your Contributions", value: formatCurrency(yourC), color: "text-blue-600" },
                      { label: "Employer Contributions", value: formatCurrency(emplC), color: "text-green-600" },
                      { label: "Market Gain", value: `${mktGain >= 0 ? "+" : ""}${formatCurrency(mktGain)}`, color: mktGain >= 0 ? "text-emerald-600" : "text-red-500" },
                      { label: "Ending Balance", value: formatCurrency(acct?.ending_value ?? acct?.total_value ?? 0), bold: true },
                    ];

                    return (
                      <div className="space-y-2">
                        {rows.map((r) => (
                          <div key={r.label} className={cn("flex items-center justify-between py-1.5 text-sm", r.bold && "border-t pt-3 mt-2")}>
                            <span className="text-muted-foreground">{r.label}</span>
                            <span className={cn("tabular-nums font-medium", r.color, r.bold && "text-lg font-bold")}>{r.value}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  <div className="flex gap-3 pt-2">
                    <Button variant="outline" onClick={handleReset}>Cancel</Button>
                    <Button
                      onClick={handleRetirementCommit}
                      disabled={state === "committing"}
                      className="bg-purple-600 hover:bg-purple-700"
                    >
                      {state === "committing" ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                      ) : (
                        <><CheckCircle2 className="mr-2 h-4 w-4" /> Save to Retirement Tracker</>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {parseResult && (state === "dry_run" || state === "committing") && !isAnnualStatement && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Review Parsed Data</CardTitle>
                  <CardDescription>
                    {parseResult.accounts.length} account{parseResult.accounts.length !== 1 ? "s" : ""} found
                    {" \u00b7 "}{totalHoldings} holdings{" \u00b7 "}{formatCurrency(totalValue)} total
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <DryRunResults
                    data={parseResult}
                    tickerOverrides={tickerOverrides}
                    tickerMapLookup={tickerMapLookup}
                    trackingModes={trackingModes}
                    aggregateCategories={aggregateCategories}
                    onTickerCategorize={handleTickerCategorize}
                    onTrackingModeChange={handleTrackingModeChange}
                    onAggregateCategoryChange={handleAggregateCategoryChange}
                  />
                </CardContent>
              </Card>

              {/* ── STEP 3: COMMIT ── */}
              {(() => {
                const uncategorizedAggregates = parseResult.accounts.filter((a, idx) => {
                  const key = a.account_number || a.account_number_masked || `account-${idx}`;
                  return trackingModes[key] === "aggregate" && !aggregateCategories[key];
                });
                const detailedWithNoHoldings = parseResult.accounts.filter((a, idx) => {
                  const key = a.account_number || a.account_number_masked || `account-${idx}`;
                  const mode = trackingModes[key] || "detailed";
                  return mode === "detailed" && a.holdings.length === 0;
                });
                const hasUncategorizedAggregates = uncategorizedAggregates.length > 0;
                const hasEmptyDetailed = detailedWithNoHoldings.length > 0;
                const commitBlocked = hasUncategorizedAggregates || hasEmptyDetailed;

                return (
                  <Card className={commitBlocked ? "border-amber-300 dark:border-amber-700" : ""}>
                    <CardHeader>
                      <CardTitle className="text-base">Encrypt & Commit</CardTitle>
                      <CardDescription>PII will be encrypted. Snapshots will be rebuilt.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {hasUncategorizedAggregates && (
                        <Alert variant="destructive" className="border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 [&>svg]:text-amber-600">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertDescription>
                            {uncategorizedAggregates.length} aggregate account{uncategorizedAggregates.length > 1 ? "s" : ""} must be categorized before committing.
                            Scroll up and assign a category to each aggregate account.
                          </AlertDescription>
                        </Alert>
                      )}
                      {hasEmptyDetailed && (
                        <Alert variant="destructive" className="border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 [&>svg]:text-amber-600">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertDescription>
                            {detailedWithNoHoldings.length} account{detailedWithNoHoldings.length > 1 ? "s have" : " has"} 0 holdings but is set to Detailed tracking.
                            Switch {detailedWithNoHoldings.length > 1 ? "them" : "it"} to Aggregate and assign a category.
                          </AlertDescription>
                        </Alert>
                      )}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>
                            <strong className="text-foreground">{parseResult.accounts.filter((a) => (trackingModes[a.account_number || a.account_number_masked] || "detailed") === "detailed").length}</strong> accounts with detailed tracking
                          </span>
                          <CircleDot className="h-3 w-3" />
                          <span>
                            <strong className="text-foreground">{parseResult.accounts.filter((a) => trackingModes[a.account_number || a.account_number_masked] === "aggregate").length}</strong> accounts as aggregate
                          </span>
                        </div>
                        <div className="flex gap-3">
                          <Button variant="outline" onClick={handleReset}>Cancel</Button>
                          <Button
                            onClick={() => setCommitDialogOpen(true)}
                            disabled={commitBlocked}
                          >
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Encrypt & Commit
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}

              <CommitDialog
                data={parseResult}
                tickerOverridesCount={Object.keys(tickerOverrides).length}
                tickerOverrides={tickerOverrides}
                tickerMapLookup={tickerMapLookup}
                isCommitting={state === "committing"}
                onCommit={handleCommit}
                open={commitDialogOpen}
                onOpenChange={setCommitDialogOpen}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
