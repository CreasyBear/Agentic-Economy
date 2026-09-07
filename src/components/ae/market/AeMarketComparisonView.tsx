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
import { toolChoiceCompareOutputSchema } from "@/modules/registry/tool-choice-contracts";

export type MarketComparison = z.infer<typeof toolChoiceCompareOutputSchema>;

type ComparisonField = "description" | "priceLabel" | "healthStatus";

const comparisonRows: readonly Readonly<{
  field: ComparisonField;
  label: string;
}>[] = [
  { field: "description", label: "Description" },
  { field: "priceLabel", label: "Indicative price" },
  { field: "healthStatus", label: "Catalog health" },
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
            Compare Tools
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Canonical published terms and current readiness for the selected Tools.
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
            {comparison.tools.length.toLocaleString()} Tools · prices and policies are sourced from the current catalog contract.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Fact</TableHead>
                {comparison.tools.map((tool) => (
                  <TableHead key={tool.toolRef} scope="col" className="min-w-52 whitespace-normal align-top">
                    <div className="grid gap-intra py-intra normal-case tracking-normal">
                      <span className="text-sm font-semibold text-foreground">{tool.title}</span>
                      <span className="font-sans text-xs font-normal text-muted-foreground">{tool.provider.name}</span>
                      <Button asChild variant="outline" size="sm" className="w-fit min-h-touch">
                        <Link
                          to="/tools/$toolRef"
                          params={{ toolRef: tool.toolRef }}
                          search={{ from: returnTo }}
                          aria-label={`Describe ${tool.title} by ${tool.provider.name}`}
                        >
                          Describe
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
                  {comparison.tools.map((tool) => (
                    <TableCell key={tool.toolRef} className="min-w-52 whitespace-normal align-top">
                      <ComparisonValue
                        field={field}
                        value={comparisonValue(comparison, field, tool.toolRef)}
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
  if (typeof value !== "string") return <span className="text-muted-foreground">Not reported</span>;
  if (field === "healthStatus") {
    return <Badge variant={value === "operational" ? "success" : value === "degraded" ? "warning" : "outline"}>{value}</Badge>;
  }
  return <span className={field === "priceLabel" ? "font-mono tabular-nums" : undefined}>{value}</span>;
}

function comparisonValue(
  comparison: Extract<MarketComparison, { kind: "ok" }>,
  field: ComparisonField,
  toolRef: string,
): unknown {
  return comparison.tools.find((tool) => tool.toolRef === toolRef)?.[field];
}

function unavailableTitle(reason: Extract<MarketComparison, { kind: "unavailable" }>["reason"]): string {
  if (reason === "tool_not_found") return "A Tool is no longer listed";
  if (reason === "tool_unavailable") return "A Tool is not currently available";
  return "This comparison could not be read";
}

function unavailableDescription(reason: Extract<MarketComparison, { kind: "unavailable" }>["reason"]): string {
  if (reason === "tool_not_found") return "Edit the selection to replace the missing Tool, then compare again.";
  if (reason === "tool_unavailable") return "Readiness changed after selection. Edit the selection or retry after the catalog updates.";
  return "The comparison references were refused. Return to the results and select two to four current Tools.";
}
