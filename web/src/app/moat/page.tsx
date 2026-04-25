"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Shield,
  Plus,
  RefreshCw,
  Trash2,
  Loader2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  AlertCircle,
  Lock,
  Globe,
  Scale,
  Gem,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronRight,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortField = "ticker" | "companyName" | "overallScore" | "moatType" | "confidence" | "trend";
type SortDir = "asc" | "desc";

interface CategoryScore {
  score: number;
  evidence: string[];
}

interface AnalysisSummary {
  _id: Id<"moatAnalyses">;
  ticker: string;
  companyName: string;
  overallScore: number;
  moatType: "wide" | "narrow" | "none";
  confidence: number;
  trend: "improving" | "stable" | "declining";
  analyzedAt: string;
}

interface AnalysisDetail {
  _id: Id<"moatAnalyses">;
  ticker: string;
  companyName: string;
  overallScore: number;
  moatType: "wide" | "narrow" | "none";
  confidence: number;
  trend: "improving" | "stable" | "declining";
  categories: {
    switching_costs: CategoryScore;
    network_effects: CategoryScore;
    cost_leadership: CategoryScore;
    intangible_assets: CategoryScore;
  };
  summary: string;
  risks: string[];
  analyzedAt: string;
}

interface EvidenceItem {
  _id: Id<"moatEvidence">;
  category: string;
  quote: string;
  filingSource: string;
  sentiment: "positive" | "negative" | "neutral";
  strength: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  switching_costs: { label: "Switching Costs", icon: Lock, color: "blue" },
  network_effects: { label: "Network Effects", icon: Globe, color: "purple" },
  cost_leadership: { label: "Cost Leadership", icon: Scale, color: "emerald" },
  intangible_assets: { label: "Intangible Assets", icon: Gem, color: "amber" },
};

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

function moatTypeColor(moatType: string): string {
  switch (moatType) {
    case "wide":
      return "text-emerald-600";
    case "narrow":
      return "text-amber-600";
    default:
      return "text-red-500";
  }
}

function moatTypeBgColor(moatType: string): string {
  switch (moatType) {
    case "wide":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400";
    case "narrow":
      return "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400";
    default:
      return "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400";
  }
}

function moatTypeLabel(moatType: string): string {
  switch (moatType) {
    case "wide":
      return "Wide Moat";
    case "narrow":
      return "Narrow Moat";
    default:
      return "No Moat";
  }
}

function scoreColor(score: number): string {
  if (score >= 67) return "text-emerald-600";
  if (score >= 34) return "text-amber-600";
  return "text-red-500";
}

function scoreBarColor(score: number): string {
  if (score >= 67) return "bg-emerald-500";
  if (score >= 34) return "bg-amber-500";
  return "bg-red-500";
}

function sentimentColor(sentiment: string): string {
  switch (sentiment) {
    case "positive":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400";
    case "negative":
      return "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400";
    default:
      return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400";
  }
}

function trendIcon(trend: string) {
  switch (trend) {
    case "improving":
      return <TrendingUp className="h-3.5 w-3.5" />;
    case "declining":
      return <TrendingDown className="h-3.5 w-3.5" />;
    default:
      return <Minus className="h-3.5 w-3.5" />;
  }
}

function trendBadgeColor(trend: string): string {
  switch (trend) {
    case "improving":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400";
    case "declining":
      return "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400";
    default:
      return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400";
  }
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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ScoreBar({ score, color }: { score: number; color: string }) {
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <div className="flex items-center gap-3">
      <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="text-sm font-semibold tabular-nums w-8 text-right">{clamped}</span>
    </div>
  );
}

