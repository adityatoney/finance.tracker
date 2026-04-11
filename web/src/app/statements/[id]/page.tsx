"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { CATEGORIES, CATEGORY_ORDER } from "@/lib/constants/categories";
import type { AssetCategory } from "@/lib/types";
import { formatCurrency, formatCurrencyDetailed, formatMonth } from "@/lib/utils/format";
import { CategoryDistributionBar } from "@/components/upload/category-distribution-bar";
import {
  ArrowLeft,
  FileText,
  Wallet,
  Loader2,
  Layers,
  List,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function StatementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const statement = useQuery(api.statements.getById, { id: id as any });
  const holdings = useQuery(api.holdings.listByStatement, { statementId: id as any });
  const updateCategory = useMutation(api.holdings.updateCategory);
  const rebuildMonth = useMutation(api.snapshots.rebuildMonth);

  if (statement === undefined || holdings === undefined) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/settings">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
          </Link>
        </div>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (statement === null) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/settings">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
          </Link>
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

  const accounts = statement.accounts ?? [];

  // Group holdings by account number
  const holdingsByAccount: Record<string, typeof holdings> = {};
  for (const h of holdings) {
    const key = h.accountNumber ?? "";
    if (!holdingsByAccount[key]) holdingsByAccount[key] = [];
    holdingsByAccount[key].push(h);
  }

  const handleRecategorize = async (holdingId: string, category: string) => {
    const result = await updateCategory({ holdingId: holdingId as any, category });
    // Rebuild snapshots for the affected month
    if (result?.month) {
      await rebuildMonth({ month: result.month });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Link href="/settings">
            <Button variant="ghost" size="icon" className="mt-0.5">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
            <FileText className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {formatMonth(statement.statementDate)} — <span className="capitalize">{statement.brokerage}</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              {statement.fileName} · {accounts.length} account{accounts.length !== 1 ? "s" : ""} · {holdings.length} holding{holdings.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tabular-nums">{formatCurrency(statement.totalValue)}</p>
          {statement.netDeposits > 0 && (
            <p className="text-xs text-muted-foreground">
              Deposits: {formatCurrency(statement.netDeposits)}
            </p>
          )}
        </div>
      </div>

      {/* Portfolio-wide category distribution */}
      {holdings.length > 0 && (
        <Card>
          <CardContent className="pt-4 pb-3">
            <CategoryDistributionBar
              holdings={holdings.map((h: any) => ({
                ticker: h.ticker,
                name: h.name ?? "",
                quantity: null,
                price: null,
                market_value: h.marketValue,
                beginning_value: null,
                ending_value: null,
                cost_basis: null,
                category: h.category,
                category_source: null,
              }))}
            />
          </CardContent>
        </Card>
      )}

      {/* Account breakdown */}
      <Accordion multiple defaultValue={accounts.map((_: any, i: number) => `acct-${i}`)} className="space-y-4">
        {accounts.map((acct: any, idx: number) => {
          const acctKey = acct.accountNumber || acct.accountNumberMasked || `account-${idx}`;
          const acctHoldings = holdingsByAccount[acct.accountNumber ?? ""] ?? [];
          const isAggregate = acct.trackingMode === "aggregate";
          const holdingsTotal = acctHoldings.reduce((s: number, h: any) => s + (h.marketValue ?? 0), 0);
          const pctOfTotal = statement.totalValue > 0 ? (acct.totalValue / statement.totalValue) * 100 : 0;

          // Dominant category color for the left border
          const catTotals: Record<string, number> = {};
          for (const h of acctHoldings) {
            const c = h.category || "uncategorized";
            catTotals[c] = (catTotals[c] ?? 0) + h.marketValue;
          }
          const dominantCat = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0]?.[0] as AssetCategory | undefined;
          const borderColor = dominantCat && CATEGORIES[dominantCat] ? CATEGORIES[dominantCat].color : "#D1D5DB";

          return (
            <AccordionItem
              key={idx}
              value={`acct-${idx}`}
              className="border rounded-lg px-0 overflow-hidden shadow-sm"
              style={{ borderLeftWidth: "3px", borderLeftColor: borderColor }}
            >
              <AccordionTrigger className="px-4 py-3.5 hover:no-underline hover:bg-muted/30 [&[data-state=open]]:bg-muted/10">
                <div className="flex items-center gap-3 flex-1 text-left">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted/60">
                    <Wallet className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">
                        {acct.accountType || "Account"}
                      </span>
                      {acct.accountNumberMasked && (
                        <Badge variant="secondary" className="text-[10px] font-mono px-1.5">
                          {acct.accountNumberMasked}
                        </Badge>
                      )}
                      <Badge variant="outline" className={cn(
                        "text-[10px] gap-1",
                        isAggregate ? "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400" : "border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-400"
                      )}>
                        {isAggregate ? <Layers className="h-2.5 w-2.5" /> : <List className="h-2.5 w-2.5" />}
                        {isAggregate ? "Aggregate" : "Detailed"}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground/60">#{idx + 1}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>{acctHoldings.length} holding{acctHoldings.length !== 1 ? "s" : ""}</span>
                      <span>·</span>
                      <span className="tabular-nums">{pctOfTotal.toFixed(1)}% of portfolio</span>
                    </div>
                  </div>
                  <div className="text-right pr-2">
                    <p className="text-base font-bold tabular-nums">{formatCurrency(acct.totalValue)}</p>
                    {acct.beginningValue != null && acct.endingValue != null && (
                      <p className={cn(
                        "text-[10px] tabular-nums flex items-center justify-end gap-0.5",
                        (acct.endingValue - acct.beginningValue) >= 0 ? "text-emerald-600" : "text-red-500"
                      )}>
                        {(acct.endingValue - acct.beginningValue) >= 0
                          ? <TrendingUp className="h-2.5 w-2.5" />
                          : <TrendingDown className="h-2.5 w-2.5" />
                        }
                        {formatCurrency(Math.abs(acct.endingValue - acct.beginningValue))}
                      </p>
                    )}
                  </div>
                </div>
              </AccordionTrigger>

              <AccordionContent className="px-0 pb-0">
                {/* Category distribution bar */}
                {acctHoldings.length > 0 && (
                  <div className="px-4 pt-2 pb-1">
                    <CategoryDistributionBar
                      holdings={acctHoldings.map((h: any) => ({
                        ticker: h.ticker,
                        name: h.name ?? "",
                        quantity: null,
                        price: null,
                        market_value: h.marketValue,
                        beginning_value: null,
                        ending_value: null,
                        cost_basis: null,
                        category: h.category,
                        category_source: null,
                      }))}
                    />
                  </div>
                )}

                {acctHoldings.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                    {isAggregate ? "Tracked as aggregate — no individual holdings." : "No holdings found for this account."}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="text-xs">
                        <TableHead className="h-8">Ticker</TableHead>
                        <TableHead className="h-8">Name</TableHead>
                        <TableHead className="h-8">Category</TableHead>
                        <TableHead className="h-8 text-right">Qty</TableHead>
                        <TableHead className="h-8 text-right">Price</TableHead>
                        <TableHead className="h-8 text-right">Market Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {acctHoldings.map((h: any, hIdx: number) => {
                        const catMeta = CATEGORIES[h.category as AssetCategory];
                        return (
                          <TableRow key={h._id} className={cn("text-xs", hIdx % 2 === 1 && "bg-muted/30")}>
                            <TableCell className="py-1.5">
                              <span className="font-mono font-semibold">{h.ticker}</span>
                            </TableCell>
                            <TableCell className="py-1.5 text-muted-foreground max-w-[180px] truncate">
                              {h.name}
                            </TableCell>
                            <TableCell className="py-1.5">
                              <Select
                                defaultValue=""
                                value={h.category || ""}
                                onValueChange={(val) => {
                                  if (val) handleRecategorize(h._id, String(val));
                                }}
                              >
                                <SelectTrigger className={cn(
                                  "h-6 w-[130px] text-[10px] shadow-none",
                                  "border-0 bg-transparent px-0 hover:bg-muted/50 focus:ring-0"
                                )}>
                                  <SelectValue placeholder="Uncategorized">
                                    {(selectedValue: unknown) => {
                                      const val = String(selectedValue || h.category || "");
                                      const meta = val ? CATEGORIES[val as AssetCategory] : null;
                                      return meta ? (
                                        <span className="inline-flex items-center gap-1.5">
                                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
                                          {meta.label}
                                        </span>
                                      ) : (
                                        <span className="text-amber-500">Uncategorized</span>
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
                            <TableCell className="py-1.5 text-right tabular-nums">
                              {h.quantity ? h.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 }) : "—"}
                            </TableCell>
                            <TableCell className="py-1.5 text-right tabular-nums">
                              {h.price ? formatCurrencyDetailed(h.price) : "—"}
                            </TableCell>
                            <TableCell className="py-1.5 text-right tabular-nums font-medium">
                              {formatCurrencyDetailed(h.marketValue)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {/* Total row */}
                      <TableRow className="text-xs border-t-2 bg-muted/20">
                        <TableCell className="py-2 font-semibold" colSpan={5}>
                          Total
                        </TableCell>
                        <TableCell className="py-2 text-right tabular-nums font-bold">
                          {formatCurrencyDetailed(holdingsTotal)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                )}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
