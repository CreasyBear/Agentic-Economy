import { createFileRoute } from "@tanstack/react-router";

import { AePublicShell } from "@/components/ae/layout/AePublicShell";
import { AePageState } from "@/components/ae/layout/AePageState";
import { AePublicRoutePending } from "@/components/ae/layout/AePublicRoutePending";
import { AeMarketPage } from "@/components/ae/market/AeMarketPage";
import { Button } from "@/components/ui/button";
import {
  marketWindowSchema,
  type MarketWindow,
} from "@/modules/market/contracts";
import { readMarketRouteServer } from "@/modules/market/market.functions";

export type MarketSearch = Readonly<{
  window: MarketWindow;
  query?: string;
  availability?: "routeable" | "integrated" | "unavailable";
  cursor?: string;
  capability?: string;
}>;

export const Route = createFileRoute("/market")({
  validateSearch: (search: Record<string, unknown>): MarketSearch => ({
    window: marketWindowSchema.safeParse(search.window).success
      ? (search.window as MarketWindow)
      : "30d",
    ...(typeof search.query === "string" &&
    search.query.length <= 200 &&
    search.query.trim().length > 0
      ? { query: search.query.trim() }
      : {}),
    ...(search.availability === "routeable" ||
    search.availability === "integrated" ||
    search.availability === "unavailable"
      ? { availability: search.availability }
      : {}),
    ...(typeof search.cursor === "string" && search.cursor.length <= 512
      ? { cursor: search.cursor }
      : {}),
    ...(typeof search.capability === "string" &&
    search.capability.length > 0 &&
    search.capability.length <= 200
      ? { capability: search.capability }
      : {}),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => readMarketRouteServer({ data: deps }),
  pendingComponent: MarketPending,
  errorComponent: MarketError,
  head: () => ({
    meta: [
      { title: "Agent tool market | Agentic Economy" },
      {
        name: "description",
        content:
          "Find tools your agent can call, compare admitted providers by price and observed performance, and choose an Operation.",
      },
    ],
  }),
  component: MarketRoute,
});

function MarketPending() {
  return <AePublicRoutePending label="Updating market results…" shape="market" />;
}

function MarketError() {
  return (
    <AePageState
      tone="danger"
      title="The catalog didn’t load"
      description="Reload this page to fetch the current tools. No Operation was called."
      action={
        <Button asChild className="min-h-11">
          <a href="/market?window=30d">Reload catalog</a>
        </Button>
      }
    />
  )
}

function MarketRoute() {
  return (
    <AePublicShell>
      <AeMarketPage
        projection={Route.useLoaderData()}
        search={Route.useSearch()}
      />
    </AePublicShell>
  );
}
