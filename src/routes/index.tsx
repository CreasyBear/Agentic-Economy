import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { ArrowRightIcon, SearchIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { z } from "zod";

import { AePublicShell } from "@/components/ae/layout/AePublicShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { HOME } from "@/content/brand-copy";
import { QUERY_MAX_LENGTH } from "@/lib/query-length";
import { formatUtcTimestamp } from "@/lib/ui/format-time";
import { readMarketRouteServer } from "@/modules/market/market.functions";
import type { OperationCardViewModel } from "@/modules/market/operation-view-model";

const HOME_CAPABILITY_LIMIT = 6;

const rootSearchSchema = z.object({
  q: z.string().optional().catch(undefined),
  project: z.string().max(200).optional().catch(undefined),
});

export type RootSearchParams = {
  q?: string | undefined;
  project?: string | undefined;
};

export type HomeCapabilityRead =
  | Readonly<{
      kind: "ok";
      operations: readonly OperationCardViewModel[];
      matchedCount: number;
    }>
  | Readonly<{ kind: "unavailable" }>;

/** Home never reads WorkTree. `project` remains accepted for old shared URLs. */
export async function loadRootRoute(
  _search: RootSearchParams,
): Promise<undefined> {
  return undefined;
}

export function validateRootSearch(
  search: Record<string, unknown>,
): RootSearchParams {
  const parsed = rootSearchSchema.parse(search);
  const query = parsed.q?.trim() ?? "";
  const project = parsed.project?.trim() ?? "";
  return {
    ...(query.length === 0 ? {} : { q: query }),
    ...(project.length === 0 ? {} : { project }),
  };
}

export async function readHomeCapabilities(): Promise<HomeCapabilityRead> {
  try {
    const projection = await readMarketRouteServer({
      data: {
        window: "30d",
        access: "agentic_economy",
        availability: "routeable",
      },
    });
    if (projection.catalog.kind !== "ok") {
      return projection.catalog.kind === "unavailable"
        ? { kind: "unavailable" }
        : { kind: "ok", operations: [], matchedCount: 0 };
    }

    return {
      kind: "ok",
      matchedCount: projection.catalog.matchedCount,
      operations: projection.catalog.items.slice(0, HOME_CAPABILITY_LIMIT),
    };
  } catch {
    return { kind: "unavailable" };
  }
}

export const Route = createFileRoute("/")({
  validateSearch: validateRootSearch,
  beforeLoad: ({ search }) => {
    if (search.q !== undefined) {
      throw redirect({
        to: "/market",
        search: { window: "30d", query: search.q },
      });
    }
  },
  loader: readHomeCapabilities,
  pendingComponent: HomePending,
  errorComponent: HomeError,
  head: () => ({
    meta: [
      { title: HOME.metaTitle },
      { name: "description", content: HOME.metaDescription },
    ],
  }),
  component: ServicesRoute,
});

function ServicesRoute() {
  const { q } = Route.useSearch();
  const read = Route.useLoaderData();
  const navigate = useNavigate();
  const [queryValue, setQueryValue] = useState(q ?? "");
  const [queryError, setQueryError] = useState<
    "required" | "too-long" | undefined
  >();
  const queryTooLong = queryValue.length > QUERY_MAX_LENGTH;

  function handleAskSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const rawQuery = String(formData.get("q") ?? "");
    setQueryValue(rawQuery);
    if (rawQuery.length > QUERY_MAX_LENGTH) {
      setQueryError("too-long");
      return;
    }
    const query = rawQuery.trim();
    if (query.length === 0) {
      setQueryError("required");
      return;
    }
    setQueryError(undefined);
    void navigate({ to: "/market", search: { window: "30d", query } });
  }

  return (
    <AePublicShell>
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-8 sm:px-6 sm:py-10">
        <section className="grid max-w-4xl gap-5">
          <div className="grid gap-3">
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Agent capability market
            </p>
            <h1 className="max-w-3xl font-display text-4xl font-medium leading-[1.08] tracking-[-0.035em] sm:text-5xl">
              {HOME.heroHeading}
            </h1>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground">
              {HOME.heroSubhead}
            </p>
          </div>

          <form
            key={q ?? ""}
            role="search"
            aria-label="Search the capability market"
            onSubmit={handleAskSubmit}
            className="grid gap-2"
          >
            <FieldLabel htmlFor="service-search" className="sr-only">
              Search capabilities
            </FieldLabel>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="relative rounded-md transition-[box-shadow] duration-base ease-standard focus-within:shadow-float">
                <SearchIcon
                  aria-hidden="true"
                  className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id="service-search"
                  name="q"
                  type="search"
                  value={queryValue}
                  required
                  placeholder="Search APIs, capabilities, or providers"
                  autoComplete="off"
                  aria-describedby="service-search-hint service-search-count"
                  aria-invalid={
                    queryError !== undefined || queryTooLong ? "true" : undefined
                  }
                  onChange={(event) => {
                    setQueryValue(event.currentTarget.value);
                    setQueryError(undefined);
                  }}
                  onInvalid={(event) => {
                    event.preventDefault();
                    setQueryError(
                      event.currentTarget.validity.valueMissing
                        ? "required"
                        : "too-long",
                    );
                  }}
                  className="h-12 bg-card pl-10 text-base shadow-soft"
                />
              </div>
              <Button type="submit" size="lg" className="min-h-12 px-6">
                Search capabilities
              </Button>
            </div>
            <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
              <p
                id="service-search-hint"
                aria-live="polite"
                aria-atomic="true"
              >
                {queryError === "required"
                  ? "Enter an API, capability, or provider."
                  : queryError === "too-long" || queryTooLong
                    ? `Keep your search to ${QUERY_MAX_LENGTH} characters or fewer.`
                    : "Browse and compare before you connect or call."}
              </p>
              <span
                id="service-search-count"
                className="shrink-0 font-mono tabular-nums"
                aria-live="polite"
              >
                {queryValue.length}/{QUERY_MAX_LENGTH}
              </span>
            </div>
          </form>

          <nav
            aria-label="Popular searches"
            className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"
          >
            <span className="text-muted-foreground">Popular:</span>
            {HOME.exampleAsks.map((query) => (
              <Link
                key={query}
                to="/market"
                search={{ window: "30d", query }}
                className="inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline"
              >
                {query}
              </Link>
            ))}
          </nav>
        </section>

        <HomeCapabilityResults read={read} />
      </div>
    </AePublicShell>
  );
}