function CategoryCard({
  categoryKey,
  data,
}: {
  categoryKey: string;
  data: CategoryScore;
}) {
  const config = CATEGORY_CONFIG[categoryKey];
  if (!config) return null;
  const Icon = config.icon;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">{config.label}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <ScoreBar score={data.score} color={scoreBarColor(data.score)} />
        {data.evidence.length > 0 && (
          <div className="space-y-2">
            {data.evidence.slice(0, 2).map((quote, idx) => (
              <blockquote
                key={idx}
                className="border-l-2 border-muted-foreground/20 pl-3 text-xs text-muted-foreground italic"
              >
                {quote}
              </blockquote>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EvidenceSection({
  evidence,
}: {
  evidence: EvidenceItem[] | undefined;
}) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  if (!evidence || evidence.length === 0) {
    return null;
  }

  // Group evidence by category
  const grouped = evidence.reduce<Record<string, EvidenceItem[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Evidence</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {Object.entries(grouped).map(([cat, items]) => {
          const config = CATEGORY_CONFIG[cat];
          const isExpanded = expandedCategories.has(cat);
          const Icon = config?.icon ?? Shield;
          const label = config?.label ?? cat;

          return (
            <div key={cat} className="border rounded-lg overflow-hidden">
              <button
                onClick={() => toggleCategory(cat)}
                className="flex items-center gap-2 w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium">{label}</span>
                <Badge variant="secondary" className="ml-auto text-[10px]">
                  {items.length}
                </Badge>
              </button>
              {isExpanded && (
                <div className="px-4 pb-3 space-y-3 border-t">
                  {items.map((item) => (
                    <div key={item._id} className="pt-3 space-y-1.5">
                      <blockquote className="border-l-2 border-muted-foreground/20 pl-3 text-sm text-muted-foreground italic">
                        {item.quote}
                      </blockquote>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">
                          {item.filingSource}
                        </Badge>
                        <Badge className={cn("text-[10px] border-0", sentimentColor(item.sentiment))}>
                          {item.sentiment}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          Strength: {item.strength}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function MoatAnalysisPage() {
  const analyses = useQuery(api.moat.listAnalyses) as AnalysisSummary[] | undefined;
  const analyzeTicker = useAction(api.moat.analyzeTicker);
  const deleteAnalysis = useMutation(api.moat.deleteAnalysis);

  const [newTicker, setNewTicker] = useState("");
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("overallScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Conditional queries — only fetch when a ticker is selected
  const analysisDetail = useQuery(
    api.moat.getAnalysis,
    selectedTicker ? { ticker: selectedTicker } : "skip"
  ) as AnalysisDetail | null | undefined;

  const evidenceData = useQuery(
    api.moat.getEvidence,
    analysisDetail?._id ? { analysisId: analysisDetail._id } : "skip"
  ) as EvidenceItem[] | undefined;

  // ---------- Handlers ----------

  const handleAnalyze = async () => {
    const ticker = newTicker.trim().toUpperCase();
    if (!ticker) return;
    setError(null);
    setAnalyzing(true);
    try {
      await analyzeTicker({ ticker });
      setNewTicker("");
      setSelectedTicker(ticker);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to analyze ${ticker}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleReanalyze = async (ticker: string) => {
    setError(null);
    setAnalyzing(true);
    try {
      await analyzeTicker({ ticker });
      setSelectedTicker(ticker);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to re-analyze ${ticker}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDelete = async (ticker: string) => {
    if (selectedTicker === ticker) setSelectedTicker(null);
    await deleteAnalysis({ ticker });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir(field === "ticker" || field === "companyName" ? "asc" : "desc");
    }
  };

  // ---------- Sorted list ----------

  const sortedAnalyses = useMemo(() => {
    if (!analyses) return [];
    const result = [...analyses];
    result.sort((a, b) => {
      let av: number | string = 0;
      let bv: number | string = 0;

      switch (sortField) {
        case "ticker":
          av = a.ticker;
          bv = b.ticker;
          break;
        case "companyName":
          av = a.companyName;
          bv = b.companyName;
          break;
        case "overallScore":
          av = a.overallScore;
          bv = b.overallScore;
          break;
        case "moatType":
          av = a.moatType;
          bv = b.moatType;
          break;
        case "confidence":
          av = a.confidence;
          bv = b.confidence;
          break;
        case "trend":
          av = a.trend;
          bv = b.trend;
          break;
      }

      let cmp = 0;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return result;
  }, [analyses, sortField, sortDir]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-30" />;
    return sortDir === "asc" ? <ArrowUp className="ml-1 h-3 w-3" /> : <ArrowDown className="ml-1 h-3 w-3" />;
  };

  const allCount = analyses?.length ?? 0;

  // ---------- Loading state ----------

  if (analyses === undefined) {
    return (
      <div className="space-y-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Shield className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Moat Analysis</h1>
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        </div>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // ---------- Render ----------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Shield className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Moat Analysis</h1>
            <p className="text-sm text-muted-foreground">
              Competitive advantage scoring &middot; Buffett/Graham methodology
            </p>
          </div>
        </div>
      </div>

      {/* Error */}
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
              onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
              placeholder="Enter ticker symbol (e.g., AAPL, MSFT, GOOG)"
              className="max-w-xs font-mono"
              disabled={analyzing}
            />
            <Button onClick={handleAnalyze} disabled={!newTicker.trim() || analyzing}>
              {analyzing ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Analyzing...
                </>
              ) : (
                <>
                  <Plus className="mr-1.5 h-4 w-4" /> Analyze
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Selected Ticker Detail */}
      {selectedTicker && analysisDetail && (
        <div className="space-y-4">
          {/* Score Overview Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Overall Moat Score */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Overall Moat Score
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className={cn("text-4xl font-bold tabular-nums", scoreColor(analysisDetail.overallScore))}>
                  {analysisDetail.overallScore}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {analysisDetail.companyName} ({analysisDetail.ticker})
                </p>
              </CardContent>
            </Card>

            {/* Moat Type */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Moat Type
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Badge className={cn("text-sm px-3 py-1 border-0", moatTypeBgColor(analysisDetail.moatType))}>
                  {moatTypeLabel(analysisDetail.moatType)}
                </Badge>
              </CardContent>
            </Card>

            {/* Confidence */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Confidence
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-bold tabular-nums">
                  {analysisDetail.confidence}
                  <span className="text-lg text-muted-foreground">%</span>
                </p>
              </CardContent>
            </Card>

            {/* Trend */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Badge className={cn("text-sm px-3 py-1 border-0 inline-flex items-center gap-1.5", trendBadgeColor(analysisDetail.trend))}>
                  {trendIcon(analysisDetail.trend)}
                  {analysisDetail.trend.charAt(0).toUpperCase() + analysisDetail.trend.slice(1)}
                </Badge>
              </CardContent>
            </Card>
          </div>

          {/* Category Breakdown (2x2 grid) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(CATEGORY_CONFIG).map(([key]) => {
              const catData = analysisDetail.categories?.[key as keyof typeof analysisDetail.categories];
              if (!catData) return null;
              return <CategoryCard key={key} categoryKey={key} data={catData} />;
            })}
          </div>

          {/* Summary Card */}
          {analysisDetail.summary && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Buffett-Style Assessment</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {analysisDetail.summary}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Key Risks Card */}
          {analysisDetail.risks && analysisDetail.risks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Key Risks</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {analysisDetail.risks.slice(0, 3).map((risk, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-red-400 shrink-0" />
                      {risk}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Evidence Accordion */}
          <EvidenceSection evidence={evidenceData} />
        </div>
      )}

      {/* Analyzed Tickers Table */}
      {allCount === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-20">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
              <Shield className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="text-lg font-semibold">No analyses yet</p>
            <p className="text-sm text-muted-foreground mt-1">Enter a ticker above to run your first moat analysis.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>
                    <button
                      onClick={() => handleSort("ticker")}
                      className="inline-flex items-center text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                    >
                      Ticker <SortIcon field="ticker" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      onClick={() => handleSort("companyName")}
                      className="inline-flex items-center text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                    >
                      Company <SortIcon field="companyName" />
                    </button>
                  </TableHead>
                  <TableHead className="text-right">
                    <div className="inline-flex items-center gap-1 ml-auto">
                      <button
                        onClick={() => handleSort("overallScore")}
                        className="inline-flex items-center text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                      >
                        Moat Score <SortIcon field="overallScore" />
                      </button>
                      <Popover>
                        <PopoverTrigger className="text-muted-foreground hover:text-foreground transition-colors">
                          <Info className="h-3.5 w-3.5" />
                        </PopoverTrigger>
                        <PopoverContent className="w-96 text-left text-xs" side="bottom" align="center">
                          <p className="font-semibold text-sm mb-2">Moat Analysis Legend</p>
                          <p className="text-muted-foreground mb-3">
                            AI-powered competitive advantage scoring using <span className="font-medium text-foreground">SEC filings</span> and <span className="font-medium text-foreground">earnings transcripts</span>, based on Buffett/Graham methodology.
                          </p>

                          <div className="space-y-1.5 mb-3">
                            <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wider">Moat Score (1–100)</p>
                            <p className="text-muted-foreground">Composite score across four competitive advantage categories:</p>
                            <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                              <div className="flex items-center gap-1.5">
                                <Lock className="h-3 w-3 text-blue-500 shrink-0" />
                                <span className="text-muted-foreground"><span className="font-medium text-foreground">Switching Costs</span> — customer lock-in</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Globe className="h-3 w-3 text-purple-500 shrink-0" />
                                <span className="text-muted-foreground"><span className="font-medium text-foreground">Network Effects</span> — value grows with users</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Scale className="h-3 w-3 text-emerald-500 shrink-0" />
                                <span className="text-muted-foreground"><span className="font-medium text-foreground">Cost Leadership</span> — lowest-cost producer</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Gem className="h-3 w-3 text-amber-500 shrink-0" />
                                <span className="text-muted-foreground"><span className="font-medium text-foreground">Intangible Assets</span> — brands, patents</span>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-1.5 mb-3">
                            <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wider">Moat Type</p>
                            <div className="flex items-center gap-2">
                              <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 shrink-0">Wide Moat</span>
                              <span className="text-muted-foreground">Score 67+ — strong, durable advantages</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400 shrink-0">Narrow Moat</span>
                              <span className="text-muted-foreground">Score 34–66 — some advantages, less defensible</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400 shrink-0">No Moat</span>
                              <span className="text-muted-foreground">Score &lt; 34 — little competitive edge</span>
                            </div>
                          </div>

                          <div className="space-y-1.5 mb-3">
                            <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wider">Confidence (0–100%)</p>
                            <p className="text-muted-foreground">How confident the analysis is based on evidence quality and quantity. High = many filings with consistent data. Low = sparse or contradictory signals.</p>
                          </div>

                          <div className="space-y-1.5">
                            <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wider">Trend</p>
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 shrink-0"><TrendingUp className="h-2.5 w-2.5" /> Improving</span>
                              <span className="text-muted-foreground">Moat getting stronger in recent filings</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400 shrink-0"><Minus className="h-2.5 w-2.5" /> Stable</span>
                              <span className="text-muted-foreground">Competitive position is steady</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400 shrink-0"><TrendingDown className="h-2.5 w-2.5" /> Declining</span>
                              <span className="text-muted-foreground">Moat erosion signals detected</span>
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </TableHead>
                  <TableHead>
                    <button
                      onClick={() => handleSort("moatType")}
                      className="inline-flex items-center text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                    >
                      Moat Type <SortIcon field="moatType" />
                    </button>
                  </TableHead>
                  <TableHead className="text-right">
                    <button
                      onClick={() => handleSort("confidence")}
                      className="inline-flex items-center text-xs font-semibold uppercase tracking-wider whitespace-nowrap ml-auto"
                    >
                      Confidence <SortIcon field="confidence" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      onClick={() => handleSort("trend")}
                      className="inline-flex items-center text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                    >
                      Trend <SortIcon field="trend" />
                    </button>
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider whitespace-nowrap">
                    Last Analyzed
                  </TableHead>
                  <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedAnalyses.map((a) => {
                  const isSelected = selectedTicker === a.ticker;
                  return (
                    <TableRow
                      key={a._id}
                      className={cn("group cursor-pointer", isSelected && "bg-muted/50")}
                      onClick={() => setSelectedTicker(isSelected ? null : a.ticker)}
                    >
                      <TableCell className="py-3">
                        <span className="inline-block rounded bg-muted/60 px-2 py-0.5 font-mono text-sm font-semibold">
                          {a.ticker}
                        </span>
                      </TableCell>
                      <TableCell className="py-3 text-muted-foreground max-w-[200px] truncate">
                        {a.companyName || "\u2014"}
                      </TableCell>
                      <TableCell className="py-3 text-right">
                        <span className={cn("text-sm font-semibold tabular-nums", scoreColor(a.overallScore))}>
                          {a.overallScore}
                        </span>
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge className={cn("text-[10px] border-0", moatTypeBgColor(a.moatType))}>
                          {moatTypeLabel(a.moatType)}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 text-right tabular-nums text-sm">
                        {a.confidence}%
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge className={cn("text-[10px] border-0 inline-flex items-center gap-1", trendBadgeColor(a.trend))}>
                          {trendIcon(a.trend)}
                          {a.trend.charAt(0).toUpperCase() + a.trend.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {a.analyzedAt ? formatTimeAgo(a.analyzedAt) : "\u2014"}
                      </TableCell>
                      <TableCell className="py-3 text-right">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => handleReanalyze(a.ticker)}
                            disabled={analyzing}
                            title="Re-analyze"
                          >
                            {analyzing && selectedTicker === a.ticker ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(a.ticker)}
                            title="Delete analysis"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {sortedAnalyses.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                      No analyses found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
