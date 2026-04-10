"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HoldingsTable } from "@/components/holdings/holdings-table";
import { CATEGORIES, CATEGORY_ORDER } from "@/lib/constants/categories";
import { formatCurrency } from "@/lib/utils/format";
import { Wallet, Upload, Loader2 } from "lucide-react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";

export default function HoldingsPage() {
  const allMonths = useQuery(api.holdings.getAllMonths);
  const latestMonth = useQuery(api.holdings.getLatestMonth);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const activeMonth = selectedMonth ?? latestMonth;
  const holdings = useQuery(
    api.holdings.listForMonth,
    activeMonth ? { month: activeMonth } : "skip"
  );
  const recategorize = useMutation(api.holdings.recategorize);

  // Loading state — queries return undefined while loading
  const isLoading = allMonths === undefined || latestMonth === undefined || (activeMonth && holdings === undefined);

  // Once loaded, normalize
  const holdingsList = holdings ?? [];

  // Compute category counts and total value
  const categoryCounts: Record<string, number> = {};
  let totalValue = 0;
  for (const h of holdingsList) {
    categoryCounts[h.category] = (categoryCounts[h.category] || 0) + 1;
    totalValue += h.marketValue;
  }

  const handleRecategorize = async (ticker: string, category: string) => {
    try {
      await recategorize({ ticker, category });
    } catch (e) {
      console.error("Failed to recategorize:", e);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Wallet className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Holdings</h1>
            <p className="text-sm text-muted-foreground">
              Individual positions across all brokerages.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Wallet className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Holdings</h1>
            <p className="text-sm text-muted-foreground">
              Individual positions across all brokerages.
            </p>
          </div>
        </div>
        {allMonths && allMonths.length > 0 && (
          <Select value={activeMonth ?? ""} onValueChange={(v) => setSelectedMonth(v)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Select month" />
            </SelectTrigger>
            <SelectContent>
              {allMonths.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {holdingsList.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-20">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Wallet className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">No holdings data</h3>
            <p className="mt-1 text-sm text-muted-foreground text-center max-w-sm">
              Upload a brokerage statement to see your positions and portfolio breakdown here.
            </p>
            <Link href="/upload">
              <Button className="mt-4">
                <Upload className="mr-2 h-4 w-4" />
                Upload Statement
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Category summary bar */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-card px-4 py-3">
            {CATEGORY_ORDER.map((cat) => {
              const meta = CATEGORIES[cat];
              const count = categoryCounts[cat] || 0;
              if (count === 0) return null;
              return (
                <div key={cat} className="flex items-center gap-1.5 text-sm">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} />
                  <span className="text-muted-foreground">{meta.label}:</span>
                  <span className="font-medium">{count}</span>
                </div>
              );
            })}
            <div className="ml-auto text-sm">
              <span className="text-muted-foreground">Total:</span>{" "}
              <span className="font-semibold tabular-nums">{formatCurrency(totalValue)}</span>
            </div>
          </div>

          {/* Interactive holdings table */}
          <HoldingsTable holdings={holdingsList} onRecategorize={handleRecategorize} />
        </>
      )}
    </div>
  );
}
