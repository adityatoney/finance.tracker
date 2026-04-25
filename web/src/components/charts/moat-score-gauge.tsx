"use client";

interface MoatScoreGaugeProps {
  score: number; // 0-100
  size?: number; // px, default 120
  label?: string; // e.g., "Overall" or category name
  moatType?: string; // "wide" | "narrow" | "none" — for color override
}

function getGaugeColor(score: number, moatType?: string): string {
  // If moatType is provided, use it directly for color
  if (moatType === "wide") return "hsl(142, 70%, 45%)"; // green
  if (moatType === "narrow") return "hsl(38, 92%, 50%)"; // amber
  if (moatType === "none") return "hsl(0, 70%, 50%)"; // red

  // Otherwise derive from score
  if (score >= 67) return "hsl(142, 70%, 45%)"; // green
  if (score >= 34) return "hsl(38, 92%, 50%)"; // amber
  return "hsl(0, 70%, 50%)"; // red
}

export function MoatScoreGauge({
  score,
  size = 120,
  label,
  moatType,
}: MoatScoreGaugeProps) {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedScore = Math.max(0, Math.min(100, score));
  const progress = clampedScore / 100;
  const dashOffset = circumference * (1 - progress);

  const color = getGaugeColor(clampedScore, moatType);

  // Font size scales with gauge size
  const scoreFontSize = Math.max(14, size * 0.22);
  const labelFontSize = Math.max(10, size * 0.1);

  return (
    <div className="flex flex-col items-center gap-1">
      {/* SVG container with overlaid text */}
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className="-rotate-90"
          aria-hidden="true"
        >
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-muted/20"
          />
          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            className="transition-all duration-700 ease-out"
          />
        </svg>

        {/* Centered score text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="font-bold tabular-nums text-foreground"
            style={{ fontSize: scoreFontSize }}
            aria-label={`Moat score: ${Math.round(clampedScore)} out of 100`}
          >
            {Math.round(clampedScore)}
          </span>
        </div>
      </div>

      {/* Label below the gauge */}
      {label && (
        <span
          className="text-muted-foreground font-medium"
          style={{ fontSize: labelFontSize }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
