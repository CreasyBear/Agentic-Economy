import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import {
  AeRecordTable,
  type AeRecordTableSelection,
} from "@/components/ae/operator/AeOperatorDataTable";
import { Badge } from "@/components/ui/badge";
import {
  FALLBACK_MARKET_RETURN_CONTEXT,
  type MarketReturnContext,
} from "@/components/ae/market/market-return-context";
import { ToolPriceText } from "./AeToolPrice";
import { compareToolPrices, type ToolCardViewModel } from "@/modules/market/tool-view-model";

const readinessVariants = {
  Routeable: "success",
  SetupRequired: "warning",
  Unavailable: "outline",
} as const;

export function AeToolTable({
  tools,
  selection,
  returnTo = FALLBACK_MARKET_RETURN_CONTEXT,
}: {
  tools: readonly ToolCardViewModel[];
  selection?: AeRecordTableSelection<ToolCardViewModel>;
  returnTo?: MarketReturnContext;
}) {
  const columns = useMemo<ColumnDef<ToolCardViewModel, unknown>[]>(
    () => [
      {
        id: "tool",
        accessorKey: "title",
        header: "Name",
        cell: ({ row }) => {
          return (
            <div className="grid min-w-[12rem] gap-0.5">
              <span className="font-medium text-foreground">
                {row.original.title}
              </span>
              <span className="text-xs text-muted-foreground">
                {row.original.providerName}
              </span>
              {row.original.summary === "" ? null : <span className="max-w-md line-clamp-2 text-xs text-muted-foreground">{row.original.summary}</span>}
            </div>
          );
        },
      },
      {
        id: "price",
        accessorKey: "price",
        header: "Price",
        sortingFn: (left, right) => compareToolPrices(left.original, right.original),
        cell: ({ row }) => (
          <span className="font-mono text-sm tabular-nums"><ToolPriceText price={row.original.price} {...(row.original.priceValidUntil === undefined ? {} : { validUntil: row.original.priceValidUntil })} /></span>
        ),
      },
      {
        id: "readiness",
        accessorKey: "readinessLabel",
        header: "Readiness",
        cell: ({ row }) => (
          <Badge variant={readinessVariants[row.original.readiness]}>
            {row.original.readinessLabel}
          </Badge>
        ),
      },
      {
        id: "call",
        accessorKey: "callLabel",
        header: "Call",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.callLabel}</span>
        ),
      },
      {
        id: "rating",
        accessorFn: (row) => row.rating.display,
        header: "Rating",
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {row.original.rating.display}
          </span>
        ),
      },
      {
        id: "calls",
        accessorFn: (row) => row.popularity.display,
        header: "Calls",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{row.original.popularity.display}</span>
        ),
      },
      {
        id: "latency",
        accessorFn: (row) => row.latency.display,
        header: "Latency",
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {row.original.latency.display}
          </span>
        ),
      },
      {
        id: "auth",
        accessorKey: "authentication",
        header: "Access",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{row.original.authentication}</span>
        ),
      },
    ],
    [],
  );

  return (
    <AeRecordTable
      columns={columns}
      data={tools}
      caption="Catalog"
      countLabel="listed"
      emptyMessage="No Tools are available on this page."
      hideFilter
      getRowId={(tool) => tool.toolRef}
      {...(selection === undefined ? {} : { selection })}
      rowAction={{
        kind: "link",
        label: "Open",
        getHref: (tool) =>
          `/tools/${encodeURIComponent(tool.toolRef)}?${new URLSearchParams({ from: returnTo }).toString()}`,
        getAccessibleLabel: (tool) =>
          `${tool.readiness === "Routeable" ? "Use" : "Inspect"} ${tool.title}`,
      }}
    />
  );
}
