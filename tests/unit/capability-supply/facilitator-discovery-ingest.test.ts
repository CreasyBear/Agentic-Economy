import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { admitFacilitatorDiscoveryItems as admitOfficialFacilitatorDiscoveryItems } from "@/modules/capability-supply/server";
import {
  decideFacilitatorDiscoveryItem,
  paymentRequiredFromDiscoveryItem,
} from "@/modules/capability-supply/public";
import syntheticPostPaymentRequiredFixture from "../../fixtures/x402-bazaar/synthetic-post-payment-required.json";
const syntheticPost = syntheticPostPaymentRequiredFixture
import timezonePaymentRequired20260819Fixture from "../../fixtures/x402-bazaar/timezone-payment-required-2026-08-19.json";
const timezonePin = timezonePaymentRequired20260819Fixture
import { admitBazaarDiscoveryInfo } from "@/modules/capability-supply/server";
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
      maxTimeoutSeconds: 60,
      extra: { name: "USD Coin", version: "2" },
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

const baseSepoliaSyntheticPost = {
  ...syntheticPost,
  accepts: syntheticPost.accepts.map((accept) => ({
    ...accept,
    network: "eip155:84532",
    asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  })),
};

afterEach(() => vi.unstubAllEnvs());

describe("facilitator discovery ingest", () => {
  it.each(["GET", "POST"] as const)("admits %s object properties without an explicit type and preserves constraints", (method) => {
    const request = { properties: { url: { type: "string", format: "uri" }, max_chars: { type: "integer", maximum: 60000 } }, required: ["url"] };
    const example = { url: "https://example.com", max_chars: 8000 };
    const channel = method === "GET" ? "queryParams" : "body";
    const input = { type: "http", method, [channel]: example, ...(method === "POST" ? { bodyType: "json" } : {}) };
    const extension = { schema: { properties: { input: { properties: { [channel]: request } } } } };
    expect(admitBazaarDiscoveryInfo(extension, { input, output: { type: "json" } })).toMatchObject({
      kind: "admitted", method, inputSchema: { ...request, type: "object", additionalProperties: false }, inputExample: example,
    });
    expect(admitBazaarDiscoveryInfo({ schema: { properties: { input: { properties: { [channel]: { ...request, type: "string" } } } } } },
      { input, output: { type: "json" } })).toEqual({ kind: "refused", reason: "schema_missing" });
  });

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
    })).toMatchObject({ kind: "admitted" });
  });

  it("keeps a searchable offering when a v2 catalog row has a URL string resource and no tags", async () => {
    const captured = structuredClone(timezonePaymentRequired);
    expect(captured).toBeDefined();
    if (captured === undefined || !isRecord(captured.resource)) {
      throw new Error("expected timezone resource");
    }
    const url = captured.resource.url;
    expect(typeof url).toBe("string");
    vi.stubEnv("AE_DEPLOYMENT_ENVIRONMENT", "production");
    const admission = await admitOfficialFacilitatorDiscoveryItems([{
      ...captured,
      resource: url,
    }]);
    expect(admission.skipped).toEqual([]);
    expect(admission.admitted[0]?.offering.searchTerms.length).toBeGreaterThan(0);
    expect(admission.admitted[0]?.offering.presentation.materialTerms).toContainEqual({
      termId: "buyer-total", label: "Buyer total", value: "Confirmed in AUD by a binding Quote for your input.",
    });
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
    }, undefined, "production")).toMatchObject({ kind: "admit" });
  });

  it("admits a listing without Bazaar metadata or payers as a no-input GET on its listed URL", async () => {
    vi.stubEnv("AE_DEPLOYMENT_ENVIRONMENT", "production");
    const admission = await admitOfficialFacilitatorDiscoveryItems([
      noBazaarItem,
      { ...noBazaarItem, resource: { url: "https://example.test/one-payer" }, quality: { l30DaysUniquePayers: 1 } },
      { ...mainnetSyntheticPost, quality: { l30DaysUniquePayers: 0 } },
    ]);
    expect(admission.skipped).toEqual([]);
    expect(admission.admitted).toHaveLength(3);
    expect(JSON.parse(admission.admitted[0]?.sourceImportJson ?? "{}")).toMatchObject({
      resource: {
        resourceUrl: "https://example.test/no-bazaar",
        method: "GET",
        query: [],
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        outputSchema: { type: ["object", "array", "string", "number", "boolean", "null"] },
      },
    });
    expect(admission.admitted[0]?.execution).toMatchObject({ method: "GET", endpoint: { url: "https://example.test/no-bazaar" } });
  });

  it("names discovered offerings as jobs instead of URL paths", () => {
    const decision = decideFacilitatorDiscoveryItem(
      {
        ...noBazaarItem,
        quality: { l30DaysUniquePayers: 4 },
        resource: {
          url: "https://api.example.test/api/v1/amazon-search",
          description: "Search Amazon product listings and return structured results.",
        },
      },
      {
        kind: "admitted",
        method: "POST",
        inputSchema: { type: "object" },
        inputExample: {},
        outputSchema: { type: "object" },
      },
      "production",
    );
    expect(decision.kind).toBe("admit");
    if (decision.kind !== "admit") return;
    expect(decision.import.commercial.offering.presentation.label).toBe("Amazon Search");
    expect(decision.import.contract.name).toBe("Amazon Search");
    expect(decision.import.commercial.offering.searchTerms).toContain("Amazon Search");
  });

  it.each([
    { environment: 'production' as const, network: 'eip155:8453', asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
    { environment: 'sandbox' as const, network: 'eip155:84532', asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' },
  ])('selects the $environment lane from mixed accepts in either order without altering upstream terms', ({ environment, network, asset }) => {
    const options = [mainnetSyntheticPost.accepts[0], baseSepoliaSyntheticPost.accepts[0]];
    const bazaar = { kind: 'admitted' as const, method: 'POST' as const, inputSchema: { type: 'object' }, outputSchema: { type: 'object' } };
    for (const accepts of [options, [...options].reverse()]) {
      const item = { ...mainnetSyntheticPost, accepts };
      const decision = decideFacilitatorDiscoveryItem(item, bazaar, environment);
      expect(decision.kind).toBe('admit');
      if (decision.kind !== 'admit') continue;
      expect(decision.import.resource).toMatchObject({ network, asset, paymentRequired: { accepts } });
      expect(isRecord(decision.import.resource) ? decision.import.resource.paymentRequired : undefined).toEqual(paymentRequiredFromDiscoveryItem(item));
    }
  });

  it('skips discovery when the deployment environment is undeclared or unsupported', async () => {
    const bazaar = { kind: 'admitted' as const, method: 'POST' as const, inputSchema: { type: 'object' }, outputSchema: { type: 'object' } };
    expect(decideFacilitatorDiscoveryItem(mainnetSyntheticPost, bazaar, undefined)).toEqual({ kind: 'skip', reason: 'source_invalid' });
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', undefined);
    expect(await admitOfficialFacilitatorDiscoveryItems([mainnetSyntheticPost])).toMatchObject({ admitted: [] });
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'preview');
    expect(await admitOfficialFacilitatorDiscoveryItems([mainnetSyntheticPost])).toMatchObject({ admitted: [] });
  });

  it("admits official Base Sepolia Bazaar HTTP while skipping mainnet-only and MCP rows", async () => {
    expect(decideFacilitatorDiscoveryItem(noBazaarItem, undefined, "sandbox")).toEqual({
      kind: "skip",
      reason: "chain_unsupported",
    });
    vi.stubEnv("AE_DEPLOYMENT_ENVIRONMENT", "development");
    const mcpAndTestnet = await admitOfficialFacilitatorDiscoveryItems([mcpItem, baseSepoliaSyntheticPost]);
    expect(mcpAndTestnet.admitted).toHaveLength(1);
    expect(JSON.parse(mcpAndTestnet.admitted[0]?.sourceImportJson ?? "{}")).toMatchObject({
      resource: {
        network: "eip155:84532",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      },
    });
    expect(mcpAndTestnet.skipped.map((item) => item.reason)).toEqual([
      "transport_unsupported",
    ]);
  });

  it("admits at least two recorded bazaar resources through the Node action boundary", async () => {
    expect(timezonePaymentRequired).toBeDefined();
    const page = { items: [timezonePaymentRequired, mainnetSyntheticPost, mcpItem] };
    vi.stubEnv("AE_DEPLOYMENT_ENVIRONMENT", "production");
    const production = await admitOfficialFacilitatorDiscoveryItems(page.items);
    vi.stubEnv("AE_DEPLOYMENT_ENVIRONMENT", "development");
    const sandbox = await admitOfficialFacilitatorDiscoveryItems(page.items);
    const result = { admitted: [...production.admitted, ...sandbox.admitted], skipped: [...production.skipped, ...sandbox.skipped] };
    expect(result.admitted).toHaveLength(2);
    expect(result.skipped.length).toBeGreaterThanOrEqual(2);
    const urls = result.admitted.map(
      (draft) => draft.execution.endpoint.url,
    );
    expect(urls).toEqual([
      "https://402timezones.vercel.app/api/convert-timezone",
      "https://api.example.test/lookup",
    ]);
    // Execution identity stays bare, but the discovery resourceUrl keeps its
    // example parameter values so a paid Call still reaches the exact resource.
    expect(JSON.parse(result.admitted[0]?.sourceImportJson ?? "{}"))
      .toMatchObject({
        resource: {
          resourceUrl: "https://402timezones.vercel.app/api/convert-timezone?from=UTC&to=America%2FNew_York&time=12%3A00",
        },
      });
    expect(new Set(result.admitted.map((draft) => draft.offering.offeringId)).size).toBe(
      2,
    );
    expect(result.admitted.map((draft) => draft.offering.origin)).toEqual([
      { kind: "standalone" },
      { kind: "standalone" },
    ]);
    expect(JSON.parse(result.admitted[0]?.sourceImportJson ?? "{}"))
      .toMatchObject({
        contract: {
          inputExamples: [{
            label: "Provider example",
            input: {
              from: "America/New_York",
              to: "Asia/Tokyo",
              time: "2026-07-04T15:30",
            },
          }],
        },
      });
    expect(result.admitted[1]?.price).toMatchObject({
      provider: { units: "100", exponent: 6 },
      platformFee: { units: "0", exponent: 6 },
      total: { units: "100", exponent: 6 },
    });
    // Stored material terms keep the original "CODE amount" serialisation, independent of display formatting.
    expect(result.admitted[1]?.offering.presentation.materialTerms).toContainEqual({
      termId: "provider-amount", label: "Listed Provider amount", value: "USDC 0.000100",
    });
  });

  it("refuses an accept list above 20", async () => {
    const tooManyAccepts = {
      ...mainnetSyntheticPost,
      accepts: Array.from({ length: 21 }, () => mainnetSyntheticPost.accepts[0]),
    };
    vi.stubEnv("AE_DEPLOYMENT_ENVIRONMENT", "production");
    const result = await admitOfficialFacilitatorDiscoveryItems([tooManyAccepts]);
    expect(result).toMatchObject({
      admitted: [],
      skipped: [{ kind: "skip", reason: "payment_terms_invalid" }],
    });
  });

  it.each([
    ["a non-EVM payee", { payTo: "not-an-address" }],
    ["a non-EIP-3009 transfer method", { extra: { name: "USD Coin", version: "2", assetTransferMethod: "permit2" } }],
    ["a missing timeout", { maxTimeoutSeconds: undefined }],
  ])("refuses a listing whose only lane has %s, as the call path would", async (_label, override) => {
    vi.stubEnv("AE_DEPLOYMENT_ENVIRONMENT", "production");
    const item = { ...noBazaarItem, accepts: [{ ...noBazaarItem.accepts[0]!, ...override }] };
    expect(await admitOfficialFacilitatorDiscoveryItems([item])).toMatchObject({
      admitted: [], skipped: [{ kind: "skip", reason: "payment_terms_invalid" }],
    });
  });

  it("refuses two payable lanes as ambiguous instead of pinning the first", async () => {
    vi.stubEnv("AE_DEPLOYMENT_ENVIRONMENT", "production");
    const lane = noBazaarItem.accepts[0]!;
    const item = { ...noBazaarItem, accepts: [lane, { ...lane, payTo: "0x1111111111111111111111111111111111111111" }] };
    expect(await admitOfficialFacilitatorDiscoveryItems([item])).toMatchObject({
      admitted: [], skipped: [{ kind: "skip", reason: "payment_terms_invalid" }],
    });
  });

  it("keeps the Bazaar SDK out of the default mutation import tree", () => {
    const root = resolve(dirname(import.meta.filename), "../../..");
    const mutationPath = resolve(root, "convex/facilitatorDiscovery.ts");
    const actionPath = resolve(root, "convex/x402Directory.ts");
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
