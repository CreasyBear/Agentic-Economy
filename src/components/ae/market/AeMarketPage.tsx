import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRightIcon,
  SearchIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import { AeEmptyState } from "@/components/ae/feedback/AeEmptyState";
import { AeOperationCard } from "@/components/ae/market/AeOperationCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { ItemGroup } from "@/components/ui/item";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { MarketWindow } from "@/modules/market/contracts";
import {
  marketCategories,
  type MarketCategoryId,
} from "@/modules/market/listing-evidence";
import {
  groupOperationCards,
  type OperationCardViewModel,
} from "@/modules/market/operation-view-model";
import type { MarketRouteProjection } from "@/modules/market/server";

type MarketPageSearch = Readonly<{
  window: MarketWindow;
  query?: string;
  availability?: "routeable" | "integrated" | "unavailable";
  cursor?: string;
}>;

type CatalogOrder = "recommended" | "popular" | "rated" | "fastest";

export function AeMarketPage({
  projection,
  search,
}: {
  projection: MarketRouteProjection;
  search: MarketPageSearch;
}) {
  const navigate = useNavigate({ from: "/market" });
  const { window, catalog } = projection;
  const [categoryId, setCategoryId] = useState<MarketCategoryId | "all">("all");
  const [order, setOrder] = useState<CatalogOrder>("recommended");
  const visibleOperations = useMemo(() => {
    const operations = catalog.kind === "ok" ? catalog.items : [];
    const filtered = operations.filter(
      (operation) =>
        categoryId === "all" || operation.category.id === categoryId,
    );
    return [...filtered].sort((left, right) =>
      compareOperations(left, right, order),
    );
  }, [catalog, categoryId, order]);
  const capabilityGroups = useMemo(
    () => groupOperationCards(visibleOperations),
    [visibleOperations],
  );
  const matchedCount =
    catalog.kind === "unavailable" ? 0 : catalog.matchedCount;
  const hasFilters =
    search.query !== undefined ||
    search.availability !== undefined ||
    categoryId !== "all";

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = String(
      new FormData(event.currentTarget).get("query") ?? "",
    ).trim();
    void navigate({
      search: {
        window,
        ...(query === "" ? {} : { query }),
        ...(search.availability === undefined
          ? {}
          : { availability: search.availability }),
      },
    });
  }

  function changeAvailability(value: string) {
    const availability =
      value === "routeable" || value === "integrated" || value === "unavailable"
        ? value
        : undefined;
    void navigate({
      search: {
        window,
        ...(search.query === undefined ? {} : { query: search.query }),
        ...(availability === undefined ? {} : { availability }),
      },
    });
  }

  function changeWindow(window: MarketWindow) {
    void navigate({
      search: {
        window,
        ...(search.query === undefined ? {} : { query: search.query }),
        ...(search.availability === undefined
          ? {}
          : { availability: search.availability }),
      },
    });
  }

  function clearFilters() {
    setCategoryId("all");
    void navigate({
      search: { window },
    });
  }

  return (
    <div className="bg-background text-foreground">
      <MarketHero
        catalogAvailable={catalog.kind !== "unavailable"}
        matchedCount={matchedCount}
        query={search.query}
        onSearch={submitSearch}
      />

      <section
        id="operations"
        aria-labelledby="tool-catalog-heading"
        className="mx-auto w-full max-w-6xl scroll-mt-6 px-4 py-6 md:px-6"
      >
        <div className="flex flex-col gap-1 border-b pb-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2
              id="tool-catalog-heading"
              className="text-2xl font-semibold tracking-tight"
            >
              {search.query === undefined
                ? "Available tools"
                : `Results for “${search.query}”`}
            </h2>
            <p className="text-sm text-muted-foreground">
              Compare tools admitted to run through Agentic Economy.
            </p>
          </div>
          <p
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="mt-2 text-sm font-medium sm:mt-0"
          >
            {catalog.kind === "unavailable"
              ? "Catalogue unavailable"
              : `${visibleOperations.length.toLocaleString()} Operations shown`}
          </p>
        </div>

        <OperationControls
          availability={search.availability}
          categoryId={categoryId}
          hasFilters={hasFilters}
          matchedCount={matchedCount}
          order={order}
          window={window}
          onAvailabilityChange={changeAvailability}
          onCategoryChange={setCategoryId}
          onClear={clearFilters}
          onOrderChange={setOrder}
          onWindowChange={changeWindow}
        />

        <div className="mt-3 min-w-0">
          {capabilityGroups.length === 0 ? (
            <Card className="mt-5 shadow-none">
              <AeEmptyState
                icon={<SearchIcon />}
                title={
                  catalog.kind === "unavailable"
                    ? "The tool catalog is temporarily unavailable"
                    : "No tools match these filters"
                }
                description={
                  catalog.kind === "unavailable"
                    ? "Try again shortly. Existing tool links continue to work."
                    : "Try a broader search, another category, or a different availability."
                }
                action={
                  hasFilters ? (
                    <Button
                      variant="outline"
                      className="min-h-11"
                      onClick={clearFilters}
                    >
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          ) : (
            <div className="mt-5 grid gap-4">
              {capabilityGroups.map((group, index) => {
                const headingId = `capability-${index}`;
                return (
                  <section
                    key={group.capabilityId}
                    aria-labelledby={headingId}
                    className="overflow-hidden rounded-lg border bg-card"
                  >
                    <header className="flex flex-col gap-2 border-b bg-muted/25 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <h3 id={headingId} className="text-base font-semibold">
                          {group.label}
                        </h3>
                        <Badge variant="outline" className="font-normal">
                          {group.category.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {group.providerCount.toLocaleString()}{" "}
                        {group.providerCount === 1 ? "provider" : "providers"} ·{" "}
                        {group.providerCount > 1
                          ? "compare available suppliers"
                          : "no direct supplier alternative yet"}
                      </p>
                    </header>
                    <ItemGroup>
                      {group.operations.map((operation) => (
                        <AeOperationCard
                          key={operation.operationRef}
                          operation={operation}
                        />
                      ))}
                    </ItemGroup>
                  </section>
                );
              })}
            </div>
          )}

          {catalog.kind === "ok" &&
          catalog.pagination.hasMore &&
          catalog.pagination.nextCursor !== undefined ? (
            <Pagination className="mt-6" aria-label="Operation pages">
              <PaginationContent>
                <PaginationItem>
                  <Button asChild variant="outline" className="min-h-11">
                    <Link
                      to="/market"
                      search={{
                        window,
                        ...(search.query === undefined
                          ? {}
                          : { query: search.query }),
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
      </section>

      <MarketParticipation />
    </div>
  );
}

function OperationControls({
  availability,
  categoryId,
  hasFilters,
  matchedCount,
  order,
  window,
  onAvailabilityChange,
  onCategoryChange,
  onClear,
  onOrderChange,
  onWindowChange,
}: {
  availability: MarketPageSearch["availability"];
  categoryId: MarketCategoryId | "all";
  hasFilters: boolean;
  matchedCount: number;
  order: CatalogOrder;
  window: MarketWindow;
  onAvailabilityChange: (value: string) => void;
  onCategoryChange: (value: MarketCategoryId | "all") => void;
  onClear: () => void;
  onOrderChange: (value: CatalogOrder) => void;
  onWindowChange: (value: MarketWindow) => void;
}) {
  return (
    <>
      <nav aria-label="Tool categories" className="mt-4 overflow-x-auto pb-1">
        <ToggleGroup
          type="single"
          variant="outline"
          value={categoryId}
          onValueChange={(value) => {
            if (value !== "")
              onCategoryChange(value as MarketCategoryId | "all");
          }}
          className="min-w-max bg-card"
        >
          <ToggleGroupItem value="all" className="min-h-11">
            All tools
          </ToggleGroupItem>
          {marketCategories.map((category) => (
            <ToggleGroupItem
              key={category.id}
              value={category.id}
              className="min-h-11"
            >
              {category.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </nav>
      <div className="mt-3 sm:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" className="w-full justify-between">
              Filter and sort
              <SlidersHorizontalIcon aria-hidden="true" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="max-h-[85vh] overflow-y-auto rounded-t-lg"
          >
            <SheetHeader>
              <SheetTitle>Filter and sort tools</SheetTitle>
              <SheetDescription>
                Refine availability, evidence window, and provider order.
              </SheetDescription>
            </SheetHeader>
            <CatalogFilters
              availability={availability}
              order={order}
              window={window}
              onAvailabilityChange={onAvailabilityChange}
              onOrderChange={onOrderChange}
              onWindowChange={onWindowChange}
              idSuffix="mobile"
              className="grid gap-4 px-4"
            />
            <SheetFooter>
              <SheetClose asChild>
                <Button>View tools</Button>
              </SheetClose>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>
      <CatalogFilters
        availability={availability}
        order={order}
        window={window}
        onAvailabilityChange={onAvailabilityChange}
        onOrderChange={onOrderChange}
        onWindowChange={onWindowChange}
        className="mt-3 hidden gap-3 rounded-lg border bg-muted/20 p-3 sm:grid sm:grid-cols-3 sm:items-end"
      />
      {hasFilters ? (
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {matchedCount.toLocaleString()} matched before local category and
            order
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11"
            onClick={onClear}
          >
            Clear filters
          </Button>
        </div>
      ) : null}
    </>
  );
}

function MarketHero({
  catalogAvailable,
  matchedCount,
  query,
  onSearch,
}: {
  catalogAvailable: boolean;
  matchedCount: number;
  query: string | undefined;
  onSearch: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="border-b bg-card/40">
      <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-6 md:px-6">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="grid gap-2">
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Marketplace
            </p>
            <h1 className="max-w-3xl font-display text-3xl font-medium leading-[1.08] tracking-[-0.035em] sm:text-4xl">
              Find the right tool for the job.
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Search APIs and services. Compare exact providers on price,
              readiness, ratings, completed calls and measured latency.
            </p>
          </div>
          <p className="font-mono text-xs tabular-nums text-muted-foreground">
            {!catalogAvailable
              ? "Catalogue unavailable"
              : `${matchedCount.toLocaleString()} matching Operations`}
          </p>
        </div>

        <form className="min-w-0 max-w-3xl" onSubmit={onSearch} role="search">
          <FieldLabel className="sr-only" htmlFor="market-tool-search">
            Search tools
          </FieldLabel>
          <InputGroup className="h-12 bg-background shadow-soft transition-[border-color,box-shadow] duration-base ease-standard focus-within:shadow-float">
            <InputGroupAddon align="inline-start">
              <SearchIcon aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
              key={query ?? ""}
              id="market-tool-search"
              name="query"
              defaultValue={query ?? ""}
              maxLength={200}
              placeholder="Search tools, capabilities, or suppliers"
              className="ps-1 text-base"
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton type="submit" variant="default" size="sm">
                Search
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </form>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>Browse without an account</span>
          <span aria-hidden="true">·</span>
          <span>Inspect terms before calling</span>
          <Link
            to="/for-agents"
            className="inline-flex min-h-11 items-center font-semibold text-foreground underline-offset-4 hover:underline"
          >
            Set up an agent
            <ArrowRightIcon
              aria-hidden="true"
              className="ml-1 inline size-3.5"
            />
          </Link>
        </div>
      </div>
    </section>
  );
}

function MarketParticipation() {
  return (
    <section className="border-t bg-card/40">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between md:px-6">
        <div>
          <h2 className="font-semibold">Bring an agent or supply a tool.</h2>
          <p className="text-sm text-muted-foreground">
            Connect an agent to call tools, or list an API for agents to find.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild className="min-h-11">
            <Link to="/for-agents">Set up an agent</Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/for-providers">List a tool</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function EvidenceWindow({
  window,
  onChange,
  idSuffix = "desktop",
}: {
  window: MarketWindow;
  onChange: (window: MarketWindow) => void;
  idSuffix?: string;
}) {
  const labelId = `market-window-label-${idSuffix}`;
  return (
    <Field>
      <FieldLabel id={labelId}>Evidence window</FieldLabel>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={window}
        aria-labelledby={labelId}
        onValueChange={(value) => {
          if (value !== "") onChange(value as MarketWindow);
        }}
        className="w-fit bg-card"
      >
        {(["24h", "7d", "30d"] as const).map((value) => (
          <ToggleGroupItem
            key={value}
            value={value}
            aria-label={`Use evidence from the last ${value}`}
            className="min-h-11 min-w-11"
          >
            {value}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Field>
  );
}

function CatalogFilters({
  availability,
  order,
  window,
  onAvailabilityChange,
  onOrderChange,
  onWindowChange,
  idSuffix = "desktop",
  className,
}: {
  availability: MarketPageSearch["availability"];
  order: CatalogOrder;
  window: MarketWindow;
  onAvailabilityChange: (value: string) => void;
  onOrderChange: (value: CatalogOrder) => void;
  onWindowChange: (window: MarketWindow) => void;
  idSuffix?: string;
  className: string;
}) {
  return (
    <div className={className}>
      <Field>
        <FieldLabel htmlFor={`market-availability-${idSuffix}`}>
          Availability
        </FieldLabel>
        <Select
          value={availability ?? "all"}
          onValueChange={onAvailabilityChange}
        >
          <SelectTrigger
            id={`market-availability-${idSuffix}`}
            className="min-h-11 bg-card"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">All availability</SelectItem>
              <SelectItem value="routeable">Ready now</SelectItem>
              <SelectItem value="integrated">Integration available</SelectItem>
              <SelectItem value="unavailable">Unavailable</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor={`market-order-${idSuffix}`}>
          Order providers
        </FieldLabel>
        <Select
          value={order}
          onValueChange={(value) => onOrderChange(value as CatalogOrder)}
        >
          <SelectTrigger
            id={`market-order-${idSuffix}`}
            className="min-h-11 bg-card"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="recommended">Ready first</SelectItem>
              <SelectItem value="popular">Most used</SelectItem>
              <SelectItem value="rated">Highest rated</SelectItem>
              <SelectItem value="fastest">Fastest measured</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <EvidenceWindow
        window={window}
        onChange={onWindowChange}
        idSuffix={idSuffix}
      />
    </div>
  );
}

function compareOperations(
  left: OperationCardViewModel,
  right: OperationCardViewModel,
  order: CatalogOrder,
): number {
  if (order === "popular")
    return (
      right.popularity.completedInvocations -
        left.popularity.completedInvocations ||
      readinessRank(left) - readinessRank(right)
    );
  if (order === "rated") {
    const leftRating = left.rating.kind === "rated" ? left.rating.average : -1;
    const rightRating =
      right.rating.kind === "rated" ? right.rating.average : -1;
    return (
      rightRating - leftRating || readinessRank(left) - readinessRank(right)
    );
  }
  if (order === "fastest") {
    const leftLatency =
      left.latency.kind === "measured"
        ? left.latency.medianMs
        : Number.MAX_VALUE;
    const rightLatency =
      right.latency.kind === "measured"
        ? right.latency.medianMs
        : Number.MAX_VALUE;
    return (
      leftLatency - rightLatency || readinessRank(left) - readinessRank(right)
    );
  }
  return readinessRank(left) - readinessRank(right);
}

function readinessRank(operation: OperationCardViewModel): number {
  if (operation.readiness === "Routeable") return 0;
  if (operation.readiness === "Integrated") return 1;
  return 2;
}
