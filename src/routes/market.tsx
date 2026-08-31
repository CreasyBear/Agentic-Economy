import { Link, createFileRoute } from "@tanstack/react-router";

import { AePublicPage } from "@/components/ae/layout/AePublicPage";
import { AePageSkeleton, AePageState } from "@/components/ae/layout/AePageState";
import { AeMarketPage } from "@/components/ae/market/AeMarketPage";
import { Button } from "@/components/ui/button";
import {
  marketWindowSchema,
  type MarketWindow,
} from "@/modules/market/contracts";
import {
  isMarketCategoryId,
  type MarketCategoryId,
} from "@/modules/market/listing-evidence";
import { readMarketRouteServer } from "@/modules/market/market.functions";
import { buildPublicPageHead } from "@/modules/seo/public";

export type MarketSearch = Readonly<{
  window: MarketWindow;
  query?: string;
  availability?: "routeable" | "setup_required" | "unavailable";
  category?: MarketCategoryId;
  cursor?: string;
  capability?: string;
}>;

export function validateMarketSearch(
  search: Record<string, unknown>,
): MarketSearch {
  return {
    window: marketWindowSchema.safeParse(search.window).success
      ? (search.window as MarketWindow)
      : "30d",
    ...(typeof search.query === "string" &&
    search.query.length <= 200 &&
    search.query.trim().length > 0
      ? { query: search.query.trim() }
      : {}),
    ...(search.availability === "routeable" ||
    search.availability === "setup_required" ||
    search.availability === "unavailable"
      ? { availability: search.availability }
      : {}),
    ...(typeof search.category === "string" &&
    isMarketCategoryId(search.category)
      ? { category: search.category }
      : {}),
    ...(typeof search.cursor === "string" &&
    search.cursor.length <= 2_000
      ? { cursor: search.cursor }
      : {}),
    ...(typeof search.capability === "string" &&
    search.capability.length > 0 &&
    search.capability.length <= 200
      ? { capability: search.capability }
      : {}),
  };
}

export const Route = createFileRoute("/market")({
  validateSearch: validateMarketSearch,
  loaderDeps: ({ search }) => ({
    window: search.window,
    ...(search.query === undefined ? {} : { query: search.query }),
    ...(search.availability === undefined
      ? {}
      : { availability: search.availability }),
    ...(search.cursor === undefined ? {} : { cursor: search.cursor }),
  }),
  loader: ({ deps }) => readMarketRouteServer({ data: deps }),
  shouldReload: () => true,
  staleTime: 0,
  preloadStaleTime: 0,
  pendingComponent: MarketPending,
  errorComponent: MarketError,
  head: () =>
    buildPublicPageHead({
      path: "/market",
      title: "Agent tool market | Agentic Economy",
      description:
        "Find tools your agent can call. Compare price and readiness, then pick one.",
    }),
  component: MarketRoute,
});

function MarketPending() {
  return <AePageSkeleton title="Updating market results…" description="Updating market results…" shape="market" />;
}

function MarketError() {
  return (
    <AePageState
      tone="danger"
      title="The catalog didn’t load"
      description="Reload this page to fetch the current tools. No Operation was called."
      action={
        <Button asChild className="min-h-touch">
          <Link to="/market" search={{ window: "30d" }} reloadDocument>Reload catalog</Link>
        </Button>
      }
    />
  )
}

function MarketRoute() {
  return (
    <AePublicPage>
      <AeMarketPage
        projection={Route.useLoaderData()}
        search={Route.useSearch()}
      />
    </AePublicPage>
  );
}
