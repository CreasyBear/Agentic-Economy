// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../setup/jsdom-platform";
import "../../setup/jsdom-dialog";

import { AeSupplyLanding } from "@/components/ae/supply/AeSupplyLanding";
import {
  AeSupplyFunnel,
  type SupplyFunnelCallbacks,
} from "@/components/ae/supply/AeSupplyFunnel";
import {
  AeOwnerOperationFacts,
  AeSupplyPublisherHome,
} from "@/components/ae/supply/AeSupplyPublisherHome";
import { AeSupplyEarningsCard } from "@/components/ae/supply/AeSupplyEarningsCard";
import {
  AeSupplyEndpointConfigStep,
  type SupplyAuthorityOption,
  type SupplyEndpointConfigValue,
  type SupplyEndpointDocumentPreflightResult,
  type SupplyPublicationImport,
} from "@/components/ae/supply/AeSupplyEndpointConfigStep";
import type { PreparedPublicationMaterial } from "@/modules/capability-supply/internal/publication";
import type {
  OwnerSupplyCommandResult,
  OwnerSupplyOfferingReadback,
  OwnerSupplyReadbackSource,
  SupplyFunnelStep,
  SupplyFunnelStepState,
  SupplyLandingTool,
} from "@/modules/capability-supply/supply-funnel.functions";
import type { ServiceDto } from "@/modules/registry/public";
import {
  pricingConfigDigest,
  type PricingConfig,
} from "@/modules/money/public";
import { emptyOwnerOfferingEditorValue } from "@/components/ae/offerings/AeOwnerOfferings.exports";

const moneyServerMocks = vi.hoisted(() => ({
  createOwnerConnectAccountServer: vi.fn(),
  createOwnerOnboardingLinkServer: vi.fn(),
  readOwnerPayoutTransferServer: vi.fn(),
}));

vi.mock("@/modules/money/server", () => moneyServerMocks);

const tool: SupplyLandingTool = {
  id: "registry.services_list",
  name: "List published services",
  summary: "Read published services.",
  boundaries: ["Read-only."],
};
const service: ServiceDto = {
  id: "example",
  name: "Quote API",
  category: "Data",
  networks: [],
  enriched: false,
  integrationType: "3P",
  serviceName: "Quote API",
  tags: [],
  ae: {
    businessContext: {
      kind: "local_human",
      suburb: "Perth",
      stateTerritory: "WA",
    },
    publicUrl: "/example",
    trustTier: "claimed",
    photos: [],
    observedAt: 1,
    disposition: "current",
    source: "business_published",
    offerings: [
      {
        offeringRef: "offering:one",
        revision: 1,
        name: "Quote API",
        category: "Data",
        summary: "Returns a quote.",
        price: {
          kind: "fixed",
          amount: { currency: "AUD", units: "0", exponent: 2 },
          taxTreatment: "inclusive",
        },
        support: { integrated: false, routeable: false },
      },
    ],
    links: { business: "/api/businesses/example", manifest: "/example/ucp" },
  },
  endpoints: [
    {
      url: "https://example.test/quote",
      description: "Quote",
      serviceName: "Quote API",
      tags: [],
      parameters: [],
      quality: null,
      ae: {
        offeringRef: "offering:one",
        provenance: "business_declared",
        access: "external",
        authentication: { kind: "unknown" },
        execution: "catalog_only",
        settlementSupport: "unpriced",
      },
    },
  ],
};

