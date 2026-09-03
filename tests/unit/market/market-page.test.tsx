/**
 * @vitest-environment jsdom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../setup/jsdom-platform";

import { AeMarketPage } from "@/components/ae/market/AeMarketPage";
import type { MarketComparison } from "@/components/ae/market/AeMarketComparisonView";
import type { OperationCardViewModel } from "@/modules/market/operation-view-model";
import type { MarketRouteProjection } from "@/modules/market/server";

const generatedAt = "2026-08-23T03:00:00.000Z";

const projection: MarketRouteProjection = {
  window: "30d",
  catalog: {
    kind: "ok",
    matchedCount: 2,
    pagination: { limit: 12, hasMore: false },
    items: [
      {
        operationRef: "operation:v1:listing",
        title: "Company registry search",
        summary:
          "Find current company records and return a structured extract.",
        supplierName: "Registry Works",
        supplierSlug: "registry-works",
        supplierInitials: "RW",
        capabilityId: "identity.company_search",
        capability: "Company Search",
        category: {
          id: "identity-compliance",
          label: "Identity & compliance",
          description: "Verification and compliance checks.",
        },
        price: "USD 0.25",
        authentication: "API key connection",
        lastVerifiedAt: Date.parse(generatedAt),
        callLabel: "Use capability",
        readiness: "Routeable",
        readinessLabel: "Ready now",
        trustFact: "Ready to run through Agentic Economy",
        rating: {
          kind: "rated",
          average: 4.8,
          count: 24,
          display: "4.8 (24)",
          definition: "Authenticated ratings.",
        },
        popularity: {
          kind: "observed",
          completedInvocations: 842,
          display: "842 completed calls",
          definition: "Completed calls in this period.",
        },
        latency: {
          kind: "measured",
          medianMs: 420,
          p95Ms: 910,
          sampleSize: 48,
          display: "420 ms",
          definition: "Median admitted-to-completed latency.",
        },
      },
      {
        operationRef: "operation:v1:listing-two",
        title: "Company data lookup",
        summary: "Look up a company and return normalized registration data.",
        supplierName: "Clear Ledger",
        supplierSlug: "clear-ledger",
        supplierInitials: "CL",
        capabilityId: "identity.company_search",
        capability: "Company Search",
        category: {
          id: "identity-compliance",
          label: "Identity & compliance",
          description: "Verification and compliance checks.",
        },
        price: "USD 0.18",
        authentication: "Bearer connection",
        lastVerifiedAt: Date.parse(generatedAt),
        callLabel: "Setup required",
        readiness: "SetupRequired",
        readinessLabel: "Setup required",
        trustFact: "Not callable until setup is completed",
        rating: {
          kind: "unrated",
          count: 0,
          display: "No ratings yet",
          definition: "No authenticated ratings in this period.",
        },
        popularity: {
          kind: "observed",
          completedInvocations: 96,
          display: "96 completed calls",
          definition: "Completed calls in this period.",
        },
        latency: {
          kind: "measured",
          medianMs: 680,
          p95Ms: 1200,
          sampleSize: 21,
          display: "680 ms",
          definition: "Median admitted-to-completed latency.",
        },
      },
    ],
  },
};

afterEach(cleanup);

describe("market page", () => {
  it("keeps the catalog workspace ahead of the editorial footer", () => {
    renderMarket({ window: "30d" });

    expect(document.querySelector("#operations")?.className).toContain("min-h-dvh");
  });

  it("shows the catalog as category shelves of capabilities", () => {
    renderMarket({ window: "30d" });

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "2 current Operations",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("searchbox", { name: "Search Operations" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Availability filter" }),
    ).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "Pay per call" })).toBeNull();
    expect(screen.queryByText("Exa search")).toBeNull();
    expect(
      screen.getByRole("link", {
        name: "Company Search, 2 listed, from USD 0.18",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("tab", {
        name: "Identity & compliance, 1 capability group shown on this page",
      }),
    ).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "2 shown",
    );
    expect(screen.queryByText("Market activity")).toBeNull();
    expect(screen.getByRole("link", { name: "Connect your agent" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Publish an Operation" })).toBeTruthy();
  });

  it("keeps admitted Operations separate once a capability is opened", () => {
    renderMarket({ window: "30d", capability: "identity.company_search" });

    expect(screen.queryByText("Exa search")).toBeNull();
    expect(
      screen.getByRole("heading", { level: 1, name: "Company Search" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Use Company registry search" }),
    ).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("2 shown");
    expect(screen.getByText("4.8 (24)")).toBeTruthy();
    expect(screen.getByText("842 completed calls")).toBeTruthy();
    expect(screen.getByText("420 ms")).toBeTruthy();
    expect(screen.getByText("API key connection")).toBeTruthy();
    expect(screen.getByText("Use capability")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Catalog" })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Filter rows…" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Sort by / })).toBeNull();
    expect(
      screen.getAllByRole("link", { name: "Use Company registry search" }),
    ).toHaveLength(1);
    const operationHref = screen.getByRole("link", {
      name: "Use Company registry search",
    }).getAttribute("href");
    expect(operationHref).not.toBeNull();
    expect(new URL(operationHref!, "https://agentic-economy.example").searchParams.get("from"))
      .toBe("/market?window=30d&capability=identity.company_search#operations");
    expect(
      within(screen.getByRole("table")).getAllByRole("row").slice(1).map(
        (row) => row.textContent,
      ),
    ).toEqual([
      expect.stringContaining("Company registry search"),
      expect.stringContaining("Company data lookup"),
    ]);
  });

  it("shares a bounded comparison selection across result tables in catalog order", async () => {
    const onCompareOperations = vi.fn();
    if (projection.catalog.kind !== "ok" || projection.catalog.items[0] === undefined) {
      throw new Error("expected catalog fixture items");
    }
    const baseOperation = projection.catalog.items[0];
    const items: OperationCardViewModel[] = Array.from({ length: 6 }, (_, index) => ({
      ...baseOperation,
      operationRef: `operation:v1:compare-${String(index + 1)}`,
      title: `Compare Operation ${String(index + 1)}`,
      supplierName: `Supplier ${String(index + 1)}`,
      supplierSlug: `supplier-${String(index + 1)}`,
      capabilityId: `compare.capability_${String(index + 1)}`,
      capability: `Compare capability ${String(index + 1)}`,
      ...(index === 5
        ? {
            readiness: "Unavailable" as const,
            readinessLabel: "Unavailable",
            trustFact: "Not currently available",
          }
        : {}),
    }));
    const comparisonProjection: MarketRouteProjection = {
      ...projection,
      catalog: {
        kind: "ok",
        matchedCount: items.length,
        pagination: { limit: 12, hasMore: false },
        items,
      },
    };

    renderMarket(
      { window: "30d", query: "compare" },
      comparisonProjection,
      onCompareOperations,
    );

    const checkboxes = items.map((item) => screen.getByRole<HTMLButtonElement>(
      "checkbox",
      { name: `Select ${item.title} by ${item.supplierName}` },
    ));
    expect(screen.queryByRole("checkbox", { name: /Select all/ })).toBeNull();
    expect(checkboxes[5]?.disabled).toBe(true);

    for (const index of [3, 0, 2, 1]) {
      const item = items[index]!;
      fireEvent.click(screen.getByRole("checkbox", {
        name: `Select ${item.title} by ${item.supplierName}`,
      }));
    }

    const tray = screen.getByRole("complementary", { name: "Operation comparison" });
    expect(within(tray).getByRole("status", { name: "4 of 4 selected" })).toBeTruthy();
    const firstSelected = screen.getByRole<HTMLButtonElement>("checkbox", {
      name: "Select Compare Operation 1 by Supplier 1",
    });
    const fifthChoice = screen.getByRole<HTMLButtonElement>("checkbox", {
      name: "Select Compare Operation 5 by Supplier 5",
    });
    expect(fifthChoice.disabled).toBe(true);
    expect(firstSelected.disabled).toBe(false);
    expect(firstSelected.closest("tr")?.getAttribute("data-state")).toBe("selected");

    fireEvent.click(within(tray).getByRole("button", { name: "Compare 4" }));
    expect(onCompareOperations).toHaveBeenCalledWith(
      items.slice(0, 4).map((item) => item.operationRef),
    );

    fireEvent.click(within(tray).getByRole("button", {
      name: "Remove Compare Operation 2 by Supplier 2 from comparison",
    }));
    await waitFor(() => expect(screen.getByRole<HTMLButtonElement>("checkbox", {
      name: "Select Compare Operation 5 by Supplier 5",
    }).disabled).toBe(false));
    expect(screen.getByRole("checkbox", {
      name: "Select Compare Operation 2 by Supplier 2",
    }).getAttribute("aria-checked")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    await waitFor(() => {
      expect(screen.queryByRole("complementary", { name: "Operation comparison" })).toBeNull();
      expect(document.activeElement).toBe(screen.getByRole("link", { name: "Catalog" }));
    });
  });

  it("prunes selected Operations before a changed result page renders", () => {
    const onCompareOperations = vi.fn();
    const rendered = renderMarket(
      { window: "30d", capability: "identity.company_search" },
      projection,
      onCompareOperations,
    );
    fireEvent.click(screen.getByRole("checkbox", {
      name: "Select Company registry search by Registry Works",
    }));
    expect(screen.getByRole("complementary", { name: "Operation comparison" })).toBeTruthy();

    const secondOnly: MarketRouteProjection = {
      ...projection,
      catalog: projection.catalog.kind === "ok"
        ? {
            ...projection.catalog,
            matchedCount: 1,
            items: [projection.catalog.items[1]!],
          }
        : projection.catalog,
    };
    rendered.rerenderMarket(
      { window: "30d", query: "different page" },
      secondOnly,
      onCompareOperations,
    );

    expect(screen.queryByRole("complementary", { name: "Operation comparison" })).toBeNull();
    expect(screen.getByRole("checkbox", {
      name: "Select Company data lookup by Clear Ledger",
    }).getAttribute("aria-checked")).toBe("false");
  });

  it("clears draft comparison selection when the catalog context changes", async () => {
    const onCompareOperations = vi.fn();
    const rendered = renderMarket(
      { window: "30d", query: "company" },
      projection,
      onCompareOperations,
    );
    fireEvent.click(screen.getByRole("checkbox", {
      name: "Select Company registry search by Registry Works",
    }));

    rendered.rerenderMarket(
      { window: "30d", query: "registry" },
      projection,
      onCompareOperations,
    );

    await waitFor(() => expect(screen.queryByRole("complementary", {
      name: "Operation comparison",
    })).toBeNull());
  });

  it("edits or closes a recovered comparison without dropping its catalog context", async () => {
    const firstRef = `operation:v1:${"a".repeat(64)}`;
    const secondRef = `operation:v1:${"b".repeat(64)}`;
    const comparisonProjection: MarketRouteProjection = projection.catalog.kind === "ok"
      ? {
          ...projection,
          catalog: {
            ...projection.catalog,
            items: [
              { ...projection.catalog.items[0]!, operationRef: firstRef },
              { ...projection.catalog.items[1]!, operationRef: secondRef },
            ],
          },
        }
      : projection;
    const unavailableComparison: MarketComparison = {
      kind: "unavailable",
      schemaVersion: "registry-operations:v2",
      reason: "operation_unavailable",
    };
    const search = {
      window: "30d" as const,
      query: "company",
      availability: "routeable" as const,
      category: "identity-compliance" as const,
      cursor: "page-2",
      compare: `${firstRef},${secondRef}`,
    };
    const rendered = renderMarket(
      search,
      comparisonProjection,
      vi.fn(),
      unavailableComparison,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit selection" }));
    await waitFor(() => expect(screen.getByRole("link", { name: "Catalog" })).toBe(document.activeElement));
    expect(rendered.state.location.search).toMatchObject({
      window: "30d",
      query: "company",
      availability: "routeable",
      category: "identity-compliance",
      cursor: "page-2",
      compare: `${firstRef},${secondRef}`,
    });
    expect(screen.getByRole("checkbox", {
      name: "Select Company registry search by Registry Works",
    }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("checkbox", {
      name: "Select Company data lookup by Clear Ledger",
    }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("complementary", {
      name: "Operation comparison",
    })).toBeTruthy();

    cleanup();
    const closed = renderMarket(
      search,
      comparisonProjection,
      vi.fn(),
      unavailableComparison,
    );
    fireEvent.click(screen.getByRole("button", { name: "Back to results" }));
    await waitFor(() => expect(closed.state.location.search).not.toHaveProperty("compare"));
    expect(closed.state.location.search).toMatchObject({ query: "company", cursor: "page-2" });
    expect(screen.getByRole("link", { name: "Catalog" })).toBe(document.activeElement);
  });

  it("submits search as a native GET while preserving only compatible filters", () => {
    renderMarket({
      window: "30d",
      query: "registry",
      availability: "routeable",
      cursor: "page-2",
      capability: "identity.company_search",
      category: "identity-compliance",
    });

    const form = screen.getByRole("search") as HTMLFormElement;
    const formData = Object.fromEntries(new FormData(form));

    expect(form.method).toBe("get");
    expect(new URL(form.action).pathname).toBe("/market");
    expect(formData).toEqual({
      window: "30d",
      availability: "routeable",
      query: "registry",
    });
    expect(form.querySelector('[name="cursor"]')).toBeNull();
    expect(form.querySelector('[name="capability"]')).toBeNull();
    expect(form.querySelector('[name="category"]')).toBeNull();
    expect(form.querySelector('[data-slot="input-group"]')).toBeTruthy();
    expect(form.querySelector('[data-slot="input-group-addon"]')).toBeTruthy();
    expect(screen.getByRole("button", { name: "Search" })).toBeTruthy();
  });

  it("uses the availability Select to preserve compatible URL state and clear the cursor", async () => {
    const router = renderMarket({
      window: "30d",
      query: "registry",
      cursor: "page-2",
      capability: "identity.company_search",
      category: "identity-compliance",
    });

    fireEvent.click(
      screen.getByRole("combobox", { name: "Availability filter" }),
    );
    fireEvent.click(await screen.findByRole("option", { name: "Ready now" }));

    await waitFor(() => {
      const params = new URLSearchParams(router.history.location.search);
      expect(params.get("window")).toBe("30d");
      expect(params.get("query")).toBe("registry");
      expect(params.get("capability")).toBe("identity.company_search");
      expect(params.get("category")).toBe("identity-compliance");
      expect(params.get("availability")).toBe("routeable");
      expect(params.has("cursor")).toBe(false);
    });
  });

  it("renders only authoritative filters as removable chips", () => {
    renderMarket({
      window: "30d",
      query: "registry",
      availability: "setup_required",
      cursor: "page-2",
      capability: "identity.company_search",
      category: "identity-compliance",
    });

    const removeQuery = screen.getByRole("link", {
      name: "Remove search filter “registry”",
    });
    const removeAvailability = screen.getByRole("link", {
      name: "Remove availability filter “Setup required”",
    });
    const clearAll = screen.getByRole("link", { name: "Clear all filters" });
    const appliedFilters = screen.getByLabelText("Applied filters, 2 active");

    expect(searchParams(removeQuery).get("query")).toBeNull();
    expect(searchParams(removeQuery).get("availability")).toBe("setup_required");
    expect(searchParams(removeQuery).get("capability")).toBe(
      "identity.company_search",
    );
    expect(searchParams(removeQuery).get("category")).toBe(
      "identity-compliance",
    );
    expect(searchParams(removeAvailability).get("query")).toBe("registry");
    expect(searchParams(removeAvailability).get("availability")).toBeNull();
    expect(searchParams(removeAvailability).get("capability")).toBe(
      "identity.company_search",
    );
    expect(searchParams(removeAvailability).get("category")).toBe(
      "identity-compliance",
    );
    expect(
      within(appliedFilters).queryByRole("link", {
        name: /Remove capability filter/,
      }),
    ).toBeNull();
    expect(within(appliedFilters).queryByText(/identity\.company_search/)).toBeNull();
    expect(searchParams(clearAll).toString()).toBe("window=30d");
    expect(searchParams(removeQuery).has("cursor")).toBe(false);
    expect(removeQuery.getAttribute("data-slot")).toBe("badge");
  });

  it("shows Clear all for one true filter and excludes a capability drill-down", () => {
    renderMarket({
      window: "30d",
      query: "registry",
      capability: "identity.company_search",
    });

    const appliedFilters = screen.getByLabelText("Applied filters, 1 active");
    expect(
      within(appliedFilters).getByRole("link", { name: "Clear all filters" }),
    ).toBeTruthy();
    expect(within(appliedFilters).queryByText(/identity\.company_search/)).toBeNull();
  });

  it("restores a deep-linked category and reports loaded-page capability counts", () => {
    renderMarket({ window: "30d", category: "identity-compliance" });

    const selected = screen.getByRole("tab", {
      name: "Identity & compliance, 1 capability group shown on this page",
    });
    expect(selected.getAttribute("aria-selected")).toBe("true");
    expect(
      screen.getByRole("tab", {
        name: "Finance, 0 capability groups shown on this page",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", {
        name: "Company Search, 2 listed, from USD 0.18",
      }),
    ).toBeTruthy();
  });

  it("writes category tab changes to the URL and clears cursor and capability", async () => {
    const router = renderMarket({
      window: "30d",
      availability: "routeable",
      category: "identity-compliance",
      cursor: "page-2",
    });

    const financeTab = screen.getByRole("tab", {
      name: "Finance, 0 capability groups shown on this page",
    });
    fireEvent.mouseDown(financeTab, { button: 0, ctrlKey: false });
    fireEvent.click(financeTab);

    await waitFor(() => {
      const params = new URLSearchParams(router.history.location.search);
      expect(params.get("window")).toBe("30d");
      expect(params.get("availability")).toBe("routeable");
      expect(params.get("category")).toBe("finance");
      expect(params.has("cursor")).toBe(false);
      expect(params.has("capability")).toBe(false);
    });
  });

  it("announces an empty Operation search truthfully", () => {
    renderMarket(
      { window: "30d", query: "not in the catalogue" },
      {
        ...projection,
        catalog: { kind: "no_candidates", matchedCount: 0 },
      },
    );

    expect(screen.getByRole("status").textContent).toBe("0 shown");
    expect(screen.getByText("No Operations match these filters")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Clear filters" })).toBeTruthy();
  });

  it("distinguishes catalogue unavailability from an empty search", () => {
    renderMarket(
      { window: "30d" },
      {
        ...projection,
        catalog: { kind: "unavailable", reason: "source_unavailable" },
      },
    );

    expect(
      screen.getByText("The Operation catalog is temporarily unavailable"),
    ).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Catalogue unavailable");
    expect(screen.queryByText("No Operations match these filters")).toBeNull();
    expect(screen.getByRole("link", { name: "Try again" })).toBeTruthy();
  });

  it("states the page size against the catalog total and paginates browse", () => {
    const firstItem =
      projection.catalog.kind === "ok" ? projection.catalog.items[0] : undefined;
    if (firstItem === undefined) {
      throw new Error("expected catalog fixture items");
    }
    renderMarket(
      { window: "30d" },
      {
        ...projection,
        catalog: {
          kind: "ok",
          matchedCount: 136,
          pagination: { limit: 12, hasMore: true, nextCursor: "page-2" },
          items: [firstItem],
        },
      },
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "136 current Operations" }),
    ).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("1 of 136");
    expect(screen.getByRole("link", { name: "Next 12" }).getAttribute("href")).toContain(
      "cursor=page-2",
    );
  });
});

function renderMarket(
  search: Parameters<typeof AeMarketPage>[0]["search"],
  marketProjection = projection,
  onCompareOperations?: (operationRefs: readonly string[]) => void,
  comparison?: MarketComparison,
) {
  const rootRoute = createRootRoute();
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: "/market" }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/operations/$operationRef",
    }),
    createRoute({ getParentRoute: () => rootRoute, path: "/for-agents" }),
    createRoute({ getParentRoute: () => rootRoute, path: "/for-providers" }),
    createRoute({ getParentRoute: () => rootRoute, path: "/" }),
  ]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [marketUrl(search)] }),
  });

  const market = (
    nextSearch: Parameters<typeof AeMarketPage>[0]["search"],
    nextProjection: MarketRouteProjection,
    nextOnCompareOperations = onCompareOperations,
  ) => (
    <RouterContextProvider router={router}>
      <AeMarketPage
        projection={nextProjection}
        search={nextSearch}
        {...(nextOnCompareOperations === undefined
          ? {}
          : { onCompareOperations: nextOnCompareOperations })}
        {...(comparison === undefined ? {} : { comparison })}
      />
    </RouterContextProvider>
  );
  const rendered = render(market(search, marketProjection));

  return Object.assign(router, {
    rerenderMarket: (
      nextSearch: Parameters<typeof AeMarketPage>[0]["search"],
      nextProjection: MarketRouteProjection,
      nextOnCompareOperations = onCompareOperations,
    ) => rendered.rerender(market(nextSearch, nextProjection, nextOnCompareOperations)),
  });
}

function marketUrl(search: Parameters<typeof AeMarketPage>[0]["search"]) {
  const params = new URLSearchParams({ window: search.window });
  if (search.query !== undefined) params.set("query", search.query);
  if (search.availability !== undefined) {
    params.set("availability", search.availability);
  }
  if (search.category !== undefined) params.set("category", search.category);
  if (search.cursor !== undefined) params.set("cursor", search.cursor);
  if (search.capability !== undefined) {
    params.set("capability", search.capability);
  }
  if (search.compare !== undefined) params.set("compare", search.compare);
  return `/market?${params.toString()}`;
}

function searchParams(element: HTMLElement) {
  const href = element.getAttribute("href");
  if (href === null) throw new Error("expected link href");
  return new URL(href, "https://agentic-economy.example").searchParams;
}
