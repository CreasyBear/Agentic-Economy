import { createFileRoute, type ErrorComponentProps } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { AePublicPage } from "@/components/ae/layout/AePublicPage";
import { AePageSkeleton, AePageState } from "@/components/ae/layout/AePageState";
import { AeMarketPage } from "@/components/ae/market/AeMarketPage";
import { Button } from "@/components/ui/button";
import { readCapabilityOperationCompare } from "@/modules/capability-supply/operation-source";
import {
  isPublicOperationRef,
  operationCompareInputSchema,
} from "@/modules/capability-supply/public";
import {
  marketWindowSchema,
  type MarketWindow,
} from "@/modules/market/contracts";
import {
  isMarketCategoryId,
  type MarketCategoryId,
} from "@/modules/market/listing-evidence";
import { readMarketRouteServer } from "@/modules/market/market.functions";
import { projectOperationCompareChoices } from "@/modules/registry/operation-choice-contracts";
import { buildPublicPageHead } from "@/modules/seo/public";

export type MarketSearch = Readonly<{
  window: MarketWindow;
  query?: string;
  availability?: "routeable" | "setup_required" | "unavailable";
  category?: MarketCategoryId;
  cursor?: string;
  capability?: string;
  compare?: string;
}>;

const readMarketComparisonServer = createServerFn({ method: "GET" })
  .validator((data) => operationCompareInputSchema.parse(data))
  .handler(async ({ data }) =>
    projectOperationCompareChoices(
      await readCapabilityOperationCompare({ operationRefs: data.operationRefs }),
    ),
  );

export function parseMarketCompareRefs(value: unknown): readonly string[] | undefined {
  if (typeof value !== "string" || value.length > 1_000) return undefined;
  const refs = [...new Set(value.split(","))];
  if (
    refs.length < 2 ||
    refs.length > 4 ||
    !refs.every(isPublicOperationRef)
  ) {
    return undefined;
  }
  return refs;
}

export function validateMarketSearch(
  search: Record<string, unknown>,
): MarketSearch {
  const compareRefs = parseMarketCompareRefs(search.compare);
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
    ...(compareRefs === undefined ? {} : { compare: compareRefs.join(",") }),
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
    ...(search.compare === undefined ? {} : { compare: search.compare }),
  }),
  loader: async ({ deps }) => {
    const operationRefs = parseMarketCompareRefs(deps.compare);
    const [projection, comparison] = await Promise.all([
      readMarketRouteServer({
        data: {
          window: deps.window,
          ...(deps.query === undefined ? {} : { query: deps.query }),
          ...(deps.availability === undefined
            ? {}
            : { availability: deps.availability }),
          ...(deps.cursor === undefined ? {} : { cursor: deps.cursor }),
        },
      }),
      operationRefs === undefined
        ? Promise.resolve(undefined)
        : readMarketComparisonServer({ data: { operationRefs } }),
    ]);
    return { projection, comparison };
  },
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
  return <AePageSkeleton title="Updating the market view…" description="Loading current catalog facts…" shape="market" />;
}

function MarketError({ reset }: ErrorComponentProps) {
  return (
    <AePageState
      tone="danger"
      title="The market view didn’t load"
      description="Try again to fetch the current catalog and comparison. No Operation was called."
      action={
        <Button type="button" className="min-h-touch" onClick={reset}>
          Try again
        </Button>
      }
    />
  )
}

function MarketRoute() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <AePublicPage>
      <AeMarketPage
        projection={data.projection}
        search={search}
        {...(data.comparison === undefined
          ? {}
          : { comparison: data.comparison })}
        onCompareOperations={(operationRefs) => {
          void navigate({
            to: "/market",
            search: { ...search, compare: operationRefs.join(",") },
          });
        }}
      />
    </AePublicPage>
  );
}
