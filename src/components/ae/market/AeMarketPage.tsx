import { Link } from "@tanstack/react-router";
import { SearchIcon } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { AeEmptyState } from "@/components/ae/feedback/AeEmptyState";
import { AePageHeader } from "@/components/ae/layout/AePageHeader";
import { AeCapabilityTile } from "@/components/ae/market/AeCapabilityTile";
import { AeOperationTable } from "@/components/ae/market/AeOperationTable";
import { Button } from "@/components/ui/button";
import { ItemGroup } from "@/components/ui/item";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { MarketWindow } from "@/modules/market/contracts";
import {
  marketCategories,
  type MarketCategoryId,
} from "@/modules/market/listing-evidence";
import {
  capabilityFromPrice,
  groupCapabilitiesByCategory,
  groupOperationCards,
  type CapabilityGroupViewModel,
  type CategoryShelfViewModel,
} from "@/modules/market/operation-view-model";
import type { MarketRouteProjection } from "@/modules/market/server";

type MarketPageSearch = Readonly<{
  window: MarketWindow;
  query?: string;
  availability?: "routeable" | "integrated" | "unavailable";
  cursor?: string;
  capability?: string;
}>;

const CATALOG_DESCRIPTION =
  "Compare exact Operations on price and readiness, then call through Agentic Economy. No provider signup on the browse path.";

export function AeMarketPage({
  projection,
  search,
}: {
  projection: MarketRouteProjection;
  search: MarketPageSearch;
}) {
  const { window, catalog } = projection;
  const [categoryId, setCategoryId] = useState<MarketCategoryId | "all">("all");
  const operations = catalog.kind === "ok" ? catalog.items : [];
  const capabilityGroups = useMemo(
    () => groupOperationCards(operations),
    [operations],
  );
  const shelves = useMemo(
    () => groupCapabilitiesByCategory(capabilityGroups),
    [capabilityGroups],
  );
  const matchedCount =
    catalog.kind === "unavailable" ? 0 : catalog.matchedCount;
  const drilledGroup = capabilityGroups.find(
    (group) => group.capabilityId === search.capability,
  );
  const query = search.query;
  const isQuery = query !== undefined;
  const unavailable = catalog.kind === "unavailable";
  const empty = !unavailable && matchedCount === 0;
  const toolLabel = matchedCount === 1 ? "tool" : "tools";
  const status =
    unavailable
      ? "Catalogue unavailable"
      : `${(drilledGroup?.operations.length ?? matchedCount).toLocaleString()} Operations shown`;

  const catalogLink = (
    <Button asChild variant="ghost" className="min-h-11">
      <Link to="/market" search={{ window }}>
        Catalog
      </Link>
    </Button>
  );

  let title: string;
  let description: string;
  let actions: ReactNode;
  let body: ReactNode;

  if (drilledGroup !== undefined) {
    const count = drilledGroup.operations.length;
    title = drilledGroup.label;
    description = `${drilledGroup.category.label} · ${count.toLocaleString()} ${count === 1 ? "Operation" : "Operations"} · ${capabilityFromPrice(drilledGroup.operations)}`;
    actions = catalogLink;
    body = <AeOperationTable operations={drilledGroup.operations} />;
  } else if (isQuery) {
    title = `Results for “${query}”`;
    description =
      "Exact Operations that match this search. Compare price and readiness, then call through Agentic Economy.";
    actions = catalogLink;
    body =
      unavailable || empty || catalog.kind !== "ok" ? (
        <CatalogEmpty unavailable={unavailable} />
      ) : (
        <OperationResults
          groups={capabilityGroups}
          catalog={catalog}
          window={window}
          search={search}
        />
      );
  } else {
    title = unavailable
      ? "The tool catalog"
      : `${matchedCount.toLocaleString()} ${toolLabel} for agents`;
    description = CATALOG_DESCRIPTION;
    actions = (
      <>
        <Button asChild variant="outline" className="min-h-11">
          <Link to="/for-providers">List a tool</Link>
        </Button>
        <Button asChild className="min-h-11">
          <Link to="/for-agents">Set up an agent</Link>
        </Button>
      </>
    );
    body = unavailable || empty ? (
      <CatalogEmpty unavailable={unavailable} />
    ) : (
      <CatalogTabs
        categoryId={categoryId}
        shelves={shelves}
        window={window}
        onCategoryChange={setCategoryId}
      />
    );
  }

  return (
    <div id="operations" className="scroll-mt-6">
      <AePageHeader
        title={title}
        description={description}
        actions={actions}
        meta={status}
      />
      <div className="ae-rail grid gap-section pb-page">
        {body}
      </div>
    </div>
  );
}

