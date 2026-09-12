import { createFileRoute, type ErrorComponentProps } from "@tanstack/react-router";
import { Store } from "lucide-react";

import { AePublicPage } from "@/components/ae/layout/AePublicPage";
import { AePageSkeleton, AePageState } from "@/components/ae/layout/AePageState";
import { AeX402Directory } from "@/components/ae/market/AeX402Directory";
import type { MarketReturnSearch } from '@/components/ae/market/market-return-context';
import { Button } from "@/components/ui/button";
import { readCanonicalBaseUrlServer } from "@/lib/server/canonical-url.functions";
import { readX402DirectoryCatalogueServer, readX402DirectoryCatalogueOverviewServer, readX402DirectoryProvidersServer } from "@/modules/market/x402-directory-index.functions";
import { x402DirectoryCatalogueInputSchema } from "@/modules/market/x402-directory-catalogue";
import { directoryCatalogueSearchValues } from '@/modules/market/x402-directory-navigation';
import { readX402MarketplaceHomeServer } from "@/modules/market/x402-marketplace-home.functions";
import { readProviderListedToolsServer } from "@/modules/market/market.functions";
import { buildPublicPageHead, buildSiteJsonLd } from "@/modules/seo/public";

export type MarketSearch = MarketReturnSearch;

/**
 * Legacy `?compare=` links pointed at the retired capability-catalog page
 * tree and carried `operation:v1:` tool references. The directory tree keys
 * comparisons by the x402 `resource` identifier instead, so this only keeps
 * the shape (1-4 unique, bounded values) and leaves resolving the values to
 * whatever entries the directory has already loaded.
 */
export function parseMarketCompareRefs(value: unknown): readonly string[] | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > 20_000) return undefined;
  const refs = [...new Set(value.split(",").map((part) => part.trim()).filter((part) => part.length > 0 && part.length <= 8_192))];
  if (refs.length === 0 || refs.length > 4) return undefined;
  return refs;
}

export function validateMarketSearch(
  search: Record<string, unknown>,
): MarketSearch {
  const directory = x402DirectoryCatalogueInputSchema.parse(directoryCatalogueSearchValues(search));
  if (search.providerCursor !== undefined && (typeof search.providerCursor !== 'string' || search.providerCursor.length === 0 || search.providerCursor.length > 16384)) throw new Error('Invalid Provider catalogue cursor')
  const compareRefs = parseMarketCompareRefs(search.compare);
  return {
    ...directory,
    ...(typeof search.providerCursor === 'string' ? { providerCursor: search.providerCursor } : {}),
    ...(search.view === "discover" || search.view === "tools" || search.view === "providers" || search.view === "saved" ? { view: search.view } : {}),
    ...(compareRefs === undefined ? {} : { compare: compareRefs.join(",") }),
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
    ...(search.view === undefined ? {} : { view: search.view }),
  }),
  loader: async ({ deps }) => {
    const catalogueInput = x402DirectoryCatalogueInputSchema.parse(directoryCatalogueSearchValues(deps))
    const showHome = deps.view === 'discover'
    const [catalogue, canonicalBaseUrl, home, overview, providers, providerListed] = await Promise.all([
      readX402DirectoryCatalogueServer({ data: { ...catalogueInput, ...(catalogueInput.query || catalogueInput.sort ? {} : { sort: 'adoption' }) } }),
      readCanonicalBaseUrlServer(),
      showHome ? readX402MarketplaceHomeServer().catch(() => undefined) : Promise.resolve(undefined),
      readX402DirectoryCatalogueOverviewServer(),
      deps.view === 'providers' && deps.query === undefined && deps.network === undefined && deps.provider === undefined && deps.maxUsdPrice === undefined && deps.directoryCategory === undefined ? readX402DirectoryProvidersServer({ data: { ...(deps.providerCursor === undefined ? {} : { providerCursor: deps.providerCursor }) } }) : Promise.resolve(undefined),
      showHome ? readProviderListedToolsServer().catch(() => undefined) : Promise.resolve(undefined),
    ])
    const page = catalogue?.kind === 'ok' ? catalogue.page : { kind: 'unavailable' as const, reason: catalogue?.reason === 'query_invalid' ? 'query_invalid' as const : 'source_unavailable' as const }
    return { page, catalogue, overview, canonicalBaseUrl, home, providers, providerListed }
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

  return (
    <AePublicPage>
      <AeX402Directory page={data.page} search={search} catalogue={data.catalogue} overview={data.overview} {...(data.providers === undefined ? {} : { providers: data.providers })} {...(data.home === undefined ? {} : { home: data.home })} {...(data.providerListed === undefined ? {} : { providerListed: data.providerListed })} />
    </AePublicPage>
  );
}
