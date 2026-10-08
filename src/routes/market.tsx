import { createFileRoute, type ErrorComponentProps } from "@tanstack/react-router";
import { AePageSkeleton, AePageState } from "@/components/ae/layout/AePageState";
import { AeMarketPage } from "@/components/ae/market/AeMarketPage";
import { Button } from "@/components/arc/button/button";
import { loadMarketPageRouteData, marketDocumentTitle, marketLoaderDeps, validateMarketSearch, type MarketCanonicalSearchPage } from '@/modules/market/market.functions';
import { buildPublicPageHead, buildSiteJsonLd } from "@/modules/seo/public";

export { parseMarketCompareRefs, validateMarketSearch } from '@/modules/market/market.functions'
export type { MarketSearch } from '@/modules/market/market.functions'

export const Route = createFileRoute("/market")({
  staticData: {
    nav: {
      label: 'Market',
      search: {},
      header: { order: 0, audience: 'always' },
      footer: { column: 'Market', order: 0 },
    },
  },
  validateSearch: validateMarketSearch,
  loaderDeps: ({ search }) => marketLoaderDeps(search),
  beforeLoad: ({ matches, routeId }): { previousCanonicalSearch: MarketCanonicalSearchPage | undefined } => ({
    previousCanonicalSearch: (matches.find(match => match.routeId === routeId)?.loaderData as Readonly<{ canonicalSearch?: MarketCanonicalSearchPage }> | undefined)?.canonicalSearch,
  }),
  loader: ({ deps, abortController, context }) => loadMarketPageRouteData(deps, { signal: abortController?.signal, previousCanonicalSearch: context?.previousCanonicalSearch }),
  // Search can send query/candidate text to the disclosed recipient. Activate first.
  preload: false,
  staleTime: 30_000,
  preloadStaleTime: 30_000,
  // Keep the marketplace frame and tab controls mounted through navigation.
  // AeMarketPage shows a requested tab's local loading state until its genuine
  // catalogue commits; filter reloads retain their current rows.
  pendingMs: Infinity,
  pendingComponent: MarketPending,
  errorComponent: MarketError,
  head: ({ loaderData, match }) =>
    buildPublicPageHead({
      path: "/market",
      title: marketDocumentTitle(match.search.view),
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
  const invalidSearch = typeof error === 'object' && error !== null && 'name' in error
    && (error.name === 'SearchParamError' || error.name === 'ZodError');
  return (
    <AePageState
      tone="danger"
      title="The market view didn’t load"
      description={invalidSearch ? "A directory search or filter is invalid. Check the address and try again. No broader search was run." : "Try again to fetch the current catalog and comparison. No Tool was called."}
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
