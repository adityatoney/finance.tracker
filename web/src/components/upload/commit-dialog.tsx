"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { ParseResult, HoldingParsed } from "@/lib/types";
import { formatCurrencyDetailed } from "@/lib/utils/format";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Calendar,
  Building2,
  Wallet,
  ArrowDownToLine,
  Tags,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import { CategoryDistributionBar } from "@/components/upload/category-distribution-bar";

interface CommitDialogProps {
  data: ParseResult;
  tickerOverridesCount: number;
  tickerOverrides?: Record<string, string>;
  tickerMapLookup?: Record<string, string>;
  isCommitting: boolean;
  error?: string | null;
  onCommit: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommitDialog({
  data,
  tickerOverridesCount,
  tickerOverrides = {},
  tickerMapLookup = {},
  isCommitting,
  error,
  onCommit,
  open,
  onOpenChange,
}: CommitDialogProps) {
  const totalValue = data.accounts.reduce((s, a) => s + a.total_value, 0);
  const holdingsCount = data.accounts.reduce(
    (s, a) => s + a.holdings.length,
    0
  );
  const allHoldings: HoldingParsed[] = data.accounts.flatMap(
    (a) => a.holdings
  );

  const summaryItems = [
    {
      icon: Calendar,
      label: "Statement Date",
      value: data.statement_date,
    },
    {
      icon: Building2,
      label: "Brokerage",
      value: data.brokerage,
      capitalize: true,
    },
    {
      icon: Wallet,
      label: "Holdings",
      value: `${holdingsCount} across ${data.accounts.length} account${data.accounts.length !== 1 ? "s" : ""}`,
    },
    {
      icon: ArrowDownToLine,
      label: "Deposits",
      value: String(data.deposits.length),
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm Upload</DialogTitle>
          <DialogDescription>
            Review the summary below before encrypting and committing.
          </DialogDescription>
        </DialogHeader>

        {/* Large total value */}
        <div className="text-center py-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Total Portfolio Value
          </p>
          <p className="text-2xl font-bold tracking-tight mt-1">
            {formatCurrencyDetailed(totalValue)}
          </p>
        </div>

        {/* Category distribution bar */}
        {allHoldings.length > 0 && (
          <CategoryDistributionBar holdings={allHoldings} tickerOverrides={tickerOverrides} tickerMapLookup={tickerMapLookup} className="px-1" />
        )}

        <Separator />

        {/* Summary items with icons */}
        <div className="space-y-3 py-1">
          {summaryItems.map((item) => (
            <div key={item.label} className="flex items-center gap-3 text-sm">
              <item.icon className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground flex-1">
                {item.label}
              </span>
              <span
                className={`font-medium ${item.capitalize ? "capitalize" : ""}`}
              >
                {item.value}
              </span>
            </div>
          ))}
          {tickerOverridesCount > 0 && (
            <div className="flex items-center gap-3 text-sm">
              <Tags className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground flex-1">
                New Ticker Mappings
              </span>
              <span className="font-medium">{tickerOverridesCount}</span>
            </div>
          )}
        </div>

        {/* Error display */}
        {error && (
          <Alert variant="destructive" className="mt-2">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-sm">{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isCommitting}
          >
            Cancel
          </Button>
          <Button onClick={onCommit} disabled={isCommitting}>
            {isCommitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Encrypting...
              </>
            ) : (
              <>
                <ShieldCheck className="mr-2 h-4 w-4" />
                Encrypt & Commit
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
