import { useState } from "react";
import { useRouter } from "@tanstack/react-router";

import { AePublicPage } from "@/components/ae/layout/AePublicPage";
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
  const router = useRouter();
  const [retained, setRetained] = useState<{ data: AeMarketPageProps["data"]; search: MarketSearch } | undefined>(
    data.page.kind === "ok" ? { data, search } : undefined,
  );
  if (data.page.kind === "ok" && retained?.data !== data) setRetained({ data, search });
  const decision = retainedMarketCatalogue(retained?.data, data);
  const shownData = decision.shown;
  const shownSearch = decision.retainPrevious && retained !== undefined ? retained.search : search;
  return (
    <AePublicPage>
      {decision.retainPrevious ? (
        <div className="arc-market ae-rail pt-section" role="alert">
          <p className="text-sm text-destructive">This market view could not be loaded. The previous catalogue is still shown.</p>
          <Button type="button" className="mt-3 min-h-touch" variant="secondary" onClick={() => void router.invalidate()}>Try again</Button>
        </div>
      ) : null}
      <AeX402Directory
        marketPath="/market"
        activeView={shownData.view}
        page={shownData.page}
        compareEntries={shownData.compareEntries}
        search={shownSearch}
        catalogue={shownData.catalogue}
        overview={shownData.overview}
        {...(shownData.jevRecipient === null ? {} : { jevRecipient: `${shownData.jevRecipient.label} (${shownData.jevRecipient.host})` })}
        {...(shownData.chatRecipient === null ? {} : { chatRecipient: `${shownData.chatRecipient.label} (${shownData.chatRecipient.host})` })}
        {...(shownData.providers === undefined ? {} : { providers: shownData.providers })}
        {...(shownData.home === undefined ? {} : { home: shownData.home })}
      />
    </AePublicPage>
  );
}
