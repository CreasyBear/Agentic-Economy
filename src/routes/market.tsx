import { createFileRoute, type ErrorComponentProps } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Store } from "lucide-react";

import { AePublicPage } from "@/components/ae/layout/AePublicPage";
import { AePageSkeleton, AePageState } from "@/components/ae/layout/AePageState";
import { AeMarketPage } from "@/components/ae/market/AeMarketPage";
import { AeX402Directory } from "@/components/ae/market/AeX402Directory";
import type { MarketReturnSearch } from '@/components/ae/market/market-return-context';
import { Button } from "@/components/ui/button";
import { readCanonicalBaseUrlServer } from "@/lib/server/canonical-url.functions";
import { readCapabilityToolCompare } from "@/modules/capability-supply/tool-source";
import {
  isPublicToolRef,
  toolCompareInputSchema,
} from "@/modules/capability-supply/public";
import type { MarketWindow } from "@/modules/market/contracts";
import {
  isMarketCategoryId,
} from "@/modules/market/listing-evidence";
import { readMarketRouteServer } from "@/modules/market/market.functions";
import { readX402DirectoryCatalogueServer, readX402DirectoryCatalogueOverviewServer, readX402DirectoryProvidersServer } from "@/modules/market/x402-directory-index.functions";
import { x402DirectoryCatalogueInputSchema } from "@/modules/market/x402-directory-catalogue";
import { directoryCatalogueSearchValues } from '@/modules/market/x402-directory-navigation';
import { readX402MarketplaceHomeServer } from "@/modules/market/x402-marketplace-home.functions";
import { projectToolCompareChoices } from "@/modules/registry/tool-choice-contracts";
import { buildPublicPageHead, buildSiteJsonLd } from "@/modules/seo/public";

export type MarketSearch = MarketReturnSearch;

// Comparable-Tool evidence (rating, popularity, latency) is still computed
// over a rolling window internally; the public search surface no longer
// exposes a time-window control, so this is a fixed internal default.
const MARKET_EVIDENCE_WINDOW: MarketWindow = "30d";

const readMarketComparisonServer = createServerFn({ method: "GET" })
  .validator((data) => toolCompareInputSchema.parse(data))
  .handler(async ({ data }) =>
    projectToolCompareChoices(
      await readCapabilityToolCompare({ toolRefs: data.toolRefs }),
    ),
  );

export function parseMarketCompareRefs(value: unknown): readonly string[] | undefined {
  if (typeof value !== "string" || value.length > 1_000) return undefined;
  const refs = [...new Set(value.split(","))];
  if (
    refs.length < 2 ||
    refs.length > 4 ||
    !refs.every(isPublicToolRef)
  ) {
    return undefined;
  }
  return refs;
}

export function validateMarketSearch(
  search: Record<string, unknown>,
): MarketSearch {
  const compareRefs = parseMarketCompareRefs(search.compare);
  const directory = x402DirectoryCatalogueInputSchema.parse(directoryCatalogueSearchValues(search));
  if (search.providerCursor !== undefined && (typeof search.providerCursor !== 'string' || search.providerCursor.length === 0 || search.providerCursor.length > 16384)) throw new Error('Invalid Provider catalogue cursor')
  return {
    ...directory,
    ...(typeof search.providerCursor === 'string' ? { providerCursor: search.providerCursor } : {}),
    ...(search.view === "discover" || search.view === "tools" || search.view === "providers" || search.view === "saved" ? { view: search.view } : {}),
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
    ...(typeof search.offset === "number" && Number.isSafeInteger(search.offset) && search.offset >= 0
      ? { offset: search.offset } : {}),
    ...(typeof search.resource === "string" && search.resource.length > 0 && search.resource.length <= 8192
      ? { resource: search.resource } : {}),
  };
}

