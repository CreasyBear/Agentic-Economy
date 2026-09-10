import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as ConvexSourceModule from "@/lib/server/convex-source";
import type * as TanstackReactStartModule from "@tanstack/react-start";

const sourceMocks = vi.hoisted(() => ({
  callSourceQuery: vi.fn(),
  startOwnerSupplySourceConnection: vi.fn(),
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
vi.mock("@/modules/capability-supply/source-first-owner", async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/capability-supply/source-first-owner')>()),
  startOwnerSupplySourceConnection: sourceMocks.startOwnerSupplySourceConnection,
}));

import {
  filterOwnerSupplyAuthorityOptions,
  readOwnerProviderConnectionsServer,
  startOwnerSupplySourceConnectionServer,
} from "@/modules/capability-supply/supply-funnel.functions";

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

describe("Package 5 owner connection rollout", () => {
  it("does not reserve a static-credential ceremony when production rollout is disabled", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AE_PACKAGE5_WRITES_ENABLED", "true");
    vi.stubEnv("AE_SUPPLY_HTTP_CREDENTIALS_ENABLED", undefined);
    sourceMocks.callSourceQuery.mockReset();

    const result = await startOwnerSupplySourceConnectionServer({
      data: {
        businessId: "business:one",
        source: {
          kind: "openapi",
          definitionUrl: "https://provider.example/openapi.yaml",
          environment: "production",
        },
        expectedSourceDigest: `sha256:${"1".repeat(64)}`,
        candidateRef: `sha256:${"2".repeat(64)}`,
        idempotencyKey: "provider-static-disabled",
      },
    });

    expect(result).toMatchObject({
      kind: "action_required",
      requiredAction: {
        blockedCapabilities: ["supply.publish"],
        cta: "/owner/offerings",
      },
    });
    expect(sourceMocks.callSourceQuery).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("lets supported x402 follow its own guards while static HTTP credentials remain disabled", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AE_PACKAGE5_WRITES_ENABLED", "true");
    vi.stubEnv("AE_SUPPLY_HTTP_CREDENTIALS_ENABLED", undefined);
    sourceMocks.startOwnerSupplySourceConnection.mockResolvedValue({
      kind: "action_required",
      requiredAction: {
        action: "supply.source.preview",
        blockedCapabilities: ["supply.publish"],
        cta: "/owner/offerings?connect=x402",
        ctaLabel: "Connect service",
        description: "Inspect the exact x402 lane.",
        iconUrl: null,
        status: "required",
        title: "Connect service",
      },
    });

    const result = await startOwnerSupplySourceConnectionServer({
      data: {
        businessId: "business:one",
        source: {
          kind: "x402",
          resourceUrl: "https://provider.example/paid",
          method: "POST",
          environment: "sandbox",
        },
        expectedSourceDigest: `sha256:${"1".repeat(64)}`,
        candidateRef: `sha256:${"2".repeat(64)}`,
        idempotencyKey: "x402-source-enabled",
      },
    });

    expect(result).toMatchObject({ kind: "action_required", requiredAction: { title: "Connect service" } });
    expect(sourceMocks.startOwnerSupplySourceConnection).toHaveBeenCalledTimes(1);
    vi.unstubAllEnvs();
  });
});
