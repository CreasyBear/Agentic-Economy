import {
  amount,
  committedQuote,
  controlToolRef,
  publicBusinessDetailResponse,
  linkedService,
  publicToolDescribeResponse,
  publicToolSearchResponse,
  tool,
  toolRef,
  observedAt,
  serviceFetch,
  servicePage,
  strictReceipt,
} from "./tool-gateway-production-smoke-harness";
import { describe, expect, it } from "vitest";
import { canonicalDigest } from "../../../src/modules/common/canonical-digest";

import { GatewayProductionSmokeReceiptSchema } from "../../../tools/release/tool-gateway-production-smoke";
import {
  discoverGatewayServices,
  discoverTool,
  gatewayToolRejectionReason,
  matchGatewayServiceTool,
} from "../../../tools/release/tool-gateway-production-smoke-discovery";

function selectedTool() {
  return {
    toolRef,
    businessId: "business:provider",
    offeringRef: tool.listing.listingRef,
    search: publicToolSearchResponse().items[0]!,
    description: publicToolDescribeResponse().tool,
    quote: committedQuote(),
    authorityMode: "provider_owned" as const,
  };
}

describe("hosted Tool gateway smoke discovery", () => {
  it("discovers canonical service identity across bounded cursor pages", async () => {
    const { config, urls } = serviceFetch([
      servicePage(
        [linkedService("service:owner", toolRef)],
        false,
        "cursor:1",
      ),
      servicePage(
        [
          linkedService("service:control", controlToolRef, {
            kind: "platform_credential",
            scheme: "bearer",
          }),
        ],
        true,
      ),
    ]);
    const discovered = await discoverGatewayServices(config);
    expect(discovered.serviceCount).toBe(2);
    expect(discovered.endpointCount).toBe(2);
    expect(discovered.tools.get(toolRef)).toEqual({
      serviceId: "service:owner",
      offeringRef: tool.listing.listingRef,
      authentication: { kind: "ae_api_key" },
      authorityMode: "provider_owned",
    });
    expect(discovered.tools.get(controlToolRef)?.serviceId).toBe(
      "service:control",
    );
    expect(urls).toEqual([
      "https://gateway.example/api/v1/businesses?limit=50",
      "https://gateway.example/api/v1/businesses?limit=50&cursor=cursor%3A1",
    ]);
  });

  it("searches and describes the current Tool routes before selecting a candidate", async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    const fetch: typeof globalThis.fetch = async (input, init) => {
      const url = String(input);
      const body = init?.body === undefined ? undefined : JSON.parse(String(init.body));
      requests.push({ url, body });
      if (url.endsWith("/api/v1/market-tools/search")) {
        return Response.json(publicToolSearchResponse("paid"));
      }
      if (url.endsWith("/api/v1/market-tools/describe"))
        return Response.json(publicToolDescribeResponse());
      if (url.endsWith("/api/businesses/provider"))
        return Response.json(publicBusinessDetailResponse());
      return Response.json(committedQuote());
    };

    const services = {
      tools: new Map([
        [
          toolRef,
          {
            serviceId: "service:owner",
            offeringRef: tool.listing.listingRef,
            authentication: { kind: "ae_api_key" as const },
            authorityMode: "provider_owned" as const,
          },
        ],
      ]),
      serviceCount: 1,
      endpointCount: 1,
    };
    const discovered = await discoverTool(
      {
        baseUrl: "https://gateway.example",
        apiKey: "run-key",
        input: { city: "Perth" },
        fetch,
      },
      "paid",
      observedAt,
      "owner",
      services,
    );
    expect(discovered).toMatchObject({
      toolRef,
      businessId: "business:provider",
      offeringRef: tool.listing.listingRef,
      quote: { quoteRef: committedQuote().quoteRef },
    });
    expect(requests).toEqual([
      {
        url: "https://gateway.example/api/v1/market-tools/search",
        body: { query: "paid", limit: 20 },
      },
      {
        url: "https://gateway.example/api/v1/market-tools/describe",
        body: { toolRef },
      },
      {
        url: "https://gateway.example/api/businesses/provider",
        body: undefined,
      },
      {
        url: "https://gateway.example/api/v1/tools/quote",
        body: { toolRef, input: { city: "Perth" } },
      },
    ]);
  });

  it("fails closed for missing linkage and endpoint/detail authentication mismatch", () => {
    const missing = {
      tools: new Map(),
      serviceCount: 0,
      endpointCount: 0,
    };
    const selected = selectedTool();
    expect(() =>
      matchGatewayServiceTool(missing, selected, "owner"),
    ).toThrow("tool_service_link_missing");
    const mismatched = {
      tools: new Map([
        [
          toolRef,
          {
            serviceId: "service:owner",
            offeringRef: tool.listing.listingRef,
            authentication: {
              kind: "platform_credential" as const,
              scheme: "bearer" as const,
            },
            authorityMode: "provider_owned" as const,
          },
        ],
      ]),
      serviceCount: 1,
      endpointCount: 1,
    };
    expect(() =>
      matchGatewayServiceTool(mismatched, selected, "owner"),
    ).toThrow("service_authentication_mismatch");
  });

  it("requires owner keyless, paid control authentication, and distinct service identities", () => {
    const selected = selectedTool();
    const ownerKeyed = {
      ...selected,
      description: {
        ...selected.description,
        authentication: {
          kind: "platform_credential" as const,
          scheme: "bearer" as const,
        },
      },
    };
    const ownerKeyedDiscovery = {
      tools: new Map([
        [
          toolRef,
          {
            serviceId: "service:owner",
            offeringRef: tool.listing.listingRef,
            authentication: ownerKeyed.description.authentication,
            authorityMode: "provider_owned" as const,
          },
        ],
      ]),
      serviceCount: 1,
      endpointCount: 1,
    };
    expect(() =>
      matchGatewayServiceTool(ownerKeyedDiscovery, ownerKeyed, "owner"),
    ).toThrow("gateway_smoke_owner_tool_not_brokered");
    const controlKeylessDiscovery = {
      tools: new Map([
        [
          toolRef,
          {
            serviceId: "service:control",
            offeringRef: tool.listing.listingRef,
            authentication: { kind: "ae_api_key" as const },
            authorityMode: "provider_owned" as const,
          },
        ],
      ]),
      serviceCount: 1,
      endpointCount: 1,
    };
    expect(() =>
      matchGatewayServiceTool(
        controlKeylessDiscovery,
        selected,
        "control",
      ),
    ).toThrow("control_tool_authentication_unsupported");
    const { receiptDigest: _receiptDigest, ...material } = strictReceipt();
    const collided = {
      ...material,
      discovery: {
        ...material.discovery,
        controlServiceId: material.discovery.ownerServiceId,
      },
    };
    expect(() =>
      GatewayProductionSmokeReceiptSchema.parse({
        ...collided,
        receiptDigest: canonicalDigest(collided),
      }),
    ).toThrow("identities collide");
  });

  it("stops after the hard Services page cap", async () => {
    const { config } = serviceFetch(
      Array.from({ length: 100 }, (_, index) =>
        servicePage([], false, `cursor:${index}`),
      ),
    );
    await expect(discoverGatewayServices(config)).rejects.toThrow(
      "services_page_limit_exceeded",
    );
  });
  it("selects a current provider-owned paid fixed-price Tool at runtime", () => {
    const selected = selectedTool();
    expect(
      gatewayToolRejectionReason(
        {
          ...selected,
          quote: {
            ...selected.quote,
            price: { ...amount, units: "0" },
          },
        },
        observedAt,
      ),
    ).toBe("gateway_smoke_candidate_free");
    expect(
      gatewayToolRejectionReason(selected, observedAt),
    ).toBeUndefined();
  });
});
