// @vitest-environment jsdom

import { renderWithRouter } from "./supply-funnel-harness";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AeSupplyPublisherHome } from "@/components/ae/supply/AeSupplyPublisherHome";

describe("current supply funnel", () => {
  it("labels non-production operational observations with their environment", () => {
    renderWithRouter(
      <AeSupplyPublisherHome
        readback={{
          kind: "available",
          businessId: "business-1",
          business: { name: "Provider", slug: "provider" },
          offerings: [],
          callLog: [],
          activityTruncated: true,
          liquidity: {
            fillCount: 2,
            zeroCount: 1,
            firstSuccessP50Ms: 120,
            firstSuccessP95Ms: 240,
            depthSamples: 3,
            environment: "sandbox",
          },
        }}
        earnings={{ kind: "not_found" }}
        connections={[{
          connectionRef: "provider-connection:test",
          businessId: "business-1",
          providerRef: "provider:test",
          providerAccountRef: "https://provider.example/quote",
          adapterId: "x402-fetch:v2",
          grantedScopes: ["invoke"],
          grantedResources: ["https://provider.example/quote"],
          authorityGeneration: 1,
          authorityDigest: "sha256:test",
          lifecycle: "active",
          available: true,
          credentialConfigured: false,
          observedAt: 1,
          reasonCode: null,
          evidenceRefs: [],
          createdAt: 1,
          updatedAt: 1,
        }]}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Operational usage · sandbox" }),
    ).toBeDefined();
    expect(
      screen.getByText("Environment").nextElementSibling?.textContent,
    ).toBe("sandbox");
    expect(
      screen.getByText(/sandbox operational observations only/i),
    ).toBeDefined();
    expect(screen.getByText(/not production proof/i)).toBeDefined();
    expect(screen.getByText("Showing the 50 most recent activity records.")).toBeDefined();
    expect(screen.getByRole("heading", { name: "Provider connections" })).toBeDefined();
    expect(screen.getByText("Connection active")).toBeDefined();
    expect(screen.getByText("https://provider.example/quote")).toBeDefined();
    expect(screen.getByRole("button", { name: "Refresh authority" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Revoke" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Connect provider" })).toBeDefined();
  });

  it("renders an incomplete owner readback as a repair state", () => {
    renderWithRouter(
      <AeSupplyPublisherHome
        readback={{ kind: "incomplete" }}
        earnings={{ kind: "not_found" }}
      />,
    );

    expect(screen.getByText("Operations need repair")).toBeDefined();
    expect(
      screen.getByRole("link", { name: "Reload services" }),
    ).toBeDefined();
    expect(screen.queryByText("No operations yet.")).toBeNull();
  });
});
