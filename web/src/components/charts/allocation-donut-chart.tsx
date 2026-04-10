"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { AllocationSlice } from "@/lib/types";
import { formatCurrency } from "@/lib/utils/format";

interface AllocationDonutChartProps {
  data: AllocationSlice[];
}

export function AllocationDonutChart({ data }: AllocationDonutChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center text-muted-foreground">
        No allocation data available.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
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
        <Tooltip
          formatter={(value: unknown) => formatCurrency(Number(value))}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
