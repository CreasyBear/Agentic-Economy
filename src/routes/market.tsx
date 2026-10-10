import { createFileRoute, type ErrorComponentProps } from "@tanstack/react-router";
import { AePageState } from "@/components/ae/layout/AePageState";
import { readLandingServer, type LandingRow } from "@/components/ae/home/landing.functions";
import { AeMarketPage } from "@/components/ae/market/AeMarketPage";
import { Button } from "@/components/arc/button/button";
import { degrade } from "@/lib/observability/degrade";
import { loadMarketPageRouteData, marketDocumentTitle, marketLoaderDeps, validateMarketSearch } from '@/modules/market/market.functions';
import { marketShowsLandingRows, type MarketCanonicalSearchPage } from '@/modules/market/market-route-data';
import { buildPublicPageHead, buildSiteJsonLd } from "@/modules/seo/public";

export { parseMarketCompareRefs, validateMarketSearch } from '@/modules/market/market.functions'
export type { MarketSearch } from '@/modules/market/market.functions'

export const Route = createFileRoute("/market")({
  staticData: {
    nav: {
      label: 'Tools',
      search: {},
      header: { order: 0, audience: 'always' },
      footer: { column: 'Market', order: 0 },
    },
  },
  validateSearch: validateMarketSearch,
  loaderDeps: ({ search }) => marketLoaderDeps(search),
  // The keyword index is awaited; best-match ranking and the default browse's titled rows are
  // deferred promises, so the grid never waits for them. The rows reuse the landing's cached read.
  // A failed ranking refresh keeps the committed ranking, so hand it to the next load.
  beforeLoad: ({ matches, routeId }): { previousCanonicalSearch: Promise<MarketCanonicalSearchPage> | undefined } => ({
    previousCanonicalSearch: (matches.find(match => match.routeId === routeId)?.loaderData as Readonly<{ canonicalSearch?: Promise<MarketCanonicalSearchPage> }> | undefined)?.canonicalSearch,
  }),
  loader: async ({ deps, abortController, context }) => {
    const landingRows = marketShowsLandingRows(deps)
      ? readLandingServer().then(landing => landing.rows, cause => degrade<readonly LandingRow[]>(cause, [], { site: 'marketLandingRows', reason: 'source_unavailable' }))
      : undefined;
    const data = await loadMarketPageRouteData(deps, { signal: abortController?.signal, previousCanonicalSearch: context?.previousCanonicalSearch });
    return { ...data, landingRows };
  },
  // Ranking sends the query to the disclosed recipient. Activate first.
  preload: false,
  staleTime: 30_000,
  preloadStaleTime: 30_000,
  // Keep the search bar and current rows mounted while the next view loads.
  pendingMs: Infinity,
  errorComponent: MarketError,
  head: ({ loaderData, match }) =>
    buildPublicPageHead({
      path: "/market",
      title: marketDocumentTitle(match.search.view),
      description:
        "Browse thousands of paid APIs, data feeds and services. Compare price per call and use any of them with no subscription.",
      ...(loaderData?.canonicalBaseUrl === undefined ? {} : {
        canonicalBaseUrl: loaderData.canonicalBaseUrl,
        jsonLd: buildSiteJsonLd(loaderData.canonicalBaseUrl),
      }),
    }),
  component: MarketRoute,
});

function MarketError({ reset, error }: ErrorComponentProps) {
  const invalidSearch = typeof error === 'object' && error !== null && 'name' in error
    && (error.name === 'SearchParamError' || error.name === 'ZodError');
  return (
    <AePageState
      tone="danger"
      title="Tools didn’t load"
      description={invalidSearch ? "A search or filter in the address isn’t valid. Check it and try again." : "We couldn’t reach the tool index. Try again. Nothing was charged."}
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
  return <AeMarketPage data={data} search={search} />;
}
