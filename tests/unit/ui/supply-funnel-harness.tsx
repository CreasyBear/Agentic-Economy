import { cleanup, render } from "@testing-library/react";
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { ReactElement } from "react";
import { afterEach, beforeEach, vi } from "vitest";
import "../../setup/jsdom-platform";
import "../../setup/jsdom-dialog";

import type { PreparedPublicationMaterial } from "@/modules/capability-supply/internal/publication";
import type {
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
import type { SupplyEndpointConfigValue } from "@/components/ae/supply/AeSupplyEndpointConfigStep";

export const moneyServerMocks = {
  createOwnerConnectAccountServer: vi.fn(),
  createOwnerOnboardingLinkServer: vi.fn(),
  readOwnerPayoutTransferServer: vi.fn(),
};

vi.mock("@/modules/money/server", () => moneyServerMocks);

export const tool: SupplyLandingTool = {
  id: "registry.services_list",
  name: "List published services",
  summary: "Read published services.",
  boundaries: ["Read-only."],
};
export const service: ServiceDto = {
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

export const pricingConfig: PricingConfig = {
  version: "pricing:v2",
  unit: "call",
  paidAmount: { currency: "AUD", units: "125", exponent: 2 },
};
export const priceDigest = pricingConfigDigest(pricingConfig);
export const sourceHash = `sha256:${"a".repeat(64)}`;
export const sourceReadback: OwnerSupplyReadbackSource = {
  kind: "openapi_http",
  selector: { path: "/quote", method: "post" },
  revision: "source:one",
  digest: sourceHash,
};
export const preparedPublication: PreparedPublicationMaterial = {
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
export const openApiDocument = {
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
export const sourceValue: SupplyEndpointConfigValue = {
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

export const x402SourceValue: SupplyEndpointConfigValue = {
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

export function offeringAt(step: SupplyFunnelStep): OwnerSupplyOfferingReadback {
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

export function x402OfferingAtTest(): OwnerSupplyOfferingReadback {
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

export function renderWithRouter(ui: ReactElement) {
  const rootRoute = createRootRoute();
  const providerRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/for-providers",
  });
  const ownerSupplyRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/owner/supply",
  });
  const routeTree = rootRoute.addChildren([providerRoute, ownerSupplyRoute]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/for-providers"] }),
  });
  return render(
    <RouterContextProvider router={router}>{ui}</RouterContextProvider>,
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});
