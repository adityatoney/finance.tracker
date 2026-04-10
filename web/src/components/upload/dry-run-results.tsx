"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { CategoryDistributionBar } from "@/components/upload/category-distribution-bar";
import { cn } from "@/lib/utils";
import type { ParseResult, AssetCategory, TrackingMode } from "@/lib/types";
import { CATEGORIES, CATEGORY_ORDER } from "@/lib/constants/categories";
import { formatCurrencyDetailed, formatCurrency } from "@/lib/utils/format";
import {
  AlertTriangle,
  Shield,
  ChevronDown,
  Layers,
  List,
  Wallet,
  Eye,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { useState } from "react";

interface DryRunResultsProps {
  data: ParseResult;
  tickerOverrides: Record<string, string>;
  tickerMapLookup: Record<string, string>;
  trackingModes: Record<string, TrackingMode>;
  aggregateCategories: Record<string, string>;
  onTickerCategorize: (ticker: string, category: AssetCategory) => void;
  onTrackingModeChange: (accountKey: string, mode: TrackingMode) => void;
  onAggregateCategoryChange: (accountKey: string, category: AssetCategory) => void;
}

export function DryRunResults({
  data,
  tickerOverrides,
  tickerMapLookup,
  trackingModes,
  aggregateCategories,
  onTickerCategorize,
  onTrackingModeChange,
  onAggregateCategoryChange,
}: DryRunResultsProps) {
  const [rawTextOpen, setRawTextOpen] = useState(false);
  const allAccountKeys = data.accounts.map((_, i) => `account-${i}`);
  const [expandedAccounts, setExpandedAccounts] = useState<string[]>(allAccountKeys);
  const allExpanded = expandedAccounts.length === allAccountKeys.length;

  return (
    <div className="space-y-4">
      {/* Warnings (filter out internal metadata keys) */}
      {(() => {
        const internalPrefixes = ["file_hash:", "period_start:", "period_end:", "period_days:", "annual_statement:", "plan_name:", "your_contributions:", "employer_contributions:", "market_gain:", "vested_balance:"];
        const visibleWarnings = data.warnings.filter((w) => !internalPrefixes.some((p) => w.startsWith(p)));
        return visibleWarnings.length > 0 ? (
          <div className="space-y-2">
            {visibleWarnings.map((warning, i) => (
              <Alert key={i} className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-sm">{warning}</AlertDescription>
              </Alert>
            ))}
          </div>
        ) : null;
      })()}

      {/* PII notice */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2">
        <Shield className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
        Account numbers and owner names will be encrypted (Fernet AES) before database storage.
      </div>

      {/* Expand / Collapse all */}
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground h-7"
          onClick={() => setExpandedAccounts(allExpanded ? [] : allAccountKeys)}
        >
          <ChevronDown className={cn("h-3.5 w-3.5 mr-1 transition-transform", allExpanded ? "rotate-180" : "")} />
          {allExpanded ? "Collapse All" : "Expand All"}
        </Button>
      </div>

      {/* Per-account breakdown */}
      <Accordion multiple value={expandedAccounts} onValueChange={setExpandedAccounts} className="space-y-3">
        {data.accounts.map((account, idx) => {
          const accountKey = account.account_number || account.account_number_masked || `account-${idx}`;
          const mode = trackingModes[accountKey] || "detailed";
          const isAggregate = mode === "aggregate";
          const acctLabel = account.account_type || "Account";
          const acctId = account.account_number_masked || account.account_number || `#${idx + 1}`;

          // ── Verification: compare Section 1 ending value vs Section 2 holdings sum ──
          const holdingsEndSum = account.holdings.reduce(
            (sum, h) => sum + (h.ending_value ?? h.market_value), 0
          );
          const section1Ending = account.ending_value ?? account.total_value;
          const diff = Math.abs(section1Ending - holdingsEndSum);
          // Allow $0.02 tolerance for rounding
          const isVerified = diff < 0.02;
          const hasHoldings = account.holdings.length > 0;

          return (
            <AccordionItem
              key={idx}
              value={`account-${idx}`}
              className={`border rounded-lg px-0 overflow-hidden ${!isVerified && hasHoldings ? "border-amber-300 dark:border-amber-800" : ""}`}
            >
              <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30 [&[data-state=open]]:bg-muted/20">
                <div className="flex items-center gap-3 flex-1 text-left">
                  <Wallet className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{acctLabel}</span>
                      <Badge variant="outline" className="font-mono text-[10px]">{acctId}</Badge>
                      {isAggregate && (
                        <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-0 text-[10px]">
                          Aggregate
                        </Badge>
                      )}
                      {/* Verification badge */}
                      {hasHoldings && (
                        isVerified ? (
                          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 border-0 text-[10px] gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Verified
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 border-0 text-[10px] gap-1">
                            <XCircle className="h-3 w-3" />
                            Mismatch {formatCurrencyDetailed(diff)}
                          </Badge>
                        )
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      <span>{account.holdings.length} holding{account.holdings.length !== 1 ? "s" : ""}</span>
                      {account.beginning_value != null && account.ending_value != null ? (
                        <>
                          <span>{formatCurrency(account.beginning_value)}</span>
                          <span>→</span>
                          <span className="font-medium text-foreground">{formatCurrency(account.ending_value)}</span>
                          {account.change_in_investment != null && (
                            <span className={account.change_in_investment >= 0 ? "text-emerald-600 font-medium" : "text-red-500 font-medium"} title="Market gain (excludes contributions)">
                              Mkt {account.change_in_investment >= 0 ? "+" : ""}{formatCurrency(account.change_in_investment)}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="font-medium text-foreground">{formatCurrency(account.total_value)}</span>
                      )}
                    </div>
                  </div>
                </div>
              </AccordionTrigger>

              <AccordionContent className="px-4 pb-4">
                {/* Tracking mode toggle */}
                <div className="flex items-center justify-between py-3 border-b mb-3">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-medium">Tracking Mode</Label>
                    <p className="text-[11px] text-muted-foreground max-w-md">
                      {isAggregate
                        ? "Track only the total account value — individual holdings won't be stored."
                        : "Track each individual holding within this account."}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-muted-foreground">Aggregate</span>
                    <Switch
                      checked={!isAggregate}
                      onCheckedChange={(checked) =>
                        onTrackingModeChange(accountKey, checked ? "detailed" : "aggregate")
                      }
                    />
                    <span className="text-[10px] text-muted-foreground">Detailed</span>
                  </div>
                </div>

                {/* Aggregate info box with category selector */}
                {isAggregate && (
                  <div className="rounded-md bg-muted/30 p-4 mb-3">
                    <div className="flex items-start gap-3">
                      <Layers className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="flex-1 space-y-2">
                        <p className="text-sm font-medium">Aggregate Tracking</p>
                        <p className="text-xs text-muted-foreground">
                          Stored as a single position worth{" "}
                          <strong>{formatCurrency(account.total_value)}</strong>.
                        </p>
                        <div className="flex items-center gap-2 pt-1">
                          <span className="text-xs text-muted-foreground">Category:</span>
                          <Select
                            value={aggregateCategories[accountKey] || ""}
                            onValueChange={(val) => {
                              if (val) onAggregateCategoryChange(accountKey, String(val) as AssetCategory);
                            }}
                          >
                            <SelectTrigger className="h-7 w-[160px] text-xs">
                              <SelectValue placeholder="Select category">
                                {(selectedValue: unknown) => {
                                  const val = String(selectedValue || "");
                                  const meta = val ? CATEGORIES[val as AssetCategory] : null;
                                  return meta ? (
                                    <span className="inline-flex items-center gap-1.5">
                                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
                                      {meta.label}
                                    </span>
                                  ) : (
                                    "Select category"
                                  );
                                }}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {CATEGORY_ORDER.map((cat) => (
                                <SelectItem key={cat} value={cat} className="text-xs">
                                  <span className="inline-flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: CATEGORIES[cat].color }} />
                                    {CATEGORIES[cat].label}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Category distribution bar */}
                {hasHoldings && (
                  <CategoryDistributionBar
                    holdings={account.holdings}
                    tickerOverrides={tickerOverrides}
                    className="mb-4"
                  />
                )}

                {/* Holdings table */}
                <div className={isAggregate ? "opacity-40" : ""}>
                  <ScrollArea className={account.holdings.length > 8 ? "h-[320px]" : ""}>
                    <Table>
                      <TableHeader>
                        <TableRow className="text-xs">
                          <TableHead className="h-8">Ticker</TableHead>
                          <TableHead className="h-8">Name</TableHead>
                          <TableHead className="h-8">Category</TableHead>
                          <TableHead className="h-8 text-right">Qty</TableHead>
                          <TableHead className="h-8 text-right">Price</TableHead>
                          <TableHead className="h-8 text-right">Begin</TableHead>
                          <TableHead className="h-8 text-right">End</TableHead>
                          <TableHead className="h-8 text-right">Cost Basis</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {account.holdings.map((h, hIdx) => {
                          // Resolve category: user override → ticker map → parsed category → null
                          const resolvedCat = tickerOverrides[h.ticker] || tickerMapLookup[h.ticker.toUpperCase()] || h.category;
                          const catMeta = resolvedCat ? CATEGORIES[resolvedCat as AssetCategory] : null;
                          const isUnmapped = !resolvedCat;
                          return (
                            <TableRow key={hIdx} className={`text-xs ${isUnmapped ? "bg-amber-50/50 dark:bg-amber-950/10" : ""}`}>
                              <TableCell className="font-mono font-semibold py-1.5">{h.ticker}</TableCell>
                              <TableCell className="text-muted-foreground py-1.5 max-w-[180px] truncate">
                                {h.name}
                              </TableCell>
                              <TableCell className="py-1.5">
                                <Select
                                  value={resolvedCat || ""}
                                  onValueChange={(val) => {
                                    if (val) onTickerCategorize(h.ticker, String(val) as AssetCategory);
                                  }}
                                >
                                  <SelectTrigger
                                    className={cn(
                                      "h-6 w-[130px] text-[10px] shadow-none",
                                      isUnmapped
                                        ? "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30"
                                        : "border-0 bg-transparent px-0 hover:bg-muted/50 focus:ring-0"
                                    )}
                                  >
                                    <SelectValue placeholder="Categorize...">
                                      {(selectedValue: unknown) => {
                                        const val = String(selectedValue || resolvedCat || "");
                                        const meta = val ? CATEGORIES[val as AssetCategory] : null;
                                        return meta ? (
                                          <span className="inline-flex items-center gap-1">
                                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
                                            {meta.label}
                                          </span>
                                        ) : (
                                          <span className="text-amber-500">Categorize...</span>
                                        );
                                      }}
                                    </SelectValue>
                                  </SelectTrigger>
                                  <SelectContent>
                                    {CATEGORY_ORDER.map((cat) => (
                                      <SelectItem key={cat} value={cat} className="text-xs">
                                        <span className="inline-flex items-center gap-1.5">
                                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: CATEGORIES[cat].color }} />
                                          {CATEGORIES[cat].label}
                                        </span>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell className="text-right py-1.5 tabular-nums">
                                {h.quantity ? h.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 }) : "—"}
                              </TableCell>
                              <TableCell className="text-right py-1.5 tabular-nums">
                                {h.price ? formatCurrencyDetailed(h.price) : "—"}
                              </TableCell>
                              <TableCell className="text-right py-1.5 tabular-nums text-muted-foreground">
                                {h.beginning_value != null ? formatCurrencyDetailed(h.beginning_value) : "—"}
                              </TableCell>
                              <TableCell className="text-right py-1.5 tabular-nums font-medium">
                                {h.ending_value != null ? formatCurrencyDetailed(h.ending_value) : formatCurrencyDetailed(h.market_value)}
                              </TableCell>
                              <TableCell className="text-right py-1.5 tabular-nums text-muted-foreground">
                                {h.cost_basis != null ? formatCurrencyDetailed(h.cost_basis) : "—"}
                              </TableCell>
                            </TableRow>
                          );
                        })}

                        {/* ── Verification footer ── */}
                        {hasHoldings && (
                          <>
                            {/* Holdings sum row */}
                            <TableRow className="text-xs border-t-2 bg-muted/20">
                              <TableCell className="py-2 font-semibold" colSpan={5}>
                                Holdings Total (Section 2)
                              </TableCell>
                              <TableCell className="text-right py-2 tabular-nums font-medium text-muted-foreground">
                                {formatCurrencyDetailed(
                                  account.holdings.reduce((s, h) => s + (h.beginning_value ?? 0), 0)
                                )}
                              </TableCell>
                              <TableCell className="text-right py-2 tabular-nums font-bold">
                                {formatCurrencyDetailed(holdingsEndSum)}
                              </TableCell>
                              <TableCell className="text-right py-2 tabular-nums text-muted-foreground">
                                {formatCurrencyDetailed(
                                  account.holdings.reduce((s, h) => s + (h.cost_basis ?? 0), 0)
                                )}
                              </TableCell>
                            </TableRow>

                            {/* Section 1 stated value row */}
                            <TableRow className="text-xs bg-muted/20">
                              <TableCell className="py-2 font-semibold" colSpan={5}>
                                Account Total (Section 1)
                              </TableCell>
                              <TableCell className="text-right py-2 tabular-nums font-medium text-muted-foreground">
                                {account.beginning_value != null ? formatCurrencyDetailed(account.beginning_value) : "—"}
                              </TableCell>
                              <TableCell className="text-right py-2 tabular-nums font-bold">
                                {formatCurrencyDetailed(section1Ending)}
                              </TableCell>
                              <TableCell />
                            </TableRow>

                            {/* Verification result row */}
                            <TableRow className={`text-xs ${isVerified ? "bg-emerald-50 dark:bg-emerald-950/20" : "bg-amber-50 dark:bg-amber-950/20"}`}>
                              <TableCell colSpan={6} className="py-2">
                                <div className="flex items-center gap-2">
                                  {isVerified ? (
                                    <>
                                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                      <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                                        Verified — totals match
                                      </span>
                                    </>
                                  ) : (
                                    <>
                                      <XCircle className="h-3.5 w-3.5 text-amber-600" />
                                      <span className="text-amber-700 dark:text-amber-400 font-medium">
                                        Mismatch — difference of {formatCurrencyDetailed(diff)}. Please verify manually.
                                      </span>
                                    </>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right py-2 tabular-nums font-bold">
                                {isVerified ? (
                                  <span className="text-emerald-600">✓</span>
                                ) : (
                                  <span className="text-amber-600 font-mono">{diff > 0 ? "Δ " : ""}{formatCurrencyDetailed(diff)}</span>
                                )}
                              </TableCell>
                              <TableCell />
                            </TableRow>
                          </>
                        )}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      {/* Raw text collapsible */}
      <Collapsible open={rawTextOpen} onOpenChange={setRawTextOpen}>
        <CollapsibleTrigger className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-md hover:bg-muted/50">
          <Eye className="h-3.5 w-3.5" />
          {rawTextOpen ? "Hide" : "Show"} raw extracted text
          <ChevronDown className={`h-3 w-3 transition-transform ${rawTextOpen ? "rotate-180" : ""}`} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="mt-2">
            <CardContent className="pt-4">
              <ScrollArea className="h-[300px]">
                <pre className="text-[11px] font-mono whitespace-pre-wrap text-muted-foreground leading-relaxed">
                  {data.raw_text_preview || "No text extracted"}
                </pre>
              </ScrollArea>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
