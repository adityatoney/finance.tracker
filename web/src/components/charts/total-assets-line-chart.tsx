"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatCurrency, formatMonth } from "@/lib/utils/format";

interface TotalAssetsLineChartProps {
  data: { month: string; total: number }[];
}

export function TotalAssetsLineChart({ data }: TotalAssetsLineChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-[250px] items-center justify-center text-muted-foreground">
        No data yet.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="month" tickFormatter={formatMonth} className="text-xs" />
        <YAxis tickFormatter={(v: number) => v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `$${(v / 1_000).toFixed(0)}K` : `$${v}`} width={55} className="text-xs" />
        <Tooltip
          formatter={(value: unknown) => [formatCurrency(Number(value)), "Total Assets"]}
          labelFormatter={(label: unknown) => formatMonth(String(label))}
        />
        <Line
          type="monotone"
          dataKey="total"
          stroke="#8B5CF6"
          strokeWidth={2}
          dot={{ r: 4, fill: "#8B5CF6" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
