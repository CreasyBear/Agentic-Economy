import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import type { z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FALLBACK_MARKET_RETURN_CONTEXT,
  type MarketReturnContext,
} from "@/components/ae/market/market-return-context";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatOperationPrice,
  formatOperationReadiness,
} from "@/modules/market/operation-view-model";
import type {
  PublicOperationAvailability,
  PublicOperationPrice,
} from "@/modules/capability-supply/public";
import { operationChoiceCompareOutputSchema } from "@/modules/registry/operation-choice-contracts";

export type MarketComparison = z.infer<typeof operationChoiceCompareOutputSchema>;

type ComparisonField = "price" | "availability" | "dataUse" | "effects";

const comparisonRows: readonly Readonly<{
  field: ComparisonField;
  label: string;
}>[] = [
  { field: "price", label: "Price" },
  { field: "availability", label: "Readiness" },
  { field: "dataUse", label: "Data use" },
  { field: "effects", label: "Effects" },
];

export function AeMarketComparisonView({
  comparison,
  onEditSelection,
  onBack,
  onRetry,
  returnTo = FALLBACK_MARKET_RETURN_CONTEXT,
}: {
  comparison: MarketComparison;
  onEditSelection: () => void;
  onBack: () => void;
  onRetry: () => void;
  returnTo?: MarketReturnContext;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [comparison]);

  if (comparison.kind === "unavailable") {
    return (
      <div className="ae-rail grid min-h-dvh gap-section pb-page">
        <div className="grid gap-intra">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Catalog comparison
          </p>
          <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-semibold tracking-tight outline-none">
            Comparison unavailable
          </h1>
        </div>
        <Alert>
          <AlertTitle>{unavailableTitle(comparison.reason)}</AlertTitle>
          <AlertDescription>
            <p>{unavailableDescription(comparison.reason)}</p>
            <div className="flex flex-wrap gap-intra pt-intra">
              <Button type="button" onClick={onRetry}>Try again</Button>
              <Button type="button" variant="outline" onClick={onEditSelection}>
                Edit selection
              </Button>
              <Button type="button" variant="ghost" onClick={onBack}>
                Back to results
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="ae-rail grid min-h-dvh content-start gap-section pb-page">
      <div className="flex min-w-0 max-w-full flex-wrap items-end justify-between gap-related">
        <div className="grid min-w-0 gap-intra">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Catalog comparison
          </p>
          <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-semibold tracking-tight outline-none">
            Compare Operations
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Canonical published terms and current readiness for the selected Operations.
          </p>
        </div>
        <div className="flex flex-wrap gap-intra">
          <Button type="button" variant="outline" onClick={onEditSelection}>
            Edit selection
          </Button>
          <Button type="button" variant="ghost" onClick={onBack}>
            Back to results
          </Button>
        </div>
      </div>

      <Card className="min-w-0 max-w-full">
        <CardHeader>
          <CardTitle>Current comparison</CardTitle>
          <CardDescription>
            {comparison.operations.length.toLocaleString()} Operations · prices and policies are sourced from the current catalog contract.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Fact</TableHead>
                {comparison.operations.map((operation) => (
                  <TableHead key={operation.operationRef} scope="col" className="min-w-52 whitespace-normal align-top">
                    <div className="grid gap-intra py-intra normal-case tracking-normal">
                      <span className="text-sm font-semibold text-foreground">{operation.title}</span>
                      <span className="font-sans text-xs font-normal text-muted-foreground">{operation.supplier.name}</span>
                      <Button asChild variant="outline" size="sm" className="w-fit min-h-touch">
                        <Link
                          to="/operations/$operationRef"
                          params={{ operationRef: operation.operationRef }}
                          search={{ from: returnTo }}
                          aria-label={`Inspect ${operation.title} by ${operation.supplier.name}`}
                        >
                          Inspect
                        </Link>
                      </Button>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {comparisonRows.map(({ field, label }) => (
                <TableRow key={field}>
                  <TableHead scope="row" className="align-top">{label}</TableHead>
                  {comparison.operations.map((operation) => (
                    <TableCell key={operation.operationRef} className="min-w-52 whitespace-normal align-top">
                      <ComparisonValue
                        field={field}
                        value={comparisonValue(comparison, field, operation.operationRef)}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function ComparisonValue({ field, value }: { field: ComparisonField; value: unknown }) {
  if (field === "price") {
    return isOperationPrice(value)
      ? <span className="font-mono tabular-nums">{formatOperationPrice(value)}</span>
      : <span className="text-muted-foreground">Not reported</span>;
  }
  if (field === "availability") {
    if (!isAvailability(value)) {
      return <span className="text-muted-foreground">Not reported</span>;
    }
    const label = formatOperationReadiness(value.posture);
    return <Badge variant={value.posture === "routeable" ? "success" : value.posture === "setup_required" ? "warning" : "outline"}>{label}</Badge>;
  }
  if (field === "dataUse") {
    const labels = policyLabels(value, "classification", {
      public: "Public data",
      personal: "Personal data",
      sensitive: "Sensitive data",
      credential: "Credentials",
    });
    return <span>{policyValue(labels, value, "No declared data use")}</span>;
  }
  const labels = policyLabels(value, "class", {
    data_release: "Data release",
    financial_exposure: "Financial exposure",
    external_state_change: "External state change",
  });
  return <span>{policyValue(labels, value, "No declared effects")}</span>;
}

function policyValue(
  labels: string | undefined,
  rawValue: unknown,
  emptyLabel: string,
): string {
  if (labels !== undefined) return labels;
  return Array.isArray(rawValue) && rawValue.length === 0
    ? emptyLabel
    : "Not reported";
}

function comparisonValue(
  comparison: Extract<MarketComparison, { kind: "ok" }>,
  field: ComparisonField,
  operationRef: string,
): unknown {
  return comparison.facts
    .find((fact) => fact.field === field)
    ?.values.find((entry) => entry.operationRef === operationRef)?.value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOperationPrice(value: unknown): value is PublicOperationPrice {
  return isRecord(value) &&
    (value.kind === "fixed" || value.kind === "range" || value.kind === "on_request");
}

function isAvailability(
  value: unknown,
): value is Pick<PublicOperationAvailability, "posture"> {
  return isRecord(value) &&
    (value.posture === "routeable" || value.posture === "setup_required" || value.posture === "unavailable");
}

function policyLabels(
  value: unknown,
  key: "classification" | "class",
  labels: Readonly<Record<string, string>>,
): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const found = [...new Set(value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry[key] !== "string") return [];
    const label = labels[entry[key]];
    return label === undefined ? [] : [label];
  }))];
  return found.length === 0 ? undefined : found.join(", ");
}

function unavailableTitle(reason: Extract<MarketComparison, { kind: "unavailable" }>["reason"]): string {
  if (reason === "operation_not_found") return "An Operation is no longer listed";
  if (reason === "operation_unavailable") return "An Operation is not currently available";
  return "This comparison could not be read";
}

function unavailableDescription(reason: Extract<MarketComparison, { kind: "unavailable" }>["reason"]): string {
  if (reason === "operation_not_found") return "Edit the selection to replace the missing Operation, then compare again.";
  if (reason === "operation_unavailable") return "Readiness changed after selection. Edit the selection or retry after the catalog updates.";
  return "The comparison references were refused. Return to the results and select two to four current Operations.";
}
