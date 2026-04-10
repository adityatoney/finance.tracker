import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface SectionHeaderProps {
  icon: LucideIcon;
  title: string;
  count?: number;
  children?: React.ReactNode; // right-aligned actions
}

export function SectionHeader({ icon: Icon, title, count, children }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
        {count !== undefined && (
          <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-[10px] font-medium rounded-full">
            {count}
          </Badge>
        )}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
