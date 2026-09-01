import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import {
  type OnChangeFn,
  type RowSelectionState,
} from "@tanstack/react-table";
import { SearchIcon } from "lucide-react";
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { AeEmptyState } from "@/components/ae/feedback/AeEmptyState";
import { AePageHeader } from "@/components/ae/layout/AePageHeader";
import { AeCapabilityTile } from "@/components/ae/market/AeCapabilityTile";
import {
  AE_COMPARE_MAX_OPERATIONS,
  AeCompareTray,
} from "@/components/ae/market/AeCompareTray";
import {
  AeMarketComparisonView,
  type MarketComparison,
} from "@/components/ae/market/AeMarketComparisonView";
import {
  AeMarketToolbar,
  type AeMarketToolbarSearch,
} from "@/components/ae/market/AeMarketToolbar";
import { AeOperationTable } from "@/components/ae/market/AeOperationTable";
import {
  buildMarketReturnContext,
  type MarketReturnContext,
} from "@/components/ae/market/market-return-context";
import type { AeRecordTableSelection } from "@/components/ae/operator/AeOperatorDataTable";
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
  type OperationCardViewModel,
} from "@/modules/market/operation-view-model";
import type { MarketRouteProjection } from "@/modules/market/server";

type MarketPageSearch = AeMarketToolbarSearch & Readonly<{ compare?: string }>;

const CATALOG_DESCRIPTION =
  "Inspect price, access, and readiness without an account. Only available Operations can be called.";

