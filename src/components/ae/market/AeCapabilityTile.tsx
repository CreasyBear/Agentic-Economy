import { useCurrentToolPrice } from "./AeToolPrice";
import { Link } from "@tanstack/react-router";

import {
  Item,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemHeader,
  ItemTitle,
} from "@/components/ui/item";
import {
  capabilityFromPrice,
  type CapabilityGroupViewModel,
} from "@/modules/market/tool-view-model";

export function AeCapabilityTile({
  group,
}: {
  group: CapabilityGroupViewModel;
}) {
  const listingFact =
    group.providerCount > 1
      ? `${group.providerCount.toLocaleString()} listed`
      : group.tools[0]?.providerName ?? "1 listed";
  const expiries = group.tools.flatMap((tool) => tool.priceValidUntil === undefined ? [] : [tool.priceValidUntil]);
  const price = useCurrentToolPrice(capabilityFromPrice(group.tools), expiries.length === 0 ? undefined : Math.min(...expiries));

  return (
    <Item
      asChild
      className="group h-full rounded-none border-0 border-t border-border bg-transparent px-0 py-related hover:bg-transparent"
    >
      <Link
        to="/market"
        search={{ query: group.label }}
        aria-label={`${group.label}, ${listingFact}, ${price}`}
      >
        <ItemContent>
          <ItemHeader>
            <ItemTitle className="text-base font-semibold transition-colors duration-fast ease-standard group-hover:text-brand-strong">
              {group.label}
            </ItemTitle>
            <span className="shrink-0 text-xs text-muted-foreground">
              {group.category.label}
            </span>
          </ItemHeader>
          <ItemDescription>{group.tools[0]?.summary}</ItemDescription>
          <ItemFooter className="pt-intra text-sm">
            <span className="text-muted-foreground">{listingFact}</span>
            <span className="font-mono text-foreground tabular-nums">{price}</span>
          </ItemFooter>
        </ItemContent>
      </Link>
    </Item>
  );
}
