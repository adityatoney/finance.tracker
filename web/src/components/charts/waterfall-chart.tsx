"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from "recharts";
import { formatCurrency } from "@/lib/utils/format";

interface WaterfallChartProps {
  contributions: number;
  marketGain: number;
  startValue: number;
  endValue: number;
}

export function WaterfallChart({ contributions, marketGain, startValue, endValue }: WaterfallChartProps) {
  const data = [
    { name: "Start", value: startValue, invisible: 0, type: "total" },
    { name: "Contributions", value: contributions, invisible: startValue, type: "contribution" },
    { name: "Market Gain", value: marketGain, invisible: startValue + contributions, type: marketGain >= 0 ? "gain" : "loss" },
    { name: "End", value: endValue, invisible: 0, type: "total" },
  ];

  const colors: Record<string, string> = {
    total: "#6B7280",
    contribution: "#3B82F6",
    gain: "#10B981",
    loss: "#EF4444",
  };

  if (startValue === 0 && endValue === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center text-muted-foreground">
        No data for waterfall chart yet.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="name" className="text-xs" />
        <YAxis tickFormatter={(v: number) => v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `$${(v / 1_000).toFixed(0)}K` : `$${v}`} width={55} className="text-xs" />
        <Tooltip formatter={(value: unknown) => formatCurrency(Number(value))} />
        <Bar dataKey="invisible" stackId="stack" fill="transparent" />
        <Bar dataKey="value" stackId="stack">
          {data.map((entry, index) => (
            <Cell key={index} fill={colors[entry.type]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
