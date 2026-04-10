import { type AssetCategory, type CategoryMeta } from "@/lib/types";

export const CATEGORIES: Record<AssetCategory, CategoryMeta> = {
  foundational: {
    key: "foundational",
    label: "Foundational",
    color: "#3B82F6",
    tailwindBg: "bg-blue-500",
    tailwindText: "text-blue-500",
  },
  value: {
    key: "value",
    label: "Value",
    color: "#F59E0B",
    tailwindBg: "bg-amber-500",
    tailwindText: "text-amber-500",
  },
  growth: {
    key: "growth",
    label: "Growth",
    color: "#10B981",
    tailwindBg: "bg-emerald-500",
    tailwindText: "text-emerald-500",
  },
  emergency_fund: {
    key: "emergency_fund",
    label: "Emergency Fund",
    color: "#64748B",
    tailwindBg: "bg-slate-500",
    tailwindText: "text-slate-500",
  },
  btc_crypto: {
    key: "btc_crypto",
    label: "Crypto",
    color: "#F97316",
    tailwindBg: "bg-orange-500",
    tailwindText: "text-orange-500",
  },
} as const;

export const CATEGORY_ORDER: AssetCategory[] = [
  "foundational",
  "value",
  "growth",
  "emergency_fund",
  "btc_crypto",
];

export const BROKERAGES = [
  { value: "fidelity", label: "Fidelity" },
  { value: "netbenefits", label: "Fidelity NetBenefits (401k)" },
  { value: "robinhood", label: "Robinhood" },
  { value: "betterment", label: "Betterment" },
] as const;
