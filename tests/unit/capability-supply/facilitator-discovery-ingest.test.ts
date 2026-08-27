import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { admitFacilitatorDiscoveryItems as admitOfficialFacilitatorDiscoveryItems } from "../../../convex/facilitatorDiscoveryAction";
import timezonePin from "../../../src/modules/capability-supply/internal/x402-bazaar-fixtures/timezone-payment-required-2026-08-19.json";
import syntheticPost from "../../../src/modules/capability-supply/internal/x402-bazaar-fixtures/synthetic-post-payment-required.json";
import {
  decideFacilitatorDiscoveryItem,
  FACILITATOR_DISCOVERY_URLS,
  isAllowlistedFacilitatorDiscoveryUrl,
  parseFacilitatorDiscoveryPage,
  paymentRequiredFromDiscoveryItem,
} from "@/modules/capability-supply/internal/facilitator-discovery-ingest";
import { admitBazaarDiscoveryInfo } from "@/modules/capability-supply/internal/publication-importer-x402-bazaar";
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
        input: {
          type: "mcp",
          toolName: "lookup",
          inputSchema: { type: "object", properties: {} },
        },
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
  it("rejects unsupported Bazaar HTTP channels and non-JSON output", () => {
    const extension = isRecord(timezonePaymentRequired?.extensions)
      && isRecord(timezonePaymentRequired.extensions.bazaar)
      ? timezonePaymentRequired.extensions.bazaar
      : undefined;
    expect(extension).toBeDefined();
    if (extension === undefined || !isRecord(extension.info) || !isRecord(extension.info.input)) {
      throw new Error("expected timezone Bazaar fixture");
    }
    const input = extension.info.input;
    const output = extension.info.output;
    for (const forbidden of [
      { pathParams: {} },
      { headers: {} },
      { body: {} },
      { bodyType: "json" },
    ]) {
      expect(admitBazaarDiscoveryInfo(extension, {
        input: { ...input, ...forbidden },
        output,
      })).toEqual({ kind: "refused", reason: "transport_unsupported" });
    }
    expect(admitBazaarDiscoveryInfo(extension, {
      input: { type: "http", method: "POST", bodyType: "json", body: {}, queryParams: {} },
      output,
    })).toEqual({ kind: "refused", reason: "transport_unsupported" });
    expect(admitBazaarDiscoveryInfo(extension, {
      input,
      output: { type: "text", example: { ok: true } },
    })).toEqual({ kind: "refused", reason: "schema_missing" });
    expect(admitBazaarDiscoveryInfo(extension, {
      input,
      output: { type: "json", example: Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`field${index}`, true])) },
    })).toEqual({ kind: "refused", reason: "schema_missing" });
  });

  it("keeps a searchable offering when a v2 catalog row has a URL string resource and no tags", async () => {
    const captured = structuredClone(timezonePaymentRequired);
    expect(captured).toBeDefined();
    if (captured === undefined || !isRecord(captured.resource)) {
      throw new Error("expected timezone resource");
    }
    const url = captured.resource.url;
    expect(typeof url).toBe("string");
    const admission = await admitOfficialFacilitatorDiscoveryItems([{
      ...captured,
      resource: url,
    }]);
    expect(admission.skipped).toEqual([]);
    expect(admission.admitted[0]?.offering.searchTerms.length).toBeGreaterThan(0);
  });

  it("normalizes x402 v2 catalog items whose resource is a URL string", () => {
    const paymentRequired = paymentRequiredFromDiscoveryItem({
      ...noBazaarItem,
      resource: "https://example.test/no-bazaar",
      description: "String-resource catalog row",
    });
    expect(paymentRequired).toMatchObject({
      x402Version: 2,
      resource: {
        url: "https://example.test/no-bazaar",
        description: "String-resource catalog row",
      },
    });
    expect(decideFacilitatorDiscoveryItem({
      ...noBazaarItem,
      resource: "https://example.test/no-bazaar",
    })).toEqual({ kind: "skip", reason: "bazaar_missing" });
  });

  it("names discovered offerings as jobs instead of URL paths", () => {
    const decision = decideFacilitatorDiscoveryItem(
      {
        ...noBazaarItem,
        resource: {
          url: "https://api.example.test/api/v1/amazon-search",
          description: "Search Amazon product listings and return structured results.",
        },
      },
      {
        kind: "admitted",
        method: "POST",
        inputSchema: { type: "object" },
        outputSchema: { type: "object" },
        query: undefined,
      },
    );
    expect(decision.kind).toBe("admit");
    if (decision.kind !== "admit") return;
    expect(decision.import.commercial.offering.presentation.label).toBe("Amazon Search");
    expect(decision.import.contract.name).toBe("Amazon Search");
    expect(decision.import.commercial.offering.searchTerms).toContain("Amazon Search");
  });

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

  it("skips missing bazaar and MCP instead of falling back to AM parameters", async () => {
    expect(decideFacilitatorDiscoveryItem(noBazaarItem)).toEqual({
      kind: "skip",
      reason: "bazaar_missing",
    });
    const mcpAndTestnet = await admitOfficialFacilitatorDiscoveryItems([mcpItem, syntheticPost]);
    expect(mcpAndTestnet.admitted).toHaveLength(0);
    expect(mcpAndTestnet.skipped.map((item) => item.reason)).toEqual([
      "transport_unsupported",
      "chain_unsupported",
    ]);
  });

  it("admits at least two recorded bazaar resources through the Node action boundary", async () => {
    expect(timezonePaymentRequired).toBeDefined();
    const page = parseFacilitatorDiscoveryPage({
      items: [timezonePaymentRequired, mainnetSyntheticPost, noBazaarItem, mcpItem],
    });
    expect(page?.items).toHaveLength(4);
    const result = await admitOfficialFacilitatorDiscoveryItems(page!.items);
    expect(result.admitted).toHaveLength(2);
    expect(result.skipped.length).toBeGreaterThanOrEqual(2);
    const urls = result.admitted.map(
      (draft) => draft.execution.endpoint.url,
    );
    expect(urls).toEqual([
      "https://402timezones.vercel.app/api/convert-timezone",
      "https://api.example.test/lookup",
    ]);
    expect(new Set(result.admitted.map((draft) => draft.offering.offeringId)).size).toBe(
      2,
    );
    expect(result.admitted.map((draft) => draft.offering.origin)).toEqual([
      { kind: "standalone" },
      { kind: "standalone" },
    ]);
    expect(result.admitted[1]?.price).toMatchObject({
      provider: { units: "100", exponent: 6 },
      platformFee: { units: "10", exponent: 6 },
      total: { units: "110", exponent: 6 },
    });
  });

  it("admits a full page but refuses an accept list above 20", async () => {
    expect(parseFacilitatorDiscoveryPage({ items: Array.from({ length: 100 }, () => noBazaarItem) })?.items)
      .toHaveLength(100);
    expect(parseFacilitatorDiscoveryPage({ items: Array.from({ length: 101 }, () => noBazaarItem) })).toBeUndefined();
    const tooManyAccepts = {
      ...mainnetSyntheticPost,
      accepts: Array.from({ length: 21 }, () => mainnetSyntheticPost.accepts[0]),
    };
    const result = await admitOfficialFacilitatorDiscoveryItems([tooManyAccepts]);
    expect(result).toMatchObject({
      admitted: [],
      skipped: [{ kind: "skip", reason: "payment_terms_invalid" }],
    });
  });

  it("keeps the Bazaar SDK out of the default mutation import tree", () => {
    const root = resolve(dirname(import.meta.filename), "../../..");
    const mutationPath = resolve(root, "convex/facilitatorDiscovery.ts");
    const actionPath = resolve(root, "convex/facilitatorDiscoveryAction.ts");
    const mutationImports = collectStaticImportTree(mutationPath, root);
    const actionImports = collectStaticImportTree(actionPath, root);
    expect(mutationImports).not.toContain("@x402/extensions/bazaar");
    expect([...mutationImports].filter((value) => value.startsWith("node:") || NODE_BUILTINS.has(value))).toEqual([]);
    expect(actionImports).toContain("@x402/extensions/bazaar");
  });
});

