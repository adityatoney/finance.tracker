"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CategoryAreaChart } from "@/components/charts/category-area-chart";
import { AllocationDonutChart } from "@/components/charts/allocation-donut-chart";
import { SectionHeader } from "@/components/layout/section-header";
import { CATEGORIES, CATEGORY_ORDER } from "@/lib/constants/categories";
import type { StackedAreaDataPoint, AllocationSlice, AssetCategory } from "@/lib/types";
import { formatCurrency, formatMonth } from "@/lib/utils/format";
import {
  LayoutDashboard,
  TrendingUp,
  TrendingDown,
  PieChart,
  Upload,
  ArrowRight,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Mountain,
  BarChart3,
  Briefcase,
  Target,
  CalendarDays,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

function DashboardSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="h-10 w-10 rounded-lg bg-muted" />
        <div className="space-y-2">
          <div className="h-6 w-40 rounded bg-muted" />
          <div className="h-4 w-72 rounded bg-muted" />
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 rounded-lg bg-muted" />
        ))}
      </div>
      <div className="h-96 rounded-lg bg-muted" />
    </div>
  );
}

// ── Small stat card component ──
function StatCard({
  label,
  value,
  subValue,
  icon: Icon,
  trend,
  className,
}: {
  label: string;
  value: string;
  subValue?: string;
  icon: any;
  trend?: "up" | "down" | "neutral";
  className?: string;
}) {
  return (
    <Card className={cn("relative overflow-hidden hover:shadow-sm transition-shadow", className)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <div className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full",
            trend === "up" ? "bg-emerald-100 dark:bg-emerald-900/30" :
            trend === "down" ? "bg-red-100 dark:bg-red-900/30" :
            "bg-muted"
          )}>
            <Icon className={cn(
              "h-3.5 w-3.5",
              trend === "up" ? "text-emerald-600 dark:text-emerald-400" :
              trend === "down" ? "text-red-500 dark:text-red-400" :
              "text-muted-foreground"
            )} />
          </div>
        </div>
        <p className="mt-1.5 text-2xl font-bold tracking-tight tabular-nums">{value}</p>
        {subValue && (
          <p className={cn(
            "mt-0.5 text-xs tabular-nums",
            trend === "up" ? "text-emerald-600 dark:text-emerald-400" :
            trend === "down" ? "text-red-500 dark:text-red-400" :
            "text-muted-foreground"
          )}>
            {subValue}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const snapshots = useQuery(api.snapshots.list);
  const statements = useQuery(api.statements.list);
  const depositsByMonth = useQuery(api.snapshots.depositsByMonth);
  const latestMonth = useQuery(api.holdings.getLatestMonth);
  const latestHoldings = useQuery(
    api.holdings.listForMonth,
    latestMonth ? { month: latestMonth } : "skip"
  );
  const portfolioTwr = useQuery(api.twr.getTwr, { scope: "portfolio" });

  // MoM table sort
  const [momSortDir, setMomSortDir] = useState<"asc" | "desc">("desc");

  if (snapshots === undefined || statements === undefined || depositsByMonth === undefined) {
    return <DashboardSkeleton />;
  }

  // ── Compute month-level aggregates ──
  const months = [...new Set(snapshots.map((s) => s.month))].sort();
  const currentMonth = months[months.length - 1] ?? null;
  const prevMonth = months[months.length - 2] ?? null;

  // Deposits per month come from the deposits TABLE (filtered to exclude employer contributions)
  // via the depositsByMonth Convex query — this is the source of truth, not snapshot netDeposits.
  const monthTotals = new Map<string, { total: number; deposits: number; gain: number }>();
  for (const s of snapshots) {
    if (!monthTotals.has(s.month)) monthTotals.set(s.month, { total: 0, deposits: 0, gain: 0 });
    const m = monthTotals.get(s.month)!;
    m.total += s.totalValue;
    m.gain += s.marketGain;
  }
  // Set deposits from the filtered deposits query (YOUR contributions only)
  for (const [month, amount] of Object.entries(depositsByMonth)) {
    if (monthTotals.has(month)) {
      monthTotals.get(month)!.deposits = amount;
    } else {
      monthTotals.set(month, { total: 0, deposits: amount, gain: 0 });
    }
  }

  const current = monthTotals.get(currentMonth ?? "") ?? { total: 0, deposits: 0, gain: 0 };
  const prev = monthTotals.get(prevMonth ?? "") ?? { total: 0, deposits: 0, gain: 0 };

  // ── KPI Stats ──
  const totalPortfolio = current.total;
  const momChange = current.total - prev.total;
  const momPct = prev.total > 0 ? (momChange / prev.total) * 100 : 0;
  const momTrend = momChange >= 0 ? "up" as const : "down" as const;

  // Peak and drawdown
  const allTotals = Array.from(monthTotals.values()).map((m) => m.total);
  const peakValue = Math.max(...allTotals, 0);
  const peakMonth = months.find((m) => (monthTotals.get(m)?.total ?? 0) === peakValue) ?? "";
  const drawdown = totalPortfolio - peakValue;
  const drawdownPct = peakValue > 0 ? (drawdown / peakValue) * 100 : 0;

  // All-time market gain
  const allTimeGain = Array.from(monthTotals.values()).reduce((s, m) => s + m.gain, 0);
  // Exclude first month's "gain" which is just the initial portfolio value
  const firstMonthGain = monthTotals.get(months[0] ?? "")?.gain ?? 0;
  const realMarketGain = allTimeGain - firstMonthGain;

  // Holdings stats
  const holdingsList = latestHoldings ?? [];
  const detailedHoldings = holdingsList.filter((h) => !h.ticker.startsWith("ACCT:") && !h.ticker.startsWith("CASH:"));
  const largestHolding = detailedHoldings.length > 0
    ? detailedHoldings.reduce((a, b) => (a.marketValue > b.marketValue ? a : b))
    : null;
  const largestPct = largestHolding && totalPortfolio > 0
    ? (largestHolding.marketValue / totalPortfolio) * 100
    : 0;

  // Brokerages
  const brokerages = new Set(statements?.map((s) => s.brokerage) ?? []);

  // ── Stacked area data ──
  const areaData: StackedAreaDataPoint[] = (() => {
    const monthMap = new Map<string, StackedAreaDataPoint>();
    for (const s of snapshots) {
      if (!monthMap.has(s.month)) {
        monthMap.set(s.month, {
          month: s.month, foundational: 0, value: 0, growth: 0, emergency_fund: 0, btc_crypto: 0, total: 0,
        });
      }
      const point = monthMap.get(s.month)!;
      const cat = s.category as AssetCategory;
      if (cat in point) {
        (point as unknown as Record<string, number>)[cat] = s.totalValue;
      }
    }
    for (const point of monthMap.values()) {
      point.total = CATEGORY_ORDER.reduce((sum, cat) => sum + ((point as unknown as Record<string, number>)[cat] ?? 0), 0);
    }
    return Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month));
  })();

  // ── Allocation data ──
  const allocationData: AllocationSlice[] = (() => {
    if (!currentMonth) return [];
    const latest = snapshots.filter((s) => s.month === currentMonth);
    const total = latest.reduce((sum, s) => sum + s.totalValue, 0);
    return CATEGORY_ORDER.map((cat) => {
      const snap = latest.find((s) => s.category === cat);
      const value = snap?.totalValue ?? 0;
      return {
        category: cat, label: CATEGORIES[cat].label, value,
        percentage: total > 0 ? (value / total) * 100 : 0, color: CATEGORIES[cat].color,
      };
    }).filter((s) => s.value > 0);
  })();

  const hasData = totalPortfolio > 0;

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          <LayoutDashboard className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Portfolio performance across {brokerages.size} brokerage{brokerages.size !== 1 ? "s" : ""} · {months.length} month{months.length !== 1 ? "s" : ""} of data
          </p>
        </div>
      </div>

      {!hasData ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-20">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
              <Upload className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="text-lg font-semibold">No data yet</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm text-center">
              Upload your first brokerage statement to see portfolio performance, category allocation, and month-over-month trends.
            </p>
            <Link href="/upload">
              <Button className="mt-6">
                Upload Statement
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Row 1: Primary KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Portfolio"
              value={formatCurrency(totalPortfolio)}
              subValue={currentMonth ? formatMonth(currentMonth) : undefined}
              icon={DollarSign}
            />
            <StatCard
              label="MoM Change"
              value={`${momChange >= 0 ? "+" : ""}${formatCurrency(momChange)}`}
              subValue={`${momChange >= 0 ? "+" : ""}${momPct.toFixed(1)}% vs ${prevMonth ? formatMonth(prevMonth) : "prev"}`}
              icon={momChange >= 0 ? ArrowUpRight : ArrowDownRight}
              trend={momTrend}
            />
            <StatCard
              label="Peak Value"
              value={formatCurrency(peakValue)}
              subValue={peakMonth ? formatMonth(peakMonth) : undefined}
              icon={Mountain}
            />
            <StatCard
              label="From Peak"
              value={drawdown === 0 ? "At Peak" : `${formatCurrency(drawdown)}`}
              subValue={drawdown === 0 ? undefined : `${drawdownPct.toFixed(1)}% drawdown`}
              icon={drawdown === 0 ? TrendingUp : TrendingDown}
              trend={drawdown === 0 ? "up" : drawdown < 0 ? "down" : "neutral"}
            />
          </div>

          {/* Row 2: Secondary stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Market Gain"
              value={`${realMarketGain >= 0 ? "+" : ""}${formatCurrency(realMarketGain)}`}
              subValue={`Since ${months[1] ? formatMonth(months[1]) : "start"}`}
              icon={BarChart3}
              trend={realMarketGain >= 0 ? "up" : "down"}
            />
            <StatCard
              label="Tracked Deposits"
              value={formatCurrency(Array.from(monthTotals.values()).reduce((s, m) => s + m.deposits, 0))}
              subValue="From parsed statements"
              icon={Briefcase}
            />
            <StatCard
              label="Largest Position"
              value={largestHolding ? largestHolding.ticker : "—"}
              subValue={largestHolding ? `${formatCurrency(largestHolding.marketValue)} (${largestPct.toFixed(1)}%)` : undefined}
              icon={Target}
            />
            <StatCard
              label="TWR"
              value={
                portfolioTwr
                  ? `${(portfolioTwr.twrCumulative * 100) >= 0 ? "+" : ""}${(portfolioTwr.twrCumulative * 100).toFixed(1)}%`
                  : "—"
              }
              subValue={
                portfolioTwr?.twrAnnualized != null
                  ? `${(portfolioTwr.twrAnnualized * 100) >= 0 ? "+" : ""}${(portfolioTwr.twrAnnualized * 100).toFixed(1)}% annualized`
                  : portfolioTwr
                    ? "< 12 months of data"
                    : "Upload 2+ statements"
              }
              icon={portfolioTwr && portfolioTwr.twrCumulative >= 0 ? TrendingUp : TrendingDown}
              trend={portfolioTwr ? (portfolioTwr.twrCumulative >= 0 ? "up" : "down") : "neutral"}
            />
          </div>

          {/* Portfolio Growth */}
          <div className="space-y-3">
            <SectionHeader icon={TrendingUp} title="Portfolio Growth" />
            <Card>
              <CardContent className="pt-6">
                <CategoryAreaChart data={areaData} />
              </CardContent>
            </Card>
          </div>

          {/* MoM Detail Table */}
          {months.length > 0 && (
            <div className="space-y-3">
              <SectionHeader icon={CalendarDays} title="Month-over-Month Detail" />
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-semibold">
                          <button
                            onClick={() => setMomSortDir(momSortDir === "desc" ? "asc" : "desc")}
                            className="inline-flex items-center gap-1"
                          >
                            Month
                            {momSortDir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
                          </button>
                        </TableHead>
                        <TableHead className="text-right font-semibold">Portfolio Value</TableHead>
                        <TableHead className="text-right font-semibold">Deposits</TableHead>
                        <TableHead className="text-right font-semibold">Market Gain</TableHead>
                        <TableHead className="text-right font-semibold">MoM Change</TableHead>
                        <TableHead className="text-right font-semibold">
                          <span title="Market Gain / Previous Month Portfolio Value">Return %</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(momSortDir === "desc" ? [...months].reverse() : [...months]).map((m, i) => {
                        const data = monthTotals.get(m) ?? { total: 0, deposits: 0, gain: 0 };
                        const monthIdx = months.indexOf(m);
                        const prevData = monthIdx > 0 ? monthTotals.get(months[monthIdx - 1]) ?? { total: 0, deposits: 0, gain: 0 } : null;
                        const momChange = prevData ? data.total - prevData.total : 0;
                        const returnPct = prevData && prevData.total > 0
                          ? (data.gain / prevData.total) * 100
                          : 0;
                        return (
                          <TableRow key={m} className={cn("text-sm", i % 2 === 1 && "bg-muted/30")}>
                            <TableCell className="font-semibold">{formatMonth(m)}</TableCell>
                            <TableCell className="text-right tabular-nums font-medium">{formatCurrency(data.total)}</TableCell>
                            <TableCell className="text-right tabular-nums text-blue-600">{formatCurrency(data.deposits)}</TableCell>
                            <TableCell className={cn("text-right tabular-nums font-medium", data.gain >= 0 ? "text-emerald-600" : "text-red-500")}>
                              {data.gain >= 0 ? "+" : ""}{formatCurrency(data.gain)}
                            </TableCell>
                            <TableCell className={cn("text-right tabular-nums", momChange >= 0 ? "text-emerald-600" : "text-red-500")}>
                              {prevData ? `${momChange >= 0 ? "+" : ""}${formatCurrency(momChange)}` : "—"}
                            </TableCell>
                            <TableCell className={cn("text-right tabular-nums font-medium", returnPct >= 0 ? "text-emerald-600" : "text-red-500")}>
                              {prevData ? `${returnPct >= 0 ? "+" : ""}${returnPct.toFixed(1)}%` : "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Allocation — at the bottom */}
          <div className="space-y-3">
            <SectionHeader icon={PieChart} title="Allocation" />
            <Card>
              <CardContent className="pt-6">
                <AllocationDonutChart data={allocationData} />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
