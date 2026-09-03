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
import type { OperationCardViewModel } from "@/modules/market/operation-view-model";
import {
  pricingConfigDigest,
  type PricingConfig,
} from "@/modules/money/public";
import type { SupplyEndpointConfigValue } from "@/components/ae/supply/AeSupplyEndpointConfigStep";

export const moneyServerMocks = {
  beginOwnerPayoutTransferServer: vi.fn(),
  createOwnerConnectAccountServer: vi.fn(),
  createOwnerOnboardingLinkServer: vi.fn(),
  readOwnerPayoutTransferServer: vi.fn(),
};

vi.mock("@/modules/money/money.functions", () => moneyServerMocks);
vi.mock("@clerk/tanstack-react-start", () => ({
  useReverification: <T extends (...args: never[]) => unknown>(callback: T) => callback,
}));
vi.mock("@tanstack/react-start", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-start")>()),
  useServerFn: <T extends (...args: never[]) => unknown>(callback: T) => callback,
}));

export const tool: SupplyLandingTool = {
  id: "registry.services_list",
  name: "List published services",
  summary: "Read published services.",
  boundaries: ["Read-only."],
};
export const operation: OperationCardViewModel = {
  operationRef: `operation:v1:${"a".repeat(64)}`,
  title: "Quote API",
  supplierName: "Example Labs",
  supplierSlug: "example-labs",
  supplierInitials: "EL",
  capabilityId: "demo.quote",
  capability: "Quote API",
  category: { id: "data-research", label: "Data", description: "Data tools" },
  summary: "Returns a quote.",
  readiness: "Routeable",
  readinessLabel: "Ready now",
  trustFact: "Ready to run through Agentic Economy",
  price: "AUD 0.00",
  authentication: "None",
  lastVerifiedAt: 1,
  callLabel: "Use capability",
  rating: { kind: "unrated", count: 0, display: "No ratings yet", definition: "No rating" },
  popularity: { kind: "no_activity", completedInvocations: 0, display: "No completed calls yet", definition: "No calls" },
  latency: { kind: "insufficient_sample", sampleSize: 0, minimumSampleSize: 5, display: "Not enough data", definition: "No sample" },
};

export const pricingConfig: PricingConfig = {
  version: "pricing:v3",
  kind: "fixed_aud",
  currency: "AUD",
  exponent: 6,
  amountUnits: "1250000",
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
      price: { kind: "fixed", amount: { currency: "AUD", units: pricingConfig.kind === "fixed_aud" ? pricingConfig.amountUnits : "0", exponent: 6 } },
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
    authority: { kind: "public_upstream" },
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
  authority: { kind: "public_upstream" },
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
  authority: { kind: "public_upstream" },
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
    managementStatus: "Validating",
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
    managementStatus: step === "test" ? "Live" : "Validating",
    sourceHash,
    source: sourceReadback,
    admission: { state: "admitted" },
    pricing: { config: pricingConfig, priceDigest },
    authority: { mode: "provider_owned", kind: "public_upstream" },
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
        authority: { kind: "public_upstream" },
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
  const payTo = "0x1111111111111111111111111111111111111111";
  const endpointUrl = "https://example.test/paid-quote";
  const paymentRequiredJson = JSON.stringify({
    x402Version: 2,
    resource: { url: endpointUrl },
    accepts: [{
      scheme: "exact",
      network: "eip155:84532",
      amount: "10000",
      asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      payTo,
      maxTimeoutSeconds: 60,
      extra: {
        name: "USD Coin",
        version: "2",
        assetTransferMethod: "eip3009",
      },
    }],
  });
  const canaryPricing: PricingConfig = {
    version: "pricing:v3",
    kind: "managed_x402",
    effectTiming: "payment_required_before_effect",
    sourceRequirement: {
      network: "eip155:84532",
      asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      atomicUnits: "10000",
    },
    pricingPolicyRef: "pricing-policy:sandbox-managed-x402:v1",
    publicDisplay: "on_request",
  };
  return {
    ...offering,
    sourceMaterial: {
      ...preparedPublication,
      sourceKind: "x402",
      sourceSelector: { resourceUrl: endpointUrl },
      pricingConfigJson: JSON.stringify(canaryPricing),
      priceDigest: pricingConfigDigest(canaryPricing),
      binding: {
        ...preparedPublication.binding,
        endpointUrl,
        adapter: {
          adapterId: "x402-fetch:v2",
          config: {
            method: "POST",
            requestTimeoutMs: 5_000,
            scheme: "exact",
            network: "eip155:84532",
            currency: "USD",
            routeAmountExponent: 2,
            assetAmountExponent: 6,
            asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
            payTo,
            paymentRequiredJson,
          },
        },
      },
    },
    source,
    authority: {
      mode: "provider_owned",
      kind: "provider_connection",
      connectionRef: "connection:x402",
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
          connectionRef: "connection:x402",
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
