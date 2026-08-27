import { beforeEach, describe, expect, it, vi } from "vitest";
import { withSourceWrite } from "../../helpers/source-write-admission";
import type * as ConvexSourceModule from "@/lib/server/convex-source";
import type * as PublicationModule from "@/modules/capability-supply/internal/publication";
import type * as SourceWriteAdmissionModule from "@/lib/server/source-write-admission";
import type * as TanstackReactStartModule from "@tanstack/react-start";

const sourceMocks = vi.hoisted(() => ({
  callSourceQuery: vi.fn(),
  callSourceMutation: vi.fn(),
  sourceWriteAdmissionFromContext: vi.fn(),
  preparePublicationDraft: vi.fn(),
}));

vi.mock("@tanstack/react-start", async (importOriginal) => ({
  ...(await importOriginal<typeof TanstackReactStartModule>()),
  createServerFn: () => ({
    validator: () => ({ handler: (handler: unknown) => handler }),
    handler: (handler: unknown) => handler,
  }),
}));
vi.mock("@/lib/server/convex-source", async (importOriginal) => ({
  ...(await importOriginal<typeof ConvexSourceModule>()),
  callSourceQuery: sourceMocks.callSourceQuery,
  callSourceMutation: sourceMocks.callSourceMutation,
}));
vi.mock("@/lib/server/source-write-admission", async (importOriginal) => ({
  ...(await importOriginal<typeof SourceWriteAdmissionModule>()),
  sourceWriteAdmissionFromContext: sourceMocks.sourceWriteAdmissionFromContext,
}));
vi.mock(
  "@/modules/capability-supply/internal/publication",
  async (importOriginal) => ({
    ...(await importOriginal<typeof PublicationModule>()),
    preparePublicationDraft: sourceMocks.preparePublicationDraft,
  }),
);

import {
  defaultSupplyPricingConfig,
  realPricingConfigPort,
  stubPricingConfigPort,
} from "@/modules/capability-supply/internal/supply-funnel/pricing-port";
import {
  admitOwnerCapabilityServer,
  preflightOwnerCapabilityServer,
  filterOwnerSupplyAuthorityOptions,
  readOwnerProviderConnectionsServer,
  readOwnerSupplyFunnelServer,
  resolveSupplyPricing,
} from "@/modules/capability-supply/supply-funnel.functions";

describe("supply funnel pricing", () => {
  it("uses the zero-price call default", () => {
    const result = resolveSupplyPricing(defaultSupplyPricingConfig);
    expect(result.kind).toBe("ready");
    if (result.kind === "ready")
      expect(result.preview.resolution).toMatchObject({
        kind: "free",
        reason: "zero_price",
      });
  });

  it("refuses paid pricing through the named stub seam", () => {
    const config = {
      ...defaultSupplyPricingConfig,
      paidAmount: { ...defaultSupplyPricingConfig.paidAmount, units: "100" },
    };
    expect(stubPricingConfigPort.normalize(config)).toEqual({
      kind: "refused",
      reason: "price_unavailable",
    });
  });

  it("shows deterministic gross, fee, and provider net through the real port", () => {
    const config = {
      ...defaultSupplyPricingConfig,
      paidAmount: { ...defaultSupplyPricingConfig.paidAmount, units: "100" },
    };
    const normalized = realPricingConfigPort.normalize(config);
    expect(normalized.kind).toBe("valid");
    if (normalized.kind === "valid") {
      const resolved = realPricingConfigPort.resolve({
        config: normalized.config,
        freeCallsUsed: 0,
      });
      expect(resolved).toMatchObject({
        kind: "ready",
        preview: {
          grossAmount: { currency: "AUD", units: "100", exponent: 2 },
          feeAmount: { currency: "AUD", units: "10", exponent: 2 },
          providerNetAmount: { currency: "AUD", units: "90", exponent: 2 },
        },
      });
    }
  });
});

describe("owner supply authority options", () => {
  it("keeps non-secret x402 and configured keyed authorities in the owner business", () => {
    const x402 = {
      connectionRef: "connection:x402",
      businessId: "business:owner",
      providerRef: "provider:x402",
      adapterId: "x402-fetch:v2",
      credentialConfigured: false,
      available: true,
      lifecycle: "active",
    };
    const configuredKeyed = {
      connectionRef: "connection:http",
      businessId: "business:owner",
      providerRef: "provider:http",
      adapterId: "http-json:v1",
      credentialConfigured: true,
      available: false,
      lifecycle: "revoked",
    };

    const result = filterOwnerSupplyAuthorityOptions("business:owner", [
      x402,
      configuredKeyed,
      {
        ...x402,
        connectionRef: "connection:other-business",
        businessId: "business:other",
      },
      {
        ...configuredKeyed,
        connectionRef: "connection:missing-credential",
        credentialConfigured: false,
      },
    ]);

    expect(result).toEqual([x402, configuredKeyed]);
  });
});

