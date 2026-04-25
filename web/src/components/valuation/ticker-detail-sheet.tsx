"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart3,
  AlertCircle,
} from "lucide-react";
import { formatCurrency, formatPercent } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

interface TickerDetailSheetProps {
  ticker: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CLASSIFICATION_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; darkBg: string }
> = {
  deep_value: {
    label: "Deep Value",
    color: "text-emerald-700 dark:text-emerald-300",
    bg: "bg-emerald-100",
    darkBg: "dark:bg-emerald-900/50",
  },
  value: {
    label: "Value",
    color: "text-blue-700 dark:text-blue-300",
    bg: "bg-blue-100",
    darkBg: "dark:bg-blue-900/50",
  },
  fair: {
    label: "Fair",
    color: "text-gray-700 dark:text-gray-300",
    bg: "bg-gray-100",
    darkBg: "dark:bg-gray-800/50",
  },
  overvalued: {
    label: "Overvalued",
    color: "text-red-700 dark:text-red-300",
    bg: "bg-red-100",
    darkBg: "dark:bg-red-900/50",
  },
};

function formatLargeNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  if (abs >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return formatCurrency(value);
}

function formatGrowthRate(value: number | undefined): string {
  if (value === undefined || value === null) return "N/A";
  return formatPercent(value * 100);
}

function MarginOfSafetyBadge({ margin }: { margin: number }) {
  const isPositive = margin >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
        isPositive
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
          : "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300"
      )}
    >
      {isPositive ? (
        <TrendingUp className="h-3 w-3" />
      ) : (
        <TrendingDown className="h-3 w-3" />
      )}
      {margin.toFixed(1)}%
    </span>
  );
}

function ClassificationBadge({ classification }: { classification: string }) {
  const config = CLASSIFICATION_CONFIG[classification] ?? CLASSIFICATION_CONFIG.fair;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border-0 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        config.bg,
        config.darkBg,
        config.color
      )}
    >
      {config.label}
    </span>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 p-4">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="h-40 w-full" />
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    </div>
  );
}

const SCENARIO_ORDER = ["conservative", "moderate", "optimistic"] as const;

const SCENARIO_LABELS: Record<string, string> = {
  conservative: "Conservative",
  moderate: "Moderate",
  optimistic: "Optimistic",
};

const SCENARIO_COLORS: Record<string, string> = {
  conservative: "border-amber-500/30",
  moderate: "border-blue-500/30",
  optimistic: "border-emerald-500/30",
};

