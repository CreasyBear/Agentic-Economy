/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { afterEach, describe, expect, it } from "vitest";
import "../../setup/jsdom-platform";

import { AeMarketPage } from "@/components/ae/market/AeMarketPage";
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
        readiness: "Integrated",
        readinessLabel: "Integration available",
        trustFact: "Connected, but not currently ready to run",
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
  it("shows the catalog as category shelves of capabilities", () => {
    renderMarket({ window: "30d" });

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "2 tools for agents",
      }),
    ).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Search tools" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "Pay per call" })).toBeNull();
    expect(screen.queryByText("Exa search")).toBeNull();
    expect(
      screen.getByRole("link", {
        name: "Company Search, 2 listed, from USD 0.18",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("tab", { name: "Identity & compliance 1" }),
    ).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "2 shown",
    );
    expect(screen.queryByText("Market activity")).toBeNull();
    expect(screen.getByRole("link", { name: "Connect your agent" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "List a tool" })).toBeTruthy();
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
    expect(screen.getByText("No tools match these filters")).toBeTruthy();
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
      screen.getByText("The tool catalog is temporarily unavailable"),
    ).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Catalogue unavailable");
    expect(screen.queryByText("No tools match these filters")).toBeNull();
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
      screen.getByRole("heading", { level: 1, name: "136 tools for agents" }),
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
    history: createMemoryHistory({ initialEntries: ["/market"] }),
  });

  render(
    <RouterContextProvider router={router}>
      <AeMarketPage projection={marketProjection} search={search} />
    </RouterContextProvider>,
  );
}
