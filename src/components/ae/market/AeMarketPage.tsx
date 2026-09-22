import { AePublicPage } from "@/components/ae/layout/AePublicPage";
import { AeX402Directory } from "@/components/ae/market/AeX402Directory";
import type { MarketSearch } from "@/modules/market/market.functions";
import type { X402DirectoryPage } from "@/modules/market/x402-directory";
import type { MarketCompareEntry } from "@/modules/market/market-route-data";
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
  }>;
  search: MarketSearch;
}>;

export function AeMarketPage({ data, search }: AeMarketPageProps) {
  return (
    <AePublicPage>
      <AeX402Directory
        marketPath="/market"
        activeView={data.view}
        page={data.page}
        compareEntries={data.compareEntries}
        search={search}
        catalogue={data.catalogue}
        overview={data.overview}
        {...(data.providers === undefined ? {} : { providers: data.providers })}
        {...(data.home === undefined ? {} : { home: data.home })}
      />
    </AePublicPage>
  );
}
