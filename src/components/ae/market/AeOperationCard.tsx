import { Link } from "@tanstack/react-router";

import { AeFactList } from "@/components/ae/data/AeFactList";
import { Badge } from "@/components/ui/badge";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import type { OperationCardViewModel } from "@/modules/market/operation-view-model";

const readinessVariants = {
  Routeable: "success",
  Integrated: "warning",
  Unavailable: "outline",
} as const;

export function AeOperationCard({
  operation,
}: {
  operation: OperationCardViewModel;
}) {
  return (
    <li className="border-b last:border-b-0 [contain-intrinsic-size:auto_7.25rem] [content-visibility:auto]">
      <Item
        asChild
        size="sm"
        className="group rounded-none px-4 py-3.5 transition-colors duration-base ease-standard hover:bg-brand-muted/35 hover:shadow-market-row-hover active:bg-brand-muted/55 sm:px-5 md:grid md:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] md:gap-5"
      >
        <Link
          to="/operations/$operationRef"
          params={{ operationRef: operation.operationRef }}
          aria-label={`Inspect ${operation.title}`}
        >
          <ItemContent className="min-w-0 basis-full md:basis-auto">
            <ItemTitle className="max-w-full flex-wrap gap-2">
              <span className="line-clamp-2 break-words underline-offset-4 transition-colors duration-fast group-hover:text-brand-strong group-hover:underline">
                {operation.title}
              </span>
              <Badge
                variant={readinessVariants[operation.readiness]}
                className="shrink-0"
                title={operation.trustFact}
              >
                {operation.readinessLabel}
              </Badge>
            </ItemTitle>
            <p className="text-xs font-medium text-muted-foreground">
              {operation.supplierName}
            </p>
            <ItemDescription className="max-w-2xl break-words text-pretty">
              {operation.summary}
            </ItemDescription>
          </ItemContent>

          <AeFactList
            density="compact"
            className="w-full grid-cols-2 sm:grid-cols-4 md:w-auto"
            facts={[
              {
                label: "Price",
                value: operation.price,
                mono: true,
                definition: "Published price for this exact Operation.",
              },
              {
                label: "Rating",
                value: operation.rating.display,
                muted: operation.rating.kind === "unrated",
                definition: operation.rating.definition,
              },
              {
                label: "Calls",
                value: operation.popularity.display,
                muted: operation.popularity.kind === "no_activity",
                definition: operation.popularity.definition,
              },
              {
                label: "Latency",
                value: operation.latency.display,
                muted: operation.latency.kind === "insufficient_sample",
                definition: operation.latency.definition,
              },
            ]}
          />
        </Link>
      </Item>
    </li>
  );
}
