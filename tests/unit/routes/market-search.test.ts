import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Route, parseMarketCompareRefs, validateMarketSearch } from "@/routes/market";
import { resolveCanonicalBaseUrl } from "@/lib/server/canonical-url";

vi.mock("@/lib/server/canonical-url.functions", () => ({
  readCanonicalBaseUrlServer: async () => resolveCanonicalBaseUrl(new Request("https://untrusted.example/market")).baseUrl,
}));
const reads = vi.hoisted(() => ({ catalogue: vi.fn(), providers: vi.fn(), overview: vi.fn(), resource: vi.fn(), home: vi.fn() }));
vi.mock("@/modules/market/x402-directory-index.functions", () => ({
  readX402DirectoryCatalogueServer: reads.catalogue,
  readX402DirectoryProvidersServer: reads.providers,
  readX402DirectoryCatalogueOverviewServer: reads.overview,
  readX402DirectoryCatalogueResourceServer: reads.resource,
}));
vi.mock("@/modules/market/x402-marketplace-home.functions", () => ({ readX402MarketplaceHomeServer: reads.home }));
vi.mock("@/modules/market/x402-directory.functions", () => ({
  readX402DirectoryServer: async () => ({ kind: "ok", items: [], offset: 0, limit: 20 }),
  prepareX402DirectoryResourceServer: vi.fn(),
}));

beforeEach(() => {
  for (const read of Object.values(reads)) read.mockReset();
  reads.catalogue.mockResolvedValue({ kind: "ok", source: "index", page: { kind: "ok", items: [], offset: 0, limit: 24 }, coverage: { indexedTotal: 4000 }, searchMethod: "native_index", isDone: true });
  reads.providers.mockResolvedValue({ kind: "unavailable", reason: "index_unavailable" });
  reads.overview.mockResolvedValue({ kind: "unavailable", reason: "index_unavailable" });
  reads.resource.mockResolvedValue({ kind: "not_found" });
  reads.home.mockResolvedValue({ observedAt: "2026-09-08T00:00:00Z", rails: [] });
});
afterEach(() => vi.unstubAllEnvs());

describe("market entry metadata", () => {
  it.each([
    ["https://app.aecon.ai", {}],
    ["https://preview.example.test", { directoryCategory: "developer-tools" }],
  ])("uses configured app origin %s for canonical and site metadata", async (origin, filters) => {
    vi.stubEnv("AE_CANONICAL_BASE_URL", origin);
    const loader = Route.options.loader;
    const buildHead = Route.options.head;
    if (typeof loader !== "function" || buildHead === undefined) throw new Error("market_metadata_missing");
    const loaderData = await loader({ deps: { ...filters } } as never);
    const head = await buildHead({ loaderData } as never);
    expect(head).toMatchObject({
      links: [{ rel: "canonical", href: `${origin}/market` }],
      meta: expect.arrayContaining([{ property: "og:url", content: `${origin}/market` }]),
      scripts: [{ type: "application/ld+json", children: expect.stringContaining(`${origin}/market?query={search_term_string}`) }],
    });
    expect(JSON.stringify(head)).toContain("WebSite");
    expect(JSON.stringify(head)).not.toContain("https://aecon.ai");
    expect(JSON.stringify(head)).not.toContain("untrusted.example");
  });
});

describe("market search validation", () => {
  it("drops the retired capability-catalog parameters instead of erroring", () => {
    expect(
      validateMarketSearch({ category: "identity-compliance", capability: "web-search", availability: "routeable", cursor: "page-2" }),
    ).toEqual({});
  });
});

describe("legacy compare mapping", () => {
  it("keeps one to four unique, bounded resource identifiers in one readable parameter", () => {
    const first = "https://api.example.com/tools/first";
    const second = "https://api.example.com/tools/second";

    expect(parseMarketCompareRefs(`${first},${second}`)).toEqual([first, second]);
    expect(validateMarketSearch({ query: "company", compare: `${first},${second}` })).toEqual({
      query: "company",
      compare: `${first},${second}`,
    });
  });

  it("deduplicates references and drops empty or oversized comparisons", () => {
    const first = "https://api.example.com/tools/first";
    const second = "https://api.example.com/tools/second";
    const third = "https://api.example.com/tools/third";
    const fourth = "https://api.example.com/tools/fourth";
    const fifth = "https://api.example.com/tools/fifth";

    expect(validateMarketSearch({ compare: `${first},${second},${first}` })).toEqual({ compare: `${first},${second}` });
    expect(validateMarketSearch({ compare: `${first},${second},${third},${fourth},${fifth}` })).toEqual({});
    expect(validateMarketSearch({ compare: "" })).toEqual({});
    expect(validateMarketSearch({ compare: `${first},   ,${second}` })).toEqual({ compare: `${first},${second}` });
  });
});

