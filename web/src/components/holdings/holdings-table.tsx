"use client";

import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { CATEGORIES, CATEGORY_ORDER } from "@/lib/constants/categories";
import { formatCurrencyDetailed, formatCurrency } from "@/lib/utils/format";
import type { AssetCategory } from "@/lib/types";
import { Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Shape returned by Convex api.holdings.listForMonth */
export interface ConvexHolding {
  _id: string;
  ticker: string;
  name: string;
  quantity: number;
  price: number;
  marketValue: number;
  category: string;
  brokerage: string;
  statementDate: string;
  beginningValue?: number | null;
  endingValue?: number | null;
  costBasis?: number | null;
}

type SortField = "ticker" | "name" | "brokerage" | "category" | "quantity" | "price" | "marketValue" | "pctOfPortfolio";
type SortDir = "asc" | "desc";

interface HoldingsTableProps {
  holdings: ConvexHolding[];
  onRecategorize: (ticker: string, category: string) => void;
}

export function HoldingsTable({ holdings, onRecategorize }: HoldingsTableProps) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [brokerageFilter, setBrokerageFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("marketValue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Compute category and brokerage counts for filter tabs
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const h of holdings) {
      counts[h.category] = (counts[h.category] || 0) + 1;
    }
    return counts;
  }, [holdings]);

  const brokerageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const h of holdings) {
      const b = h.brokerage || "unknown";
      counts[b] = (counts[b] || 0) + 1;
    }
    return counts;
  }, [holdings]);

  const uniqueBrokerages = useMemo(
    () => Object.keys(brokerageCounts).sort(),
    [brokerageCounts]
  );

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir(field === "marketValue" || field === "quantity" || field === "price" ? "desc" : "asc");
    }
  };

  const handleRecategorize = (ticker: string, category: string) => {
    try {
      onRecategorize(ticker, category);
    } catch (e) {
      console.error("Failed to recategorize:", e);
    }
  };

  // Total portfolio value (across ALL holdings, not just filtered)
  const portfolioTotal = useMemo(
    () => holdings.reduce((s, h) => s + h.marketValue, 0),
    [holdings]
  );

  const getPct = (value: number) => portfolioTotal > 0 ? (value / portfolioTotal) * 100 : 0;

  const filtered = useMemo(() => {
    let result = holdings;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (h) => h.ticker.toLowerCase().includes(q) || h.name.toLowerCase().includes(q)
      );
    }
    if (categoryFilter !== "all") {
      result = result.filter((h) => h.category === categoryFilter);
    }
    if (brokerageFilter !== "all") {
      result = result.filter((h) => h.brokerage === brokerageFilter);
    }
    return [...result].sort((a, b) => {
      if (sortField === "pctOfPortfolio") {
        return sortDir === "asc" ? a.marketValue - b.marketValue : b.marketValue - a.marketValue;
      }
      const av = a[sortField];
      const bv = b[sortField];
      let cmp = 0;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [holdings, search, categoryFilter, brokerageFilter, sortField, sortDir]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-30" />;
    return sortDir === "asc" ? <ArrowUp className="ml-1 h-3 w-3" /> : <ArrowDown className="ml-1 h-3 w-3" />;
  };

  // Filter tabs (matching Sevarthi.Hub pill style)
  const filterTabs = [
    { key: "all", label: "All", count: holdings.length },
    ...CATEGORY_ORDER
      .filter((cat) => categoryCounts[cat] > 0)
      .map((cat) => ({
        key: cat,
        label: CATEGORIES[cat].label,
        count: categoryCounts[cat] || 0,
        color: CATEGORIES[cat].color,
      })),
  ];
  // Add uncategorized if present
  if (categoryCounts["uncategorized"]) {
    filterTabs.push({ key: "uncategorized", label: "Uncategorized", count: categoryCounts["uncategorized"] });
  }

  return (
    <div className="space-y-4">
      {/* Category filter pills (Sevarthi.Hub style) */}
      <div className="flex flex-wrap items-center gap-2">
        {filterTabs.map((tab) => {
          const isActive = categoryFilter === tab.key;
          const tabColor = "color" in tab ? (tab as { color: string }).color : undefined;
          return (
            <button
              key={tab.key}
              onClick={() => setCategoryFilter(tab.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
                isActive
                  ? "border-foreground/20 bg-foreground text-background font-medium"
                  : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              {tabColor && (
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: isActive ? "currentColor" : tabColor }} />
              )}
              {tab.label}
              <span className={cn(
                "text-xs tabular-nums",
                isActive ? "opacity-80" : "opacity-50"
              )}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Brokerage filter pills */}
      {uniqueBrokerages.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60 mr-1">
            Brokerage
          </span>
          <button
            onClick={() => setBrokerageFilter("all")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
              brokerageFilter === "all"
                ? "border-foreground/20 bg-foreground text-background font-medium"
                : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            All
            <span className={cn("text-xs tabular-nums", brokerageFilter === "all" ? "opacity-80" : "opacity-50")}>
              {holdings.length}
            </span>
          </button>
          {uniqueBrokerages.map((b) => (
            <button
              key={b}
              onClick={() => setBrokerageFilter(b)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm capitalize transition-colors",
                brokerageFilter === b
                  ? "border-foreground/20 bg-foreground text-background font-medium"
                  : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              {b}
              <span className={cn("text-xs tabular-nums", brokerageFilter === b ? "opacity-80" : "opacity-50")}>
                {brokerageCounts[b]}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Search bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search holdings..."
            className="pl-9"
          />
        </div>
        <span className="text-sm text-muted-foreground ml-auto tabular-nums">
          {filtered.length} position{filtered.length !== 1 ? "s" : ""}
        </span>
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
                <TableHead>
                  <button onClick={() => handleSort("brokerage")} className="inline-flex items-center text-xs font-semibold uppercase tracking-wider whitespace-nowrap">
                    Brokerage <SortIcon field="brokerage" />
                  </button>
                </TableHead>
                <TableHead>
                  <button onClick={() => handleSort("category")} className="inline-flex items-center text-xs font-semibold uppercase tracking-wider whitespace-nowrap">
                    Category <SortIcon field="category" />
                  </button>
                </TableHead>
                <TableHead className="text-right">
                  <button onClick={() => handleSort("quantity")} className="inline-flex items-center text-xs font-semibold uppercase tracking-wider whitespace-nowrap ml-auto">
                    Shares <SortIcon field="quantity" />
                  </button>
                </TableHead>
                <TableHead className="text-right">
                  <button onClick={() => handleSort("price")} className="inline-flex items-center text-xs font-semibold uppercase tracking-wider whitespace-nowrap ml-auto">
                    Price <SortIcon field="price" />
                  </button>
                </TableHead>
                <TableHead className="text-right">
                  <button onClick={() => handleSort("marketValue")} className="inline-flex items-center text-xs font-semibold uppercase tracking-wider whitespace-nowrap ml-auto">
                    Value <SortIcon field="marketValue" />
                  </button>
                </TableHead>
                <TableHead className="text-right">
                  <button onClick={() => handleSort("pctOfPortfolio")} className="inline-flex items-center text-xs font-semibold uppercase tracking-wider whitespace-nowrap ml-auto">
                    % <SortIcon field="pctOfPortfolio" />
                  </button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((h) => {
                const catMeta = CATEGORIES[h.category as AssetCategory];
                return (
                  <TableRow key={h._id} className="group">
                    <TableCell className="py-3.5">
                      <span className="inline-block rounded bg-muted/60 px-2 py-0.5 font-mono text-sm font-semibold">
                        {h.ticker}
                      </span>
                    </TableCell>
                    <TableCell className="py-3.5 text-muted-foreground">{h.name}</TableCell>
                    <TableCell className="py-3.5">
                      <Badge variant="secondary" className="text-xs font-normal capitalize">
                        {h.brokerage}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3.5">
                      <Select
                        value={h.category}
                        onValueChange={(val) => {
                          if (val && val !== h.category) handleRecategorize(h.ticker, String(val));
                        }}
                      >
                        <SelectTrigger
                          className="h-7 border-0 bg-transparent shadow-none px-0 hover:bg-muted/50 focus:ring-0 w-[140px]"
                        >
                          <SelectValue placeholder={h.category}>
                            {(selectedValue: unknown) => {
                              const val = String(selectedValue || h.category);
                              const meta = CATEGORIES[val as AssetCategory];
                              return meta ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
                                  {meta.label}
                                </span>
                              ) : (
                                <span className="text-amber-500">{val}</span>
                              );
                            }}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORY_ORDER.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              <span className="inline-flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: CATEGORIES[cat].color }} />
                                {CATEGORIES[cat].label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="py-3.5 text-right tabular-nums">
                      {h.quantity > 0 ? h.quantity.toFixed(2) : "\u2014"}
                    </TableCell>
                    <TableCell className="py-3.5 text-right tabular-nums">
                      {h.price > 0 ? formatCurrencyDetailed(h.price) : "\u2014"}
                    </TableCell>
                    <TableCell className="py-3.5 text-right font-medium tabular-nums">
                      {formatCurrencyDetailed(h.marketValue)}
                    </TableCell>
                    <TableCell className="py-3.5 text-right tabular-nums text-muted-foreground text-xs">
                      {getPct(h.marketValue).toFixed(1)}%
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                    {search || categoryFilter !== "all"
                      ? "No holdings match your filters."
                      : "No holdings data."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
