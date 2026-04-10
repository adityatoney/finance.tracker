import { getDb } from "../index";
import { monthlySnapshots } from "../schema";
import { desc, eq, and, gte, lte } from "drizzle-orm";
import type { StackedAreaDataPoint, KpiData, AllocationSlice, AssetCategory } from "@/lib/types";
import { CATEGORIES, CATEGORY_ORDER } from "@/lib/constants/categories";

export function getSnapshotsForRange(startMonth: string, endMonth: string) {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(monthlySnapshots)
    .where(and(gte(monthlySnapshots.month, startMonth), lte(monthlySnapshots.month, endMonth)))
    .orderBy(monthlySnapshots.month)
    .all();
}

export function getAllSnapshots() {
  const db = getDb();
  if (!db) return [];
  return db.select().from(monthlySnapshots).orderBy(monthlySnapshots.month).all();
}

export function getStackedAreaData(): StackedAreaDataPoint[] {
  const snapshots = getAllSnapshots();
  const monthMap = new Map<string, StackedAreaDataPoint>();

  for (const s of snapshots) {
    if (!monthMap.has(s.month)) {
      monthMap.set(s.month, {
        month: s.month,
        foundational: 0,
        value: 0,
        growth: 0,
        emergency_fund: 0,
        btc_crypto: 0,
      });
    }
    const point = monthMap.get(s.month)!;
    const cat = s.category as AssetCategory;
    if (cat in point) {
      (point as unknown as Record<string, number>)[cat] = s.totalValue;
    }
  }

  return Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month));
}

export function getKpiData(): KpiData[] {
  const db = getDb();
  if (!db) return [];

  const snapshots = db.select().from(monthlySnapshots).orderBy(desc(monthlySnapshots.month)).all();
  if (snapshots.length === 0) return [];

  // Get the two most recent distinct months
  const months = [...new Set(snapshots.map(s => s.month))].sort().reverse();
  const currentMonth = months[0];
  const prevMonth = months[1] || null;

  return CATEGORY_ORDER.map((cat) => {
    const current = snapshots.find(s => s.month === currentMonth && s.category === cat);
    const prev = prevMonth ? snapshots.find(s => s.month === prevMonth && s.category === cat) : null;

    const currentValue = current?.totalValue ?? 0;
    const previousValue = prev?.totalValue ?? 0;
    const delta = currentValue - previousValue;
    const deltaPercent = previousValue > 0 ? (delta / previousValue) * 100 : 0;

    return {
      category: cat,
      label: CATEGORIES[cat].label,
      currentValue,
      previousValue,
      momDelta: delta,
      momDeltaPercent: deltaPercent,
      color: CATEGORIES[cat].color,
    };
  });
}

export function getAllocationData(): AllocationSlice[] {
  const db = getDb();
  if (!db) return [];

  const snapshots = db.select().from(monthlySnapshots).orderBy(desc(monthlySnapshots.month)).all();
  if (snapshots.length === 0) return [];

  const latestMonth = [...new Set(snapshots.map(s => s.month))].sort().reverse()[0];
  const latest = snapshots.filter(s => s.month === latestMonth);
  const total = latest.reduce((sum, s) => sum + s.totalValue, 0);

  return CATEGORY_ORDER.map((cat) => {
    const snap = latest.find(s => s.category === cat);
    const value = snap?.totalValue ?? 0;
    return {
      category: cat,
      label: CATEGORIES[cat].label,
      value,
      percentage: total > 0 ? (value / total) * 100 : 0,
      color: CATEGORIES[cat].color,
    };
  }).filter(s => s.value > 0);
}
