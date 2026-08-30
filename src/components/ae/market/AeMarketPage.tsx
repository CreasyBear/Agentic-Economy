import { Link } from "@tanstack/react-router";
import { SearchIcon } from "lucide-react";
import { Suspense, useMemo, useState, type ReactNode } from "react";

import { AeEmptyState } from "@/components/ae/feedback/AeEmptyState";
import { AePageHeader } from "@/components/ae/layout/AePageHeader";
import { AeCapabilityTile } from "@/components/ae/market/AeCapabilityTile";
import { AeOperationTable } from "@/components/ae/market/AeOperationTable";
import { AeSiteButton } from "@/components/ae/website/AeSiteButton";
import { Button } from "@/components/ui/button";
import { ItemGroup } from "@/components/ui/item";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AGENT_DOOR } from "@/content/brand-copy";
import { resolveOperationCategoryIcon } from "@/lib/public/operation-icons";
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
  "Inspect price, access, and readiness without an account. Only available Operations can be called.";

export function AeMarketPage({
  projection,
  search,
}: {
  projection: MarketRouteProjection;
  search: MarketPageSearch;
}) {
  const { window, catalog } = projection;
  const [categoryId, setCategoryId] = useState<MarketCategoryId | "all">("all");
  const operations = useMemo(
    () => catalog.kind === "ok" ? catalog.items : [],
    [catalog],
  );
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
    (group) =>
      group.capabilityId === search.capability ||
      group.operations.some(
        (operation) => operation.capabilityId === search.capability,
      ),
  );
  const query = search.query;
  const isQuery = query !== undefined;
  const unavailable = catalog.kind === "unavailable";
  const empty = !unavailable && matchedCount === 0;
  const operationLabel = matchedCount === 1 ? "Operation" : "Operations";
  const shownCount = drilledGroup?.operations.length ?? operations.length;
  const status = unavailable
    ? "Catalogue unavailable"
    : catalog.kind === "ok" &&
        drilledGroup === undefined &&
        (catalog.pagination.hasMore || matchedCount > shownCount)
      ? `${shownCount.toLocaleString()} of ${matchedCount.toLocaleString()}`
      : `${shownCount.toLocaleString()} shown`;

  const catalogLink = (
    <Button asChild variant="ghost" className="min-h-touch">
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
    description = `${drilledGroup.category.label} · ${count.toLocaleString()} listed · ${capabilityFromPrice(drilledGroup.operations)}`;
    actions = catalogLink;
    body = <AeOperationTable operations={drilledGroup.operations} />;
  } else if (isQuery) {
    title = `Results for “${query}”`;
    description =
      "Current Operations that match this job. Inspect access and readiness before calling.";
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
      ? "The Operation catalog"
      : `${matchedCount.toLocaleString()} current ${operationLabel}`;
    description = CATALOG_DESCRIPTION;
    actions = (
      <>
        <AeSiteButton asChild variant="outlined">
          <Link to="/for-providers">Publish an Operation</Link>
        </AeSiteButton>
        <AeSiteButton asChild>
          <Link to="/for-agents">{AGENT_DOOR.cta}</Link>
        </AeSiteButton>
      </>
    );
    body = unavailable || empty ? (
      <CatalogEmpty unavailable={unavailable} />
    ) : (
      <CatalogTabs
        categoryId={categoryId}
        shelves={shelves}
        window={window}
        search={search}
        pagination={catalog.kind === "ok" ? catalog.pagination : { limit: 12, hasMore: false }}
        onCategoryChange={setCategoryId}
      />
    );
  }

  return (
    <div id="operations" className="scroll-mt-6">
      <AePageHeader
        eyebrow="Catalog"
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
      title="The Operation catalog is temporarily unavailable"
      description="Try again shortly. Existing Operation links continue to work."
      action={
        <Button asChild className="min-h-touch">
          <Link to="/market" search={{ window: "30d" }}>Try again</Link>
        </Button>
      }
    />
  ) : (
    <AeEmptyState
      icon={<SearchIcon />}
      title="No Operations match these filters"
      description="Try a broader search, another category, or a different availability."
      action={
        <Button asChild className="min-h-touch">
          <Link to="/market" search={{ window: "30d" }}>Clear filters</Link>
        </Button>
      }
    />
  );
}

function CatalogTabs({
  categoryId,
  shelves,
  window,
  search,
  pagination,
  onCategoryChange,
}: {
  categoryId: MarketCategoryId | "all";
  shelves: readonly CategoryShelfViewModel[];
  window: MarketWindow;
  search: MarketPageSearch;
  pagination: Extract<MarketRouteProjection["catalog"], { kind: "ok" }>["pagination"];
  onCategoryChange: (value: MarketCategoryId | "all") => void;
}) {
  const total = shelves.reduce(
    (sum, shelf) => sum + shelf.capabilities.length,
    0,
  );

  return (
    <div className="grid gap-section">
    <Tabs
      className="gap-section"
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
        className="h-auto min-h-touch w-full flex-wrap justify-start border-b border-border"
      >
        <TabsTrigger value="all" className="min-h-touch flex-none">
          All {total}
        </TabsTrigger>
        {marketCategories.map((category) => {
          const shelf = shelves.find((item) => item.category.id === category.id);
          if (shelf === undefined) return null;
          const CategoryIcon = resolveOperationCategoryIcon(category.id);
          return (
            <TabsTrigger
              key={category.id}
              value={category.id}
              className="min-h-touch flex-none"
            >
              <Suspense fallback={null}>
                <CategoryIcon className="size-4" />
              </Suspense>
              {category.label} {shelf.capabilities.length}
            </TabsTrigger>
          );
        })}
      </TabsList>
      <TabsContent value="all" className="grid gap-section">
        {shelves.map((shelf) => (
          <CategoryShelf key={shelf.category.id} shelf={shelf} window={window} />
        ))}
      </TabsContent>
      {shelves.map((shelf) => (
        <TabsContent
          key={shelf.category.id}
          value={shelf.category.id}
          className="grid gap-section"
        >
          <CategoryShelf shelf={shelf} window={window} />
        </TabsContent>
      ))}
    </Tabs>
    <CatalogPagination pagination={pagination} window={window} search={search} />
    </div>
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
    <section aria-labelledby={headingId} className="grid gap-related">
      <div className="grid gap-intra">
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
      <ItemGroup className="grid gap-related sm:grid-cols-2">
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
    <div className="grid gap-section">
      {groups.map((group) => (
        <section
          key={group.capabilityId}
          aria-labelledby={`capability-${group.capabilityId}`}
          className="grid gap-related"
        >
          <div className="grid gap-intra">
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
      <CatalogPagination
        pagination={catalog.pagination}
        window={window}
        search={search}
      />
    </div>
  );
}

function CatalogPagination({
  pagination,
  window,
  search,
}: {
  pagination: Extract<MarketRouteProjection["catalog"], { kind: "ok" }>["pagination"];
  window: MarketWindow;
  search: MarketPageSearch;
}) {
  if (!pagination.hasMore || pagination.nextCursor === undefined) return null;
  return (
    <Pagination aria-label="Catalog pages">
      <PaginationContent>
        <PaginationItem>
              <Button asChild variant="outline" className="min-h-touch">
                <Link
                  to="/market"
                  reloadDocument
                  search={{
                window,
                ...(search.query === undefined ? {} : { query: search.query }),
                ...(search.availability === undefined
                  ? {}
                  : { availability: search.availability }),
                cursor: pagination.nextCursor,
              }}
            >
              Next {pagination.limit}
            </Link>
          </Button>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
