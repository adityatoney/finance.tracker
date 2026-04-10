"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils/format";
import {
  ArrowLeft,
  PiggyBank,
  Loader2,
  DollarSign,
  Users,
  TrendingUp,
  TrendingDown,
  Calendar,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

function DetailRow({ label, value, color, bold, icon: Icon }: {
  label: string; value: string; color?: string; bold?: boolean; icon?: any;
}) {
  return (
    <div className={cn("flex items-center justify-between py-3 px-1", bold && "border-t pt-4 mt-1")}>
      <span className="flex items-center gap-2 text-muted-foreground">
        {Icon && <Icon className="h-4 w-4" />}
        {label}
      </span>
      <span className={cn("tabular-nums font-medium", color, bold && "text-xl font-bold")}>{value}</span>
    </div>
  );
}

export default function RetirementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const data = useQuery(api.retirement.list);

  if (data === undefined) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/retirement"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button></Link>
        </div>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const stmt = data.find((r: any) => (r as any)._id === id);

  if (!stmt) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/retirement"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button></Link>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-20">
            <p className="text-lg font-semibold">Statement not found</p>
            <p className="text-sm text-muted-foreground mt-1">It may have been deleted.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalContrib = stmt.yourContributions + stmt.employerContributions;
  const avgCapital = stmt.beginningBalance + (totalContrib * 0.5);
  const returnPct = avgCapital > 0 ? (stmt.marketGain / avgCapital) * 100 : 0;
  const totalChange = stmt.endingBalance - stmt.beginningBalance;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href="/retirement">
          <Button variant="ghost" size="icon" className="mt-0.5">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
          <PiggyBank className="h-5 w-5 text-purple-600 dark:text-purple-400" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{stmt.year} — {stmt.planName}</h1>
          <p className="text-sm text-muted-foreground">
            {stmt.fileName} · {stmt.periodStart} to {stmt.periodEnd}
          </p>
        </div>
      </div>

      {/* Balance summary card */}
      <Card className="border-purple-200 dark:border-purple-800" style={{ borderLeftWidth: "3px", borderLeftColor: "#8B5CF6" }}>
        <CardContent className="pt-6 pb-4">
          <div className="grid grid-cols-2 gap-6 mb-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Beginning Balance</p>
              <p className="text-2xl font-bold tabular-nums mt-1">{formatCurrency(stmt.beginningBalance)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Ending Balance</p>
              <p className="text-2xl font-bold tabular-nums mt-1">{formatCurrency(stmt.endingBalance)}</p>
            </div>
          </div>

          {/* Visual bar showing composition of change */}
          <div className="rounded-lg bg-muted/30 p-4 space-y-3">
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <span>Change Breakdown</span>
              <span className={cn("text-sm", totalChange >= 0 ? "text-emerald-600" : "text-red-500")}>
                {totalChange >= 0 ? "+" : ""}{formatCurrency(totalChange)}
              </span>
            </div>

            {/* Stacked bar */}
            {(() => {
              const total = stmt.yourContributions + stmt.employerContributions + Math.abs(stmt.marketGain);
              if (total === 0) return null;
              const yourPct = (stmt.yourContributions / total) * 100;
              const emplPct = (stmt.employerContributions / total) * 100;
              const gainPct = (Math.abs(stmt.marketGain) / total) * 100;
              return (
                <div className="flex h-3 w-full overflow-hidden rounded-full">
                  <div style={{ width: `${yourPct}%`, backgroundColor: "#3B82F6" }} />
                  <div style={{ width: `${emplPct}%`, backgroundColor: "#10B981" }} />
                  <div style={{ width: `${gainPct}%`, backgroundColor: stmt.marketGain >= 0 ? "#F59E0B" : "#EF4444" }} />
                </div>
              );
            })()}

            <div className="flex gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-blue-500" /> Your Contributions
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Employer Match
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: stmt.marketGain >= 0 ? "#F59E0B" : "#EF4444" }} /> Market {stmt.marketGain >= 0 ? "Gain" : "Loss"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detail rows */}
      <Card>
        <CardContent className="pt-4 divide-y">
          <DetailRow icon={Calendar} label="Statement Period" value={`${stmt.periodStart} — ${stmt.periodEnd}`} />
          <DetailRow icon={FileText} label="Plan Name" value={stmt.planName} />
          <DetailRow icon={DollarSign} label="Your Contributions" value={formatCurrency(stmt.yourContributions)} color="text-blue-600" />
          <DetailRow icon={Users} label="Employer Contributions" value={formatCurrency(stmt.employerContributions)} color="text-green-600" />
          <DetailRow icon={DollarSign} label="Total Contributions" value={formatCurrency(totalContrib)} />
          <DetailRow
            icon={stmt.marketGain >= 0 ? TrendingUp : TrendingDown}
            label="Change on Market Value"
            value={`${stmt.marketGain >= 0 ? "+" : ""}${formatCurrency(stmt.marketGain)}`}
            color={stmt.marketGain >= 0 ? "text-emerald-600" : "text-red-500"}
          />
          <DetailRow
            icon={TrendingUp}
            label="Return % (Modified Dietz)"
            value={`${returnPct >= 0 ? "+" : ""}${returnPct.toFixed(1)}%`}
            color={returnPct >= 0 ? "text-emerald-600" : "text-red-500"}
          />
          {stmt.vestedBalance != null && (
            <DetailRow icon={PiggyBank} label="Vested Balance" value={formatCurrency(stmt.vestedBalance)} bold />
          )}
          <DetailRow icon={PiggyBank} label="Ending Balance" value={formatCurrency(stmt.endingBalance)} bold />
        </CardContent>
      </Card>
    </div>
  );
}
