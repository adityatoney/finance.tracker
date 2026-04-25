"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SectionHeader } from "@/components/layout/section-header";
import { formatCurrency, formatCurrencyDetailed } from "@/lib/utils/format";
import {
  Eye,
  Plus,
  RefreshCw,
  Trash2,
  Loader2,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  TrendingUp,
  TrendingDown,
  Clock,
  AlertCircle,
  Calculator,
  Shield,
  Info,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { TickerDetailSheet } from "@/components/valuation/ticker-detail-sheet";
import Link from "next/link";

type SortField = "ticker" | "name" | "price" | "changePct" | "change1m" | "change6m" | "change1y" | "change3y" | "change5y" | "pctInRange" | "marginOfSafety";
type SortDir = "asc" | "desc";
type FilterType = "all" | "gainers" | "losers" | "undervalued";

function ValuationBadge({ data }: { data: any }) {
  if (!data?.valuationClass) return <span className="text-muted-foreground text-xs">—</span>;

  // Skip/error states
  if (data.valuationClass === "etf_skip") {
    return <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">ETF Skipped</span>;
  }
  if (data.valuationClass === "restricted") {
    return <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400">Restricted</span>;
  }
  if (data.valuationClass === "rate_limited") {
    return <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium bg-orange-50 text-orange-600 dark:bg-orange-950 dark:text-orange-400">Rate Limited</span>;
  }
  if (data.valuationClass === "error") {
    return <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium bg-red-50 text-red-500 dark:bg-red-950 dark:text-red-400">Error</span>;
  }

  const colors: Record<string, string> = {
    deep_value: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    value: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
    fair: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
    overvalued: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  };
  const labels: Record<string, string> = {
    deep_value: "Deep Value",
    value: "Value",
    fair: "Fair",
    overvalued: "Overvalued",
  };
  const mos = data.marginOfSafety ?? 0;
  const isUnder = mos > 0;

  return (
    <div className="text-center space-y-0.5">
      <span className={cn("inline-block rounded-full px-2 py-0.5 text-[10px] font-medium", colors[data.valuationClass] || "bg-gray-100 text-gray-800")}>
        {labels[data.valuationClass] || data.valuationClass}
      </span>
      {data.intrinsicValue != null && data.intrinsicValue > 0 && (
        <>
          <p className="text-[9px] text-muted-foreground tabular-nums">
            Fair: ${data.intrinsicValue.toFixed(0)}
          </p>
          <p className={cn(
            "text-[9px] tabular-nums font-medium",
            isUnder ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"
          )}>
            {isUnder ? `${mos.toFixed(0)}% upside` : `${Math.abs(mos).toFixed(0)}% over`}
          </p>
        </>
      )}
    </div>
  );
}

function isMarketOpen(): boolean {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay();
  const hours = et.getHours();
  const minutes = et.getMinutes();
  const timeInMinutes = hours * 60 + minutes;
  // Mon–Fri, 9:30 AM – 4:00 PM ET
  return day >= 1 && day <= 5 && timeInMinutes >= 570 && timeInMinutes < 960;
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function ChangeBadge({ value, suffix = "%" }: { value: number | undefined | null; suffix?: string }) {
  if (value === undefined || value === null) return <span className="text-muted-foreground">—</span>;
  const isPositive = value >= 0;
  return (
    <span className={cn("tabular-nums text-xs font-medium", isPositive ? "text-emerald-600" : "text-red-500")}>
      {isPositive ? "+" : ""}{value.toFixed(2)}{suffix}
    </span>
  );
}

function RangeBar({ pct, low, high }: { pct: number | undefined | null; low?: number | null; high?: number | null }) {
  if (pct === undefined || pct === null) return <span className="text-muted-foreground text-xs">—</span>;
  const clamped = Math.max(0, Math.min(100, pct));
  // Color: red at 0%, yellow at 50%, green at 100%
  const hue = (clamped / 100) * 120; // 0=red, 60=yellow, 120=green
  return (
    <div className="space-y-0.5 min-w-[120px]">
      <div className="flex items-center justify-between text-[9px] text-muted-foreground tabular-nums">
        <span>{low ? `$${low.toFixed(0)}` : ""}</span>
        <span>{high ? `$${high.toFixed(0)}` : ""}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden relative">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${Math.max(clamped, 2)}%`,
            backgroundColor: `hsl(${hue}, 70%, 45%)`,
          }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground text-center tabular-nums">{clamped.toFixed(1)}%</p>
    </div>
  );
}

export default function WatchlistPage() {
  const watchlist = useQuery(api.watchlist.list);
  const addTicker = useMutation(api.watchlist.add);
  const removeTicker = useMutation(api.watchlist.remove);
  const refreshTickerAction = useAction(api.watchlist.refreshTicker);
  const refreshAllAction = useAction(api.watchlist.refreshAll);
  const calculateAllDcfAction = useAction(api.valuation.calculateAllDcf);
  const moatAnalyses = useQuery(api.moat.listAnalyses);

  const [newTicker, setNewTicker] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [sortField, setSortField] = useState<SortField>("ticker");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [loadingTickers, setLoadingTickers] = useState<Set<string>>(new Set());
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [runningDcf, setRunningDcf] = useState(false);
  const [detailTicker, setDetailTicker] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Build a map of moat analyses by ticker for badge display
  const moatByTicker = useMemo(() => {
    const map = new Map<string, { overallScore: number; moatType: string }>();
    if (moatAnalyses) {
      for (const a of moatAnalyses) {
        map.set(a.ticker, { overallScore: a.overallScore, moatType: a.moatType });
      }
    }
    return map;
  }, [moatAnalyses]);

  const handleRunDcf = async () => {
    setRunningDcf(true);
    setError(null);
    try {
      await calculateAllDcfAction({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run DCF");
    } finally {
      setRunningDcf(false);
    }
  };

  const marketOpen = isMarketOpen();

  const handleAdd = async () => {
    if (!newTicker.trim()) return;
    const tickerToAdd = newTicker.trim().toUpperCase();
    setError(null);
    try {
      // 1. Add to Convex watchlist
      await addTicker({ ticker: tickerToAdd });
      setNewTicker("");

      // 2. Auto-fetch data from Yahoo Finance
      setLoadingTickers((prev) => new Set(prev).add(tickerToAdd));
      try {
        await refreshTickerAction({ ticker: tickerToAdd });
      } catch (refreshErr) {
        setError(refreshErr instanceof Error ? refreshErr.message : `Could not fetch data for ${tickerToAdd}`);
      } finally {
        setLoadingTickers((prev) => {
          const next = new Set(prev);
          next.delete(tickerToAdd);
          return next;
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add ticker");
    }
  };

  const handleRemove = async (ticker: string) => {
    await removeTicker({ ticker });
  };

  const handleRefreshAll = async () => {
    setRefreshingAll(true);
    setError(null);
    try {
      const result = await refreshAllAction({});
      if (result.errors > 0) {
        setError(`Refreshed ${result.updated} tickers, ${result.errors} failed`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh");
    } finally {
      setRefreshingAll(false);
    }
  };

  const handleRefresh = async (ticker: string) => {
    setLoadingTickers((prev) => new Set(prev).add(ticker));
    setError(null);
    try {
      await refreshTickerAction({ ticker });
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to refresh ${ticker}`);
    } finally {
      setLoadingTickers((prev) => {
        const next = new Set(prev);
        next.delete(ticker);
        return next;
      });
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir(field === "ticker" || field === "name" ? "asc" : "desc");
    }
  };

  // Filter and sort
  const items = useMemo(() => {
    if (!watchlist) return [];
    let result = [...watchlist];

    // Search
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (w) => w.ticker.toLowerCase().includes(q) || (w.data?.name || "").toLowerCase().includes(q)
      );
    }

    // Filter
    if (filter === "gainers") result = result.filter((w) => (w.data?.changePct ?? 0) > 0);
    if (filter === "losers") result = result.filter((w) => (w.data?.changePct ?? 0) < 0);
    if (filter === "undervalued") result = result.filter((w) => (w.data?.marginOfSafety ?? -1) > 0);

    // Sort
    result.sort((a, b) => {
      let av: number | string = 0;
      let bv: number | string = 0;

      if (sortField === "ticker") { av = a.ticker; bv = b.ticker; }
      else if (sortField === "name") { av = a.data?.name || ""; bv = b.data?.name || ""; }
      else { av = (a.data as any)?.[sortField] ?? -Infinity; bv = (b.data as any)?.[sortField] ?? -Infinity; }

      let cmp = 0;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [watchlist, search, filter, sortField, sortDir]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-30" />;
    return sortDir === "asc" ? <ArrowUp className="ml-1 h-3 w-3" /> : <ArrowDown className="ml-1 h-3 w-3" />;
  };

  // Counts for filter pills
  const allCount = watchlist?.length ?? 0;
  const gainerCount = watchlist?.filter((w) => (w.data?.changePct ?? 0) > 0).length ?? 0;
  const loserCount = watchlist?.filter((w) => (w.data?.changePct ?? 0) < 0).length ?? 0;
  const undervaluedCount = watchlist?.filter((w) => (w.data?.marginOfSafety ?? -1) > 0).length ?? 0;

  // Latest update across all tickers
  const latestUpdate = useMemo(() => {
    if (!watchlist) return null;
    let latest = "";
    for (const w of watchlist) {
      if (w.data?.lastUpdated && w.data.lastUpdated > latest) latest = w.data.lastUpdated;
    }
    return latest || null;
  }, [watchlist]);

  if (watchlist === undefined) {
    return (
      <div className="space-y-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Eye className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Watchlist</h1>
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        </div>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const filterPills: { key: FilterType; label: string; count: number; icon?: typeof TrendingUp }[] = [
    { key: "all", label: "All", count: allCount },
    { key: "gainers", label: "Gainers", count: gainerCount, icon: TrendingUp },
    { key: "losers", label: "Losers", count: loserCount, icon: TrendingDown },
    { key: "undervalued", label: "Undervalued", count: undervaluedCount, icon: Calculator },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Eye className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Watchlist</h1>
            <p className="text-sm text-muted-foreground">
              Track stocks and ETFs · Yahoo Finance
              {!marketOpen && (
                <span className="ml-2 text-amber-600">· Market closed</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {latestUpdate && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatTimeAgo(latestUpdate)}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRunDcf}
            disabled={runningDcf || allCount === 0}
            title="Run DCF valuation on all tickers"
          >
            {runningDcf ? (
              <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Running DCF...</>
            ) : (
              <><Calculator className="mr-1.5 h-3.5 w-3.5" /> Run DCF</>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshAll}
            disabled={refreshingAll || allCount === 0}
            title={!marketOpen ? "Market closed — showing cached data" : "Refresh all tickers"}
          >
            {refreshingAll ? (
              <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Refreshing...</>
            ) : (
              <><RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh All</>
            )}
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg px-4 py-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Add ticker */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex gap-3">
            <Input
              value={newTicker}
              onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="Enter ticker symbol (e.g., MSFT, NVDA, BRK.B)"
              className="max-w-xs font-mono"
            />
            <Button onClick={handleAdd} disabled={!newTicker.trim()}>
              <Plus className="mr-1.5 h-4 w-4" /> Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {allCount === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-20">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
              <Eye className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="text-lg font-semibold">No tickers yet</p>
            <p className="text-sm text-muted-foreground mt-1">Add a stock or ETF ticker above to start tracking.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Filter pills */}
          <div className="flex flex-wrap items-center gap-2">
            {filterPills.map((pill) => {
              const isActive = filter === pill.key;
              const Icon = pill.icon;
              return (
                <button
                  key={pill.key}
                  onClick={() => setFilter(pill.key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
                    isActive
                      ? "border-foreground/20 bg-foreground text-background font-medium"
                      : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  {Icon && <Icon className="h-3 w-3" />}
                  {pill.label}
                  <span className={cn("text-xs tabular-nums", isActive ? "opacity-80" : "opacity-50")}>
                    {pill.count}
                  </span>
                </button>
              );
            })}

            <div className="relative ml-auto max-w-xs flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="pl-9 h-9"
              />
            </div>
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>
                      <button onClick={() => handleSort("ticker")} className="inline-flex items-center text-xs font-semibold uppercase tracking-wider whitespace-nowrap">
                        Ticker <SortIcon field="ticker" />
                      </button>
                    </TableHead>
                    <TableHead>
                      <button onClick={() => handleSort("name")} className="inline-flex items-center text-xs font-semibold uppercase tracking-wider whitespace-nowrap">
                        Name <SortIcon field="name" />
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button onClick={() => handleSort("price")} className="inline-flex items-center text-xs font-semibold uppercase tracking-wider whitespace-nowrap ml-auto">
                        Price <SortIcon field="price" />
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button onClick={() => handleSort("changePct")} className="inline-flex items-center text-xs font-semibold uppercase tracking-wider whitespace-nowrap ml-auto">
                        1D <SortIcon field="changePct" />
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button onClick={() => handleSort("change1m")} className="inline-flex items-center text-xs font-semibold uppercase tracking-wider whitespace-nowrap ml-auto">
                        1M <SortIcon field="change1m" />
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button onClick={() => handleSort("change6m")} className="inline-flex items-center text-xs font-semibold uppercase tracking-wider whitespace-nowrap ml-auto">
                        6M <SortIcon field="change6m" />
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button onClick={() => handleSort("change1y")} className="inline-flex items-center text-xs font-semibold uppercase tracking-wider whitespace-nowrap ml-auto">
                        1Y <SortIcon field="change1y" />
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button onClick={() => handleSort("change3y")} className="inline-flex items-center text-xs font-semibold uppercase tracking-wider whitespace-nowrap ml-auto">
                        3Y <SortIcon field="change3y" />
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button onClick={() => handleSort("change5y")} className="inline-flex items-center text-xs font-semibold uppercase tracking-wider whitespace-nowrap ml-auto">
                        5Y <SortIcon field="change5y" />
                      </button>
                    </TableHead>
                    <TableHead>
                      <button onClick={() => handleSort("pctInRange")} className="inline-flex items-center text-xs font-semibold uppercase tracking-wider whitespace-nowrap">
                        52W Range <SortIcon field="pctInRange" />
                      </button>
                    </TableHead>
                    <TableHead className="text-center">
                      <div className="inline-flex items-center gap-1">
                        <button onClick={() => handleSort("marginOfSafety")} className="inline-flex items-center text-xs font-semibold uppercase tracking-wider whitespace-nowrap">
                          Valuation <SortIcon field="marginOfSafety" />
                        </button>
                        <Popover>
                          <PopoverTrigger className="text-muted-foreground hover:text-foreground transition-colors">
                            <Info className="h-3.5 w-3.5" />
                          </PopoverTrigger>
                          <PopoverContent className="w-80 text-left text-xs" side="bottom" align="center">
                            <p className="font-semibold text-sm mb-2">Valuation Legend</p>
                            <p className="text-muted-foreground mb-3">
                              Based on a <span className="font-medium text-foreground">Discounted Cash Flow (DCF)</span> model using 5 years of financial data from FMP.
                            </p>
                            <div className="space-y-1.5 mb-3">
                              <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wider">Ratings</p>
                              <div className="flex items-center gap-2">
                                <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 shrink-0">Deep Value</span>
                                <span className="text-muted-foreground">&gt; 40% upside — significantly underpriced</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 shrink-0">Value</span>
                                <span className="text-muted-foreground">20–40% upside — moderately underpriced</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 shrink-0">Fair</span>
                                <span className="text-muted-foreground">0–20% upside — roughly fair value</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 shrink-0">Overvalued</span>
                                <span className="text-muted-foreground">X% over — priced above fair value</span>
                              </div>
                            </div>
                            <div className="space-y-1.5 mb-3">
                              <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wider">Status</p>
                              <div className="flex items-center gap-2">
                                <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 shrink-0">ETF Skipped</span>
                                <span className="text-muted-foreground">ETFs/funds have no individual financials</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400 shrink-0">Restricted</span>
                                <span className="text-muted-foreground">Ticker not available on FMP free tier</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium bg-orange-50 text-orange-600 dark:bg-orange-950 dark:text-orange-400 shrink-0">Rate Limited</span>
                                <span className="text-muted-foreground">API rate limit hit — retry later</span>
                              </div>
                            </div>
                            <div className="border-t pt-2 space-y-1">
                              <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wider">Metrics</p>
                              <p><span className="font-medium text-foreground">Fair</span> <span className="text-muted-foreground">— estimated fair price per share based on discounted future cash flows</span></p>
                              <p><span className="font-medium text-emerald-600">X% upside</span> <span className="text-muted-foreground">— current price is below fair value (potential buy)</span></p>
                              <p><span className="font-medium text-red-500">X% over</span> <span className="text-muted-foreground">— current price exceeds fair value (potentially overpriced)</span></p>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </TableHead>
                    <TableHead className="text-center text-xs font-semibold uppercase tracking-wider">
                      Moat
                    </TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((w) => {
                    const d = w.data;
                    const isLoading = loadingTickers.has(w.ticker);
                    return (
                      <TableRow key={w._id} className="group">
                        <TableCell className="py-3">
                          <span className="inline-block rounded bg-muted/60 px-2 py-0.5 font-mono text-sm font-semibold">
                            {w.ticker.includes(":") ? w.ticker.split(":").pop() : w.ticker}
                          </span>
                        </TableCell>
                        <TableCell className="py-3 text-muted-foreground max-w-[200px] truncate">
                          {d?.name || "—"}
                          {d?.sector && (
                            <span className="block text-[10px] text-muted-foreground/60">{d.sector}</span>
                          )}
                        </TableCell>
                        <TableCell className="py-3 text-right tabular-nums font-medium">
                          {d?.price ? formatCurrencyDetailed(d.price) : "—"}
                        </TableCell>
                        <TableCell className="py-3 text-right">
                          {d?.change !== undefined && d?.changePct !== undefined ? (
                            <div>
                              <ChangeBadge value={d.changePct} />
                              <span className="block text-[10px] text-muted-foreground tabular-nums">
                                {d.change >= 0 ? "+" : ""}{d.change.toFixed(2)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="py-3 text-right"><ChangeBadge value={d?.change1m} /></TableCell>
                        <TableCell className="py-3 text-right"><ChangeBadge value={d?.change6m} /></TableCell>
                        <TableCell className="py-3 text-right"><ChangeBadge value={d?.change1y} /></TableCell>
                        <TableCell className="py-3 text-right"><ChangeBadge value={d?.change3y} /></TableCell>
                        <TableCell className="py-3 text-right"><ChangeBadge value={d?.change5y} /></TableCell>
                        <TableCell className="py-3">
                          <RangeBar pct={d?.pctInRange} low={d?.low52w} high={d?.high52w} />
                        </TableCell>
                        <TableCell className="py-3 text-center">
                          <button onClick={() => setDetailTicker(w.ticker)} className="hover:opacity-80 transition-opacity">
                            <ValuationBadge data={d} />
                          </button>
                        </TableCell>
                        <TableCell className="py-3 text-center">
                          {moatByTicker.has(w.ticker) ? (
                            <Link href={`/moat?ticker=${w.ticker}`}>
                              <span className={cn(
                                "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium",
                                moatByTicker.get(w.ticker)!.moatType === "wide" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" :
                                moatByTicker.get(w.ticker)!.moatType === "narrow" ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" :
                                "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                              )}>
                                {Math.round(moatByTicker.get(w.ticker)!.overallScore)}
                              </span>
                            </Link>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => handleRefresh(w.ticker)}
                              disabled={isLoading}
                              title="Refresh data"
                            >
                              {isLoading ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              onClick={() => handleRemove(w.ticker)}
                              title="Remove from watchlist"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          {d?.lastUpdated && (
                            <p className="text-[9px] text-muted-foreground/50 text-right mt-0.5">
                              {formatTimeAgo(d.lastUpdated)}
                            </p>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={13} className="py-12 text-center text-sm text-muted-foreground">
                        No tickers match your filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {/* Ticker Detail Sheet */}
      <TickerDetailSheet
        ticker={detailTicker ?? ""}
        open={detailTicker !== null}
        onOpenChange={(open) => { if (!open) setDetailTicker(null); }}
      />
    </div>
  );
}
