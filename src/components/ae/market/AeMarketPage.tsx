import { useEffect, useRef, useState } from "react";
import { recordProductJourney } from "@/lib/observability/product-journey";
import { useRouter, useRouterState } from "@tanstack/react-router";

import { AePublicPage } from "@/components/ae/layout/AePublicPage";
import { DirectoryHostsPage } from "@/components/ae/market/DirectoryHostsPage";
import { MarketLanding } from "@/components/ae/market/MarketLanding";
import { AeX402Directory } from "@/components/ae/market/AeX402Directory";
import { Button } from "@/components/arc/button/button";
import type { MarketSearch } from "@/modules/market/market.functions";
import type { X402DirectoryPage } from "@/modules/market/x402-directory";
import { retainedMarketCatalogue, type MarketCompareEntry } from "@/modules/market/market-route-data";
import type {
  X402DirectoryCatalogue,
  X402DirectoryCatalogueOverview,
  X402DirectoryProvidersPage,
} from "@/modules/market/x402-directory-catalogue";
import type { X402MarketplaceHome } from "@/modules/market/x402-marketplace-home";

export type AeMarketPageProps = Readonly<{
  data: Readonly<{
    view: NonNullable<MarketSearch["view"]>;
    page: X402DirectoryPage;
    compareEntries: readonly MarketCompareEntry[];
    catalogue: X402DirectoryCatalogue;
    overview: X402DirectoryCatalogueOverview;
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
  const canRetain = data.providers === undefined && data.page.kind === "ok" && (data.view === "tools" || data.view === "providers");
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
  useEffect(() => {
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
    <AePublicPage footer="none"><div ref={contentRef} aria-busy={requestedView !== undefined}>
      {requestedView !== undefined && pendingView === undefined ? <p role="status" className="ae-rail py-3 text-sm text-muted-foreground">Updating results. The current search stays visible until the new results arrive.</p> : null}
      {decision.retainPrevious ? (
        <div className="arc-market ae-rail pt-section" role="alert">
          <p className="text-sm text-destructive">This market view could not be loaded. The previous catalogue is still shown.</p>
          <Button type="button" className="mt-3 min-h-touch" variant="secondary" onClick={() => void router.invalidate()}>Try again</Button>
        </div>
      ) : null}
      {landing ? <MarketLanding search={shownSearch} searchRecipient={shownData.jevRecipient} /> : shownData.providers !== undefined && pendingView === undefined ? <DirectoryHostsPage result={shownData.providers} search={shownSearch} /> : <AeX402Directory
        marketPath="/market"
        defaultLayout="grid"
        activeView={shownData.view}
        {...(pendingView === undefined ? {} : { pendingView })}
        page={shownData.page}
        compareEntries={shownData.compareEntries}
        search={shownSearch}
        catalogue={shownData.catalogue}
        overview={shownData.overview}
        {...(shownData.jevRecipient === null ? {} : { jevRecipient: `${shownData.jevRecipient.label} (${shownData.jevRecipient.host})` })}
        {...(shownData.chatRecipient === null ? {} : { chatRecipient: `${shownData.chatRecipient.label} (${shownData.chatRecipient.host})` })}
        {...(shownData.providers === undefined ? {} : { providers: shownData.providers })}
        {...(shownData.home === undefined ? {} : { home: shownData.home })}
      />}
    </div></AePublicPage>
  );
}
