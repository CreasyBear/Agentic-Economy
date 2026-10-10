import { useCallback, useEffect, useRef, useState } from "react";
import { recordProductJourney } from "@/lib/observability/product-journey";
import { useRouter, useRouterState } from "@tanstack/react-router";

import { AePublicPage } from "@/components/ae/layout/AePublicPage";
// Static: the router already splits this route's component and fetches it beside the loader.
import { AeX402Directory } from "@/components/ae/market/AeX402Directory";
import { Alert } from "@/components/arc/alert/alert";
import { Button } from "@/components/arc/button/button";
import type { LandingRow } from "@/components/ae/home/landing.functions";
import type { MarketSearch } from "@/modules/market/market.functions";
import type { X402DirectoryPage } from "@/modules/market/x402-directory";
import { retainedMarketCatalogue, type MarketCompareEntry, type MarketCanonicalSearchPage } from "@/modules/market/market-route-data";
import type {
  X402DirectoryCatalogue,
  X402DirectoryCatalogueOverview,
  X402DirectoryProvidersPage,
} from "@/modules/market/x402-directory-catalogue";

export type AeMarketPageProps = Readonly<{
  data: Readonly<{
    view: NonNullable<MarketSearch["view"]>;
    /** Deferred best-match ranking. Index results never wait for it. */
    canonicalSearch?: Promise<MarketCanonicalSearchPage> | undefined;
    /** Deferred titled rows for the default browse, read from the landing's cache. */
    landingRows?: Promise<readonly LandingRow[]> | undefined;
    page: X402DirectoryPage;
    compareEntries: readonly MarketCompareEntry[];
    catalogue: X402DirectoryCatalogue;
    overview: X402DirectoryCatalogueOverview | undefined;
    providers: X402DirectoryProvidersPage | undefined;
    jevRecipient: Readonly<{ label: string; host: string }> | null;
    /** The page link's index cursor had expired, so this is page 1. */
    cursorReset?: boolean;
  }>;
  search: MarketSearch;
}>;

export function AeMarketPage({ data, search }: AeMarketPageProps) {
  const observedKind = (data.providers ?? data.page).kind;
  useEffect(() => {
    recordProductJourney({ action: 'market_viewed', phase: observedKind === 'ok' ? 'observed' : 'failed', surface: 'market' })
  }, [observedKind, search.view])
  const router = useRouter();
  const canRetain = data.providers === undefined && data.page.kind === "ok" && (data.view === "tools" || data.view === "providers");
  const [retained, setRetained] = useState<{ data: AeMarketPageProps["data"]; search: MarketSearch } | undefined>(
    canRetain ? { data, search } : undefined,
  );
  if (canRetain && retained?.data !== data) setRetained({ data, search });
  const decision = retainedMarketCatalogue(retained?.data, data);
  const shownData = decision.shown;
  const shownSearch = decision.retainPrevious && retained !== undefined ? retained.search : search;
  // The router owns the request and race handling. Show the requested view at
  // once, but supply its rows only after the matching loader has committed.
  const requestedView = useRouterState({ select: state => {
    if (state.status !== "pending" || state.location.pathname !== "/market") return undefined;
    const view = state.location.search.view;
    return view === "providers" || view === "saved" ? view : "tools";
  } });
  const pendingView = requestedView !== shownData.view ? requestedView : undefined;
  // Sort, filters, paging and layout reload the same view: dim it in place, as Airbnb does, so a click visibly took.
  const loading = requestedView !== undefined && pendingView === undefined;
  const contentRef = useRef<HTMLDivElement>(null);
  const previousView = useRef(shownData.view);
  const onContentReady = useCallback(() => {
    if (pendingView !== undefined) return;
    const changed = previousView.current !== shownData.view;
    previousView.current = shownData.view;
    // A view switch replaces the focused link. Keep focus on the new view's heading.
    if (changed && document.activeElement === document.body) {
      const heading = contentRef.current?.querySelector('h1');
      if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
    }
  }, [pendingView, shownData.view]);
  useEffect(onContentReady, [onContentReady]);
  return (
    <AePublicPage><div ref={contentRef} aria-busy={requestedView !== undefined}>
      {decision.retainPrevious ? (
        <div className="arc-market ae-rail pt-6">
          <Alert tone="warning" title="These results may be out of date">
            The tool index didn’t respond, so you’re seeing the last results that loaded.
            <Button type="button" className="mt-3 min-h-touch" variant="secondary" onClick={() => void router.invalidate({ filter: match => match.id === router.state.matches.find(current => current.routeId === '/market')?.id })}>Try again</Button>
          </Alert>
        </div>
      ) : null}
      <AeX402Directory
        marketPath="/market"
        defaultLayout="grid"
        activeView={shownData.view}
        {...(pendingView === undefined ? {} : { pendingView })}
        {...(shownData.canonicalSearch === undefined ? {} : { canonicalSearch: shownData.canonicalSearch })}
        {...(shownData.landingRows === undefined ? {} : { landingRows: shownData.landingRows })}
        {...(shownData.providers === undefined ? {} : { providers: shownData.providers })}
        loading={loading}
        page={shownData.page}
        compareEntries={shownData.compareEntries}
        search={shownSearch}
        catalogue={shownData.catalogue}
        {...(shownData.overview === undefined ? {} : { overview: shownData.overview })}
        {...(shownData.jevRecipient === null ? {} : { jevRecipient: shownData.jevRecipient.label })}
        cursorReset={shownData.cursorReset === true}
      />
    </div></AePublicPage>
  );
}
