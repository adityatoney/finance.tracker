import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { KpiData, AssetCategory } from "@/lib/types";
import { formatCurrency, formatPercent } from "@/lib/utils/format";
import {
  Shield,
  Landmark,
  TrendingUp,
  PiggyBank,
  Bitcoin,
  type LucideIcon,
} from "lucide-react";

const CATEGORY_ICONS: Record<AssetCategory, LucideIcon> = {
  foundational: Shield,
  value: Landmark,
  growth: TrendingUp,
  emergency_fund: PiggyBank,
  btc_crypto: Bitcoin,
};

interface KpiCardProps {
  data: KpiData;
}

export function KpiCard({ data }: KpiCardProps) {
  const isPositive = data.momDelta >= 0;
  const Icon = CATEGORY_ICONS[data.category] || TrendingUp;

  return (
    <Card className="relative overflow-hidden hover:shadow-sm transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {data.label}
          </p>
          <Icon className="h-5 w-5 text-muted-foreground/30" />
        </div>
        <p className="mt-2 text-3xl font-bold tracking-tight">
          {formatCurrency(data.currentValue)}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Badge
            className={
              isPositive
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 border-0 text-[10px] px-1.5"
                : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 border-0 text-[10px] px-1.5"
            }
          >
            {isPositive ? "▲" : "▼"} {formatPercent(data.momDeltaPercent)}
          </Badge>
          <span className="text-[11px] text-muted-foreground">
            vs last month
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
