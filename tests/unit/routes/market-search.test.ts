import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Route, parseMarketCompareRefs, validateMarketSearch } from "@/routes/market";
import { resolveCanonicalBaseUrl } from "@/lib/server/canonical-url";

vi.mock("@/lib/server/canonical-url.functions", () => ({
  readCanonicalBaseUrlServer: async () => resolveCanonicalBaseUrl(new Request("https://untrusted.example/market")).baseUrl,
}));
const reads = vi.hoisted(() => ({ catalogue: vi.fn(), analytics: vi.fn(), providers: vi.fn(), overview: vi.fn(), resource: vi.fn(), canonical: vi.fn(), home: vi.fn() }));
vi.mock("@/modules/market/x402-directory-index.functions", () => ({
  readX402DirectoryCatalogueServer: reads.catalogue,
  readX402DirectoryAnalyticsServer: reads.analytics,
  readX402DirectoryProvidersServer: reads.providers,
  readX402DirectoryCatalogueOverviewServer: reads.overview,
  readX402DirectoryCatalogueResourceServer: reads.resource,
}));
vi.mock("@/modules/market/x402-marketplace-home.functions", () => ({ readX402MarketplaceHomeServer: reads.home }));
vi.mock("@/modules/market/x402-directory.functions", () => ({
  readX402DirectoryServer: async () => ({ kind: "ok", items: [], offset: 0, limit: 20 }),
  prepareX402DirectoryResourceServer: vi.fn(),
}));
vi.mock("@/modules/market/market.functions", () => ({
  readMarketRouteServer: reads.canonical,
}));

beforeEach(() => {
  for (const read of Object.values(reads)) read.mockReset();
  reads.catalogue.mockResolvedValue({ kind: "ok", source: "index", page: { kind: "ok", items: [], offset: 0, limit: 24 }, coverage: { indexedTotal: 4000 }, searchMethod: "native_index", isDone: true });
  reads.analytics.mockResolvedValue({ kind: 'unavailable', reason: 'index_unavailable' });
  reads.providers.mockResolvedValue({ kind: "unavailable", reason: "index_unavailable" });
  reads.overview.mockResolvedValue({ kind: "unavailable", reason: "index_unavailable" });
  reads.resource.mockResolvedValue({ kind: "not_found" });
  reads.canonical.mockResolvedValue({ window: "30d", catalog: { kind: "unavailable" } });
  reads.home.mockResolvedValue({ observedAt: "2026-09-08T00:00:00Z", rails: [] });
});
afterEach(() => vi.unstubAllEnvs());