export const Route = createFileRoute("/market")({
  staticData: {
    nav: {
      label: 'Market',
      search: {},
      header: { order: 0 },
      footer: { column: 'Market', order: 0 },
      operatorUtility: { roles: ['owner', 'admin', 'developer'], order: 0, icon: Store },
    },
  },
  validateSearch: validateMarketSearch,
  loaderDeps: ({ search }) => ({
    ...directoryCatalogueSearchValues(search),
    ...(search.providerCursor === undefined ? {} : { providerCursor: search.providerCursor }),
    ...(search.directoryCategory === undefined ? {} : { directoryCategory: search.directoryCategory }),
    ...(search.indexCursor === undefined ? {} : { indexCursor: search.indexCursor }),
    ...(search.sort === undefined ? {} : { sort: search.sort }),
    ...(search.view === undefined ? {} : { view: search.view }),
    ...(search.network === undefined ? {} : { network: search.network }),
    ...(search.provider === undefined ? {} : { provider: search.provider }),
    ...(search.maxUsdPrice === undefined ? {} : { maxUsdPrice: search.maxUsdPrice }),
    ...(search.query === undefined ? {} : { query: search.query }),
    ...(search.availability === undefined
      ? {}
      : { availability: search.availability }),
    ...(search.cursor === undefined ? {} : { cursor: search.cursor }),
    ...(search.compare === undefined ? {} : { compare: search.compare }),
    ...(search.capability === undefined ? {} : { capability: search.capability }),
    ...(search.category === undefined ? {} : { category: search.category }),
    ...(search.offset === undefined ? {} : { offset: search.offset }),
  }),
  loader: async ({ deps }) => {
    // Preserve existing exact-Tool links and comparisons. Ordinary discovery
    // reads the upstream directory without admission or readiness filtering.
    if (deps.capability === undefined && deps.compare === undefined && deps.cursor === undefined
      && deps.availability === undefined && deps.category === undefined) {
      const catalogueInput = x402DirectoryCatalogueInputSchema.parse(directoryCatalogueSearchValues(deps))
      const showHome = deps.view === 'discover'
      const [catalogue, canonicalBaseUrl, home, overview, providers] = await Promise.all([
        readX402DirectoryCatalogueServer({ data: { ...catalogueInput, ...(catalogueInput.query || catalogueInput.sort ? {} : { sort: 'adoption' }) } }),
        readCanonicalBaseUrlServer(),
        showHome ? readX402MarketplaceHomeServer().catch(() => undefined) : Promise.resolve(undefined),
        readX402DirectoryCatalogueOverviewServer(),
        deps.view === 'providers' && deps.query === undefined && deps.network === undefined && deps.provider === undefined && deps.maxUsdPrice === undefined && deps.directoryCategory === undefined ? readX402DirectoryProvidersServer({ data: { ...(deps.providerCursor === undefined ? {} : { providerCursor: deps.providerCursor }) } }) : Promise.resolve(undefined),
      ])
      const page = catalogue?.kind === 'ok' ? catalogue.page : { kind: 'unavailable' as const, reason: catalogue?.reason === 'query_invalid' ? 'query_invalid' as const : 'source_unavailable' as const }
      return { kind: 'directory' as const, page, catalogue, overview, canonicalBaseUrl, home, providers }
    }
    const toolRefs = parseMarketCompareRefs(deps.compare);
    const [projection, comparison, canonicalBaseUrl] = await Promise.all([
      readMarketRouteServer({
        data: {
          window: MARKET_EVIDENCE_WINDOW,
          ...(deps.query === undefined ? {} : { query: deps.query }),
          ...(deps.availability === undefined
            ? {}
            : { availability: deps.availability }),
          ...(deps.cursor === undefined ? {} : { cursor: deps.cursor }),
        },
      }),
      toolRefs === undefined
        ? Promise.resolve(undefined)
        : readMarketComparisonServer({ data: { toolRefs } }),
      readCanonicalBaseUrlServer(),
    ]);
    return { kind: 'tools' as const, projection, comparison, canonicalBaseUrl };
  },
  staleTime: 30_000,
  preloadStaleTime: 30_000,
  // The router default (150ms) is tuned for slow, rare navigations; a filter
  // click on this page re-runs the same route's loader and, past that
  // default, would unmount the whole directory for MarketPending's full-page
  // skeleton even though the previous results are still valid to look at.
  // Raising the threshold lets a typical catalogue round trip finish without
  // ever swapping the visible list out from under the user.
  pendingMs: 1_000,
  pendingMinMs: 500,
  pendingComponent: MarketPending,
  errorComponent: MarketError,
  head: ({ loaderData }) =>
    buildPublicPageHead({
      path: "/market",
      title: "Agent tool market | Agentic Economy",
      description:
        "Explore agent capabilities, compare published prices and adoption, and find Tools for your next task.",
      ...(loaderData?.canonicalBaseUrl === undefined ? {} : {
        canonicalBaseUrl: loaderData.canonicalBaseUrl,
        jsonLd: buildSiteJsonLd(loaderData.canonicalBaseUrl),
      }),
    }),
  component: MarketRoute,
});

function MarketPending() {
  return <AePageSkeleton title="Updating the market view…" description="Loading current catalog facts…" shape="market" />;
}

function MarketError({ reset, error }: ErrorComponentProps) {
  return (
    <AePageState
      tone="danger"
      title="The market view didn’t load"
        description={error.name === "SearchParamError" || error.name === "ZodError" ? "A directory filter is invalid. Check the provider hostname, network and non-negative USD price in the address, then try again. No broader search was run." : "Try again to fetch the current catalog and comparison. No Tool was called."}
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
      {data.kind === 'directory' ? <AeX402Directory page={data.page} search={search} catalogue={data.catalogue} overview={data.overview} {...(data.providers === undefined ? {} : { providers: data.providers })} {...(data.home === undefined ? {} : { home: data.home })} /> : <AeMarketPage
        projection={data.projection}
        search={{
          ...(search.query === undefined ? {} : { query: search.query }),
          ...(search.availability === undefined ? {} : { availability: search.availability }),
          ...(search.category === undefined ? {} : { category: search.category }),
          ...(search.cursor === undefined ? {} : { cursor: search.cursor }),
          ...(search.capability === undefined ? {} : { capability: search.capability }),
          ...(search.compare === undefined ? {} : { compare: search.compare }),
        }}
        {...(data.comparison === undefined
          ? {}
          : { comparison: data.comparison })}
        onCompareTools={(toolRefs) => {
          void navigate({
            to: "/market",
            search: { ...search, compare: toolRefs.join(",") },
          });
        }}
      />}
    </AePublicPage>
  );
}
