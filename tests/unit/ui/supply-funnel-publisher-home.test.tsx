// @vitest-environment jsdom

import { offeringAt, renderWithRouter } from "./supply-funnel-harness";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AeSupplyPublisherHome } from "@/components/ae/supply/AeSupplyPublisherHome";

describe("current supply funnel", () => {
  it("gives every Operation exactly one status-aware primary continuation", () => {
    const base = offeringAt("test");
    if (base.publication === undefined) throw new Error("test_publication_missing");
    const operation = (
      suffix: string,
      patch: Partial<typeof base>,
    ) => ({
      ...base,
      offeringRef: `offering:${suffix}`,
      name: `Operation ${suffix}`,
      ...patch,
    });

    renderWithRouter(
      <AeSupplyPublisherHome
        readback={{
          kind: "available",
          businessId: "business-1",
          business: { name: "Provider", slug: "provider" },
          offerings: [
            operation("describe", {
              ...offeringAt("describe"),
              offeringRef: "offering:describe",
            }),
            operation("provider", {
              ...offeringAt("admission"),
              offeringRef: "offering:provider",
            }),
            operation("readiness", {
              ...offeringAt("readiness"),
              offeringRef: "offering:readiness",
            }),
            operation("authority-stale", {
              ...offeringAt("readiness"),
              offeringRef: "offering:authority-stale",
              actionableReason: "authority_stale",
              authority: {
                mode: "provider_owned",
                kind: "provider_connection",
                providerRef: "provider:stale",
                authorityGeneration: 2,
                authorityDigest: "sha256:stale",
              },
            }),
            operation("credential-rejected", {
              ...offeringAt("readiness"),
              offeringRef: "offering:credential-rejected",
              actionableReason: "credential_rejected",
              readiness: { outcome: "credential_rejected", evidenceRefs: [] },
              authority: {
                mode: "provider_owned",
                kind: "provider_connection",
                providerRef: "provider:rejected",
                authorityGeneration: 3,
                authorityDigest: "sha256:rejected",
              },
            }),
            operation("incompatible", {
              publication: {
                ...base.publication,
                state: "incompatible",
                lifecycle: {
                  state: "incompatible",
                  reasons: ["incompatible_revision"],
                },
              },
              lifecycle: {
                state: "incompatible",
                reasons: ["incompatible_revision"],
              },
              live: { available: false, reason: "incompatible_revision" },
            }),
            operation("withdrawn", {
              status: "paused",
              publication: {
                ...base.publication,
                state: "withdrawn",
                lifecycle: {
                  state: "withdrawn",
                  reasons: ["withdrawn"],
                },
              },
              lifecycle: { state: "withdrawn", reasons: ["withdrawn"] },
              live: { available: false, reason: "withdrawn" },
            }),
            operation("live", {}),
            operation("retired", {
              status: "retired",
              publication: { ...base.publication, state: "superseded" },
              lifecycle: { state: "inactive", reasons: [] },
              live: { available: false },
            }),
          ],
          callLog: [],
          activityTruncated: false,
          liquidity: {
            fillCount: 0,
            zeroCount: 0,
            depthSamples: 0,
            environment: "production",
          },
        }}
        earnings={{ kind: "not_found" }}
      />,
    );

    const expected = [
      ["Continue description", "/owner/supply/offering%3Adescribe#description"],
      ["Connect provider", "/owner/supply/offering%3Aprovider#provider"],
      ["Recheck readiness", "/owner/supply/offering%3Areadiness#readiness"],
      ["Refresh provider authority", "/owner/supply#provider-connection-provider%3Astale"],
      ["Repair provider connection", "/owner/supply#provider-connection-provider%3Arejected"],
      ["Inspect incompatibility", "/owner/supply/offering%3Aincompatible#incompatibility"],
      ["Republish", "/owner/supply/offering%3Awithdrawn#publication-maintenance"],
      ["View live Operation", "/operations/operation%3Aone"],
      ["Review earnings", "/owner/supply#earnings"],
    ] as const;

    for (const [label, href] of expected) {
      const action = screen.getByRole("link", { name: label });
      expect(action.getAttribute("href")).toBe(href);
    }
    expect(screen.getAllByRole("link", { name: /Continue description|Connect provider|Recheck readiness|Refresh provider authority|Repair provider connection|Inspect incompatibility|Republish|View live Operation|Review earnings/ })).toHaveLength(9);
  });

  it("labels non-production operational observations with their environment", () => {
    window.history.replaceState(
      null,
      "",
      "/owner/supply#provider-connection-provider%3Atest",
    );
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
    expect(screen.getByRole("heading", { name: "Supplier connections" })).toBeDefined();
    expect(screen.getByText("Connection active")).toBeDefined();
    expect(screen.getByText("https://provider.example/quote")).toBeDefined();
    expect(screen.getByRole("button", { name: "Refresh authority" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Revoke" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Connect supplier" })).toBeDefined();
    expect(document.activeElement?.getAttribute("id")).toBe(
      "provider-connection-provider:test",
    );
    window.history.replaceState(null, "", "/");
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
      screen.getByRole("link", { name: "Reload Operations" }),
    ).toBeDefined();
    expect(screen.queryByText("No operations yet.")).toBeNull();
  });
});