beforeEach(() => {
  window.sessionStorage.clear();
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

describe("supply landing", () => {
  it("leads with the business outcome and generated service rows", () => {
    renderWithRouter(<AeSupplyLanding tools={[tool]} services={[service]} />);
    expect(
      screen.getByRole("heading", { name: /AI assistants/i }),
    ).toBeDefined();
    expect(
      screen
        .getByRole("link", { name: "Claim provider identity" })
        .getAttribute("href"),
    ).toBe("/claim/form?source=supply");
    expect(screen.getByText(/agents bring you work/i)).toBeDefined();
    expect(screen.getByText("Quote API")).toBeDefined();
    expect(screen.queryByText(/\b[0-9]+ actions available/i)).toBeNull();
    expect(
      screen.queryByText(/publisher console|money rail|machine surfaces/i),
    ).toBeNull();
  });

  it("renders the honest empty state", () => {
    renderWithRouter(<AeSupplyLanding tools={[]} services={[]} />);
    expect(screen.getByText("No services are listed yet.")).toBeDefined();
  });
});
describe("current supply funnel", () => {
  it("renders only the describe frontier first", () => {
    const callbacks: SupplyFunnelCallbacks = {
      saveOffering: async (value) => ({
        kind: "saved",
        value,
        message: "Saved.",
      }),
      preflight: async () => ({
        kind: "refused",
        reason: "not_used",
        fix: "Not used in this step.",
      }),
      admit: async () => ({ step: "admission", state: "completed" }),
      runReadiness: async () => ({ step: "readiness", state: "completed" }),
      runTest: async () => ({ step: "test", state: "completed" }),
    };
    render(
      <AeSupplyFunnel
        businessId="business:one"
        offering={offeringAt("describe")}
        initialOffering={emptyOwnerOfferingEditorValue}
        callbacks={callbacks}
      />,
    );
    expect(screen.getByText("Service details")).toBeDefined();
    expect(
      screen.queryByRole("heading", { name: "Check that it works" }),
    ).toBeNull();
  });

  it("moves through save, admission, readiness, and test effects", async () => {
    const savedValue = {
      ...emptyOwnerOfferingEditorValue,
      expectedRevision: 1,
      name: "Weather data",
      category: "Data",
      summary: "Returns a current weather report.",
    };
    const saveOfferingImplementation: SupplyFunnelCallbacks["saveOffering"] =
      async () => ({ kind: "saved", value: savedValue, message: "Saved." });
    const saveOffering = vi.fn(saveOfferingImplementation);
    const preflightImplementation: SupplyFunnelCallbacks["preflight"] = async (
      source,
    ) => {
      expect(source.sourceRevision).toBe("source:one");
      return { kind: "prepared", prepared: preparedPublication };
    };
    const preflight = vi.fn(preflightImplementation);
    const admitImplementation: SupplyFunnelCallbacks["admit"] = async () => {
      return {
        step: "admission",
        state: "completed",
        offeringRef: "offering:one",
        revision: 1,
        publicationRef: "publication:one",
        operationRef: "operation:one",
        message: "Admitted.",
      };
    };
    const admit = vi.fn(admitImplementation);
    const runReadinessImplementation: SupplyFunnelCallbacks["runReadiness"] =
      async () => ({ step: "readiness", state: "completed" });
    const runReadiness = vi.fn(runReadinessImplementation);
    const runTestImplementation: SupplyFunnelCallbacks["runTest"] =
      async () => ({ step: "test", state: "completed" });
    const runTest = vi.fn(runTestImplementation);
    let nextStep: SupplyFunnelStep = "admission";
    let updateOffering: (step: SupplyFunnelStep) => void = () => undefined;
    const callbacks: SupplyFunnelCallbacks = {
      saveOffering,
      preflight,
      admit,
      runReadiness,
      runTest,
      onReload: async () => updateOffering(nextStep),
    };
    const view = render(
      <AeSupplyFunnel
        businessId="business:one"
        offering={offeringAt("describe")}
        initialOffering={emptyOwnerOfferingEditorValue}
        initialSource={sourceValue}
        callbacks={callbacks}
      />,
    );
    updateOffering = (step) =>
      view.rerender(
        <AeSupplyFunnel
          businessId="business:one"
          offering={offeringAt(step)}
          initialOffering={emptyOwnerOfferingEditorValue}
          initialSource={sourceValue}
          callbacks={callbacks}
        />,
      );

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Weather data" },
    });
    fireEvent.change(screen.getByLabelText("Category"), {
      target: { value: "Data" },
    });
    fireEvent.change(screen.getByLabelText("Summary"), {
      target: { value: "Returns a current weather report." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: "Tell AE where your service runs",
        }),
      ).toBeDefined(),
    );
    expect(saveOffering).toHaveBeenCalledOnce();

    nextStep = "readiness";
    fireEvent.click(screen.getByRole("button", { name: "Check and continue" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: "Check that the admitted operation works",
        }),
      ).toBeDefined(),
    );
    expect(preflight).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "openapi_http",
        sourceRevision: "source:one",
      }),
    );
    expect(admit).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "openapi_http",
        sourceRevision: "source:one",
      }),
    );
    expect(admit.mock.calls[0]).toHaveLength(1);

    nextStep = "test";
    fireEvent.click(screen.getByRole("button", { name: "Check the service" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Run a real test" }),
      ).toBeDefined(),
    );
    expect(runReadiness).toHaveBeenCalledWith(
      expect.objectContaining({
        offeringRef: "offering:one",
        publicationRef: "publication:one",
      }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Review and confirm the test" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Send the test" }),
      ).toBeDefined(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Send the test" }));
    await waitFor(() =>
      expect(runTest).toHaveBeenCalledWith(
        expect.objectContaining({
          offeringRef: "offering:one",
          publicationRef: "publication:one",
        }),
      ),
    );
  });

  it("distinguishes an x402 readiness challenge from a paid fill", async () => {
    const runTest = vi.fn(async () => ({
      step: "test" as const,
      state: "completed" as const,
      message:
        "The exact admitted operation returned a fresh valid x402 payment challenge. No payment was sent.",
    }));
    const callbacks: SupplyFunnelCallbacks = {
      saveOffering: async (value) => ({
        kind: "saved",
        value,
        message: "Saved.",
      }),
      preflight: async () => ({
        kind: "refused",
        reason: "not_used",
        fix: "Not used in this step.",
      }),
      admit: async () => ({ step: "admission", state: "completed" }),
      runReadiness: async () => ({ step: "readiness", state: "completed" }),
      runTest,
    };
    render(
      <AeSupplyFunnel
        businessId="business:one"
        offering={x402OfferingAtTest()}
        initialOffering={emptyOwnerOfferingEditorValue}
        callbacks={callbacks}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "Check payment challenge (no payment sent).",
      }),
    ).toBeDefined();
    expect(screen.getByText(/readiness only/i)).toBeDefined();
    expect(
      screen.getByText(
        /not a paid fill, Qualified Use, earnings, settlement, or proof of live availability/i,
      ),
    ).toBeDefined();
    expect(screen.queryByText("Send the test")).toBeNull();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Check payment challenge (no payment sent).",
      }),
    );
    await waitFor(() => expect(runTest).toHaveBeenCalledOnce());
  });

  it("rejects malformed source material before admission", async () => {
    const preflightImplementation: SupplyFunnelCallbacks["preflight"] =
      async () => ({ kind: "prepared", prepared: preparedPublication });
    const preflight = vi.fn(preflightImplementation);
    const admitImplementation: SupplyFunnelCallbacks["admit"] = async () => ({
      step: "admission",
      state: "completed",
    });
    const admit = vi.fn(admitImplementation);
    const callbacks: SupplyFunnelCallbacks = {
      saveOffering: async (value) => ({
        kind: "saved",
        value,
        message: "Saved.",
      }),
      preflight,
      admit,
      runReadiness: async () => ({ step: "readiness", state: "completed" }),
      runTest: async () => ({ step: "test", state: "completed" }),
    };
    render(
      <AeSupplyFunnel
        businessId="business:one"
        offering={offeringAt("admission")}
        initialOffering={emptyOwnerOfferingEditorValue}
        initialSource={{ ...sourceValue, contract: {} }}
        callbacks={callbacks}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Check and continue" }));
    expect(screen.getByRole("alert").textContent).toMatch(
      /contract must declare at least one output evidence pointer/i,
    );
    expect(preflight).not.toHaveBeenCalled();
    expect(admit).not.toHaveBeenCalled();
  });
  it("blocks an expired provider connection before source preflight", async () => {
    const preflight = vi.fn(async () => ({
      kind: "prepared" as const,
      prepared: preparedPublication,
    }));
    const admit = vi.fn(async () => ({
      step: "admission" as const,
      state: "completed" as const,
    }));
    const authority: SupplyAuthorityOption = {
      connectionRef: "connection:expired",
      businessId: "business:one",
      providerRef: "provider:weather",
      providerAccountRef: "account:weather",
      adapterId: "http-json:v1",
      grantedScopes: [],
      grantedResources: [],
      authorityGeneration: 1,
      authorityDigest: `sha256:${"a".repeat(64)}`,
      lifecycle: "active",
      available: false,
      credentialConfigured: true,
      observedAt: 1,
      expiresAt: 2,
      reasonCode: "credential_expired",
      evidenceRefs: [],
      createdAt: 1,
      updatedAt: 1,
    };
    render(
      <AeSupplyFunnel
        businessId="business:one"
        offering={offeringAt("admission")}
        initialOffering={emptyOwnerOfferingEditorValue}
        initialSource={{
          ...sourceValue,
          authority: {
            kind: "provider_connection",
            connectionRef: authority.connectionRef,
            providerRef: authority.providerRef,
          },
        }}
        authorityOptions={[authority]}
        callbacks={{
          saveOffering: async (value) => ({
            kind: "saved",
            value,
            message: "Saved.",
          }),
          preflight,
          admit,
          runReadiness: async () => ({ step: "readiness", state: "completed" }),
          runTest: async () => ({ step: "test", state: "completed" }),
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Check and continue" }));
    expect(
      (await screen.findAllByText(/provider connection is unavailable/i))
        .length,
    ).toBeGreaterThan(0);
    expect(preflight).not.toHaveBeenCalled();
    expect(admit).not.toHaveBeenCalled();
  });

  it("selects an available non-secret x402 provider connection", async () => {
    const authority: SupplyAuthorityOption = {
      connectionRef: "connection:x402",
      businessId: "business:one",
      providerRef: "provider:x402",
      providerAccountRef: "account:x402",
      adapterId: "x402-fetch:v2",
      grantedScopes: [],
      grantedResources: [],
      authorityGeneration: 1,
      authorityDigest: `sha256:${"b".repeat(64)}`,
      lifecycle: "active",
      available: true,
      credentialConfigured: false,
      observedAt: 1,
      reasonCode: null,
      evidenceRefs: [],
      createdAt: 1,
      updatedAt: 1,
    };
    const preflight = vi.fn(async (source: SupplyPublicationImport) => {
      expect(source).toMatchObject({
        kind: "x402",
        commercial: {
          authority: {
            kind: "provider_connection",
            connectionRef: authority.connectionRef,
            providerRef: authority.providerRef,
          },
        },
      });
      return { kind: "prepared" as const, prepared: preparedPublication };
    });

    render(
      <AeSupplyEndpointConfigStep
        initialValue={x402SourceValue}
        authorityOptions={[authority]}
        onPreflight={preflight}
        onSubmit={async () => undefined}
      />,
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Access authority" }));
    fireEvent.click(
      screen.getByRole("option", { name: /provider:x402 · available/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Check and continue" }));

    await waitFor(() => expect(preflight).toHaveBeenCalledOnce());
  });
  it("offers OpenAPI selection and renders document inspection outcomes", async () => {
    const inspectDocument = vi.fn(
      async (): Promise<SupplyEndpointDocumentPreflightResult> => ({
        kind: "preflighted",
        sourceDigest: sourceHash,
        truncated: false,
        outcomes: [
          { selector: { path: "/quote", method: "post" }, kind: "executable" },
          {
            selector: { path: "/admin", method: "get" },
            kind: "unsafe",
            reason: "transport_unsupported",
          },
          {
            selector: { path: "/secret", method: "get" },
            kind: "credential_required",
            credential: {
              kind: "api_key",
              location: "header",
              name: "X-API-Key",
            },
          },
        ],
      }),
    );
    render(
      <AeSupplyEndpointConfigStep
        initialValue={x402SourceValue}
        onPreflight={async () => ({
          kind: "prepared",
          prepared: preparedPublication,
        })}
        onPreflightDocument={inspectDocument}
        onSubmit={async () => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("combobox", { name: "Connection type" }));
    fireEvent.click(screen.getByRole("option", { name: "OpenAPI HTTP API" }));
    const documentField = screen.getByLabelText("OpenAPI document (JSON)");
    expect(documentField).toBeDefined();
    fireEvent.change(documentField, {
      target: { value: JSON.stringify(openApiDocument) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Inspect operations" }));

    await waitFor(() => expect(inspectDocument).toHaveBeenCalledOnce());
    expect(
      screen.getByRole("group", { name: "OpenAPI operation outcomes" }),
    ).toBeDefined();
    expect(screen.getByText("POST /quote")).toBeDefined();
    expect(screen.getByText("transport_unsupported")).toBeDefined();
    expect(
      screen.getByText(/Credential: api_key · X-API-Key · header/),
    ).toBeDefined();
    expect(
      screen.queryByRole("radio", { name: "Select GET /admin" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Select POST /quote" }));
    expect(screen.getByDisplayValue("POST /quote")).toBeDefined();
  });
  it("allows credential-required OpenAPI selection only for an available compatible connection", async () => {
    const credentialDocument = {
      ...openApiDocument,
      paths: {
        "/private": {
          get: {
            responses: {
              "200": {
                content: { "application/json": { schema: { type: "object" } } },
              },
            },
          },
        },
      },
    };
    const credentialPreflight: SupplyEndpointDocumentPreflightResult = {
      kind: "preflighted",
      sourceDigest: sourceHash,
      truncated: false,
      outcomes: [
        {
          selector: { path: "/private", method: "get" },
          kind: "credential_required",
          credential: {
            kind: "api_key",
            location: "header",
            name: "X-API-Key",
          },
        },
      ],
    };
    const preflight = vi.fn(async () => ({
      kind: "prepared" as const,
      prepared: preparedPublication,
    }));
    const keyedAuthority: SupplyAuthorityOption = {
      connectionRef: "connection:api",
      businessId: "business:one",
      providerRef: "provider:api",
      providerAccountRef: "account:api",
      adapterId: "http-json:v1",
      grantedScopes: [],
      grantedResources: [],
      authorityGeneration: 1,
      authorityDigest: `sha256:${"c".repeat(64)}`,
      lifecycle: "active",
      available: true,
      credentialConfigured: true,
      observedAt: 1,
      reasonCode: null,
      evidenceRefs: [],
      createdAt: 1,
      updatedAt: 1,
    };
    const credentialSource = {
      ...sourceValue,
      documentJson: JSON.stringify(credentialDocument),
      operation: { path: "/private", method: "get" as const },
    };
    const view = render(
      <AeSupplyEndpointConfigStep
        initialValue={credentialSource}
        initialDocumentPreflight={credentialPreflight}
        onPreflightDocument={async () => credentialPreflight}
        onPreflight={preflight}
        onSubmit={async () => undefined}
      />,
    );

    expect(
      screen.queryByRole("radio", { name: "Select GET /private" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Check and continue" }));
    expect(
      screen.getAllByText(/executable or credential-authorized GET or POST/i)
        .length,
    ).toBeGreaterThan(0);
    expect(preflight).not.toHaveBeenCalled();

    view.rerender(
      <AeSupplyEndpointConfigStep
        initialValue={{
          ...credentialSource,
          authority: {
            kind: "provider_connection",
            connectionRef: keyedAuthority.connectionRef,
            providerRef: keyedAuthority.providerRef,
          },
        }}
        initialDocumentPreflight={credentialPreflight}
        onPreflightDocument={async () => credentialPreflight}
        authorityOptions={[keyedAuthority]}
        onPreflight={preflight}
        onSubmit={async () => undefined}
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByRole("radio", { name: "Select GET /private" }),
      ).toBeDefined(),
    );
    fireEvent.click(screen.getByRole("radio", { name: "Select GET /private" }));
    fireEvent.click(screen.getByRole("button", { name: "Check and continue" }));
    await waitFor(() => expect(preflight).toHaveBeenCalledOnce());
  });

  it("keeps readiness refusal recovery honest and does not create earnings", async () => {
    let attempt = 0;
    let nextStep: SupplyFunnelStep = "readiness";
    let updateOffering: (step: SupplyFunnelStep) => void = () => undefined;
    const runReadinessImplementation: SupplyFunnelCallbacks["runReadiness"] =
      async () => {
        attempt += 1;
        return attempt === 1
          ? { step: "readiness", state: "refused", refusal: "health_unhealthy" }
          : { step: "readiness", state: "completed" };
      };
    const runReadiness = vi.fn(runReadinessImplementation);
    const callbacks: SupplyFunnelCallbacks = {
      saveOffering: async (value) => ({
        kind: "saved",
        value,
        message: "Saved.",
      }),
      preflight: async () => ({
        kind: "prepared",
        prepared: preparedPublication,
      }),
      admit: async () => ({ step: "admission", state: "completed" }),
      runReadiness,
      runTest: async () => ({ step: "test", state: "completed" }),
      onReload: async () => updateOffering(nextStep),
    };
    const view = render(
      <AeSupplyFunnel
        businessId="business:one"
        offering={offeringAt("readiness")}
        initialOffering={emptyOwnerOfferingEditorValue}
        callbacks={callbacks}
      />,
    );
    updateOffering = (step) =>
      view.rerender(
        <AeSupplyFunnel
          businessId="business:one"
          offering={offeringAt(step)}
          initialOffering={emptyOwnerOfferingEditorValue}
          callbacks={callbacks}
        />,
      );

    fireEvent.click(screen.getByRole("button", { name: "Check the service" }));
    await waitFor(() =>
      expect(
        screen.getByText(/endpoint returned an unhealthy result/i),
      ).toBeDefined(),
    );
    expect(screen.queryByText("health_unhealthy")).toBeNull();
    expect(screen.getByRole("alert").className).toContain("text-destructive");

    nextStep = "test";
    fireEvent.click(screen.getByRole("button", { name: "Check the service" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Run a real test" }),
      ).toBeDefined(),
    );
    await waitFor(() =>
      expect(screen.getByText("Check that it works is saved.")).toBeDefined(),
    );
    expect(screen.getByRole("alert").className).not.toContain(
      "text-destructive",
    );
    expect(runReadiness).toHaveBeenCalledTimes(2);

    render(<AeSupplyEarningsCard readback={{ kind: "not_found" }} />);
    expect(
      screen.getByText(/Setup or test calls do not create earnings/i),
    ).toBeDefined();
  });

  it("requires one explicit confirmation before withdrawing a publication", async () => {
    let resolveWithdraw!: (result: OwnerSupplyCommandResult) => void;
    const withdraw = vi.fn(
      () =>
        new Promise<OwnerSupplyCommandResult>((resolve) => {
          resolveWithdraw = resolve;
        }),
    );
    const callbacks: SupplyFunnelCallbacks = {
      saveOffering: async (value) => ({
        kind: "saved",
        value,
        message: "Saved.",
      }),
      preflight: async () => ({
        kind: "prepared",
        prepared: preparedPublication,
      }),
      admit: async () => ({ step: "admission", state: "completed" }),
      runReadiness: async () => ({ step: "readiness", state: "completed" }),
      runTest: async () => ({ step: "test", state: "completed" }),
      withdraw,
    };
    render(
      <AeSupplyFunnel
        businessId="business:one"
        offering={offeringAt("test")}
        initialOffering={emptyOwnerOfferingEditorValue}
        callbacks={callbacks}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Withdraw publication" }),
    );
    expect(withdraw).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(withdraw).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Withdraw publication" }),
    );
    const confirm = screen.getByRole("button", { name: "Confirm withdrawal" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(withdraw).toHaveBeenCalledOnce();

    resolveWithdraw({
      kind: "withdrawn",
      publicationRef: "publication:one",
      revision: 2,
      lifecycle: { state: "withdrawn", reasons: ["owner_withdrew"] },
    });
    await waitFor(() =>
      expect(
        screen.getByText(/current publication is withdrawn/i),
      ).toBeDefined(),
    );
    expect(screen.getByRole("alert").className).not.toContain(
      "text-destructive",
    );
  });

  it("shows recorded daily balance copy and Connect setup without payout mutation controls", () => {
    const exact = { currency: "USD", units: "5000", exponent: 2 };
    render(
      <AeSupplyEarningsCard
        readback={{
          kind: "available",
          businessId: "business-1",
          accountsTruncated: false,
          accounts: [
            {
              currency: "USD",
              earnings: {
                kind: "ok",
                businessId: "business-1",
                grossAccrual: exact,
                rake: { ...exact, units: "500" },
                providerNet: exact,
                paidOut: { ...exact, units: "0" },
                held: exact,
                recoveryDue: { ...exact, units: "0" },
                truncated: false,
                evidence: "source",
              },
              payout: {
                kind: "ok",
                businessId: "business-1",
                accountState: "not_started",
                payoutState: "held_threshold",
                payoutRef: "payout-1",
                providerNet: exact,
                minimumPayout: { ...exact, units: "1000" },
                evidence: "source",
              },
            },
          ],
        }}
      />,
    );

    expect(
      screen.getByText(
        "AE records eligible net earnings in a daily payout balance. Live transfers remain held while the live-money gate is closed.",
      ),
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Set up payouts" }),
    ).toBeDefined();
    expect(screen.queryByText("Minimum payout")).toBeNull();
    for (const name of [
      "Start payout",
      "Confirm payout",
      "Recover transfer",
      "Reconcile transfer",
    ]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(screen.queryByText("Durable transfer evidence")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Refresh recorded status" }),
    ).toBeNull();
    expect(
      moneyServerMocks.readOwnerPayoutTransferServer,
    ).not.toHaveBeenCalled();
    expect(moneyServerMocks).not.toHaveProperty(
      "beginOwnerPayoutTransferServer",
    );
    expect(moneyServerMocks).not.toHaveProperty(
      "recoverOwnerPayoutTransferServer",
    );
  });

  it("renders persisted transfer evidence with read-only refresh and verified wording", async () => {
    const onStatusRefreshed = vi.fn();
    moneyServerMocks.readOwnerPayoutTransferServer.mockResolvedValue({
      kind: "ok",
      transfer: {},
    });
    const exact = { currency: "USD", units: "5000", exponent: 2 };
    const payout = Object.assign(
      {
        kind: "ok" as const,
        businessId: "business-1",
        accountState: "ready" as const,
        payoutState: "paid" as const,
        payoutRef: "payout-1",
        payoutCommandId: "command-1",
        providerNet: exact,
        minimumPayout: { ...exact, units: "1000" },
        stripeTransferId: "tr_1",
        destinationAccountId: "acct_1",
        transferStatus: "succeeded" as const,
        requestDigest: "sha256:request",
        evidenceDigest: "sha256:evidence",
        providerHeldBefore: exact,
        providerHeldAfter: { ...exact, units: "0" },
        providerPaidBefore: { ...exact, units: "0" },
        providerPaidAfter: exact,
        recoveryState: "admin_intervention" as const,
        evidence: "source" as const,
      },
      { idempotencyKey: "payout-key-1" },
    );
    render(
      <AeSupplyEarningsCard
        readback={{
          kind: "available",
          businessId: "business-1",
          accountsTruncated: false,
          accounts: [
            {
              currency: "USD",
              earnings: {
                kind: "ok",
                businessId: "business-1",
                grossAccrual: exact,
                rake: { ...exact, units: "500" },
                providerNet: exact,
                paidOut: exact,
                held: { ...exact, units: "0" },
                recoveryDue: { ...exact, units: "0" },
                truncated: false,
                evidence: "source",
              },
              payout,
            },
          ],
        }}
        onStatusRefreshed={onStatusRefreshed}
      />,
    );

    expect(screen.getByText("Durable transfer evidence")).toBeDefined();
    expect(screen.getByText("tr_1")).toBeDefined();
    expect(screen.getByText("sha256:evidence")).toBeDefined();
    expect(screen.getByText("USD 50.00 → USD 0.00")).toBeDefined();
    expect(screen.getByText("USD 0.00 → USD 50.00")).toBeDefined();
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh recorded status" }),
    );
    await waitFor(() =>
      expect(moneyServerMocks.readOwnerPayoutTransferServer).toHaveBeenCalledWith(
        {
          data: {
            businessId: "business-1",
            currency: "USD",
            payoutRef: "payout-1",
            idempotencyKey: "payout-key-1",
          },
        },
      ),
    );
    await waitFor(() => expect(onStatusRefreshed).toHaveBeenCalledOnce());
    expect(screen.getByText("Transferred to Stripe")).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Refresh recorded status" }),
    ).toBeDefined();
    expect(
      screen.getByText(
        "Transfer outcome requires system reconciliation. Contact support with the durable command ID; do not retry the transfer.",
      ),
    ).toBeDefined();
    expect(
      screen.queryByRole("button", { name: "Check transfer status" }),
    ).toBeNull();
    for (const name of [
      "Start payout",
      "Confirm payout",
      "Recover transfer",
      "Reconcile transfer",
    ]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(moneyServerMocks).not.toHaveProperty(
      "beginOwnerPayoutTransferServer",
    );
    expect(moneyServerMocks).not.toHaveProperty(
      "recoverOwnerPayoutTransferServer",
    );
  });
  it("shows system reconciliation guidance for an unknown recorded transfer", async () => {
    const onStatusRefreshed = vi.fn();
    const exact = { currency: "USD", units: "5000", exponent: 2 };
    moneyServerMocks.readOwnerPayoutTransferServer.mockResolvedValue({
      kind: "ok",
      transfer: {},
    });
    render(
      <AeSupplyEarningsCard
        readback={{
          kind: "available",
          businessId: "business-1",
          accountsTruncated: false,
          accounts: [
            {
              currency: "USD",
              earnings: {
                kind: "ok",
                businessId: "business-1",
                grossAccrual: exact,
                rake: { ...exact, units: "500" },
                providerNet: exact,
                paidOut: { ...exact, units: "0" },
                held: exact,
                recoveryDue: { ...exact, units: "0" },
                truncated: false,
                evidence: "source",
              },
              payout: {
                kind: "ok",
                businessId: "business-1",
                accountState: "ready",
                idempotencyKey: "payout-key-unknown",
                payoutState: "outcome_unknown",
                payoutRef: "payout-unknown",
                payoutCommandId: "command-unknown",
                providerNet: exact,
                minimumPayout: { ...exact, units: "1000" },
                recoveryState: "provider_id",
                evidence: "source",
              },
            },
          ],
        }}
        onStatusRefreshed={onStatusRefreshed}
      />,
    );
    expect(
      screen.getByText("AE is reconciling the recorded transfer. Do not retry it."),
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Refresh recorded status" }),
    ).toBeDefined();
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh recorded status" }),
    );
    await waitFor(() =>
      expect(moneyServerMocks.readOwnerPayoutTransferServer).toHaveBeenCalledWith(
        {
          data: {
            businessId: "business-1",
            currency: "USD",
            payoutRef: "payout-unknown",
            idempotencyKey: "payout-key-unknown",
          },
        },
      ),
    );
    await waitFor(() => expect(onStatusRefreshed).toHaveBeenCalledOnce());
    expect(moneyServerMocks).not.toHaveProperty(
      "beginOwnerPayoutTransferServer",
    );
    expect(moneyServerMocks).not.toHaveProperty(
      "recoverOwnerPayoutTransferServer",
    );
  });
  it("refreshes a command-backed pending transfer only through the read command", async () => {
    const onStatusRefreshed = vi.fn();
    const exact = { currency: "USD", units: "5000", exponent: 2 };
    moneyServerMocks.readOwnerPayoutTransferServer.mockResolvedValue({
      kind: "ok",
      transfer: {},
    });
    render(
      <AeSupplyEarningsCard
        readback={{
          kind: "available",
          businessId: "business-1",
          accountsTruncated: false,
          accounts: [
            {
              currency: "USD",
              earnings: {
                kind: "ok",
                businessId: "business-1",
                grossAccrual: exact,
                rake: { ...exact, units: "500" },
                providerNet: exact,
                paidOut: { ...exact, units: "0" },
                held: exact,
                recoveryDue: { ...exact, units: "0" },
                truncated: false,
                evidence: "source",
              },
              payout: {
                kind: "ok",
                businessId: "business-1",
                accountState: "ready",
                payoutState: "transfer_pending",
                payoutRef: "payout-pending",
                payoutCommandId: "command-pending",
                idempotencyKey: "payout-key-pending",
                providerNet: exact,
                minimumPayout: { ...exact, units: "1000" },
                stripeTransferId: "tr_pending",
                destinationAccountId: "acct_1",
                transferStatus: "pending",
                requestDigest: "sha256:request-pending",
                evidenceDigest: "sha256:evidence-pending",
                recoveryState: "provider_id",
                evidence: "source",
              },
            },
          ],
        }}
        onStatusRefreshed={onStatusRefreshed}
      />,
    );

    expect(screen.getByText("Durable transfer evidence")).toBeDefined();
    expect(screen.getByText("tr_pending")).toBeDefined();
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh recorded status" }),
    );
    await waitFor(() =>
      expect(moneyServerMocks.readOwnerPayoutTransferServer).toHaveBeenCalledWith(
        {
          data: {
            businessId: "business-1",
            currency: "USD",
            payoutRef: "payout-pending",
            idempotencyKey: "payout-key-pending",
          },
        },
      ),
    );
    expect(moneyServerMocks.readOwnerPayoutTransferServer).toHaveBeenCalledTimes(
      1,
    );
    expect(moneyServerMocks.createOwnerConnectAccountServer).not.toHaveBeenCalled();
    expect(moneyServerMocks.createOwnerOnboardingLinkServer).not.toHaveBeenCalled();
    await waitFor(() => expect(onStatusRefreshed).toHaveBeenCalledOnce());
  });
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

const pricingConfig: PricingConfig = {
  version: "pricing:v2",
  unit: "call",
  paidAmount: { currency: "AUD", units: "125", exponent: 2 },
};
const priceDigest = pricingConfigDigest(pricingConfig);
const sourceHash = `sha256:${"a".repeat(64)}`;
const sourceReadback: OwnerSupplyReadbackSource = {
  kind: "openapi_http",
  selector: { path: "/quote", method: "post" },
  revision: "source:one",
  digest: sourceHash,
};
const preparedPublication: PreparedPublicationMaterial = {
  sourceKind: "openapi_http",
  sourceSelector: { path: "/quote", method: "post" },
  sourceDescriptorJson: '{"openapi":"3.1.0"}',
  sourceRevision: "source:one",
  sourceDigest: sourceHash,
  documentJson: '{"openapi":"3.1.0"}',
  offering: {
    offeringId: "offering:one",
    networkId: "ae:public",
    presentation: {
      label: "Quote API",
      summary: "Returns a quote.",
      price: { kind: "fixed", amount: pricingConfig.paidAmount },
      materialTerms: [],
      commercialRelationship: {
        kind: "none",
        summary: "No commercial influence.",
        influencesEligibility: false,
        influencesInclusion: false,
        influencesOrder: false,
        evidenceRefs: ["evidence:commercial"],
      },
    },
    searchTerms: ["quote"],
    registrationEvidenceRefs: ["evidence:offering"],
  },
  binding: {
    bindingId: "binding:one",
    endpointUrl: "https://example.test/quote",
    authority: { kind: "keyless" },
    continuation: {
      kind: "single_response",
      evidenceRefs: ["evidence:continuation"],
    },
    cancellation: {
      kind: "unsupported",
      evidenceRefs: ["evidence:cancellation"],
    },
    adapter: {
      adapterId: "http-json:v1",
      config: { method: "POST", requestTimeoutMs: 5_000 },
    },
    registrationEvidenceRefs: ["evidence:binding"],
  },
  evidenceRefs: ["evidence:source"],
  pricingConfigJson: JSON.stringify(pricingConfig),
  priceDigest,
};
const openApiDocument = {
  openapi: "3.1.0",
  info: { title: "Quote API", version: "1.0.0" },
  servers: [{ url: "https://example.test" }],
  paths: {
    "/quote": {
      post: {
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { type: "object" } } },
          },
        },
      },
    },
  },
};
const sourceValue: SupplyEndpointConfigValue = {
  sourceKind: "openapi_http",
  sourceRevision: "source:one",
  contract: {
    contractFormat: "ae.capability-contract:v2",
    capabilityId: "demo.quote",
    version: 1,
    name: "Quote API",
    description: "Returns a quote.",
    customerAnnotations: [
      { document: "input", pointer: "/city", label: "City", role: "request" },
    ],
    dataUse: [],
    effects: [],
    evidence: [
      { evidenceId: "quote", outputPointer: "/quote", purpose: "completion" },
    ],
    lifecycle: { idempotency: "required", recovery: "retry_safe" },
  },
  commercial: {
    offering: preparedPublication.offering,
    bindingId: "binding:one",
  },
  evidenceRefs: ["evidence:source"],
  requestTimeoutMs: 5_000,
  authority: { kind: "keyless" },
  documentJson: JSON.stringify(openApiDocument),
  operation: { path: "/quote", method: "post" },
  fixedQuery: [],
};

const x402SourceValue: SupplyEndpointConfigValue = {
  sourceKind: "x402",
  sourceRevision: "source:x402",
  contract: sourceValue.contract,
  commercial: sourceValue.commercial,
  evidenceRefs: sourceValue.evidenceRefs,
  requestTimeoutMs: 5_000,
  authority: { kind: "keyless" },
  resourceJson: JSON.stringify({
    resourceUrl: "https://example.test/paid-quote",
    inputSchema: { type: "object", properties: {} },
    outputSchema: { type: "object", properties: { quote: { type: "number" } } },
    scheme: "exact",
    network: "eip155:8453",
    asset: "USDC",
    payTo: "0x0000000000000000000000000000000000000000",
  }),
};

function offeringAt(step: SupplyFunnelStep): OwnerSupplyOfferingReadback {
  const stepStates: Readonly<Record<SupplyFunnelStep, SupplyFunnelStepState>> =
    step === "describe"
      ? {
          describe: "in_progress",
          admission: "not_started",
          readiness: "not_started",
          test: "not_started",
        }
      : step === "admission"
        ? {
            describe: "completed",
            admission: "in_progress",
            readiness: "not_started",
            test: "not_started",
          }
        : step === "readiness"
          ? {
              describe: "completed",
              admission: "completed",
              readiness: "in_progress",
              test: "not_started",
            }
          : {
              describe: "completed",
              admission: "completed",
              readiness: "completed",
              test: "completed",
            };
  const common = {
    offeringRef: "offering:one",
    revision: 1,
    name: "Quote API",
    summary: "Returns a quote.",
    status: "draft",
    admission: { state: "not_admitted" },
    lifecycle: { state: "inactive", reasons: [] },
    readiness: { outcome: "unobserved", evidenceRefs: [] },
    live: { available: false, reason: "health_unobserved" },
    currentStep: step,
    stepStates,
    accessPaths: [],
  } satisfies OwnerSupplyOfferingReadback;
  if (step === "describe") return common;
  if (step === "admission")
    return {
      ...common,
      sourceHash,
      source: sourceReadback,
    };
  const publicationReadiness: NonNullable<
    OwnerSupplyOfferingReadback["publication"]
  >["readiness"] =
    step === "test"
      ? {
          outcome: "healthy",
          observedAt: 1_000,
          validUntil: 2_000,
          targetDigest: sourceHash,
          requestDigest: sourceHash,
          responseStatus: 200,
          responseContentType: "application/json",
          responseDigest: sourceHash,
          evidenceRefs: ["evidence:readiness"],
        }
      : { outcome: "unobserved", evidenceRefs: [] };
  const readiness: OwnerSupplyOfferingReadback["readiness"] =
    step === "test"
      ? {
          outcome: "healthy",
          observedAt: 1_000,
          validUntil: 2_000,
          evidenceRefs: ["evidence:readiness"],
        }
      : { outcome: "unobserved", evidenceRefs: [] };
  return {
    ...common,
    sourceHash,
    source: sourceReadback,
    admission: { state: "admitted" },
    pricing: { config: pricingConfig, priceDigest },
    authority: { mode: "provider_owned", kind: "keyless" },
    publication: {
      state: "current",
      publicationRef: "publication:one",
      publicationRevision: 1,
      operationRef: "operation:one",
      authorityMode: "provider_owned",
      contractRef: {
        capabilityId: "demo.quote",
        version: 1,
        contractDigest: "contract:one",
      },
      source: sourceReadback,
      pricing: { config: pricingConfig, priceDigest },
      binding: {
        bindingId: "binding:one",
        bindingDigest: sourceHash,
        endpointUrl: "https://example.test/quote",
        adapterId: "http-json:v1",
        admission: "admitted",
        conformance: "conformant",
        authority: { kind: "keyless" },
      },
      lifecycle: { state: "active", reasons: [] },
      readiness: publicationReadiness,
    },
    readiness,
    live:
      step === "test"
        ? { available: true }
        : { available: false, reason: "health_unobserved" },
  };
}

function x402OfferingAtTest(): OwnerSupplyOfferingReadback {
  const offering = offeringAt("test");
  if (offering.publication === undefined)
    throw new Error("x402_test_publication_missing");
  const source: OwnerSupplyReadbackSource = {
    kind: "x402",
    selector: { resourceUrl: "https://example.test/paid-quote" },
    revision: "source:x402",
    digest: sourceHash,
  };
  return {
    ...offering,
    source,
    authority: {
      mode: "provider_owned",
      kind: "provider_connection",
      providerRef: "provider:x402",
      authorityGeneration: 1,
      authorityDigest: sourceHash,
    },
    publication: {
      ...offering.publication,
      source,
      binding: {
        ...offering.publication.binding,
        endpointUrl: "https://example.test/paid-quote",
        adapterId: "x402-fetch:v2",
        authority: {
          kind: "provider_connection",
          providerRef: "provider:x402",
        },
      },
    },
  };
}

describe("owner operation control facts", () => {
  it("shows canonical operation, source, binding, pricing, readiness, and live readback", () => {
    render(<AeOwnerOperationFacts offering={offeringAt("test")} detail />);

    expect(screen.getByText("operation:one")).toBeDefined();
    expect(screen.getByText("publication:one · revision 1")).toBeDefined();
    expect(screen.getByText("binding:one")).toBeDefined();
    expect(screen.getByText("https://example.test/quote")).toBeDefined();
    expect(screen.getByText(`openapi_http · source:one`)).toBeDefined();
    expect(screen.getAllByText(sourceHash).length).toBeGreaterThan(0);
    expect(screen.getByText("pricing:v2 · call")).toBeDefined();
    expect(screen.getByText("AUD 1.25 · units 125 · exponent 2")).toBeDefined();
    expect(screen.getByText(priceDigest)).toBeDefined();
    expect(screen.getByText("evidence:readiness")).toBeDefined();
    expect(screen.getByText("available")).toBeDefined();
    expect(screen.queryByText(/credential|secret|token/i)).toBeNull();
  });
});

function renderWithRouter(ui: ReactElement) {
  const rootRoute = createRootRoute();
  const claimRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/claim",
  });
  const ownerSupplyRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/owner/supply",
  });
  const routeTree = rootRoute.addChildren([claimRoute, ownerSupplyRoute]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/claim"] }),
  });
  return render(
    <RouterContextProvider router={router}>{ui}</RouterContextProvider>,
  );
}