export function HomeCapabilityResults({
  read,
}: Readonly<{ read: HomeCapabilityRead }>) {
  return (
    <section aria-labelledby="home-capabilities" className="grid gap-4">
      <div className="flex flex-col gap-2 border-b pb-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-1">
          <h2 id="home-capabilities" className="text-2xl font-semibold tracking-tight">
            Capabilities ready to use
          </h2>
          <p className="text-sm text-muted-foreground">
            Current Agentic Economy capabilities with exact access and price facts.
          </p>
        </div>
        <Button asChild variant="outline" className="min-h-11 self-start sm:self-auto">
          <Link
            to="/market"
            search={{ window: "30d", access: "agentic_economy" }}
          >
            Discover all capabilities
            <ArrowRightIcon aria-hidden="true" />
          </Link>
        </Button>
      </div>

      {read.kind === "unavailable" ? (
        <Card className="p-5 shadow-none" role="status">
          <h3 className="font-semibold">Capabilities are temporarily unavailable</h3>
          <p className="text-sm text-muted-foreground">
            Open Discover to search the full registry, or try again shortly.
          </p>
        </Card>
      ) : read.operations.length === 0 ? (
        <Card className="p-5 shadow-none" role="status">
          <h3 className="font-semibold">No capabilities are ready right now</h3>
          <p className="text-sm text-muted-foreground">
            Discover the wider registry to inspect APIs that require setup.
          </p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <p className="border-b bg-muted/25 px-4 py-2 text-xs text-muted-foreground sm:px-5">
            Showing {read.operations.length.toLocaleString()} of {read.matchedCount.toLocaleString()} ready capabilities
          </p>
          <ItemGroup>
            {read.operations.map((operation) => (
              <HomeCapabilityRow
                key={operation.operationRef}
                operation={operation}
              />
            ))}
          </ItemGroup>
        </div>
      )}
    </section>
  );
}

function HomeCapabilityRow({
  operation,
}: Readonly<{ operation: OperationCardViewModel }>) {
  return (
    <li className="border-b last:border-b-0">
      <Item
        size="sm"
        className="rounded-none px-4 py-4 hover:bg-muted/35 sm:px-5 lg:flex-nowrap"
      >
        <ItemContent className="min-w-0 basis-full lg:basis-auto">
          <ItemTitle className="max-w-full gap-2">
            <h3 className="min-w-0 truncate text-sm font-medium">
              <Link
                to="/operations/$operationRef"
                params={{ operationRef: operation.operationRef }}
                className="underline-offset-4 hover:underline"
              >
              {operation.title}
              </Link>
            </h3>
            <Badge variant="success">Ready now</Badge>
          </ItemTitle>
          <p className="text-xs font-medium text-muted-foreground">
            {operation.supplierName}
          </p>
          <ItemDescription className="max-w-2xl text-pretty">
            {operation.summary}
          </ItemDescription>
        </ItemContent>

        <dl className="grid w-full grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 lg:w-auto lg:min-w-[31rem]">
          <HomeFact label="Total price" value={operation.price} mono />
          <HomeFact label="Authentication" value={operation.authentication} />
          <HomeFact
            label="Last verified"
            value={
              operation.lastVerifiedAt === undefined
                ? "Not reported"
                : `${formatUtcTimestamp(operation.lastVerifiedAt)} UTC`
            }
          />
          <HomeFact label="Call" value={operation.callLabel} />
        </dl>

        <ItemActions className="ml-auto w-full justify-end lg:w-auto">
          <Button asChild size="sm" className="min-h-11">
            <Link
              to="/operations/$operationRef"
              params={{ operationRef: operation.operationRef }}
              aria-label={`Use ${operation.title}`}
            >
              Use capability
              <ArrowRightIcon aria-hidden="true" />
            </Link>
          </Button>
        </ItemActions>
      </Item>
    </li>
  );
}

function HomeFact({
  label,
  value,
  mono = false,
}: Readonly<{ label: string; value: string; mono?: boolean }>) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={`${mono ? "font-mono" : ""} mt-0.5 text-xs font-medium tabular-nums`}
      >
        {value}
      </dd>
    </div>
  );
}

function HomePending() {
  return (
    <AePublicShell>
      <section
        className="mx-auto grid min-h-[50vh] w-full max-w-6xl content-center px-4 py-12 sm:px-6"
        aria-busy="true"
        aria-live="polite"
      >
        <p role="status" className="text-muted-foreground">
          Loading current capabilities…
        </p>
      </section>
    </AePublicShell>
  );
}

function HomeError() {
  return (
    <AePublicShell>
      <section role="alert" className="mx-auto grid min-h-[50vh] w-full max-w-3xl content-center gap-3 px-4 py-12 sm:px-6">
        <h1 className="text-2xl font-semibold">Unable to load capabilities</h1>
        <p className="text-muted-foreground">
          Check your connection and try again. No capability was called.
        </p>
        <Button asChild className="min-h-11 justify-self-start">
          <Link to="/">Try again</Link>
        </Button>
      </section>
    </AePublicShell>
  );
}