function CatalogEmpty({ unavailable }: { unavailable: boolean }) {
  return unavailable ? (
    <AeEmptyState
      icon={<SearchIcon />}
      title="The tool catalog is temporarily unavailable"
      description="Try again shortly. Existing tool links continue to work."
    />
  ) : (
    <AeEmptyState
      icon={<SearchIcon />}
      title="No tools match these filters"
      description="Try a broader search, another category, or a different availability."
    />
  );
}

function CatalogTabs({
  categoryId,
  shelves,
  window,
  onCategoryChange,
}: {
  categoryId: MarketCategoryId | "all";
  shelves: readonly CategoryShelfViewModel[];
  window: MarketWindow;
  onCategoryChange: (value: MarketCategoryId | "all") => void;
}) {
  const total = shelves.reduce(
    (sum, shelf) => sum + shelf.capabilities.length,
    0,
  );

  return (
    <Tabs
      className="gap-8"
      value={categoryId}
      onValueChange={(value) => {
        if (value === "all" || shelves.some((shelf) => shelf.category.id === value)) {
          onCategoryChange(value as MarketCategoryId | "all");
        }
      }}
    >
      <TabsList
        variant="line"
        aria-label="Catalog categories"
        className="h-auto min-h-11 w-full flex-wrap justify-start border-b border-border"
      >
        <TabsTrigger value="all" className="min-h-11 flex-none">
          All {total}
        </TabsTrigger>
        {marketCategories.map((category) => {
          const shelf = shelves.find((item) => item.category.id === category.id);
          if (shelf === undefined) return null;
          return (
            <TabsTrigger
              key={category.id}
              value={category.id}
              className="min-h-11 flex-none"
            >
              {category.label} {shelf.capabilities.length}
            </TabsTrigger>
          );
        })}
      </TabsList>
      <TabsContent value="all" className="grid gap-8">
        {shelves.map((shelf) => (
          <CategoryShelf key={shelf.category.id} shelf={shelf} window={window} />
        ))}
      </TabsContent>
      {shelves.map((shelf) => (
        <TabsContent
          key={shelf.category.id}
          value={shelf.category.id}
          className="grid gap-8"
        >
          <CategoryShelf shelf={shelf} window={window} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function CategoryShelf({
  shelf,
  window,
}: {
  shelf: CategoryShelfViewModel;
  window: MarketWindow;
}) {
  const headingId = `catalog-${shelf.category.id}`;

  return (
    <section aria-labelledby={headingId} className="grid gap-4">
      <div className="grid gap-1">
        <h2 id={headingId} className="text-xl font-semibold tracking-tight">
          {shelf.category.label}{" "}
          <span className="font-normal text-muted-foreground">
            {shelf.capabilities.length}
          </span>
        </h2>
        <p className="max-w-2xl text-pretty text-sm text-muted-foreground">
          {shelf.category.description}
        </p>
      </div>
      <ItemGroup className="grid gap-3 sm:grid-cols-2">
        {shelf.capabilities.map((group) => (
          <li key={group.capabilityId}>
            <AeCapabilityTile group={group} window={window} />
          </li>
        ))}
      </ItemGroup>
    </section>
  );
}

function OperationResults({
  groups,
  catalog,
  window,
  search,
}: {
  groups: readonly CapabilityGroupViewModel[];
  catalog: Extract<MarketRouteProjection["catalog"], { kind: "ok" }>;
  window: MarketWindow;
  search: MarketPageSearch;
}) {
  return (
    <div className="grid gap-8">
      {groups.map((group) => (
        <section
          key={group.capabilityId}
          aria-labelledby={`capability-${group.capabilityId}`}
          className="grid gap-4"
        >
          <div className="grid gap-1">
            <h2
              id={`capability-${group.capabilityId}`}
              className="text-base font-semibold"
            >
              {group.label}
            </h2>
            <p className="text-sm text-muted-foreground">
              {group.providerCount.toLocaleString()}{" "}
              {group.providerCount === 1 ? "provider" : "providers"}
            </p>
          </div>
          <AeOperationTable operations={group.operations} />
        </section>
      ))}
      {catalog.pagination.hasMore &&
      catalog.pagination.nextCursor !== undefined ? (
        <Pagination aria-label="Operation pages">
          <PaginationContent>
            <PaginationItem>
              <Button asChild variant="outline" className="min-h-11">
                <Link
                  to="/market"
                  search={{
                    window,
                    ...(search.query === undefined ? {} : { query: search.query }),
                    ...(search.availability === undefined
                      ? {}
                      : { availability: search.availability }),
                    cursor: catalog.pagination.nextCursor,
                  }}
                >
                  Next 12 Operations
                </Link>
              </Button>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      ) : null}
    </div>
  );
}
