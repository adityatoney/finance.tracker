"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { SectionHeader } from "@/components/layout/section-header";
import { formatCurrency } from "@/lib/utils/format";
import {
  PiggyBank,
  DollarSign,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  Target,
  BarChart3,
  Users,
  Upload,
  ArrowRight,
  Loader2,
  Trash2,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ComposedChart,
  Line,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

// ── Stat Card ──
function StatCard({ label, value, subValue, icon: Icon, trend, className }: {
  label: string; value: string; subValue?: string; icon: any;
  trend?: "up" | "down" | "neutral"; className?: string;
}) {
  return (
    <Card className={cn("hover:shadow-sm transition-shadow", className)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          <div className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full",
            trend === "up" ? "bg-emerald-100 dark:bg-emerald-900/30" :
            trend === "down" ? "bg-red-100 dark:bg-red-900/30" : "bg-muted"
          )}>
            <Icon className={cn("h-3.5 w-3.5",
              trend === "up" ? "text-emerald-600" : trend === "down" ? "text-red-500" : "text-muted-foreground"
            )} />
          </div>
        </div>
        <p className="mt-1.5 text-2xl font-bold tracking-tight tabular-nums">{value}</p>
        {subValue && (
          <p className={cn("mt-0.5 text-xs tabular-nums",
            trend === "up" ? "text-emerald-600" : trend === "down" ? "text-red-500" : "text-muted-foreground"
          )}>{subValue}</p>
        )}
      </CardContent>
    </Card>
  );
}

const formatCompact = (v: number) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
};

