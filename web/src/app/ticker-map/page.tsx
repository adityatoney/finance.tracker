"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { SectionHeader } from "@/components/layout/section-header";
import { CATEGORIES, CATEGORY_ORDER } from "@/lib/constants/categories";
import type { AssetCategory } from "@/lib/types";
import { Tags, Table2, Plus, Trash2, Loader2, Search } from "lucide-react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";

export default function TickerMapPage() {
  const mappings = useQuery(api.tickers.list);
  const upsertTicker = useMutation(api.tickers.upsert);
  const removeTicker = useMutation(api.tickers.remove);

  const [newTicker, setNewTicker] = useState("");
  const [newCategory, setNewCategory] = useState<string>("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const isLoading = mappings === undefined;

  const handleAdd = async () => {
    if (!newTicker || !newCategory) return;
    await upsertTicker({ ticker: newTicker.toUpperCase(), category: newCategory });
    setNewTicker("");
    setNewCategory("");
  };

  const handleDelete = async (ticker: string) => {
    await removeTicker({ ticker });
  };

  // Compute category counts
  const categoryCounts: Record<string, number> = {};
  if (mappings) {
    for (const m of mappings) {
      categoryCounts[m.category] = (categoryCounts[m.category] || 0) + 1;
    }
  }

  // Filter mappings by search + category card
  const filteredMappings = mappings?.filter((m) => {
    const matchesSearch = m.ticker.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !categoryFilter || m.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Tags className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ticker Map</h1>
          <p className="text-sm text-muted-foreground">
            Manage how tickers are categorized into asset buckets.
          </p>
        </div>
      </div>

      {/* Category count cards — click to filter */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {CATEGORY_ORDER.map((cat) => {
          const meta = CATEGORIES[cat];
          const count = categoryCounts[cat] || 0;
          const isActive = categoryFilter === cat;
          return (
            <button
              key={cat}
              onClick={() => setCategoryFilter(isActive ? null : cat)}
              className={`rounded-lg border bg-card px-4 py-3 text-left transition-all hover:shadow-sm ${
                isActive
                  ? "ring-2 ring-offset-1 ring-primary/50 border-primary/30"
                  : "hover:border-muted-foreground/30"
              }`}
              style={{ borderLeftWidth: "3px", borderLeftColor: meta.color }}
            >
              <p className="text-xs text-muted-foreground">{meta.label}</p>
              <p className="text-xl font-bold tabular-nums">{count}</p>
            </button>
          );
        })}
      </div>

      {/* Table section */}
      <div className="space-y-3">
        <SectionHeader icon={Table2} title="TICKER MAPPINGS" count={mappings?.length}>
          {/* Inline add form */}
          <Input
            value={newTicker}
            onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
            placeholder="Ticker"
            className="h-8 w-24 text-xs"
          />
          <Select value={newCategory} onValueChange={(v) => v && setNewCategory(v)}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_ORDER.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {CATEGORIES[cat].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="h-8"
            onClick={handleAdd}
            disabled={!newTicker || !newCategory}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add
          </Button>
        </SectionHeader>

        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tickers..."
            className="pl-9"
          />
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticker</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMappings?.map((m) => {
                    const catMeta = CATEGORIES[m.category as AssetCategory];
                    return (
                      <TableRow key={m._id}>
                        <TableCell className="py-3">
                          <span className="inline-block rounded bg-muted/50 px-1.5 py-0.5 font-mono text-sm font-medium">
                            {m.ticker}
                          </span>
                        </TableCell>
                        <TableCell className="py-3">
                          {catMeta ? (
                            <span className="flex items-center gap-1.5 text-sm">
                              <span
                                className="inline-block h-2 w-2 rounded-full"
                                style={{ backgroundColor: catMeta.color }}
                              />
                              {catMeta.label}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              {m.category}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="py-3">
                          {m.source === "seed" ? (
                            <Badge variant="secondary" className="text-xs">
                              seed
                            </Badge>
                          ) : (
                            <Badge variant="default" className="text-xs">
                              user
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(m.ticker)}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredMappings?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                        {search || categoryFilter ? "No tickers match your filter." : "No ticker mappings yet."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
