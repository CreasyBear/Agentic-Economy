import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as ConvexSourceModule from "@/lib/server/convex-source";
import type * as TanstackReactStartModule from "@tanstack/react-start";

const sourceMocks = vi.hoisted(() => ({
  callSourceQuery: vi.fn(),
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
}));

import {
  defaultSupplyPricingConfig,
  realPricingConfigPort,
  stubPricingConfigPort,
} from "@/modules/capability-supply/internal/supply-funnel/pricing-port";
import {
  filterOwnerSupplyAuthorityOptions,
  readOwnerProviderConnectionsServer,
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
      amountUnits: "100",
    };
    expect(stubPricingConfigPort.normalize(config)).toEqual({
      kind: "refused",
      reason: "price_unavailable",
    });
  });

  it("shows deterministic gross, fee, and provider net through the real port", () => {
    const config = {
      ...defaultSupplyPricingConfig,
      amountUnits: "100",
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
          grossAmount: { currency: "AUD", units: "100", exponent: 6 },
          feeAmount: { currency: "AUD", units: "10", exponent: 6 },
          providerNetAmount: { currency: "AUD", units: "90", exponent: 6 },
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
});
