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
  registry: {
    kind: "ok",
    generation: "registry-test",
    coverage: {
      entries: 5100,
      completedAt: Date.parse(generatedAt),
    },
    page: [
      {
        documentId: "registry:exa",
        sourceUrl: "https://agentic.market/services/api-exa-ai",
        providerUrl: "https://exa.ai",
        endpointUrl: "https://api.exa.ai/search",
        routeIdentity: "POST https://api.exa.ai/search",
        name: "Exa search",
        summary: "Search the web and return structured results.",
        provider: "Exa",
        category: "Search",
        method: "POST",
        tags: ["search"],
        networks: ["Base"],
        priceLabel: "USDC 0.007",
        exactPrice: {
          scheme: "exact",
          amount: "0.007",
          currency: "USDC",
          network: "eip155:8453",
        },
        access: "x402",
        credentialRequirements: ["x402_payment"],
        readiness: "source_declared_callable",
        lastObservedAt: generatedAt,
        inputSchemaJson: JSON.stringify({ type: "object", properties: {} }),
        exampleInvocation:
          "curl --request POST --url 'https://api.exa.ai/search'",
        sourceCalls30d: "3503",
        sourcePayers30d: "90",
        authority: "registry_metadata_only",
      },
    ],
    isDone: true,
    continueCursor: "",
  },
};

afterEach(cleanup);

describe("market page", () => {
  it("uses familiar marketplace search, access modes, and concrete registry details", () => {
    renderMarket({ window: "30d" });

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Find the right tool for the job.",
      }),
    ).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Search tools" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Search" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Pay per call" })).toBeTruthy();
    expect(screen.getByText("Exa search")).toBeTruthy();
    expect(screen.getAllByText("Pay per call").length).toBeGreaterThan(1);
    expect(
      screen.getByRole("link", { name: "Inspect Exa search" }),
    ).toBeTruthy();
    expect(screen.queryByText("Company registry search")).toBeNull();
    expect(
      screen.queryByRole("radio", { name: "Identity & compliance" }),
    ).toBeNull();
    expect(screen.getByRole("status").textContent).toContain(
      "Showing 1 of 5,100 APIs",
    );
    expect(screen.queryByText("Market activity")).toBeNull();
  });

  it("keeps admitted Operations separate with their comparison evidence", () => {
    renderMarket({ window: "30d", access: "agentic_economy" });

    expect(screen.queryByText("Exa search")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Use Company registry search" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 3, name: "Company Search" }),
    ).toBeTruthy();
    expect(screen.getByText(/2 providers/)).toBeTruthy();
    expect(screen.getByText("4.8 (24)")).toBeTruthy();
    expect(screen.getByText("842 completed calls")).toBeTruthy();
    expect(screen.getByText("420 ms")).toBeTruthy();
    expect(screen.getByText("API key connection")).toBeTruthy();
    expect(screen.getByText("Use capability")).toBeTruthy();
    expect(
      screen.getAllByRole("link", { name: "Set up an agent" }),
    ).toHaveLength(2);
  });

  it("announces an empty filtered registry truthfully", () => {
    if (projection.registry.kind !== "ok")
      throw new Error("expected registry fixture");
    renderMarket(
      { window: "30d", query: "not in the registry" },
      {
        ...projection,
        registry: {
          ...projection.registry,
          page: [],
          isDone: true,
          continueCursor: "",
        },
      },
    );

    expect(screen.getByRole("status").textContent).toBe(
      "No APIs match this search",
    );
    expect(screen.getByText("No public APIs match this search")).toBeTruthy();
  });

  it("offers an explicit recovery action when the registry is unavailable", () => {
    renderMarket(
      { window: "30d" },
      { ...projection, registry: { kind: "unavailable" } },
    );

    expect(
      screen.getByText("The public API registry is temporarily unavailable"),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.queryByText(/0 APIs/u)).toBeNull();
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
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/registry/$documentId",
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
