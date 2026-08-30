import { Link } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemHeader,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import type { MarketWindow } from "@/modules/market/contracts";
import {
  capabilityFromPrice,
  type CapabilityGroupViewModel,
} from "@/modules/market/operation-view-model";

export function AeCapabilityTile({
  group,
  window,
}: {
  group: CapabilityGroupViewModel;
  window: MarketWindow;
}) {
  const initial = group.label.trim().charAt(0).toUpperCase() || "T";
  const listingFact =
    group.providerCount > 1
      ? `${group.providerCount.toLocaleString()} listed`
      : group.operations[0]?.supplierName ?? "1 listed";
  const price = capabilityFromPrice(group.operations);

  return (
    <Item asChild variant="outline" className="h-full rounded-card bg-card">
      <Link
        to="/market"
        search={{ window, capability: group.capabilityId }}
        aria-label={`${group.label}, ${listingFact}, ${price}`}
      >
        <ItemMedia
          variant="icon"
          aria-hidden="true"
          className="font-mono text-xs font-semibold"
        >
          {initial}
        </ItemMedia>
        <ItemContent>
          <ItemHeader>
            <ItemTitle>{group.label}</ItemTitle>
            <Badge variant="outline">{group.category.label}</Badge>
          </ItemHeader>
          <ItemDescription>{group.operations[0]?.summary}</ItemDescription>
          <ItemFooter className="text-sm">
            <span>{listingFact}</span>
            <span className="font-mono tabular-nums">{price}</span>
          </ItemFooter>
        </ItemContent>
      </Link>
    </Item>
  );
}
