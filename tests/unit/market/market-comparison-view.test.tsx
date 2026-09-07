/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../setup/jsdom-platform";

import {
  AeMarketComparisonView,
  type MarketComparison,
} from "@/components/ae/market/AeMarketComparisonView";
import {
  buildMarketReturnContext,
  type MarketReturnContext,
} from "@/components/ae/market/market-return-context";
import { toolChoiceCompareOutputSchema } from "@/modules/registry/tool-choice-contracts";

const firstRef = `operation:v1:${"a".repeat(64)}`;
const secondRef = `operation:v1:${"b".repeat(64)}`;

const comparison = toolChoiceCompareOutputSchema.parse({
  kind: "ok",
  schemaVersion: "registry-tools:v2",
  tools: [
    tool(firstRef, "Registry search", "Registry Works", "USD 0.25", "operational"),
    tool(secondRef, "Company lookup", "Clear Ledger", "Price confirmed at inspection", "unverified"),
  ],
});

afterEach(cleanup);

describe("market comparison view", () => {
  it("keeps the comparison workspace ahead of the editorial footer", () => {
    const { container } = renderComparison(comparison);

    expect(container.firstElementChild?.className).toContain("min-h-dvh");
    expect(container.firstElementChild?.className).toContain("content-start");
  });

  it("renders the compact canonical comparison with Provider-qualified describe links", () => {
    const returnTo = buildMarketReturnContext({
      window: "30d",
      query: "registry",
      compare: `${firstRef},${secondRef}`,
    });
    renderComparison(comparison, { returnTo });

    const heading = screen.getByRole("heading", { level: 1, name: "Compare Tools" });
    expect(document.activeElement).toBe(heading);
    const table = screen.getByRole("table");
    expect(table.closest('[data-slot="table-container"]')?.className).toContain("overflow-x-auto");
    expect(table.closest('[data-slot="card"]')?.className).toContain("min-w-0");
    expect(within(table).getByText("Registry Works")).toBeTruthy();
    expect(within(table).getByText("Clear Ledger")).toBeTruthy();
    expect(within(table).getByText("USD 0.25")).toBeTruthy();
    expect(within(table).getByText("Price confirmed at inspection")).toBeTruthy();
    expect(within(table).getByText("operational")).toBeTruthy();
    expect(within(table).getByText("unverified")).toBeTruthy();
    const describeHref = screen.getByRole("link", {
      name: "Describe Registry search by Registry Works",
    }).getAttribute("href");
    expect(describeHref).not.toBeNull();
    const describeUrl = new URL(describeHref!, "https://agentic-economy.example");
    expect(describeUrl.pathname).toContain(encodeURIComponent(firstRef));
    expect(describeUrl.searchParams.get("from")).toBe(returnTo);
  });

  it("offers retry, edit, and back recovery for an unavailable comparison", () => {
    const onRetry = vi.fn();
    const onEditSelection = vi.fn();
    const onBack = vi.fn();
    renderComparison({
      kind: "unavailable",
      schemaVersion: "registry-tools:v2",
      reason: "tool_unavailable",
    }, { onRetry, onEditSelection, onBack });

    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Comparison unavailable" }));
    expect(screen.getByRole("alert").textContent).toContain("Readiness changed after selection");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit selection" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to results" }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onEditSelection).toHaveBeenCalledOnce();
    expect(onBack).toHaveBeenCalledOnce();
  });
});

function tool(
  toolRef: string,
  title: string,
  providerName: string,
  priceLabel: string,
  healthStatus: "operational" | "degraded" | "unverified",
) {
  return {
    toolRef,
    capabilityId: "identity.company_search",
    title,
    description: "Look up a company.",
    provider: { name: providerName, slug: providerName.toLowerCase().replaceAll(" ", "-") },
    priceLabel,
    healthStatus,
  };
}

function renderComparison(
  value: MarketComparison,
  callbacks: {
    onEditSelection?: () => void;
    onBack?: () => void;
    onRetry?: () => void;
    returnTo?: MarketReturnContext;
  } = {},
) {
  const rootRoute = createRootRoute();
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: "/market" }),
    createRoute({ getParentRoute: () => rootRoute, path: "/tools/$toolRef" }),
  ]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/market"] }),
  });
  return render(
    <RouterContextProvider router={router}>
      <AeMarketComparisonView
        comparison={value}
        onEditSelection={callbacks.onEditSelection ?? vi.fn()}
        onBack={callbacks.onBack ?? vi.fn()}
        onRetry={callbacks.onRetry ?? vi.fn()}
        {...(callbacks.returnTo === undefined ? {} : { returnTo: callbacks.returnTo })}
      />
    </RouterContextProvider>,
  );
}
