import { createFileRoute, type ErrorComponentProps } from "@tanstack/react-router";
import { AePublicPage } from "@/components/ae/layout/AePublicPage";
import { AePageSkeleton, AePageState } from "@/components/ae/layout/AePageState";
import { AeX402Directory } from "@/components/ae/market/AeX402Directory";
import { Button } from "@/components/ui/button";
import { readCanonicalBaseUrlServer } from "@/lib/server/canonical-url.functions";
import { loadMarketRouteData, marketLoaderDeps, validateMarketSearch } from '@/modules/market/market-route-data';
import { buildPublicPageHead, buildSiteJsonLd } from "@/modules/seo/public";

export { parseMarketCompareRefs, validateMarketSearch } from '@/modules/market/market-route-data'
export type { MarketSearch } from '@/modules/market/market-route-data'

export const Route = createFileRoute("/market")({
  staticData: {
    nav: {
      label: 'Market',
      search: {},
      header: { order: 0 },
      footer: { column: 'Market', order: 0 },
    },
  },
  validateSearch: validateMarketSearch,
  loaderDeps: ({ search }) => marketLoaderDeps(search),
  loader: async ({ deps }) => {
    const [data, canonicalBaseUrl] = await Promise.all([
      loadMarketRouteData(deps),
      readCanonicalBaseUrlServer(),
    ])
    return { ...data, canonicalBaseUrl }
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
      <AeX402Directory marketPath="/market" activeView={data.view} page={data.page} search={search} catalogue={data.catalogue} overview={data.overview} {...(data.providers === undefined ? {} : { providers: data.providers })} {...(data.home === undefined ? {} : { home: data.home })} />
    </AePublicPage>
  );
}
