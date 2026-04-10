import type { HoldingParsed, AssetCategory } from "@/lib/types";
import { CATEGORIES, CATEGORY_ORDER } from "@/lib/constants/categories";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { formatCurrency } from "@/lib/utils/format";

interface CategoryDistributionBarProps {
  holdings: HoldingParsed[];
  className?: string;
  tickerOverrides?: Record<string, string>;
  tickerMapLookup?: Record<string, string>;
}

export function CategoryDistributionBar({ holdings, className, tickerOverrides = {}, tickerMapLookup = {} }: CategoryDistributionBarProps) {
  // Aggregate value by category
  const totals = new Map<string, number>();
  let grandTotal = 0;

  for (const h of holdings) {
    const cat = tickerOverrides[h.ticker] || tickerMapLookup[h.ticker.toUpperCase()] || h.category || "uncategorized";
    totals.set(cat, (totals.get(cat) ?? 0) + (h.ending_value ?? h.market_value));
    grandTotal += h.ending_value ?? h.market_value;
  }

  if (grandTotal === 0) return null;

  // Build segments in category order
  const segments: { key: string; label: string; color: string; value: number; pct: number }[] = [];

  for (const cat of CATEGORY_ORDER) {
    const val = totals.get(cat);
    if (val && val > 0) {
      const meta = CATEGORIES[cat];
      segments.push({
        key: cat,
        label: meta.label,
        color: meta.color,
        value: val,
        pct: (val / grandTotal) * 100,
      });
    }
  }

  // Uncategorized
  const uncatVal = totals.get("uncategorized");
  if (uncatVal && uncatVal > 0) {
    segments.push({
      key: "uncategorized",
      label: "Uncategorized",
      color: "#D1D5DB",
      value: uncatVal,
      pct: (uncatVal / grandTotal) * 100,
    });
  }

  return (
    <div className={className}>
      {/* Bar */}
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
        {segments.map((seg) => (
          <Tooltip key={seg.key}>
            <TooltipTrigger
              className="h-full transition-all"
              style={{
                width: `${Math.max(seg.pct, 1)}%`,
                backgroundColor: seg.color,
              }}
            />
            <TooltipContent side="top" className="text-xs">
              {seg.label}: {formatCurrency(seg.value)} ({seg.pct.toFixed(1)}%)
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
        {segments.map((seg) => (
          <span key={seg.key} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
            {seg.label} {seg.pct.toFixed(0)}%
          </span>
        ))}
      </div>
    </div>
  );
}
