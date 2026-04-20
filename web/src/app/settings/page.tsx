"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SectionHeader } from "@/components/layout/section-header";
import { StatementList } from "@/components/settings/statement-list";
import { Button } from "@/components/ui/button";
import {
  Settings,
  Shield,
  Database,
  FileText,
  Wallet,
  Tags,
  Calendar,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { useState } from "react";

function SettingsSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="flex items-start gap-4">
        <div className="h-10 w-10 rounded-lg bg-muted" />
        <div className="space-y-2">
          <div className="h-6 w-32 rounded bg-muted" />
          <div className="h-4 w-64 rounded bg-muted" />
        </div>
      </div>
      <div className="h-36 rounded-lg bg-muted" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-lg bg-muted" />
        ))}
      </div>
      <div className="h-64 rounded-lg bg-muted" />
    </div>
  );
}

export default function SettingsPage() {
  const stats = useQuery(api.statements.getStats);
  const stmts = useQuery(api.statements.list);
  const removeStatement = useMutation(api.statements.remove);
  const rebuildAll = useMutation(api.snapshots.rebuildAll);
  const validation = useQuery(api.snapshots.validateTotals);

  const [isRebuilding, setIsRebuilding] = useState(false);
  const [rebuildResult, setRebuildResult] = useState<string | null>(null);

  const handleRebuildAll = async () => {
    setIsRebuilding(true);
    setRebuildResult(null);
    try {
      const result = await rebuildAll({});
      setRebuildResult(`Rebuilt snapshots for ${result.monthsRebuilt} month${result.monthsRebuilt !== 1 ? "s" : ""}`);
    } catch (err) {
      setRebuildResult(`Error: ${err instanceof Error ? err.message : "Failed"}`);
    } finally {
      setIsRebuilding(false);
    }
  };

  if (stats === undefined || stmts === undefined) {
    return <SettingsSkeleton />;
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Settings className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Database status, encryption info, and uploaded statements.
          </p>
        </div>
      </div>

      {/* ENCRYPTION section */}
      <div className="space-y-3">
        <SectionHeader icon={Shield} title="ENCRYPTION" />
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Encryption Status</span>
              <Badge variant="default" className="bg-emerald-500 hover:bg-emerald-600">
                Active
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Algorithm</span>
              <span className="text-sm font-mono">Fernet (AES-128-CBC + HMAC)</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Account numbers and owner names are encrypted before storage.
              The encryption key is stored in your .env file.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* DATABASE section */}
      <div className="space-y-3">
        <SectionHeader icon={Database} title="DATABASE">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={handleRebuildAll}
            disabled={isRebuilding}
          >
            {isRebuilding ? (
              <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Rebuilding...</>
            ) : (
              <><RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Recalculate Snapshots</>
            )}
          </Button>
          {rebuildResult && (
            <span className="text-xs text-muted-foreground">{rebuildResult}</span>
          )}
        </SectionHeader>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card>
            <CardContent className="relative pt-6">
              <FileText className="absolute right-4 top-4 h-5 w-5 text-muted-foreground/40" />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Statements
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{stats.statementCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="relative pt-6">
              <Wallet className="absolute right-4 top-4 h-5 w-5 text-muted-foreground/40" />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Holdings
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{stats.holdingsCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="relative pt-6">
              <Tags className="absolute right-4 top-4 h-5 w-5 text-muted-foreground/40" />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Ticker Mappings
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{stats.tickerMapCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="relative pt-6">
              <Calendar className="absolute right-4 top-4 h-5 w-5 text-muted-foreground/40" />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Date Range
              </p>
              <p className="mt-1 text-sm font-bold">
                {stats.dateRangeStart && stats.dateRangeEnd
                  ? `${stats.dateRangeStart} \u2192 ${stats.dateRangeEnd}`
                  : "No data"}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* DATA VALIDATION section */}
      {validation && validation.length > 0 && (
        <div className="space-y-3">
          <SectionHeader icon={Shield} title="DATA VALIDATION" />
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="px-4 py-2 text-left font-medium">Month</th>
                    <th className="px-4 py-2 text-right font-medium">Holdings Total</th>
                    <th className="px-4 py-2 text-right font-medium">Snapshot Total</th>
                    <th className="px-4 py-2 text-right font-medium">Statement Total</th>
                    <th className="px-4 py-2 text-center font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {validation.map((v) => (
                    <tr key={v.month} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="px-4 py-2.5 font-medium tabular-nums">{v.month}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        ${v.holdingsTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        ${v.snapshotTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        ${v.statementTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {v.match ? (
                          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 border-0 text-[10px]">
                            Match
                          </Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 border-0 text-[10px]">
                            ${v.diff.toLocaleString()}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* UPLOADED STATEMENTS section */}
      <div className="space-y-3">
        <SectionHeader icon={FileText} title="UPLOADED STATEMENTS" count={stmts.length} />
        <Card>
          <CardContent className="p-0">
            <StatementList statements={stmts} onDelete={removeStatement} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
