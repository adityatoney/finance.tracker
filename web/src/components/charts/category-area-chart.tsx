"use client";

import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { StackedAreaDataPoint } from "@/lib/types";
import { CATEGORIES, CATEGORY_ORDER } from "@/lib/constants/categories";
import type { AssetCategory } from "@/lib/types";
import { formatCurrency, formatMonth } from "@/lib/utils/format";

interface CategoryAreaChartProps {
  data: StackedAreaDataPoint[];
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  const total = payload.find((p: any) => p.dataKey === "total")?.value ?? 0;

  // Sort categories by value descending (exclude "total")
  const categories = payload
    .filter((p: any) => p.dataKey !== "total")
    .sort((a: any, b: any) => (b.value ?? 0) - (a.value ?? 0));

  return (
    <div className="rounded-lg border bg-background/95 backdrop-blur-sm shadow-lg px-3 py-2.5 text-sm min-w-[200px]">
      {/* Header: Mon-YY ($Total) */}
      <div className="font-semibold text-foreground mb-2 pb-1.5 border-b">
        {formatMonth(String(label))}
        <span className="ml-2 text-muted-foreground font-normal">
          ({formatCurrency(total)})
        </span>
      </div>

      {/* Category rows — aligned */}
      <div className="space-y-1">
        {categories.map((entry: any) => {
          const cat = String(entry.dataKey) as AssetCategory;
          const meta = CATEGORIES[cat];
          if (!meta || (entry.value ?? 0) === 0) return null;
          return (
            <div key={cat} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: meta.color }}
                />
                <span className="text-muted-foreground">{meta.label}</span>
              </div>
              <span className="font-medium tabular-nums">{formatCurrency(entry.value)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CategoryAreaChart({ data }: CategoryAreaChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center text-muted-foreground">
        No data yet. Upload statements to see your portfolio growth.
      </div>
    );
  }

  const formatCompact = (v: number) => {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
    return `$${v}`;
  };

  return (
    <ResponsiveContainer width="100%" height={380}>
      <ComposedChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="month"
          tickFormatter={formatMonth}
          className="text-xs"
        />
        <YAxis
          tickFormatter={formatCompact}
          width={55}
          className="text-xs"
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          formatter={(value: string) =>
            value === "total"
              ? "Total Assets"
              : CATEGORIES[value as keyof typeof CATEGORIES]?.label || value
          }
        />
        {CATEGORY_ORDER.map((cat) => (
          <Area
            key={cat}
            type="monotone"
            dataKey={cat}
            stackId="1"
            fill={CATEGORIES[cat].color}
            stroke={CATEGORIES[cat].color}
            fillOpacity={0.6}
          />
        ))}
        <Line
          type="monotone"
          dataKey="total"
          stroke="#8B5CF6"
          strokeWidth={2.5}
          dot={{ r: 4, fill: "#8B5CF6", strokeWidth: 0 }}
          strokeDasharray="6 3"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
