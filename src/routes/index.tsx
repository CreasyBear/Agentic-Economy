import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ArrowRightIcon, SearchIcon } from "lucide-react";

import { AGENT_DOOR, BUSINESS_DOOR, HOME } from "@/content/brand-copy";
import { AePublicShell } from "@/components/ae/layout/AePublicShell";
import { AeCopyCommand } from "@/components/ae/data/AeCopyCommand";
import {
  ServicesError,
  ServicesLoading,
} from "@/components/ae/home/HomeRouteStates";
import { QUERY_MAX_LENGTH } from "@/lib/query-length";
import { marketCategories } from "@/modules/market/listing-evidence";

const rootSearchSchema = z.object({
  q: z.string().optional().catch(undefined),
  project: z.string().max(200).optional().catch(undefined),
});

export type RootSearchParams = {
  q?: string | undefined;
  project?: string | undefined;
};

/** Home never reads WorkTree. `project` is accepted so old `/?project=` URLs do not 400. */
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
  loader: () => loadRootRoute({}),
  pendingComponent: ServicesLoading,
  errorComponent: ServicesError,
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
      <div className="mx-auto grid w-full max-w-[1080px] gap-10 px-4 py-10 sm:px-6 sm:py-14">
        <section className="grid gap-7 border-b pb-10 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
          <div className="grid gap-5">
            <div className="grid max-w-3xl gap-3">
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Agent tool marketplace
              </p>
              <h1 className="font-display text-4xl font-medium leading-[1.08] tracking-[-0.035em] sm:text-5xl">
                {HOME.heroHeading}
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground">
                {HOME.heroSubhead}
              </p>
            </div>

            <form
              key={q ?? ""}
              role="search"
              aria-label="Search the tool market"
              onSubmit={handleAskSubmit}
              className="grid max-w-3xl gap-2"
            >
              <FieldLabel htmlFor="service-search" className="sr-only">
                Search tools
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
                    placeholder="Search tools, capabilities, or suppliers"
                    autoComplete="off"
                    aria-describedby="service-search-hint service-search-count"
                    aria-invalid={
                      queryError !== undefined || queryTooLong
                        ? "true"
                        : undefined
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
                  Search market
                </Button>
              </div>
              <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
                <p
                  id="service-search-hint"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {queryError === "required"
                    ? "Enter a tool or capability to search the market."
                    : queryError === "too-long" || queryTooLong
                      ? `Keep your search to ${QUERY_MAX_LENGTH} characters or fewer.`
                      : "Browse first. Connect only when you are ready to call."}
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
              aria-label="Example asks"
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

            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm font-medium">
              <Link
                to="/market"
                search={{ window: "30d" }}
                className="inline-flex min-h-11 items-center gap-1 underline-offset-4 hover:underline"
              >
                Browse all tools{" "}
                <ArrowRightIcon aria-hidden="true" className="size-3.5" />
              </Link>
              <Link
                to="/for-agents"
                className="inline-flex min-h-11 items-center gap-1 underline-offset-4 hover:underline"
              >
                How agent setup works
              </Link>
              <Link
                to="/for-providers"
                className="inline-flex min-h-11 items-center gap-1 underline-offset-4 hover:underline"
              >
                Become a supplier
              </Link>
            </div>
          </div>

          <aside
            aria-label="Agent setup"
            className="grid content-start gap-3 rounded-lg border bg-card p-4 shadow-soft"
          >
            <div className="grid gap-1">
              <p className="text-sm font-semibold">Give this to your agent</p>
              <p className="text-xs leading-5 text-muted-foreground">
                It can browse and inspect without an account. It must stop
                before a paid or consequential call.
              </p>
            </div>
            <AeCopyCommand
              compact
              label="agent setup instruction"
              code="Read this site’s /llms.txt and set up Agentic Economy. Search for a tool, inspect its price and inputs, then stop before any paid or consequential call."
              copyText="Read $ORIGIN/llms.txt and set up Agentic Economy. Search for a tool, inspect its price and inputs, then stop before any paid or consequential call."
            />
            <Button asChild variant="outline" size="sm">
              <Link to="/for-agents">Agent setup guide</Link>
            </Button>
          </aside>
        </section>

        <section aria-labelledby="home-categories" className="grid gap-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 id="home-categories" className="text-xl font-semibold">
                Browse by category
              </h2>
              <p className="text-sm text-muted-foreground">
                Start with a familiar area, then compare exact providers.
              </p>
            </div>
            <Link
              to="/market"
              search={{ window: "30d" }}
              className="hidden min-h-11 items-center text-sm font-medium underline-offset-4 hover:underline sm:inline-flex"
            >
              View catalogue
            </Link>
          </div>
          <div className="grid overflow-hidden rounded-lg border bg-card sm:grid-cols-2 lg:grid-cols-3">
            {marketCategories.slice(0, 6).map((category) => (
              <Link
                key={category.id}
                to="/market"
                search={{ window: "30d", query: category.label }}
                className="group relative grid min-h-28 gap-1 border-b p-4 transition-colors duration-base ease-standard last:border-b-0 hover:z-10 hover:bg-brand-muted/30 hover:shadow-market-cell-hover focus-visible:z-10 sm:border-r sm:[&:nth-child(even)]:border-r-0 lg:[&:nth-child(even)]:border-r lg:[&:nth-child(3n)]:border-r-0 lg:[&:nth-last-child(-n+3)]:border-b-0"
              >
                <h3 className="flex items-center justify-between gap-2 font-semibold transition-colors duration-fast group-hover:text-brand-strong">
                  {category.label}
                  <ArrowRightIcon
                    aria-hidden="true"
                    className="size-4 text-muted-foreground transition-[color,transform] duration-base ease-standard group-hover:translate-x-0.5 group-hover:text-brand-strong"
                  />
                </h3>
                <p className="text-sm leading-5 text-muted-foreground">
                  {category.description}
                </p>
              </Link>
            ))}
          </div>
        </section>

        <section
          aria-label="Market entry points"
          className="grid overflow-hidden rounded-lg border bg-card sm:grid-cols-2"
        >
          {[AGENT_DOOR, BUSINESS_DOOR].map((door, index) => (
            <div
              key={door.href}
              className={
                index === 0
                  ? "grid gap-2 p-5 sm:border-r"
                  : "grid gap-2 border-t p-5 sm:border-t-0"
              }
            >
              <h2 className="font-semibold">{door.heading}</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                {door.body}
              </p>
              <Link
                to={door.href}
                className="inline-flex min-h-11 items-center gap-1 justify-self-start text-sm font-semibold underline-offset-4 hover:underline"
              >
                {door.cta}
                <ArrowRightIcon aria-hidden="true" className="size-3.5" />
              </Link>
            </div>
          ))}
        </section>
      </div>
    </AePublicShell>
  );
}
