"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import type { AllocationSlice } from "@/lib/types";
import { formatCurrency } from "@/lib/utils/format";

interface AllocationDonutChartProps {
  data: AllocationSlice[];
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const entry = payload[0].payload as AllocationSlice;
  return (
    <div className="rounded-lg border bg-background/95 backdrop-blur-sm shadow-lg px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
        <span className="font-medium">{entry.label}</span>
      </div>
      <div className="mt-1 text-muted-foreground">
        {formatCurrency(entry.value)} · {entry.percentage.toFixed(1)}%
      </div>
    </div>
  );
}

export function AllocationDonutChart({ data }: AllocationDonutChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center text-muted-foreground">
        No allocation data available.
      </div>
    );
  }

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="flex flex-col md:flex-row items-center gap-8">
      {/* Donut chart — left */}
      <div className="shrink-0">
        <ResponsiveContainer width={240} height={240}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
              dataKey="value"
              nameKey="label"
            >
              {data.map((entry, index) => (
                <Cell key={index} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <text x="50%" y="46%" textAnchor="middle" className="fill-foreground text-lg font-bold">
              {formatCurrency(total)}
            </text>
            <text x="50%" y="55%" textAnchor="middle" className="fill-muted-foreground text-[11px]">
              Total
            </text>
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend — right, vertically centered */}
      <div className="flex-1 w-full max-w-md space-y-4">
        {[...data].sort((a, b) => a.percentage - b.percentage).map((entry) => (
          <div key={entry.category} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: entry.color }} />
                <span className="text-sm font-medium">{entry.label}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold tabular-nums">{formatCurrency(entry.value)}</span>
                <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">
                  {entry.percentage.toFixed(1)}%
                </span>
              </div>
            </div>
            {/* Percentage bar */}
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.max(entry.percentage, 1)}%`,
                  backgroundColor: entry.color,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
