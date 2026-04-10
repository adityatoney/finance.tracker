import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function DashboardLoading() {
  return (
    <div className="space-y-8">
      {/* Page header skeleton */}
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>

      {/* KPI Cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-9 w-28 mt-2" />
              <Skeleton className="h-5 w-24 mt-3" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart skeleton */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-36" />
        <Card>
          <CardContent className="pt-6">
            <Skeleton className="h-[350px] w-full rounded-lg" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
