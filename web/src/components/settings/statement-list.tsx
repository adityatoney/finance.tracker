"use client";

import { useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { StatementMeta } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { Trash2, Loader2, AlertCircle } from "lucide-react";

interface StatementListProps {
  statements: (StatementMeta & { _id?: string })[];
  onDelete: (args: { statementId: any }) => Promise<unknown>;
}

export function StatementList({ statements, onDelete }: StatementListProps) {
  const router = useRouter();
  const [deleteTarget, setDeleteTarget] = useState<StatementMeta | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setError(null);
    try {
      await onDelete({ statementId: (deleteTarget as any)._id ?? deleteTarget.id });
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
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Brokerage</TableHead>
            <TableHead>File</TableHead>
            <TableHead className="text-right">Total Value</TableHead>
            <TableHead className="text-right">Deposits</TableHead>
            <TableHead>Uploaded</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {statements.map((s) => (
            <TableRow
              key={(s as any)._id ?? s.id}
              className="hover:bg-muted/50 cursor-pointer"
              onClick={() => router.push(`/statements/${(s as any)._id ?? s.id}`)}
            >
              <TableCell className="py-3 font-medium">{s.statementDate}</TableCell>
              <TableCell className="py-3 capitalize">{s.brokerage}</TableCell>
              <TableCell className="py-3 text-xs font-mono text-muted-foreground">
                {s.fileName}
              </TableCell>
              <TableCell className="py-3 text-right font-medium tabular-nums">
                {formatCurrency(s.totalValue)}
              </TableCell>
              <TableCell className="py-3 text-right tabular-nums">
                {formatCurrency(s.netDeposits)}
              </TableCell>
              <TableCell className="py-3 text-xs text-muted-foreground">
                {formatDate(s.uploadedAt)}
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