export function AeMarketPage({
  projection,
  search,
  comparison,
  onCompareOperations,
}: {
  projection: MarketRouteProjection;
  search: MarketPageSearch;
  comparison?: MarketComparison;
  onCompareOperations?: (operationRefs: readonly string[]) => void;
}) {
  const { window, catalog } = projection;
  const navigate = useNavigate();
  const router = useRouter();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [isEditingComparison, setIsEditingComparison] = useState(false);
  const selectionFallbackRef = useRef<HTMLAnchorElement>(null);
  const catalogContextKey = [
    search.window,
    search.query,
    search.availability,
    search.category,
    search.capability,
    search.cursor,
  ].join("\u0000");
  const categoryId = search.category ?? "all";
  const marketTableReturnTo = buildMarketReturnContext(search, "operations");
  const marketComparisonReturnTo = buildMarketReturnContext(search);
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
  const currentRowSelection = useMemo(
    () => pruneRowSelection(rowSelection, operations),
    [operations, rowSelection],
  );
  const selectedOperations = useMemo(
    () => operations.filter((operation) => currentRowSelection[operation.operationRef] === true),
    [currentRowSelection, operations],
  );
  useEffect(() => {
    setIsEditingComparison(false);
  }, [search.compare]);
  useEffect(() => {
    setRowSelection({});
  }, [catalogContextKey]);
  useEffect(() => {
    if (isEditingComparison) selectionFallbackRef.current?.focus();
  }, [isEditingComparison]);
  const updateRowSelection: OnChangeFn<RowSelectionState> = (updater) => {
    setRowSelection((current) => {
      const currentVisible = pruneRowSelection(current, operations);
      const next = typeof updater === "function" ? updater(currentVisible) : updater;
      return pruneRowSelection(next, operations);
    });
  };
  const marketSelection: AeRecordTableSelection<OperationCardViewModel> | undefined =
    onCompareOperations === undefined ? undefined : {
      state: currentRowSelection,
      onChange: updateRowSelection,
      getRowLabel: (operation) => `${operation.title} by ${operation.supplierName}`,
      canSelectRow: (operation) =>
        operation.readiness !== "Unavailable" &&
        (currentRowSelection[operation.operationRef] === true ||
          selectedOperations.length < AE_COMPARE_MAX_OPERATIONS),
      showSelectAll: false,
      showStatus: false,
    };
  const status = unavailable
    ? "Catalogue unavailable"
    : catalog.kind === "ok" &&
        drilledGroup === undefined &&
        (catalog.pagination.hasMore || matchedCount > shownCount)
      ? `${shownCount.toLocaleString()} of ${matchedCount.toLocaleString()}`
      : `${shownCount.toLocaleString()} shown`;

  if (comparison !== undefined && !isEditingComparison) {
    return (
      <AeMarketComparisonView
        comparison={comparison}
        onEditSelection={() => {
          const selectedRefs = new Set(search.compare?.split(",") ?? []);
          setRowSelection(Object.fromEntries(
            operations
              .filter((operation) => selectedRefs.has(operation.operationRef))
              .map((operation) => [operation.operationRef, true]),
          ));
          setIsEditingComparison(true);
        }}
        onBack={() => {
          setRowSelection({});
          setIsEditingComparison(true);
          void navigate({
            to: "/market",
            replace: true,
            search: marketSearchWithoutComparison(search),
          });
        }}
        onRetry={() => {
          void router.invalidate();
        }}
        returnTo={marketComparisonReturnTo}
      />
    );
  }

  const handleCategoryChange = (value: MarketCategoryId | "all") => {
    void navigate({
      to: "/market",
      search: {
        window,
        ...(search.query === undefined ? {} : { query: search.query }),
        ...(search.availability === undefined
          ? {}
          : { availability: search.availability }),
        ...(value === "all" ? {} : { category: value }),
      },
    });
  };

  const catalogLink = (
    <Button asChild variant="ghost" className="min-h-touch">
      <Link ref={selectionFallbackRef} to="/market" search={{ window }}>
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
    body = (
      <AeOperationTable
        operations={drilledGroup.operations}
        returnTo={marketTableReturnTo}
        {...(marketSelection === undefined ? {} : { selection: marketSelection })}
      />
    );
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
          returnTo={marketTableReturnTo}
          {...(marketSelection === undefined ? {} : { selection: marketSelection })}
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
        onCategoryChange={handleCategoryChange}
      />
    );
  }

  return (
    <div id="operations" className="min-h-dvh scroll-mt-anchor">
      <AePageHeader
        eyebrow="Catalog"
        title={title}
        description={description}
        actions={actions}
        meta={status}
        variant="market"
      />
      <div
        className={selectedOperations.length === 0
          ? "ae-rail grid gap-section pb-page"
          : "ae-rail grid gap-section pb-96 sm:pb-72"}
      >
        <AeMarketToolbar search={search} />
        {body}
        {onCompareOperations === undefined ? null : (
          <AeCompareTray
            operations={selectedOperations}
            onRemove={(operationRef) => {
              setRowSelection((current) => ({ ...current, [operationRef]: false }));
            }}
            onClear={() => setRowSelection({})}
            onCompare={(operationRefs) => {
              setIsEditingComparison(false);
              onCompareOperations(operationRefs);
            }}
            fallbackFocusRef={selectionFallbackRef}
          />
        )}
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
        if (
          value === "all" ||
          marketCategories.some((category) => category.id === value)
        ) {
          onCategoryChange(value as MarketCategoryId | "all");
        }
      }}
    >
      <TabsList
        variant="line"
        aria-label="Catalog categories"
        className="h-auto min-h-touch w-full flex-nowrap justify-start overflow-x-auto border-b border-border"
      >
        <TabsTrigger
          value="all"
          aria-label={`All, ${capabilityGroupCountLabel(total)} shown on this page`}
          className="min-h-touch flex-none"
        >
          All {total}
        </TabsTrigger>
        {marketCategories.map((category) => {
          const shelf = shelves.find((item) => item.category.id === category.id);
          const count = shelf?.capabilities.length ?? 0;
          const CategoryIcon = resolveOperationCategoryIcon(category.id);
          return (
            <TabsTrigger
              key={category.id}
              value={category.id}
              aria-label={`${category.label}, ${capabilityGroupCountLabel(count)} shown on this page`}
              className="min-h-touch flex-none"
            >
              <Suspense fallback={null}>
                <CategoryIcon className="size-4" />
              </Suspense>
              {category.label} {count}
            </TabsTrigger>
          );
        })}
      </TabsList>
      <TabsContent value="all" className="grid gap-section">
        {shelves.map((shelf) => (
          <CategoryShelf key={shelf.category.id} shelf={shelf} window={window} />
        ))}
      </TabsContent>
      {marketCategories.map((category) => {
        const shelf = shelves.find((item) => item.category.id === category.id);
        return (
          <TabsContent
            key={category.id}
            value={category.id}
            className="grid gap-section"
          >
            {shelf === undefined ? (
              <p className="py-related text-sm text-muted-foreground">
                No capability groups in {category.label} on this loaded page.
              </p>
            ) : (
              <CategoryShelf shelf={shelf} window={window} />
            )}
          </TabsContent>
        );
      })}
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
  selection,
  returnTo,
}: {
  groups: readonly CapabilityGroupViewModel[];
  catalog: Extract<MarketRouteProjection["catalog"], { kind: "ok" }>;
  window: MarketWindow;
  search: MarketPageSearch;
  selection?: AeRecordTableSelection<OperationCardViewModel>;
  returnTo: MarketReturnContext;
}) {
  return (
    <div className="grid min-w-0 gap-section">
      {groups.map((group) => (
        <section
          key={group.capabilityId}
          aria-labelledby={`capability-${group.capabilityId}`}
          className="grid min-w-0 gap-related"
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
          <AeOperationTable
            operations={group.operations}
            returnTo={returnTo}
            {...(selection === undefined ? {} : { selection })}
          />
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
                ...(search.category === undefined
                  ? {}
                  : { category: search.category }),
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

function capabilityGroupCountLabel(count: number) {
  return `${count.toLocaleString()} capability ${count === 1 ? "group" : "groups"}`;
}

function pruneRowSelection(
  selection: RowSelectionState,
  operations: readonly OperationCardViewModel[],
): RowSelectionState {
  const currentRefs = new Set(operations.map((operation) => operation.operationRef));
  return Object.fromEntries(
    Object.entries(selection).filter(([operationRef, selected]) =>
      selected === true && currentRefs.has(operationRef)),
  );
}

function marketSearchWithoutComparison(search: MarketPageSearch): AeMarketToolbarSearch {
  const { compare: _compare, ...remaining } = search;
  return remaining;
}
