import { Link } from "@tanstack/react-router";
import { CheckIcon, PlusIcon } from "lucide-react";

import { AeToolPrice } from "@/components/ae/market/AeToolPrice";
import type { MarketReturnContext } from "@/components/ae/market/market-return-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { formatUtcTimestamp } from "@/lib/ui/format-time";
import type { ToolCardViewModel } from "@/modules/market/tool-view-model";

const readinessVariants = {
  Routeable: "success",
  SetupRequired: "warning",
  Unavailable: "outline",
} as const;

/**
 * The field-guide placard: name, Provider as maker, one line of what it
 * does, price per Call, and one trust line. No fact grid — rating,
 * latency, authentication and adoption detail live on the Tool detail
 * page, not the catalog card.
 */
export function AeToolCard({
  operation,
  returnTo,
  onCompare,
  comparing,
  compareDisabled,
}: {
  operation: ToolCardViewModel;
  returnTo?: MarketReturnContext;
  onCompare?: () => void;
  comparing?: boolean;
  compareDisabled?: boolean;
}) {
  const routeable = operation.readiness === "Routeable";
  const trustLine =
    operation.lastVerifiedAt === undefined
      ? operation.trustFact
      : `Verified ${formatUtcTimestamp(operation.lastVerifiedAt)}`;

  return (
    <Card className="group relative h-full gap-0 overflow-hidden border border-border/70 p-0 shadow-none transition-[box-shadow,transform] duration-base ease-standard hover:-translate-y-1 hover:shadow-float motion-reduce:transform-none motion-reduce:transition-none">
      <CardHeader className="grid gap-intra p-5 pb-0">
        <div className="flex items-start justify-between gap-3">
          <Badge
            variant={readinessVariants[operation.readiness]}
            className="shrink-0"
            title={operation.trustFact}
          >
            {operation.readinessLabel}
          </Badge>
          {onCompare === undefined ? null : (
            <Button
              variant="ghost"
              size="icon-sm"
              className="relative z-10 rounded-full"
              onClick={onCompare}
              disabled={compareDisabled === true}
              aria-label={`${comparing ? "Remove" : "Add"} ${operation.title} ${comparing ? "from" : "to"} comparison`}
              aria-pressed={comparing === true}
            >
              {comparing ? <CheckIcon /> : <PlusIcon />}
            </Button>
          )}
        </div>
        <h3 className="min-w-0 text-lg leading-snug font-semibold tracking-tight">
          <Link
            to="/tools/$toolRef"
            params={{ toolRef: operation.toolRef }}
            {...(returnTo === undefined ? {} : { search: { from: returnTo } })}
            aria-label={`${routeable ? "Use" : "Inspect"} ${operation.title}`}
            className="line-clamp-2 break-words after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            {operation.title}
          </Link>
        </h3>
        <p className="truncate text-xs font-medium text-muted-foreground">
          {operation.providerName}
        </p>
      </CardHeader>
      <CardContent className="grid flex-1 content-start gap-2 p-5 pt-3">
        <p className="line-clamp-2 text-sm leading-relaxed text-pretty text-muted-foreground">
          {operation.summary}
        </p>
      </CardContent>
      <CardFooter className="flex-wrap items-end justify-between gap-2 border-t border-border px-5 py-3">
        <AeToolPrice
          price={operation.price}
          label="Price per Call"
          size="sm"
          {...(operation.priceValidUntil === undefined
            ? {}
            : { validUntil: operation.priceValidUntil })}
        />
        <p className="max-w-[60%] truncate text-xs text-muted-foreground" title={trustLine}>
          {trustLine}
        </p>
      </CardFooter>
    </Card>
  );
}