describe("market entry metadata", () => {
  it.each([
    ["https://app.aecon.ai", {}],
    ["https://preview.example.test", { category: "developer-tools" }],
  ])("uses configured app origin %s for canonical and site metadata", async (origin, filters) => {
    vi.stubEnv("AE_CANONICAL_BASE_URL", origin);
    const loader = Route.options.loader;
    const buildHead = Route.options.head;
    if (typeof loader !== "function" || buildHead === undefined) throw new Error("market_metadata_missing");
    const loaderData = await loader({ deps: { window: "30d", ...filters } } as never);
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
  it("retains known presentation categories and drops unknown categories", () => {
    expect(
      validateMarketSearch({
        window: "7d",
        category: "identity-compliance",
      }),
    ).toEqual({ window: "7d", category: "identity-compliance" });

    expect(
      validateMarketSearch({ window: "7d", category: "not-a-category" }),
    ).toEqual({ window: "7d" });
    expect(validateMarketSearch({ window: "7d", category: "all" })).toEqual({
      window: "7d",
    });
  });

  it("keeps two to four unique canonical comparison references in one readable parameter", () => {
    const first = `operation:v1:${"a".repeat(64)}`;
    const second = `operation:v1:${"b".repeat(64)}`;

    expect(parseMarketCompareRefs(`${first},${second}`)).toEqual([first, second]);
    expect(validateMarketSearch({
      window: "30d",
      query: "company",
      category: "identity-compliance",
      cursor: "page-2",
      compare: `${first},${second}`,
    })).toEqual({
      window: "30d",
      query: "company",
      category: "identity-compliance",
      cursor: "page-2",
      compare: `${first},${second}`,
    });
  });

  it("deduplicates references and drops malformed, short, and oversized comparisons", () => {
    const first = `operation:v1:${"a".repeat(64)}`;
    const second = `operation:v1:${"b".repeat(64)}`;
    const third = `operation:v1:${"c".repeat(64)}`;
    const fourth = `operation:v1:${"d".repeat(64)}`;
    const fifth = `operation:v1:${"e".repeat(64)}`;

    expect(validateMarketSearch({
      window: "30d",
      compare: `${first},${second},${first}`,
    })).toEqual({ window: "30d", compare: `${first},${second}` });

    for (const compare of [
      first,
      `${first},${first}`,
      `${first},operation:v1:short`,
      `${first},${second},${third},${fourth},${fifth}`,
    ]) {
      expect(validateMarketSearch({ window: "30d", compare })).toEqual({
        window: "30d",
      });
    }
  });
});

it('validates native filters without silently broadening an invalid search', () => {
  expect(validateMarketSearch({ network: 'eip155:8453', provider: 'EXAMPLE.COM', maxUsdPrice: 0, view: 'providers' })).toEqual({ window: '30d', network: 'eip155:8453', provider: 'example.com', maxUsdPrice: 0, view: 'providers' })
  for (const search of [{ provider: 'https://example.com/path' }, { maxUsdPrice: -1 }, { network: [] }, { maxUsdPrice: 'oops' }]) {
    expect(() => validateMarketSearch(search)).toThrow()
  }
})


describe('indexed directory route', () => {
  it('keeps source categories and pagination separate from canonical market parameters', async () => {
    const search = validateMarketSearch({ directoryCategory: 'CREATIVE', indexCursor: 'native-next', sort: 'updated' });
    expect(search).toEqual({ window: '30d', directoryCategory: 'creative', indexCursor: 'native-next', sort: 'updated' });
    const loader = Route.options.loader;
    if (typeof loader !== 'function') throw new Error('loader_missing');
    const data = await loader({ deps: search } as never);
    expect(data).toMatchObject({ kind: 'directory' });
    expect(reads.catalogue).toHaveBeenCalledWith({ data: { directoryCategory: 'creative', indexCursor: 'native-next', sort: 'updated' } });
    expect(reads.canonical).not.toHaveBeenCalled();
    expect(reads.home).not.toHaveBeenCalled();
  });

  it('loads a selected endpoint exactly even when absent from filtered results', async () => {
    const selected = { resource: 'https://example.com/other?format=json', title: 'Exact Tool' };
    reads.resource.mockResolvedValue({ kind: 'found', item: { entry: selected }, coverage: { indexedTotal: 4000 } });
    const loader = Route.options.loader;
    if (typeof loader !== 'function') throw new Error('loader_missing');
    const data = await loader({ deps: { window: '30d', query: 'unrelated', resource: selected.resource } } as never);
    expect(reads.resource).toHaveBeenCalledWith({ data: { resource: selected.resource } });
    expect(reads.catalogue).toHaveBeenCalledWith({ data: { query: 'unrelated' } });
    expect(data).toMatchObject({ kind: 'directory', selectedEntry: selected, page: { items: [] } });
    expect(reads.canonical).not.toHaveBeenCalled();
  });

  it('does not expose the unfiltered index total as a filtered page match count', async () => {
    const loader = Route.options.loader;
    if (typeof loader !== 'function') throw new Error('loader_missing');
    const data = await loader({ deps: { window: '30d', provider: 'example.com' } } as never);
    expect(data).toMatchObject({ kind: 'directory', catalogue: { coverage: { indexedTotal: 4000 } } });
    if (data?.kind !== 'directory') throw new Error('directory_missing');
    if (data.page.kind !== 'ok') throw new Error('page_missing');
    expect(data.page.total).toBeUndefined();
  });

  it('validates categories, cursor and query sorting without broadening invalid inputs', () => {
    expect(validateMarketSearch({ query: ' image ', sort: 'relevance', directoryCategory: 'Creative' })).toMatchObject({ query: 'image', sort: 'relevance', directoryCategory: 'creative' });
    for (const search of [{ indexCursor: 'cursor', offset: 20 }, { directoryCategory: '' }, { directoryCategory: 'x'.repeat(81) }, { indexCursor: '' }, { sort: 'cheapest' }, { query: 'image', sort: 'popular' }, { query: 'image', sort: 'updated' }]) {
      expect(() => validateMarketSearch(search)).toThrow();
    }
  });
});

describe('market analytics navigation', () => {
  it('loads the overview and adoption-ranked Tools by default without fetching collections', async () => {
    const analytics = { kind: 'ok', totalTools: 14455 };
    reads.analytics.mockResolvedValue(analytics);
    const loader = Route.options.loader;
    if (typeof loader !== 'function') throw new Error('loader_missing');
    expect(await loader({ deps: { window: '30d' } } as never)).toMatchObject({ kind: 'directory', analytics });
    expect(reads.analytics).toHaveBeenCalledWith({ data: {} });
    expect(reads.catalogue).toHaveBeenCalledWith({ data: { sort: 'adoption' } });
    expect(reads.home).not.toHaveBeenCalled();
  });
  it('scopes overview prices to the chosen network and keeps filtered Tools out of the analytics fetch', async () => {
    const loader = Route.options.loader;
    if (typeof loader !== 'function') throw new Error('loader_missing');
    await loader({ deps: { window: '30d', view: 'overview', network: 'eip155:8453' } } as never);
    expect(reads.analytics).toHaveBeenCalledWith({ data: { network: 'eip155:8453' } });
    reads.analytics.mockClear();
    const filters = { priceBand: '0_01_to_0_03', adoptionBand: '0', tags: ['search', 'a&b'], hasInputSchema: false, minPayers30d: 0, maxPayers30d: 4 };
    await loader({ deps: validateMarketSearch({ view: 'tools', ...filters }) } as never);
    expect(reads.catalogue).toHaveBeenLastCalledWith({ data: { ...filters, sort: 'adoption' } });
    expect(reads.analytics).not.toHaveBeenCalled();
  });
  it.each([{ minUsdPrice: 0.1, maxUsdPrice: 0.01 }, { minPayers30d: 5, maxPayers30d: 4 }, { minPayers30d: 0.5 }, { priceBand: 'cheap' }, { adoptionBand: 'none' }, { tags: 'search' }, { hasInputSchema: 'false' }])('rejects invalid explorer filters: %j', search => {
    expect(() => validateMarketSearch(search)).toThrow();
  });
});
