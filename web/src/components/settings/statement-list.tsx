"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatCurrency } from "@/lib/utils/format";
import { Trash2, Loader2, AlertCircle, Search } from "lucide-react";
import { cn } from "@/lib/utils";

/** Accepts either the old StatementMeta shape or the Convex document shape */
interface StatementRow {
  _id?: string;
  id?: string;
  brokerage: string;
  statementDate: string;
  fileName: string;
  totalValue: number;
  netDeposits: number;
  uploadedAt?: string;
}

interface StatementListProps {
  statements: StatementRow[];
  onDelete: (args: { statementId: any }) => Promise<unknown>;
}

export function StatementList({ statements, onDelete }: StatementListProps) {
  const router = useRouter();
  const [deleteTarget, setDeleteTarget] = useState<StatementRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [brokerageFilter, setBrokerageFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  // Compute unique dates and brokerages for filter options
  const uniqueDates = useMemo(
    () => [...new Set(statements.map((s) => s.statementDate))].sort().reverse(),
    [statements]
  );
  const uniqueBrokerages = useMemo(
    () => [...new Set(statements.map((s) => s.brokerage))].sort(),
    [statements]
  );

  // Filtered results
  const filtered = useMemo(() => {
    let result = statements;
    if (dateFilter !== "all") {
      result = result.filter((s) => s.statementDate === dateFilter);
    }
    if (brokerageFilter !== "all") {
      result = result.filter((s) => s.brokerage === brokerageFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.fileName.toLowerCase().includes(q) ||
          s.brokerage.toLowerCase().includes(q) ||
          s.statementDate.includes(q)
      );
    }
    return result;
  }, [statements, dateFilter, brokerageFilter, search]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setError(null);
    try {
      await onDelete({ statementId: deleteTarget._id ?? deleteTarget.id });
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setIsDeleting(false);
    }
  };

  if (statements.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No statements uploaded yet.
      </p>
    );
  }

  return (
    <>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 px-4 pt-4 pb-2">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files..."
            className="pl-9 h-9"
          />
        </div>
        <Select defaultValue="all" value={dateFilter} onValueChange={(v) => v && setDateFilter(v)}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue placeholder="All Dates" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Dates</SelectItem>
            {uniqueDates.map((d) => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select defaultValue="all" value={brokerageFilter} onValueChange={(v) => v && setBrokerageFilter(v)}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue placeholder="All Brokerages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Brokerages</SelectItem>
            {uniqueBrokerages.map((b) => (
              <SelectItem key={b} value={b} className="capitalize">{b}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto tabular-nums">
          {filtered.length} of {statements.length}
        </span>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Brokerage</TableHead>
            <TableHead>File</TableHead>
            <TableHead className="text-right">Total Value</TableHead>
            <TableHead className="text-right">Deposits</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((s) => (
            <TableRow
              key={s._id ?? s.id}
              className="hover:bg-muted/50 cursor-pointer"
              onClick={() => router.push(`/statements/${s._id ?? s.id}`)}
            >
              <TableCell className="py-3 font-medium tabular-nums">{s.statementDate}</TableCell>
              <TableCell className="py-3">
                <Badge variant="secondary" className="text-xs font-normal capitalize">
                  {s.brokerage}
                </Badge>
              </TableCell>
              <TableCell className="py-3 text-xs font-mono text-muted-foreground truncate max-w-[200px]">
                {s.fileName}
              </TableCell>
              <TableCell className="py-3 text-right font-medium tabular-nums">
                {formatCurrency(s.totalValue)}
              </TableCell>
              <TableCell className="py-3 text-right tabular-nums">
                {formatCurrency(s.netDeposits)}
              </TableCell>
              <TableCell className="py-3 text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={(e) => { e.stopPropagation(); setDeleteTarget(s); }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                No statements match your filters.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Statement</DialogTitle>
            <DialogDescription>
              This will permanently delete the statement, all its holdings, and rebuild snapshots.
            </DialogDescription>
          </DialogHeader>

          {deleteTarget && (
            <div className="space-y-2 py-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date</span>
                <span className="font-medium">{deleteTarget.statementDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Brokerage</span>
                <span className="font-medium capitalize">{deleteTarget.brokerage}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Value</span>
                <span className="font-medium">{formatCurrency(deleteTarget.totalValue)}</span>
              </div>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Statement
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