describe("owner supply source read failures", () => {
  beforeEach(() => {
    sourceMocks.callSourceQuery.mockReset();
  });

  it("rejects provider-connection reads with safe copy instead of an empty projection", async () => {
    const backendDetails = "convex backend secret details";
    sourceMocks.callSourceQuery.mockRejectedValue(new Error(backendDetails));

    const result = await readOwnerProviderConnectionsServer().then(
      (value) => ({ kind: "resolved" as const, value }),
      (error: unknown) => ({ kind: "rejected" as const, error }),
    );

    expect(result.kind).toBe("rejected");
    if (result.kind === "rejected") {
      expect(result.error).toBeInstanceOf(Error);
      if (result.error instanceof Error) {
        expect(result.error.message).toBe(
          "Owner supply is temporarily unavailable. Try again.",
        );
        expect(result.error.message).not.toContain(backendDetails);
      }
    }
  });

  it("returns safe copy for owner supply read failures without backend details", async () => {
    const backendDetails = "convex backend secret details";
    sourceMocks.callSourceQuery.mockRejectedValue(new Error(backendDetails));

    await expect(
      readOwnerSupplyFunnelServer({ data: { businessId: "business:owner" } }),
    ).resolves.toEqual({
      kind: "error",
      code: "source_unavailable",
      reason: "Owner supply is temporarily unavailable. Try again.",
    });
  });
  it("preserves a bounded incomplete readback for owner repair UI", async () => {
    sourceMocks.callSourceQuery.mockResolvedValue({ kind: "incomplete" });

    await expect(
      readOwnerSupplyFunnelServer({ data: { businessId: "business:owner" } }),
    ).resolves.toEqual({ kind: "incomplete" });
  });
});
const OWNER_BUSINESS_ID = "business:owner";
const OWNER_OFFERING_REF = "catalog-offering:owner";
const OWNER_OFFERING_SOURCE_HASH = `sha256:${"b".repeat(64)}`;
const OWNER_SOURCE = {
  kind: "openapi_http",
  sourceRevision: "owner-api/2026-08-09",
  document: {
    openapi: "3.1.0",
    info: { title: "Owner API", version: "1" },
    servers: [{ url: "https://provider.example" }],
    paths: {},
  },
  operation: { path: "/lookup", method: "post" },
  fixedQuery: [],
  contract: {
    capabilityId: "owner.lookup",
    version: 1,
    name: "Owner lookup",
    description: "Returns one owner-provided result.",
    customerAnnotations: [
      {
        annotationId: "result",
        document: "output",
        pointer: "/result",
        label: "Result",
        role: "completion_evidence",
      },
    ],
    dataUse: [],
    effects: [],
    evidence: [
      { evidenceId: "result", outputPointer: "/result", purpose: "completion" },
    ],
    lifecycle: { idempotency: "required", recovery: "retry_safe" },
  },
  commercial: {
    offering: {
      offeringId: "offering:owner",
      networkId: "ae:public",
      origin: { kind: "standalone" },
      presentation: {
        label: "Owner lookup",
        summary: "Returns one owner-provided result.",
        price: {
          kind: "fixed",
          amount: { currency: "AUD", units: "100", exponent: 2 },
        },
        materialTerms: [],
        commercialRelationship: {
          kind: "none",
          summary: "No commercial influence.",
          influencesEligibility: false,
          influencesInclusion: false,
          influencesOrder: false,
          evidenceRefs: ["commercial:none"],
        },
      },
      searchTerms: ["owner", "lookup"],
      registrationEvidenceRefs: ["registration:owner"],
    },
    bindingId: "binding:owner",
    authority: { kind: "public_upstream" },
    registrationEvidenceRefs: ["registration:owner"],
    requestTimeoutMs: 5_000,
  },
  evidenceRefs: ["source:owner"],
};
const OWNER_PREPARED_SOURCE_DIGEST = `sha256:${"b".repeat(64)}`;
const OWNER_PRICE_DIGEST = `sha256:${"c".repeat(64)}`;
const OWNER_PREPARED = {
  sourceKind: "openapi_http",
  sourceRevision: OWNER_SOURCE.sourceRevision,
  sourceDigest: OWNER_PREPARED_SOURCE_DIGEST,
  priceDigest: OWNER_PRICE_DIGEST,
  sourceSelector: { path: "/lookup", method: "post" },
  evidenceRefs: ["source:owner"],
};
const OWNER_SUPPLY = {
  kind: "available",
  businessId: OWNER_BUSINESS_ID,
  business: { name: "Owner", slug: "owner" },
  offerings: [
    {
      offeringRef: OWNER_OFFERING_REF,
      revision: 1,
      sourceHash: OWNER_OFFERING_SOURCE_HASH,
      accessPaths: [
        {
          accessPathRef: "access-path:owner",
          offeringSourceHash: OWNER_OFFERING_SOURCE_HASH,
          sourceHash: OWNER_OFFERING_SOURCE_HASH,
          status: "published",
          descriptor: {
            kind: "external_operation",
            url: "https://provider.example/lookup",
            method: "POST",
          },
        },
      ],
    },
  ],
  activityTruncated: false,
  callLog: [],
  liquidity: {
    fillCount: 0,
    zeroCount: 0,
    depthSamples: 0,
    environment: "development",
  },
};
const OWNER_PUBLISHED = {
  kind: "published",
  publicationRef: "publication:owner",
  publicationRevision: 1,
  operationRef: "operation:owner",
};
const ownerAdmissionData = {
  businessId: OWNER_BUSINESS_ID,
  offeringRef: OWNER_OFFERING_REF,
  offeringRevision: 1,
  offeringSourceHash: OWNER_OFFERING_SOURCE_HASH,
  source: OWNER_SOURCE,
  operationKey: "owner-admission",
  correlationId: "owner-correlation",
  reasonCode: "owner_supply_admission",
  evidenceRefs: ["owner-supply:funnel"],
};