const NODE_BUILTINS = new Set([
  "assert", "buffer", "child_process", "cluster", "console", "constants", "crypto",
  "dgram", "diagnostics_channel", "dns", "domain", "events", "fs", "http", "http2",
  "https", "module", "net", "os", "path", "perf_hooks", "process", "punycode", "querystring",
  "readline", "repl", "stream", "string_decoder", "sys", "timers", "tls", "trace_events",
  "tty", "url", "util", "v8", "vm", "wasi", "worker_threads", "zlib",
]);

function collectStaticImportTree(start: string, root: string): Set<string> {
  const pending = [start];
  const visited = new Set<string>();
  const external = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || visited.has(current)) continue;
    visited.add(current);
    const text = readFileSync(current, "utf8");
    for (const match of text.matchAll(/(?:from\s+|import\s*)["']([^"']+)["']/gu)) {
      const specifier = match[1];
      if (specifier === undefined) continue;
      const matchIndex = match.index ?? 0;
      const importIndex = Math.max(text.lastIndexOf("import", matchIndex), text.lastIndexOf("export", matchIndex));
      if (/^(?:import|export)\s+type\b/u.test(text.slice(importIndex, matchIndex).trim())) continue;
      const local = resolveLocalImport(current, specifier, root);
      if (local === undefined) external.add(specifier);
      else pending.push(local);
    }
  }
  return external;
}

function resolveLocalImport(from: string, specifier: string, root: string): string | undefined {
  if (!specifier.startsWith("./") && !specifier.startsWith("../") && !specifier.startsWith("@/")) {
    return undefined;
  }
  const base = specifier.startsWith("@/")
    ? resolve(root, "src", specifier.slice(2))
    : resolve(dirname(from), specifier);
  const candidates = [
    base,
    `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`, `${base}.mts`, `${base}.mjs`,
    resolve(base, "index.ts"), resolve(base, "index.tsx"), resolve(base, "index.js"),
  ];
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}
