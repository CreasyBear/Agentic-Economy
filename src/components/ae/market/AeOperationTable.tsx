import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";

import { AeFactList, type AeFact } from "@/components/ae/data/AeFactList";
import { AeRecordSheet } from "@/components/ae/layout/AeRecordSheet";
import {
  AeOperatorSortableHeader,
  AeRecordTable,
} from "@/components/ae/operator/AeOperatorDataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OperationCardViewModel } from "@/modules/market/operation-view-model";

const readinessVariants = {
  Routeable: "success",
  Integrated: "warning",
  Unavailable: "outline",
} as const;

export function AeOperationTable({
  operations,
}: {
  operations: readonly OperationCardViewModel[];
}) {
  const [selected, setSelected] = useState<OperationCardViewModel | undefined>();
  const columns = useMemo<ColumnDef<OperationCardViewModel, unknown>[]>(
    () => [
      {
        id: "operation",
        accessorKey: "title",
        header: ({ column }) => (
          <AeOperatorSortableHeader label="Operation" column={column} />
        ),
        cell: ({ row }) => {
          const routeable = row.original.readiness === "Routeable";
          return (
            <div className="grid min-w-[12rem] gap-0.5">
              <Link
                to="/operations/$operationRef"
                params={{ operationRef: row.original.operationRef }}
                aria-label={`${routeable ? "Use" : "Inspect"} ${row.original.title}`}
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                {row.original.title}
              </Link>
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
        header: ({ column }) => (
          <AeOperatorSortableHeader label="Price" column={column} />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-sm tabular-nums">{row.original.price}</span>
        ),
      },
      {
        id: "readiness",
        accessorKey: "readinessLabel",
        header: ({ column }) => (
          <AeOperatorSortableHeader label="Readiness" column={column} />
        ),
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
    <>
      <AeRecordTable
        columns={columns}
        data={operations}
        caption="Operations"
        countLabel="Operations"
        filterPlaceholder="Filter Operations…"
        emptyMessage="No Operations match this filter."
        onRowClick={setSelected}
      />
      <AeRecordSheet
        open={selected !== undefined}
        onOpenChange={(open) => {
          if (!open) setSelected(undefined);
        }}
        title={selected?.title ?? "Operation"}
        {...(selected?.summary === undefined ? {} : { description: selected.summary })}
        {...(selected === undefined ? {} : { facts: operationFacts(selected) })}
        {...(selected === undefined
          ? {}
          : {
              action: (
                <Button asChild className="min-h-11">
                  <Link
                    to="/operations/$operationRef"
                    params={{ operationRef: selected.operationRef }}
                  >
                    {selected.readiness === "Routeable" ? "Use" : "Inspect"} {selected.title}
                  </Link>
                </Button>
              ),
            })}
      />
    </>
  );
}

function operationFacts(operation: OperationCardViewModel): readonly AeFact[] {
  return [
    { label: "Supplier", value: operation.supplierName },
    { label: "Price", value: operation.price, mono: true },
    { label: "Readiness", value: operation.readinessLabel },
    { label: "Call", value: operation.callLabel },
    { label: "Authentication", value: operation.authentication },
    { label: "Rating", value: operation.rating.display },
    { label: "Calls", value: operation.popularity.display },
    { label: "Latency", value: operation.latency.display, mono: true },
  ];
}
