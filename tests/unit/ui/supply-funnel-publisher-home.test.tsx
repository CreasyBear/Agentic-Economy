// @vitest-environment jsdom

import { offeringAt, renderWithRouter } from "./supply-funnel-harness";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AeSupplyPublisherHome } from "@/components/ae/supply/AeSupplyPublisherHome";
import { AeOwnerProviderConnections } from "@/components/ae/supply/AeOwnerProviderConnections";
import { providerConnectionTargetId } from "@/components/ae/supply/provider-connection-target";
import { formatRelativeTime, formatTimestamp, timestampIso } from "@/lib/ui/format-time";

const connectionServerMocks = vi.hoisted(() => ({
  connect: vi.fn(),
  inspect: vi.fn(),
  reconnect: vi.fn(),
  revoke: vi.fn(),
  retryCleanup: vi.fn(),
}));

vi.mock("@tanstack/react-start", async (importOriginal) => ({
  ...(await importOriginal()),
  useServerFn: (serverFn: unknown) => serverFn,
}));

vi.mock(
  "@/modules/capability-supply/supply-funnel.functions",
  async (importOriginal) => ({
    ...(await importOriginal()),
    connectOwnerX402Server: connectionServerMocks.connect,
    inspectOwnerX402Server: connectionServerMocks.inspect,
    reconnectOwnerProviderConnectionServer: connectionServerMocks.reconnect,
    revokeOwnerProviderConnectionServer: connectionServerMocks.revoke,
    retryOwnerProviderConnectionCleanupServer: connectionServerMocks.retryCleanup,
  }),
);