export function TickerDetailSheet({
  ticker,
  open,
  onOpenChange,
}: TickerDetailSheetProps) {
  const upperTicker = ticker.toUpperCase().trim();
  const valuations = useQuery(
    api.valuation.getValuation,
    open ? { ticker: upperTicker } : "skip"
  );
  const fundamentals = useQuery(
    api.valuation.getFundamentals,
    open ? { ticker: upperTicker } : "skip"
  );

  const isLoading = valuations === undefined || fundamentals === undefined;
  const hasValuation = valuations && valuations.length > 0;

  // Sort scenarios in canonical order
  const sortedScenarios = hasValuation
    ? [...valuations].sort(
        (a, b) =>
          SCENARIO_ORDER.indexOf(a.scenario as (typeof SCENARIO_ORDER)[number]) -
          SCENARIO_ORDER.indexOf(b.scenario as (typeof SCENARIO_ORDER)[number])
      )
    : [];

  // Get the market price from the first scenario (same across all)
  const marketPrice = sortedScenarios[0]?.marketPrice;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl lg:max-w-3xl"
      >
        <SheetHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <SheetTitle className="text-xl">{upperTicker}</SheetTitle>
              <SheetDescription>
                {marketPrice !== undefined
                  ? `Current Price: ${formatCurrency(marketPrice)}`
                  : "DCF Valuation Analysis"}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-8rem)] pr-1">
          <div className="space-y-6 p-4 pt-0">
            {isLoading ? (
              <LoadingSkeleton />
            ) : !hasValuation ? (
              <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                  <AlertCircle className="h-8 w-8 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                  <p className="text-base font-medium text-foreground">
                    No DCF valuation computed
                  </p>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Click &ldquo;Run DCF&rdquo; on the watchlist to analyze this
                    ticker.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* ── Fundamentals Section ── */}
                {fundamentals && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                        Fundamentals
                      </h3>
                    </div>

                    {/* Historical FCF Table */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">
                          Historical Free Cash Flow
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Year</TableHead>
                              <TableHead className="text-right">
                                Revenue
                              </TableHead>
                              <TableHead className="text-right">FCF</TableHead>
                              <TableHead className="text-right">
                                Net Income
                              </TableHead>
                              <TableHead className="text-right">
                                Op. Cash Flow
                              </TableHead>
                              <TableHead className="text-right">
                                CapEx
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {[...fundamentals.fcfHistory]
                              .sort((a, b) => b.year.localeCompare(a.year))
                              .map((row) => (
                                <TableRow key={row.year}>
                                  <TableCell className="font-medium">
                                    {row.year}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {formatLargeNumber(row.revenue)}
                                  </TableCell>
                                  <TableCell
                                    className={cn(
                                      "text-right tabular-nums font-medium",
                                      row.freeCashFlow >= 0
                                        ? "text-emerald-600 dark:text-emerald-400"
                                        : "text-red-600 dark:text-red-400"
                                    )}
                                  >
                                    {formatLargeNumber(row.freeCashFlow)}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {formatLargeNumber(row.netIncome)}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {formatLargeNumber(row.operatingCashFlow)}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {formatLargeNumber(
                                      row.capitalExpenditure
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>

                    {/* Growth Rates */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-lg border bg-card p-3 text-center">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Rev CAGR 3Y
                        </p>
                        <p className="mt-1 text-lg font-bold tabular-nums">
                          {formatGrowthRate(fundamentals.revenueGrowth3y)}
                        </p>
                      </div>
                      <div className="rounded-lg border bg-card p-3 text-center">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Rev CAGR 5Y
                        </p>
                        <p className="mt-1 text-lg font-bold tabular-nums">
                          {formatGrowthRate(fundamentals.revenueGrowth5y)}
                        </p>
                      </div>
                      <div className="rounded-lg border bg-card p-3 text-center">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          FCF CAGR 3Y
                        </p>
                        <p className="mt-1 text-lg font-bold tabular-nums">
                          {formatGrowthRate(fundamentals.fcfGrowth3y)}
                        </p>
                      </div>
                      <div className="rounded-lg border bg-card p-3 text-center">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          FCF CAGR 5Y
                        </p>
                        <p className="mt-1 text-lg font-bold tabular-nums">
                          {formatGrowthRate(fundamentals.fcfGrowth5y)}
                        </p>
                      </div>
                    </div>

                    <Separator />
                  </div>
                )}

                {/* ── DCF Valuation Section ── */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                      DCF Valuation
                    </h3>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    {sortedScenarios.map((scenario) => {
                      const classConfig =
                        CLASSIFICATION_CONFIG[scenario.classification] ??
                        CLASSIFICATION_CONFIG.fair;

                      return (
                        <Card
                          key={scenario.scenario}
                          className={cn(
                            "border-t-2 transition-shadow hover:shadow-md",
                            SCENARIO_COLORS[scenario.scenario] ??
                              "border-gray-500/30"
                          )}
                        >
                          <CardHeader className="pb-2">
                            <CardTitle className="text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              {SCENARIO_LABELS[scenario.scenario] ??
                                scenario.scenario}
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3 pt-0">
                            {/* Intrinsic Value */}
                            <div className="text-center">
                              <p className="text-2xl font-bold tabular-nums tracking-tight">
                                {formatCurrency(
                                  scenario.intrinsicValuePerShare
                                )}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                Intrinsic Value / Share
                              </p>
                            </div>

                            {/* Margin of Safety */}
                            <div className="flex flex-col items-center gap-1">
                              <MarginOfSafetyBadge
                                margin={scenario.marginOfSafety}
                              />
                              <p className="text-[10px] text-muted-foreground">
                                Margin of Safety
                              </p>
                            </div>

                            {/* Classification Badge */}
                            <div className="flex justify-center">
                              <ClassificationBadge
                                classification={scenario.classification}
                              />
                            </div>

                            <Separator />

                            {/* Details */}
                            <div className="space-y-1.5 text-xs">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  Growth Rate
                                </span>
                                <span className="font-medium tabular-nums">
                                  {(scenario.fcfGrowthRate * 100).toFixed(1)}%
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  WACC
                                </span>
                                <span className="font-medium tabular-nums">
                                  {(scenario.discountRate * 100).toFixed(2)}%
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  Terminal Growth
                                </span>
                                <span className="font-medium tabular-nums">
                                  {(scenario.terminalGrowthRate * 100).toFixed(
                                    1
                                  )}
                                  %
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  Base FCF
                                </span>
                                <span className="font-medium tabular-nums">
                                  {formatLargeNumber(scenario.baseFcf)}
                                </span>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