describe("owner admission in-memory source proof", () => {
  beforeEach(() => {
    sourceMocks.callSourceQuery.mockReset();
    sourceMocks.callSourceMutation.mockReset();
    sourceMocks.sourceWriteAdmissionFromContext.mockReset();
    sourceMocks.preparePublicationDraft.mockReset();
    sourceMocks.sourceWriteAdmissionFromContext.mockImplementation(
      async ({
        command,
      }: {
        command: { operationKey: string; correlationId: string };
      }) => (await withSourceWrite("catalog_publish", command)).sourceWrite,
    );
    sourceMocks.callSourceMutation.mockResolvedValue(OWNER_PUBLISHED);
    sourceMocks.preparePublicationDraft.mockResolvedValue({
      kind: "prepared",
      prepared: OWNER_PREPARED,
    });
  });

  it("publishes prepared material from the in-memory source", async () => {
    sourceMocks.callSourceQuery.mockResolvedValueOnce(OWNER_SUPPLY);
    await expect(
      admitOwnerCapabilityServer({ data: ownerAdmissionData }),
    ).resolves.toEqual(OWNER_PUBLISHED);
    expect(sourceMocks.callSourceMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        prepared: OWNER_PREPARED,
        offeringRef: OWNER_OFFERING_REF,
        revision: 1,
        sourceWrite: expect.objectContaining({ version: "source-write:v2" }),
        sourceWriteRequest: {
          method: "POST",
          initiatorOrigin: "https://ae.example",
          targetOrigin: "https://ae.example",
          targetPath: "/__test/source-write",
          targetQuery: "",
          bodyDigest: expect.any(String),
        },
      }),
    );
    expect(
      sourceMocks.callSourceMutation.mock.calls[0]?.[1],
    ).not.toHaveProperty("sourceDraftRevision");
    expect(
      sourceMocks.callSourceMutation.mock.calls[0]?.[1],
    ).not.toHaveProperty("sourceDigest");
  });

  it("preflights the in-memory source without recording a draft", async () => {
    sourceMocks.callSourceQuery.mockResolvedValueOnce(OWNER_SUPPLY);
    await expect(
      preflightOwnerCapabilityServer({
        data: {
          businessId: OWNER_BUSINESS_ID,
          offeringRef: OWNER_OFFERING_REF,
          offeringRevision: 1,
          source: OWNER_SOURCE,
          evidenceRefs: ["owner-supply:funnel"],
        },
      }),
    ).resolves.toMatchObject({ kind: "prepared", prepared: OWNER_PREPARED });
    expect(sourceMocks.callSourceMutation).not.toHaveBeenCalled();
  });

  it("propagates a publish backend failure instead of relabelling it authorization_denied", async () => {
    const backendFailure = new Error("convex publish unavailable");
    sourceMocks.callSourceQuery.mockResolvedValueOnce(OWNER_SUPPLY);
    sourceMocks.callSourceMutation.mockRejectedValueOnce(backendFailure);
    await expect(
      admitOwnerCapabilityServer({ data: ownerAdmissionData }),
    ).rejects.toBe(backendFailure);
  });
});