const activeConnection = {
  connectionRef: "provider-connection:test",
  businessId: "business-1",
  providerRef: "provider:test",
  providerAccountRef: "https://provider.example/quote",
  adapterId: "x402-fetch:v2" as const,
  grantedScopes: ["invoke"],
  grantedResources: ["https://provider.example/quote"],
  authorityGeneration: 1,
  authorityDigest: "sha256:test",
  lifecycle: "active" as const,
  available: true,
  credentialConfigured: false,
  observedAt: 1,
  reasonCode: null,
  evidenceRefs: [],
  createdAt: 1,
  updatedAt: 1,
};

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
                connectionRef: "connection:stale",
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
                connectionRef: "connection:rejected",
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
      ["Continue description", "/owner/offerings/offering%3Adescribe"],
      ["Connect provider", "/owner/supply/offering%3Aprovider#provider"],
      ["Recheck readiness", "/owner/supply/offering%3Areadiness#readiness"],
      ["Refresh and re-admit", "/owner/supply?rebind=offering%3Aauthority-stale#provider-connection-connection%3Astale"],
      ["Choose replacement connection", "/owner/supply/offering%3Acredential-rejected#credential-recovery"],
      ["Inspect incompatibility", "/owner/supply/offering%3Aincompatible#incompatibility"],
      ["Republish Operation", "/owner/supply/offering%3Awithdrawn#publication-maintenance"],
      ["View live Operation", "/operations/operation:one"],
      ["Review earnings", "/owner/supply#earnings"],
    ] as const;

    const operationsTable = within(screen.getByRole("table", { name: "Operations" }));
    for (const [label, href] of expected) {
      const action = operationsTable.getByRole("link", { name: label });
      expect(action.getAttribute("href")).toBe(href);
    }
    expect(operationsTable.getAllByRole("link", { name: /Continue description|Connect provider|Recheck readiness|Refresh and re-admit|Choose replacement connection|Inspect incompatibility|Republish Operation|View live Operation|Review earnings/ })).toHaveLength(9);
  });

  it("labels non-production operational observations with their environment", () => {
    window.history.replaceState(
      null,
      "",
      "/owner/supply#provider-connection-provider-connection%3Atest",
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
        connections={[activeConnection]}
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
    expect(screen.getByRole("button", { name: "Copy connection reference" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Inspect endpoint" })).toBeDefined();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Connect verified endpoint" }).disabled).toBe(true);
    expect(document.activeElement?.getAttribute("id")).toBe(
      "provider-connection-provider-connection:test",
    );
    window.history.replaceState(null, "", "/");
  });

  it("starts the existing provider connection form in place while preserving direct-link focus", async () => {
    window.history.replaceState(
      null,
      "",
      "/owner/settings/connections#provider-x402-resource-url",
    );
    renderWithRouter(
      <AeOwnerProviderConnections businessId="business-1" connections={[]} />,
    );

    const continuation = screen.getByRole("button", { name: "Connect provider" });
    expect(screen.queryByRole("link", { name: "Connect provider" })).toBeNull();
    const resourceUrl = screen.getByLabelText("x402 resource URL");
    await waitFor(() => expect(document.activeElement).toBe(resourceUrl));

    resourceUrl.blur();
    window.history.replaceState(null, "", "/owner/settings/connections");
    fireEvent.click(continuation);
    await waitFor(() => expect(document.activeElement).toBe(resourceUrl));
    window.history.replaceState(null, "", "/");
  });

  it("shows a provider authority expiry before failure without fabricating one when absent", () => {
    const now = new Date("2029-12-31T12:00:00.000Z");
    const expiresAt = Date.parse("2030-01-01T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      renderWithRouter(
        <AeOwnerProviderConnections
          businessId="business-1"
          connections={[
            { ...activeConnection, connectionRef: "provider-connection:expiring", expiresAt },
            { ...activeConnection, connectionRef: "provider-connection:no-expiry" },
          ]}
        />,
      );

      const expiringTarget = document.getElementById(
        providerConnectionTargetId("provider-connection:expiring"),
      );
      const noExpiryTarget = document.getElementById(
        providerConnectionTargetId("provider-connection:no-expiry"),
      );
      if (expiringTarget === null || noExpiryTarget === null) {
        throw new Error("provider_connection_target_missing");
      }
      expect(within(expiringTarget).getByText("Connection active")).toBeDefined();
      const expiry = within(expiringTarget).getByText(/Authority expires/);
      expect(expiry.tagName).toBe("TIME");
      expect(expiry.getAttribute("dateTime")).toBe(timestampIso(expiresAt));
      expect(expiry.textContent).toBe(
        `Authority expires ${formatRelativeTime(expiresAt)} · ${formatTimestamp(expiresAt)}`,
      );
      expect(within(noExpiryTarget).queryByText(/Authority expires/)).toBeNull();
      expect(within(expiringTarget).getByRole("button", { name: "Refresh authority" })).toBeDefined();
      expect(within(expiringTarget).getByRole("button", { name: "Revoke" })).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("confirms the exact provider connection before revoking and locks the pending action", async () => {
    connectionServerMocks.revoke.mockReset();
    let resolveRevoke: ((result: unknown) => void) | undefined;
    connectionServerMocks.revoke.mockImplementation(
      () => new Promise((resolve) => {
        resolveRevoke = resolve;
      }),
    );
    renderWithRouter(
      <AeOwnerProviderConnections
        businessId="business-1"
        connections={[activeConnection]}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Revoke" });
    fireEvent.click(trigger);
    const dialog = screen.getByRole("alertdialog", {
      name: "Revoke this provider connection?",
    });
    expect(connectionServerMocks.revoke).not.toHaveBeenCalled();
    expect(within(dialog).getByText(
      "Revoke access to https://provider.example/quote. New calls through this connection will stop. Operations that use it need a replacement connection and re-admission before they can accept new calls.",
    )).toBeDefined();
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    await waitFor(() => expect(document.activeElement).toBe(cancel));

    fireEvent.click(cancel);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(connectionServerMocks.revoke).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    await waitFor(() => expect(document.activeElement).toBe(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" }),
    ));
    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(connectionServerMocks.revoke).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    const confirm = within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "Revoke provider connection",
    });
    fireEvent.click(confirm);
    await waitFor(() => expect(connectionServerMocks.revoke).toHaveBeenCalledOnce());
    expect(connectionServerMocks.revoke).toHaveBeenCalledWith({
      data: {
        connectionRef: "provider-connection:test",
        commandId: expect.any(String),
        expectedAuthorityGeneration: 1,
        expectedAuthorityDigest: "sha256:test",
      },
    });

    const pendingDialog = screen.getByRole("alertdialog");
    const working = within(pendingDialog).getByRole<HTMLButtonElement>("button", {
      name: "Working…",
    });
    expect(working.disabled).toBe(true);
    fireEvent.click(working);
    fireEvent.click(within(pendingDialog).getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
    expect(screen.getByRole("alertdialog")).toBeDefined();
    expect(connectionServerMocks.revoke).toHaveBeenCalledOnce();

    const finishRevoke = resolveRevoke;
    if (finishRevoke === undefined) throw new Error("revoke_not_started");
    await act(async () => {
      finishRevoke({
        kind: "applied",
        connection: { ...activeConnection, lifecycle: "revoked" },
        commandDigest: "sha256:command",
      });
    });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(connectionServerMocks.revoke).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(trigger);
  });

  it("reuses a provider command reference after an unconfirmed update", async () => {
    connectionServerMocks.reconnect.mockReset();
    connectionServerMocks.reconnect
      .mockResolvedValueOnce({ kind: "refused", code: "source_unavailable" })
      .mockResolvedValueOnce({
        kind: "applied",
        connection: { ...activeConnection, authorityGeneration: 2 },
        commandDigest: "sha256:command",
      });
    renderWithRouter(
      <AeOwnerProviderConnections
        businessId="business-1"
        connections={[activeConnection]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Refresh authority" }));
    expect(await screen.findByText(/outcome was not confirmed/i)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Reload current connections" }));
    await waitFor(() => expect(screen.getByRole<HTMLButtonElement>("button", { name: "Refresh authority" }).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Refresh authority" }));
    await waitFor(() => expect(connectionServerMocks.reconnect).toHaveBeenCalledTimes(2));

    const commandIds = connectionServerMocks.reconnect.mock.calls.map(
      (call) => call[0]?.data?.commandId,
    );
    expect(commandIds[1]).toBe(commandIds[0]);
  });

  it("requires a live supported x402 challenge before connecting", async () => {
    connectionServerMocks.inspect.mockResolvedValue({
      kind: "observed",
      authority: "observed_external",
      canonical: false,
      usageVerified: false,
      endpoint: { endpointId: "endpoint-1", url: "https://provider.example/quote" },
      backend: { backendId: "backend-1", method: "POST", resource: "https://provider.example/quote" },
      payment: {
        accepts: [{
          alternativeId: "lane-1",
          scheme: "exact",
          network: "eip155:8453",
          amount: "1000",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          payTo: "0x1111111111111111111111111111111111111111",
          maxTimeoutSeconds: 60,
          extra: { assetTransferMethod: "eip3009" },
          supportedByAe: true,
        }],
        selection: { kind: "selected", alternativeId: "lane-1" },
      },
      probe: { status: "payment_required", httpStatus: 402, observedAt: 1 },
      digest: "sha256:inspection",
      claim: {
        payTo: "0x1111111111111111111111111111111111111111",
        expiresAt: 123456,
        message: "Agentic Economy x402 seller claim v1",
      },
    });
    connectionServerMocks.connect.mockResolvedValue({
      kind: "applied",
      connection: activeConnection,
      commandDigest: "sha256:command",
    });
    renderWithRouter(
      <AeOwnerProviderConnections businessId="business-1" connections={[]} />,
    );
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: {
        request: vi.fn().mockResolvedValue(`0x${"ab".repeat(65)}`),
      },
    });

    fireEvent.change(screen.getByLabelText("x402 resource URL"), {
      target: { value: "https://provider.example/quote" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Inspect endpoint" }));
    await waitFor(() => expect(connectionServerMocks.inspect).toHaveBeenCalledWith({
      data: {
        businessId: "business-1",
        resourceUrl: "https://provider.example/quote",
        method: "POST",
        environment: "production",
      },
    }));
    expect(screen.getByText("Exact payment lane observed")).toBeDefined();
    expect(screen.getByText("Amount: 1000")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Prove payee control" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Payee control proved" })).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "Connect verified endpoint" }));
    await waitFor(() => expect(connectionServerMocks.connect).toHaveBeenCalledWith({
      data: {
        businessId: "business-1",
        resourceUrl: "https://provider.example/quote",
        method: "POST",
        environment: "production",
        claimExpiresAt: 123456,
        claimSignature: `0x${"ab".repeat(65)}`,
        commandId: expect.any(String),
      },
    }));
  });

  it("refreshes the exact bound connection when one provider host has two connections", async () => {
    const exactConnection = {
      ...activeConnection,
      connectionRef: "provider-connection:exact",
      authorityGeneration: 7,
      authorityDigest: "sha256:exact",
    };
    window.history.replaceState(
      null,
      "",
      "/owner/supply?rebind=offering%3Atest#provider-connection-provider-connection%3Aexact",
    );
    connectionServerMocks.reconnect.mockResolvedValue({
      kind: "applied",
      connection: {
        ...exactConnection,
        authorityGeneration: 8,
        authorityDigest: "sha256:refreshed",
      },
      commandDigest: "sha256:command",
    });
    renderWithRouter(
      <AeOwnerProviderConnections
        businessId="business-1"
        connections={[activeConnection, exactConnection]}
      />,
    );

    const exactTarget = document.getElementById(
      providerConnectionTargetId(exactConnection.connectionRef),
    );
    if (exactTarget === null) throw new Error("exact_connection_target_missing");
    await waitFor(() =>
      expect(document.activeElement).toBe(exactTarget),
    );
    expect(screen.getAllByText("Two-step authority recovery")).toHaveLength(1);
    expect(within(exactTarget).getByText("Two-step authority recovery")).toBeDefined();
    expect(screen.queryByRole("link", { name: "Re-admit Operation" })).toBeNull();
    fireEvent.click(within(exactTarget).getByRole("button", { name: "Refresh authority" }));
    await waitFor(() => expect(connectionServerMocks.reconnect).toHaveBeenCalledOnce());
    expect(connectionServerMocks.reconnect).toHaveBeenCalledWith({
      data: {
        connectionRef: "provider-connection:exact",
        commandId: expect.any(String),
        expectedAuthorityGeneration: 7,
        expectedAuthorityDigest: "sha256:exact",
      },
    });
    const continuation = await screen.findByRole("link", { name: "Re-admit Operation" });
    expect(continuation.getAttribute("href")).toBe(
      "/owner/supply/offering%3Atest#provider",
    );
    await waitFor(() => expect(document.activeElement).toBe(continuation));
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
