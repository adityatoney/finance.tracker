"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SectionHeader } from "@/components/layout/section-header";
import { StatementList } from "@/components/settings/statement-list";
import { Settings, Shield, Database, FileText, Wallet, Tags, Calendar } from "lucide-react";

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
        <SectionHeader icon={Database} title="DATABASE" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Statements count */}
          <Card>
            <CardContent className="relative pt-6">
              <FileText className="absolute right-4 top-4 h-5 w-5 text-muted-foreground/40" />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Statements
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{stats.statementCount}</p>
            </CardContent>
          </Card>

          {/* Holdings count */}
          <Card>
            <CardContent className="relative pt-6">
              <Wallet className="absolute right-4 top-4 h-5 w-5 text-muted-foreground/40" />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Holdings
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{stats.holdingsCount}</p>
            </CardContent>
          </Card>

          {/* Ticker Mappings count */}
          <Card>
            <CardContent className="relative pt-6">
              <Tags className="absolute right-4 top-4 h-5 w-5 text-muted-foreground/40" />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Ticker Mappings
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{stats.tickerMapCount}</p>
            </CardContent>
          </Card>

          {/* Date Range */}
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
