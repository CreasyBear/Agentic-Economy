import { describe, expect, it } from "vitest";

import timezonePin from "../../../src/modules/capability-supply/internal/x402-bazaar-fixtures/timezone-payment-required-2026-08-19.json";
import syntheticPost from "../../../src/modules/capability-supply/internal/x402-bazaar-fixtures/synthetic-post-payment-required.json";
import {
  admitFacilitatorDiscoveryItems,
  decideFacilitatorDiscoveryItem,
  FACILITATOR_DISCOVERY_URLS,
  isAllowlistedFacilitatorDiscoveryUrl,
  parseFacilitatorDiscoveryPage,
} from "@/modules/capability-supply/internal/facilitator-discovery-ingest";
import { isRecord } from "@/modules/common/is-record";

const timezonePaymentRequired = isRecord(timezonePin.paymentRequired)
  ? timezonePin.paymentRequired
  : undefined;

const noBazaarItem = {
  x402Version: 2,
  resource: { url: "https://example.test/no-bazaar" },
  accepts: [
    {
      scheme: "exact",
      network: "eip155:8453",
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      payTo: "0xbA667287B8Ef89565F8fD7AcD4d22Ce98E0f39cd",
      amount: "1000",
    },
  ],
};

const mcpItem = {
  x402Version: 2,
  resource: { url: "https://mcp.example.test/mcp" },
  accepts: noBazaarItem.accepts,
  extensions: {
    bazaar: {
      info: {
        input: { type: "mcp" },
        output: {},
      },
      schema: {
        input: { type: "object" },
        output: { type: "object" },
      },
    },
  },
};

const mainnetSyntheticPost = {
  ...syntheticPost,
  accepts: syntheticPost.accepts.map((accept) => ({
    ...accept,
    network: "eip155:8453",
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    amount: "100",
  })),
};

describe("facilitator discovery ingest", () => {
  it("allowlists PayAI and CDP REST catalogs only", () => {
    expect(FACILITATOR_DISCOVERY_URLS).toEqual([
      "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources",
      "https://facilitator.payai.network/discovery/resources",
    ]);
    expect(
      isAllowlistedFacilitatorDiscoveryUrl(
        "https://facilitator.payai.network/discovery/resources",
      ),
    ).toBe(true);
    expect(
      isAllowlistedFacilitatorDiscoveryUrl(
        "https://x402.org/facilitator/discovery/resources",
      ),
    ).toBe(false);
  });

  it("skips missing bazaar and MCP instead of falling back to AM parameters", () => {
    expect(decideFacilitatorDiscoveryItem(noBazaarItem)).toEqual({
      kind: "skip",
      reason: "bazaar_missing",
    });
    const mcp = decideFacilitatorDiscoveryItem(mcpItem);
    expect(mcp.kind).toBe("skip");
    if (mcp.kind !== "skip") throw new Error("expected skip");
    expect(["transport_unsupported", "source_invalid", "bazaar_discovery_invalid"]).toContain(mcp.reason);
    const testnet = decideFacilitatorDiscoveryItem(syntheticPost);
    expect(testnet).toEqual({ kind: "skip", reason: "chain_unsupported" });
  });

  it("admits at least two recorded bazaar resources through importX402Capability", async () => {
    expect(timezonePaymentRequired).toBeDefined();
    const page = parseFacilitatorDiscoveryPage({
      items: [timezonePaymentRequired, mainnetSyntheticPost, noBazaarItem, mcpItem],
    });
    expect(page?.items).toHaveLength(4);
    const result = await admitFacilitatorDiscoveryItems(page!.items);
    expect(result.admitted).toHaveLength(2);
    expect(result.skipped.length).toBeGreaterThanOrEqual(2);
    const urls = result.admitted.map(
      (draft) => draft.execution.endpoint.url,
    );
    expect(urls).toEqual([
      "https://402timezones.vercel.app/api/convert-timezone",
      "https://api.example.test/lookup",
    ]);
    expect(new Set(result.admitted.map((draft) => draft.contract.capabilityId)).size).toBe(
      2,
    );
    expect(result.admitted[1]?.price).toMatchObject({
      provider: { units: "100", exponent: 6 },
      platformFee: { units: "10", exponent: 6 },
      total: { units: "110", exponent: 6 },
    });
  });

  it("admits a full page but refuses an accept list above 20", () => {
    expect(parseFacilitatorDiscoveryPage({ items: Array.from({ length: 100 }, () => noBazaarItem) })?.items)
      .toHaveLength(100);
    expect(parseFacilitatorDiscoveryPage({ items: Array.from({ length: 101 }, () => noBazaarItem) })).toBeUndefined();
    const tooManyAccepts = {
      ...mainnetSyntheticPost,
      accepts: Array.from({ length: 21 }, () => mainnetSyntheticPost.accepts[0]),
    };
    expect(decideFacilitatorDiscoveryItem(tooManyAccepts)).toEqual({
      kind: "skip",
      reason: "payment_terms_invalid",
    });
  });
});
