import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import {
  AeRecordTable,
  type AeRecordTableSelection,
} from "@/components/ae/operator/AeOperatorDataTable";
import { Badge } from "@/components/ui/badge";
import type { OperationCardViewModel } from "@/modules/market/operation-view-model";

const readinessVariants = {
  Routeable: "success",
  SetupRequired: "warning",
  Unavailable: "outline",
} as const;

export function AeOperationTable({
  operations,
  selection,
}: {
  operations: readonly OperationCardViewModel[];
  selection?: AeRecordTableSelection<OperationCardViewModel>;
}) {
  const columns = useMemo<ColumnDef<OperationCardViewModel, unknown>[]>(
    () => [
      {
        id: "operation",
        accessorKey: "title",
        header: "Name",
        cell: ({ row }) => {
          return (
            <div className="grid min-w-[12rem] gap-0.5">
              <span className="font-medium text-foreground">
                {row.original.title}
              </span>
              <span className="text-xs text-muted-foreground">
                {row.original.supplierName}
              </span>
            </div>
          );
        },
      },
      {
        id: "price",
        accessorKey: "price",
        header: "Price",
        cell: ({ row }) => (
          <span className="font-mono text-sm tabular-nums">{row.original.price}</span>
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
      data={operations}
      caption="Catalog"
      countLabel="listed"
      emptyMessage="No Operations are available on this page."
      hideFilter
      getRowId={(operation) => operation.operationRef}
      {...(selection === undefined ? {} : { selection })}
      rowAction={{
        kind: "link",
        label: "Open",
        getHref: (operation) =>
          `/operations/${encodeURIComponent(operation.operationRef)}`,
        getAccessibleLabel: (operation) =>
          `${operation.readiness === "Routeable" ? "Use" : "Inspect"} ${operation.title}`,
      }}
    />
  );
}
