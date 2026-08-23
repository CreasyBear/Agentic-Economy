import { Link } from "@tanstack/react-router";

import { AeFactList } from "@/components/ae/data/AeFactList";
import { Badge } from "@/components/ui/badge";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import type { RegistryCardViewModel } from "@/modules/market/server";

const compactCountFormatter = new Intl.NumberFormat("en", {
  notation: "compact",
});

export function AeRegistryEntry({ entry }: { entry: RegistryCardViewModel }) {
  const accessLabel =
    entry.access === "x402"
      ? "Pay per call"
      : entry.access === "provider_account"
        ? "Connect account"
        : "Access unknown";
  return (
    <li className="border-b last:border-b-0 [contain-intrinsic-size:auto_7.25rem] [content-visibility:auto]">
      <Item
        asChild
        size="sm"
        className="group rounded-none px-4 py-3.5 transition-colors duration-base ease-standard hover:bg-brand-muted/35 hover:shadow-market-row-hover active:bg-brand-muted/55 sm:px-5 md:grid md:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] md:gap-5"
      >
        <Link
          to="/registry/$documentId"
          params={{ documentId: entry.documentId }}
          aria-label={`Inspect ${entry.name}`}
        >
          <ItemContent className="min-w-0 basis-full md:basis-auto">
            <ItemTitle className="max-w-full flex-wrap gap-2">
              <span className="line-clamp-2 break-words underline-offset-4 transition-colors duration-fast group-hover:text-brand-strong group-hover:underline">
                {entry.name}
              </span>
              <Badge variant={entry.access === "x402" ? "info" : "outline"}>
                {accessLabel}
              </Badge>
            </ItemTitle>
            <p className="text-xs font-medium text-muted-foreground">
              {entry.provider} · {entry.category}
            </p>
            <ItemDescription className="max-w-2xl break-words text-pretty">
              {entry.summary}
            </ItemDescription>
          </ItemContent>

          <AeFactList
            density="compact"
            className="w-full grid-cols-3 md:w-auto"
            facts={[
              {
                label: "Price",
                value: entry.priceLabel ?? "Not reported",
                mono: true,
              },
              {
                label: "Method",
                value: entry.method ?? "Not reported",
                mono: true,
              },
              {
                label: "Activity",
                value:
                  entry.sourceCalls30d === undefined
                    ? entry.sourceSampleSize === undefined
                      ? "Not reported"
                      : `${entry.sourceSampleSize.toLocaleString()} samples`
                    : `${formatCount(entry.sourceCalls30d)} calls / 30d`,
              },
            ]}
          />
        </Link>
      </Item>
    </li>
  );
}

function formatCount(value: string): string {
  try {
    return compactCountFormatter.format(BigInt(value));
  } catch {
    return value;
  }
}