it('validates native filters without silently broadening an invalid search', () => {
  expect(validateMarketSearch({ network: 'eip155:8453', provider: 'EXAMPLE.COM', maxUsdPrice: 0, view: 'providers' })).toEqual({ network: 'eip155:8453', provider: 'example.com', maxUsdPrice: 0, view: 'providers' })
  for (const search of [{ provider: 'https://example.com/path' }, { maxUsdPrice: -1 }, { network: [] }, { maxUsdPrice: 'oops' }]) {
    expect(() => validateMarketSearch(search)).toThrow()
  }
})


describe('indexed directory route', () => {
  it('keeps source categories and pagination separate from canonical market parameters', async () => {
    const search = validateMarketSearch({ directoryCategory: 'CREATIVE', indexCursor: 'native-next', sort: 'updated' });
    expect(search).toEqual({ directoryCategory: 'creative', indexCursor: 'native-next', sort: 'updated' });
    const loader = Route.options.loader;
    if (typeof loader !== 'function') throw new Error('loader_missing');
    const data = await loader({ deps: search } as never);
    expect(data).toMatchObject({ catalogue: { coverage: { indexedTotal: 4000 } } });
    expect(reads.catalogue).toHaveBeenCalledWith({ data: { directoryCategory: 'creative', indexCursor: 'native-next', sort: 'updated' } });
    expect(reads.home).not.toHaveBeenCalled();
  });

  it('loads adoption-ranked Tools by default without fetching collections', async () => {
    const loader = Route.options.loader;
    if (typeof loader !== 'function') throw new Error('loader_missing');
    const data = await loader({ deps: {} } as never);
    expect(data).toMatchObject({ catalogue: { coverage: { indexedTotal: 4000 } } });
    expect(reads.catalogue).toHaveBeenCalledWith({ data: { sort: 'adoption' } });
    expect(reads.home).not.toHaveBeenCalled();
  });

  it('does not expose the unfiltered index total as a filtered page match count', async () => {
    const loader = Route.options.loader;
    if (typeof loader !== 'function') throw new Error('loader_missing');
    const data = await loader({ deps: { provider: 'example.com' } } as never);
    expect(data).toMatchObject({ catalogue: { coverage: { indexedTotal: 4000 } } });
    if (data.page.kind !== 'ok') throw new Error('page_missing');
    expect(data.page.total).toBeUndefined();
  });

  it('validates categories, cursor and query sorting without broadening invalid inputs', () => {
    expect(validateMarketSearch({ query: ' image ', sort: 'relevance', directoryCategory: 'Creative' })).toMatchObject({ query: 'image', sort: 'relevance', directoryCategory: 'creative' });
    for (const search of [{ indexCursor: 'cursor', offset: 20 }, { directoryCategory: '' }, { directoryCategory: 'x'.repeat(81) }, { indexCursor: '' }, { sort: 'cheapest' }, { query: 'image', sort: 'popular' }, { query: 'image', sort: 'updated' }]) {
      expect(() => validateMarketSearch(search)).toThrow();
    }
  });

  it('keeps the adoption default for filtered Tool views', async () => {
    const loader = Route.options.loader;
    if (typeof loader !== 'function') throw new Error('loader_missing');
    const filters = { priceBand: '0_01_to_0_03', adoptionBand: '0', tags: ['search', 'a&b'], hasInputSchema: false, minPayers30d: 0, maxPayers30d: 4 };
    await loader({ deps: validateMarketSearch({ view: 'tools', ...filters }) } as never);
    expect(reads.catalogue).toHaveBeenLastCalledWith({ data: { ...filters, sort: 'adoption' } });
  });
});

describe('explorer filter validation', () => {
  it.each([{ minUsdPrice: 0.1, maxUsdPrice: 0.01 }, { minPayers30d: 5, maxPayers30d: 4 }, { minPayers30d: 0.5 }, { priceBand: 'cheap' }, { adoptionBand: 'none' }, { tags: 'search' }, { hasInputSchema: 'false' }])('rejects invalid explorer filters: %j', search => {
    expect(() => validateMarketSearch(search)).toThrow();
  });
});
