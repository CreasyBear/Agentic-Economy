import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { recordProductJourney } from "@/lib/observability/product-journey";
import { lazyRouteComponent, useRouter, useRouterState } from "@tanstack/react-router";

import { AePublicPage } from "@/components/ae/layout/AePublicPage";
import { AePageSkeleton } from "@/components/ae/layout/AePageState";
import { MarketLanding } from "@/components/ae/market/MarketLanding";
import { Button } from "@/components/arc/button/button";
import type { MarketSearch } from "@/modules/market/market.functions";
import type { X402DirectoryPage } from "@/modules/market/x402-directory";
import { retainedMarketCatalogue, type MarketCompareEntry, type MarketCanonicalSearchPage } from "@/modules/market/market-route-data";
import type {
  X402DirectoryCatalogue,
  X402DirectoryCatalogueOverview,
  X402DirectoryProvidersPage,
} from "@/modules/market/x402-directory-catalogue";
import type { X402MarketplaceHome } from "@/modules/market/x402-marketplace-home";

const AeX402Directory = lazyRouteComponent(() => import("@/components/ae/market/AeX402Directory"), "AeX402Directory");
const DirectoryHostsPage = lazyRouteComponent(() => import("@/components/ae/market/DirectoryHostsPage"), "DirectoryHostsPage");

// Run focus recovery only after the requested presenter's chunk has committed.
function MarketContent({ children, onReady }: Readonly<{ children: ReactNode; onReady: () => void }>) {
  useEffect(onReady, [onReady]);
  return <>{children}</>;
}

export type AeMarketPageProps = Readonly<{
  data: Readonly<{
    view: NonNullable<MarketSearch["view"]>;
    canonicalSearch?: MarketCanonicalSearchPage | undefined;
    page: X402DirectoryPage;
    compareEntries: readonly MarketCompareEntry[];
    catalogue: X402DirectoryCatalogue;
    overview: X402DirectoryCatalogueOverview | undefined;
    providers: X402DirectoryProvidersPage | undefined;
    home: X402MarketplaceHome | undefined;
    jevRecipient: Readonly<{ label: string; host: string }> | null;
    chatRecipient: Readonly<{ label: string; host: string }> | null;
  }>;
  search: MarketSearch;
}>;

export function AeMarketPage({ data, search }: AeMarketPageProps) {
  const observedKind = (data.providers ?? data.page).kind;
  useEffect(() => {
    recordProductJourney({ action: 'market_viewed', phase: observedKind === 'ok' ? 'observed' : 'failed', surface: 'market' })
  }, [observedKind, search.view])
  const router = useRouter();
  const canonicalSucceeded = data.canonicalSearch === undefined || (data.canonicalSearch.result !== undefined && data.canonicalSearch.result.kind !== 'unavailable' && data.canonicalSearch.refreshFailed !== true);
  const canRetain = canonicalSucceeded && data.providers === undefined && data.page.kind === "ok" && (data.view === "tools" || data.view === "providers");
  const [retained, setRetained] = useState<{ data: AeMarketPageProps["data"]; search: MarketSearch } | undefined>(
    canRetain ? { data, search } : undefined,
  );
  if (canRetain && retained?.data !== data) setRetained({ data, search });
  const decision = retainedMarketCatalogue(retained?.data, data);
  const shownData = decision.shown;
  const shownSearch = decision.retainPrevious && retained !== undefined ? retained.search : search;
  // The router owns the request and race handling. Select the requested tab at
  // once, but supply its rows only after the matching loader has committed.
  const requestedView = useRouterState({ select: state => {
    if (state.status !== "pending" || state.location.pathname !== "/market") return undefined;
    const view = state.location.search.view;
    return view === "tools" || view === "providers" || view === "saved" ? view : "discover";
  } });
  const pendingView = requestedView !== shownData.view ? requestedView : undefined;
  const landing = shownData.view === "discover" && pendingView === undefined;
  const previousLanding = useRef(landing);
  const contentRef = useRef<HTMLDivElement>(null);
  const onContentReady = useCallback(() => {
    if (pendingView !== undefined) return;
    const changed = previousLanding.current !== landing;
    previousLanding.current = landing;
    // Same-path navigation replaces the focused category/tab. Keep focus on the new page,
    // without stealing it from a control that remained mounted during the load.
    if (changed && document.activeElement === document.body) {
      const heading = contentRef.current?.querySelector('h1');
      if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
    }
  }, [landing, pendingView]);
  return (
    <Suspense fallback={<AePageSkeleton title="Loading the market…" description="Loading this market view…" shape="market" />}><MarketContent onReady={onContentReady}>
    <AePublicPage footer="none"><div ref={contentRef} aria-busy={requestedView !== undefined}>
      {requestedView !== undefined && pendingView === undefined ? <p role="status" className="ae-rail py-3 text-sm text-muted-foreground">Updating results. The current search stays visible until the new results arrive.</p> : null}
      {decision.retainPrevious ? (
        <div className="arc-market ae-rail pt-section" role="alert">
          <p className="text-sm text-destructive">This market view could not be loaded. The previous catalogue is still shown.</p>
          <Button type="button" className="mt-3 min-h-touch" variant="secondary" onClick={() => void router.invalidate({ filter: match => match.id === router.state.matches.find(current => current.routeId === '/market')?.id })}>Try again</Button>
        </div>
      ) : null}
      {landing ? <MarketLanding search={shownSearch} searchRecipient={shownData.jevRecipient} /> : shownData.providers !== undefined && pendingView === undefined ? <DirectoryHostsPage result={shownData.providers} search={shownSearch} /> : <AeX402Directory
        marketPath="/market"
        defaultLayout="grid"
        activeView={shownData.view}
        {...(pendingView === undefined ? {} : { pendingView })}
        {...(shownData.canonicalSearch === undefined ? {} : { canonicalSearch: shownData.canonicalSearch })}
        page={shownData.page}
        compareEntries={shownData.compareEntries}
        search={shownSearch}
        catalogue={shownData.catalogue}
        {...(shownData.overview === undefined ? {} : { overview: shownData.overview })}
        {...(shownData.jevRecipient === null ? {} : { jevRecipient: `${shownData.jevRecipient.label} (${shownData.jevRecipient.host})` })}
        {...(shownData.chatRecipient === null ? {} : { chatRecipient: `${shownData.chatRecipient.label} (${shownData.chatRecipient.host})` })}
        {...(shownData.providers === undefined ? {} : { providers: shownData.providers })}
        {...(shownData.home === undefined ? {} : { home: shownData.home })}
      />}
    </div></AePublicPage>
    </MarketContent></Suspense>
  );
}
