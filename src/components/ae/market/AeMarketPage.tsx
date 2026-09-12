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
  AE_COMPARE_MAX_TOOLS,
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
import { AeToolCard } from "@/components/ae/market/AeToolCard";
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
import { resolveToolCategoryIcon } from "@/lib/public/tool-icons";
import {
  marketCategories,
  type MarketCategoryId,
} from "@/modules/market/listing-evidence";
import {
  capabilityFromPrice,
  groupCapabilitiesByCategory,
  groupToolCards,
  type CapabilityGroupViewModel,
  type CategoryShelfViewModel,
  type ToolCardViewModel,
} from "@/modules/market/tool-view-model";
import type { MarketRouteProjection } from "@/modules/market/server";

type MarketPageSearch = AeMarketToolbarSearch & Readonly<{ compare?: string }>;

const CATALOG_DESCRIPTION =
  "Inspect price, access, and readiness without an account. Only available Tools can be called.";

export function AeMarketPage({
  projection,
  search,
  comparison,
  onCompareTools,
}: {
  projection: MarketRouteProjection;
  search: MarketPageSearch;
  comparison?: MarketComparison;
  onCompareTools?: (toolRefs: readonly string[]) => void;
}) {
  const { catalog } = projection;
  const navigate = useNavigate();
  const router = useRouter();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [isEditingComparison, setIsEditingComparison] = useState(false);
  const selectionFallbackRef = useRef<HTMLAnchorElement>(null);
  const catalogContextKey = [
    search.query,
    search.availability,
    search.category,
    search.capability,
    search.cursor,
  ].join("\u0000");
  const categoryId = search.category ?? "all";
  // No `'tools'` hash: nothing on this page has `id="tools"`, so the hash
  // only ever suppressed TanStack Router's window scroll restoration (a
  // hash present on the destination location makes commitLocation skip
  // restoring the window's scroll in favour of a hash-anchor scroll) without
  // ever landing anywhere itself. Dropping it lets Back-to-results restore
  // the scroll position the user had before opening the Tool page.
  const marketTableReturnTo = buildMarketReturnContext(search);
  const marketComparisonReturnTo = buildMarketReturnContext(search);
  const tools = useMemo(
    () => catalog.kind === "ok" ? catalog.items : [],
    [catalog],
  );
  const capabilityGroups = useMemo(
    () => groupToolCards(tools),
    [tools],
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
      group.tools.some(
        (tool) => tool.capabilityId === search.capability,
      ),
  );
  const query = search.query;
  const isQuery = query !== undefined;
  const unavailable = catalog.kind === "unavailable";
  const empty = !unavailable && tools.length === 0 && !(catalog.kind === "ok" && catalog.pagination.hasMore);
  const toolLabel = matchedCount === 1 ? "Tool" : "Tools";
  const shownCount = drilledGroup?.tools.length ?? tools.length;
  const currentRowSelection = useMemo(
    () => pruneRowSelection(rowSelection, tools),
    [tools, rowSelection],
  );
  const selectedTools = useMemo(
    () => tools.filter((tool) => currentRowSelection[tool.toolRef] === true),
    [currentRowSelection, tools],
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
      const currentVisible = pruneRowSelection(current, tools);
      const next = typeof updater === "function" ? updater(currentVisible) : updater;
      return pruneRowSelection(next, tools);
    });
  };
  const marketSelection: AeRecordTableSelection<ToolCardViewModel> | undefined =
    onCompareTools === undefined ? undefined : {
      state: currentRowSelection,
      onChange: updateRowSelection,
      getRowLabel: (tool) => `${tool.title} by ${tool.providerName}`,
      canSelectRow: (tool) =>
        tool.readiness !== "Unavailable" &&
        (currentRowSelection[tool.toolRef] === true ||
          selectedTools.length < AE_COMPARE_MAX_TOOLS),
      showSelectAll: false,
      showStatus: false,
    };
  const status = unavailable
    ? "Catalogue unavailable"
    : catalog.kind === "ok" &&
        drilledGroup === undefined &&
        matchedCount !== undefined &&
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
            tools
              .filter((tool) => selectedRefs.has(tool.toolRef))
              .map((tool) => [tool.toolRef, true]),
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
      <Link ref={selectionFallbackRef} to="/market" search={{}}>
        Market
      </Link>
    </Button>
  );

  let title: string;
  let description: string;
  let actions: ReactNode;
  let body: ReactNode;

  if (drilledGroup !== undefined) {
    const count = drilledGroup.tools.length;
    title = drilledGroup.label;
    description = `${drilledGroup.category.label} · ${count.toLocaleString()} listed · ${capabilityFromPrice(drilledGroup.tools)}`;
    actions = catalogLink;
    body = (
      <ToolCardGrid
        tools={drilledGroup.tools}
        returnTo={marketTableReturnTo}
        {...(marketSelection === undefined ? {} : { selection: marketSelection })}
      />
    );
  } else if (isQuery) {
    title = `Results for “${query}”`;
    description =
      "Current Tools that match this job. Inspect access and readiness before calling.";
    actions = catalogLink;
    body =
      unavailable || empty || catalog.kind !== "ok" ? (
        <CatalogEmpty unavailable={unavailable} />
      ) : (
        <ToolResults
          groups={capabilityGroups}
          catalog={catalog}
          search={search}
          returnTo={marketTableReturnTo}
          {...(marketSelection === undefined ? {} : { selection: marketSelection })}
        />
      );
  } else {
    title = unavailable
      ? "The Tool catalog"
      : matchedCount === undefined ? "The Tool catalog" : `${matchedCount.toLocaleString()} current ${toolLabel}`;
    description = CATALOG_DESCRIPTION;
    actions = (
      <>
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
        search={search}
        pagination={catalog.kind === "ok" ? catalog.pagination : { limit: 12, hasMore: false }}
        onCategoryChange={handleCategoryChange}
      />
    );
  }

  return (
    <div id="tools" className="min-h-dvh scroll-mt-anchor">
      <AePageHeader
        eyebrow="Catalog"
        title={title}
        description={description}
        actions={actions}
        meta={status}
        variant="market"
      />
      <div
        className={selectedTools.length === 0
          ? "ae-rail grid gap-section pb-page"
          : "ae-rail grid gap-section pb-96 sm:pb-72"}
      >
        <AeMarketToolbar search={search} />
        {catalog.kind === "ok" && catalog.partialResults === true ? (
          <p className="text-sm text-muted-foreground">Refine your search for more results.</p>
        ) : null}
        {body}
        {onCompareTools === undefined ? null : (
          <AeCompareTray
            tools={selectedTools}
            onRemove={(toolRef) => {
              setRowSelection((current) => ({ ...current, [toolRef]: false }));
            }}
            onClear={() => setRowSelection({})}
            onCompare={(toolRefs) => {
              setIsEditingComparison(false);
              onCompareTools(toolRefs);
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
      title="The Tool catalog is temporarily unavailable"
      description="Try again shortly. Existing Tool links continue to work."
      action={
        <Button asChild className="min-h-touch">
          <Link to="/market" search={{}}>Try again</Link>
        </Button>
      }
    />
  ) : (
    <AeEmptyState
      icon={<SearchIcon />}
      title="No Tools match these filters"
      description="Try a broader search, another category, or a different availability."
      action={
        <Button asChild className="min-h-touch">
          <Link to="/market" search={{}}>Clear filters</Link>
        </Button>
      }
    />
  );
}

function CatalogTabs({
  categoryId,
  shelves,
  search,
  pagination,
  onCategoryChange,
}: {
  categoryId: MarketCategoryId | "all";
  shelves: readonly CategoryShelfViewModel[];
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
          const CategoryIcon = resolveToolCategoryIcon(category.id);
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
          <CategoryShelf key={shelf.category.id} shelf={shelf} />
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
              <CategoryShelf shelf={shelf} />
            )}
          </TabsContent>
        );
      })}
    </Tabs>
    <CatalogPagination pagination={pagination} search={search} />
    </div>
  );
}