export default function RetirementPage() {
  const router = useRouter();
  const data = useQuery(api.retirement.list);
  const stats = useQuery(api.retirement.getStats);
  const removeMut = useMutation(api.retirement.remove);

  if (data === undefined || stats === undefined) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
            <PiggyBank className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Retirement</h1>
            <p className="text-sm text-muted-foreground">401(k) year-over-year performance</p>
          </div>
        </div>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!stats || data.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
            <PiggyBank className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Retirement</h1>
            <p className="text-sm text-muted-foreground">401(k) year-over-year performance</p>
          </div>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-20">
            <PiggyBank className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-lg font-semibold">No retirement data yet</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm text-center">
              Upload annual NetBenefits statements to track your 401(k) performance year over year.
            </p>
            <Link href="/upload">
              <Button className="mt-6">
                <Upload className="mr-2 h-4 w-4" /> Upload Statement
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Chart data ──
  const sorted = [...data].sort((a, b) => a.year.localeCompare(b.year));

  // Balance growth line
  const balanceData = sorted.map((r) => ({
    year: r.year,
    balance: r.endingBalance,
  }));

  // Annual breakdown stacked bar
  const breakdownData = sorted.map((r) => ({
    year: r.year,
    "Your Contributions": r.yourContributions,
    "Employer Match": r.employerContributions,
    "Market Gain": r.marketGain,
  }));

  // Cumulative contributions vs market gain, with ending balance for tooltip
  let cumContrib = 0;
  let cumGain = 0;
  const cumulativeData = sorted.map((r) => {
    cumContrib += r.yourContributions + r.employerContributions;
    cumGain += r.marketGain;
    return {
      year: r.year,
      "Total Contributions": cumContrib,
      "Total Market Gain": cumGain,
      _endingBalance: r.endingBalance,
    };
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
          <PiggyBank className="h-5 w-5 text-purple-600 dark:text-purple-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Retirement</h1>
          <p className="text-sm text-muted-foreground">
            {stats.planName} · {stats.yearsTracked} year{stats.yearsTracked !== 1 ? "s" : ""} tracked
          </p>
        </div>
      </div>

      {/* Row 1: Primary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Current Balance"
          value={formatCurrency(stats.currentBalance)}
          subValue={`As of ${stats.latestYear}`}
          icon={DollarSign}
        />
        <StatCard
          label="All-Time Contributions"
          value={formatCurrency(stats.totalContributions)}
          subValue={`You: ${formatCurrency(stats.totalYourContributions)} + Employer: ${formatCurrency(stats.totalEmployerContributions)}`}
          icon={Users}
        />
        <StatCard
          label="All-Time Market Gain"
          value={`${stats.totalMarketGain >= 0 ? "+" : ""}${formatCurrency(stats.totalMarketGain)}`}
          icon={stats.totalMarketGain >= 0 ? TrendingUp : TrendingDown}
          trend={stats.totalMarketGain >= 0 ? "up" : "down"}
        />
        <StatCard
          label="Avg Annual Return"
          value={`${stats.avgAnnualReturn >= 0 ? "+" : ""}${stats.avgAnnualReturn.toFixed(1)}%`}
          subValue="Geometric mean"
          icon={ArrowUpRight}
          trend={stats.avgAnnualReturn >= 0 ? "up" : "down"}
        />
      </div>

      {/* Row 2: Latest year + best/worst */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label={`Your Contributions (${stats.latestYear})`}
          value={formatCurrency(stats.latestYourContributions)}
          icon={DollarSign}
        />
        <StatCard
          label={`Employer Match (${stats.latestYear})`}
          value={formatCurrency(stats.latestEmployerContributions)}
          icon={Users}
        />
        <StatCard
          label={`Market Gain (${stats.latestYear})`}
          value={`${stats.latestMarketGain >= 0 ? "+" : ""}${formatCurrency(stats.latestMarketGain)}`}
          icon={stats.latestMarketGain >= 0 ? TrendingUp : TrendingDown}
          trend={stats.latestMarketGain >= 0 ? "up" : "down"}
        />
        <StatCard
          label="Best Year"
          value={stats.bestYear.year}
          subValue={`+${formatCurrency(stats.bestYear.gain)}`}
          icon={Trophy}
          trend="up"
        />
      </div>

      {/* Balance Growth Chart */}
      <div className="space-y-3">
        <SectionHeader icon={TrendingUp} title="Balance Growth" />
        <Card>
          <CardContent className="pt-6">
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={balanceData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="year" className="text-xs" />
                <YAxis tickFormatter={formatCompact} width={55} className="text-xs" />
                <Tooltip formatter={(v: unknown) => [formatCurrency(Number(v)), "Balance"]} />
                <Line type="monotone" dataKey="balance" stroke="#8B5CF6" strokeWidth={2.5} dot={{ r: 5, fill: "#8B5CF6" }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Annual Breakdown Stacked Bar */}
      <div className="space-y-3">
        <SectionHeader icon={BarChart3} title="Annual Breakdown" />
        <Card>
          <CardContent className="pt-6">
            <ResponsiveContainer width="100%" height={350}>
              <ComposedChart data={breakdownData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="year" className="text-xs" />
                <YAxis tickFormatter={formatCompact} width={55} className="text-xs" />
                <Tooltip content={({ active, payload, label }: any) => {
                  if (!active || !payload?.length) return null;
                  const total = payload.reduce((s: number, p: any) => s + (p.value ?? 0), 0);
                  const colorMap: Record<string, string> = {
                    "Your Contributions": "#3B82F6", "Employer Match": "#10B981", "Market Gain": "#F59E0B",
                  };
                  return (
                    <div className="rounded-lg border bg-background/95 backdrop-blur-sm shadow-lg px-3 py-2.5 text-sm min-w-[200px]">
                      <div className="font-semibold mb-2 pb-1.5 border-b">
                        {label} <span className="text-muted-foreground font-normal ml-1">({formatCurrency(total)})</span>
                      </div>
                      <div className="space-y-1">
                        {payload.map((p: any) => (
                          <div key={p.dataKey} className="flex items-center justify-between gap-4">
                            <span className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorMap[p.dataKey] || p.color }} />
                              <span className="text-muted-foreground">{p.dataKey}</span>
                            </span>
                            <span className="font-medium tabular-nums">{formatCurrency(p.value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }} />
                <Legend />
                <Bar dataKey="Your Contributions" stackId="stack" fill="#3B82F6" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Employer Match" stackId="stack" fill="#10B981" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Market Gain" stackId="stack" fill="#F59E0B" radius={[4, 4, 0, 0]} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Cumulative: Contributions vs Market Gain */}
      <div className="space-y-3">
        <SectionHeader icon={Target} title="Contributions vs Market Returns" />
        <Card>
          <CardContent className="pt-6">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={cumulativeData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="year" className="text-xs" />
                <YAxis tickFormatter={formatCompact} width={55} className="text-xs" />
                <Tooltip content={({ active, payload, label }: any) => {
                  if (!active || !payload?.length) return null;
                  const endingBalance = payload[0]?.payload?._endingBalance ?? 0;
                  const colorMap: Record<string, string> = {
                    "Total Contributions": "#3B82F6", "Total Market Gain": "#10B981",
                  };
                  return (
                    <div className="rounded-lg border bg-background/95 backdrop-blur-sm shadow-lg px-3 py-2.5 text-sm min-w-[240px]">
                      <div className="font-semibold mb-1 pb-1.5 border-b">
                        Through {label} <span className="text-muted-foreground font-normal ml-1">(Balance: {formatCurrency(endingBalance)})</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mb-2">Cumulative totals</p>
                      <div className="space-y-1">
                        {payload.filter((p: any) => !p.dataKey.startsWith("_")).map((p: any) => (
                          <div key={p.dataKey} className="flex items-center justify-between gap-4">
                            <span className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorMap[p.dataKey] || p.color }} />
                              <span className="text-muted-foreground">{p.dataKey}</span>
                            </span>
                            <span className="font-medium tabular-nums">{formatCurrency(p.value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }} />
                <Legend />
                <Area type="monotone" dataKey="Total Contributions" fill="#3B82F6" stroke="#3B82F6" fillOpacity={0.3} />
                <Area type="monotone" dataKey="Total Market Gain" fill="#10B981" stroke="#10B981" fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Data Table */}
      <div className="space-y-3">
        <SectionHeader icon={PiggyBank} title="Year-by-Year Detail" />
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Year</TableHead>
                  <TableHead className="text-right font-semibold">Beginning</TableHead>
                  <TableHead className="text-right font-semibold">Your $</TableHead>
                  <TableHead className="text-right font-semibold">Employer $</TableHead>
                  <TableHead className="text-right font-semibold">Total Contrib</TableHead>
                  <TableHead className="text-right font-semibold">Market Gain</TableHead>
                  <TableHead className="text-right font-semibold">Ending</TableHead>
                  <TableHead className="text-right">
                    <span title="Market Gain / (Beginning Balance + Total Contributions × 0.5)">Return %</span>
                  </TableHead>
                  <TableHead className="text-right w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((r, i) => {
                  // Modified Dietz: assumes contributions happen mid-year
                  const totalContribYear = r.yourContributions + r.employerContributions;
                  const avgCapital = r.beginningBalance + (totalContribYear * 0.5);
                  const returnPct = avgCapital > 0
                    ? (r.marketGain / avgCapital) * 100
                    : 0;
                  const totalContrib = r.yourContributions + r.employerContributions;
                  return (
                    <TableRow
                      key={(r as any)._id}
                      className={cn("text-sm cursor-pointer hover:bg-muted/50", i % 2 === 1 && "bg-muted/30")}
                      onClick={() => router.push(`/retirement/${(r as any)._id}`)}
                    >
                      <TableCell className="font-semibold">{r.year}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(r.beginningBalance)}</TableCell>
                      <TableCell className="text-right tabular-nums text-blue-600">{formatCurrency(r.yourContributions)}</TableCell>
                      <TableCell className="text-right tabular-nums text-green-600">{formatCurrency(r.employerContributions)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{formatCurrency(totalContrib)}</TableCell>
                      <TableCell className={cn("text-right tabular-nums font-medium", r.marketGain >= 0 ? "text-emerald-600" : "text-red-500")}>
                        {r.marketGain >= 0 ? "+" : ""}{formatCurrency(r.marketGain)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-bold">{formatCurrency(r.endingBalance)}</TableCell>
                      <TableCell className={cn("text-right tabular-nums font-medium", returnPct >= 0 ? "text-emerald-600" : "text-red-500")}>
                        {returnPct >= 0 ? "+" : ""}{returnPct.toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); removeMut({ id: (r as any)._id }); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {/* Totals row */}
                {(() => {
                  const totYour = sorted.reduce((s, r) => s + r.yourContributions, 0);
                  const totEmployer = sorted.reduce((s, r) => s + r.employerContributions, 0);
                  const totContrib = totYour + totEmployer;
                  const totGain = sorted.reduce((s, r) => s + r.marketGain, 0);
                  const firstBeginning = sorted[0]?.beginningBalance ?? 0;
                  const lastEnding = sorted[sorted.length - 1]?.endingBalance ?? 0;
                  return (
                    <TableRow className="text-sm border-t-2 border-foreground/20 bg-muted/60 font-bold">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(firstBeginning)}</TableCell>
                      <TableCell className="text-right tabular-nums text-blue-600">{formatCurrency(totYour)}</TableCell>
                      <TableCell className="text-right tabular-nums text-green-600">{formatCurrency(totEmployer)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(totContrib)}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", totGain >= 0 ? "text-emerald-600" : "text-red-500")}>
                        {totGain >= 0 ? "+" : ""}{formatCurrency(totGain)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-bold">{formatCurrency(lastEnding)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">—</TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  );
                })()}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
