import { Link } from "@tanstack/react-router";

import { AeFactList } from "@/components/ae/data/AeFactList";
import { AeOperationPrice } from "@/components/ae/market/AeOperationPrice";
import { Badge } from "@/components/ui/badge";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import type { OperationCardViewModel } from "@/modules/market/operation-view-model";
import { formatUtcTimestamp } from "@/lib/ui/format-time";

const readinessVariants = {
  Routeable: "success",
  Integrated: "warning",
  Unavailable: "outline",
} as const;

/**
 * The capability row on the market and home catalogue. Decision-shaped: the
 * total price leads so a buyer can compare, readiness and the call label sit
 * beside it, and the supporting evidence recedes into a compact compare
 * strip. The whole row is one link so the accessible name stays
 * `Use <title>`.
 */
export function AeOperationCard({
  operation,
}: {
  operation: OperationCardViewModel;
}) {
  const routeable = operation.readiness === "Routeable";

  return (
    <li className="border-b last:border-b-0 [contain-intrinsic-size:auto_7.25rem] [content-visibility:auto]">
      <Item
        asChild
        size="sm"
        className="group rounded-none px-4 py-4 transition-colors duration-base ease-standard hover:bg-brand-muted/35 hover:shadow-market-row-hover active:bg-brand-muted/55 sm:px-5 md:py-5"
      >
        <Link
          to="/operations/$operationRef"
          params={{ operationRef: operation.operationRef }}
          aria-label={`${routeable ? "Use" : "Inspect"} ${operation.title}`}
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

          <AeOperationPrice
            price={operation.price}
            className="basis-full justify-self-start md:w-40 md:basis-auto md:shrink-0 md:place-items-end"
          />
          <Separator />
          <ItemContent className="basis-full md:basis-auto">
            <AeFactList
              density="compact"
              className="w-full sm:grid-cols-3 md:grid-cols-5"
              facts={[
                {
                  label: "Call",
                  value: operation.callLabel,
                  muted: !routeable,
                  definition: operation.trustFact,
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
                {
                  label: "Authentication",
                  value: operation.authentication,
                  definition:
                    "Provider authentication required to call this capability.",
                },
                {
                  label: "Last verified",
                  value:
                    operation.lastVerifiedAt === undefined
                      ? "Not reported"
                      : `${formatUtcTimestamp(operation.lastVerifiedAt)} UTC`,
                  muted: operation.lastVerifiedAt === undefined,
                  definition:
                    "Most recent published readiness or price observation.",
                },
              ]}
            />
          </ItemContent>
        </Link>
      </Item>
    </li>
  );
}