function CategoryShelf({
  shelf,
}: {
  shelf: CategoryShelfViewModel;
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
            <AeCapabilityTile group={group} />
          </li>
        ))}
      </ItemGroup>
    </section>
  );
}

function ToolResults({
  groups,
  catalog,
  search,
  selection,
  returnTo,
}: {
  groups: readonly CapabilityGroupViewModel[];
  catalog: Extract<MarketRouteProjection["catalog"], { kind: "ok" }>;
  search: MarketPageSearch;
  selection?: AeRecordTableSelection<ToolCardViewModel>;
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
          <ToolCardGrid
            tools={group.tools}
            returnTo={returnTo}
            {...(selection === undefined ? {} : { selection })}
          />
        </section>
      ))}
      <CatalogPagination
        pagination={catalog.pagination}
        search={search}
      />
    </div>
  );
}

function CatalogPagination({
  pagination,
  search,
}: {
  pagination: Extract<MarketRouteProjection["catalog"], { kind: "ok" }>["pagination"];
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
              Next page
            </Link>
          </Button>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

function ToolCardGrid({
  tools,
  returnTo,
  selection,
}: {
  tools: readonly ToolCardViewModel[];
  returnTo?: MarketReturnContext;
  selection?: AeRecordTableSelection<ToolCardViewModel>;
}) {
  if (tools.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        No Tools on this page. Adjust the filters or continue to the next page.
      </p>
    );
  }
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {tools.map((tool) => {
        const comparing = selection?.state[tool.toolRef] === true;
        return (
          <li key={tool.toolRef} className="min-w-0">
            <AeToolCard
              operation={tool}
              {...(returnTo === undefined ? {} : { returnTo })}
              {...(selection === undefined
                ? {}
                : {
                    onCompare: () => {
                      selection.onChange((current) => ({
                        ...current,
                        [tool.toolRef]: !(current[tool.toolRef] === true),
                      }));
                    },
                    comparing,
                    compareDisabled:
                      !comparing && selection.canSelectRow?.(tool) === false,
                  })}
            />
          </li>
        );
      })}
    </ul>
  );
}

function capabilityGroupCountLabel(count: number) {
  return `${count.toLocaleString()} capability ${count === 1 ? "group" : "groups"}`;
}

function pruneRowSelection(
  selection: RowSelectionState,
  tools: readonly ToolCardViewModel[],
): RowSelectionState {
  const currentRefs = new Set(tools.map((tool) => tool.toolRef));
  return Object.fromEntries(
    Object.entries(selection).filter(([toolRef, selected]) =>
      selected === true && currentRefs.has(toolRef)),
  );
}

function marketSearchWithoutComparison(search: MarketPageSearch): AeMarketToolbarSearch {
  const { compare: _compare, ...remaining } = search;
  return remaining;
}
