/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from 'react-dom/server';
import { RouterContextProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';

import { Route, parseMarketCompareRefs, validateMarketSearch } from "@/routes/market";
import { SEARCH_QUERY_MAX_LENGTH } from "@/modules/common/search-query";
import {
  carryMarketCompare,
  marketCompareParam,
  marketLoaderDeps,
  retainedMarketCatalogue,
  loadCanonicalMarketSearch,
  type MarketCanonicalSearchPage,
  toggleMarketCompareRef,
} from "@/modules/market/market-route-data";
import { resolveCanonicalBaseUrl } from "@/lib/server/canonical-url";

vi.mock("@/lib/server/canonical-url.functions", () => ({
  readCanonicalBaseUrlServer: async () => resolveCanonicalBaseUrl(new Request("https://untrusted.example/market")).baseUrl,
}));
vi.mock("@/modules/market/market.functions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/market/market.functions")>()),
  readMarketDiscoveryRecipientServer: async () => null,
  readMarketChatRecipientServer: async () => null,
}));
const reads = vi.hoisted(() => ({ catalogue: vi.fn(), providers: vi.fn(), overview: vi.fn(), resource: vi.fn(), home: vi.fn(), tool: vi.fn(), external: vi.fn(), search: vi.fn() }));
vi.mock("@/modules/market/x402-directory-index.functions", () => ({
  readX402DirectoryCatalogueServer: reads.catalogue,
  readX402DirectoryProvidersServer: reads.providers,
  readX402DirectoryCatalogueOverviewServer: reads.overview,
  readX402DirectoryCatalogueResourceServer: reads.resource,
}));
vi.mock("@/modules/market/tool-detail-route.functions", () => ({ readPublicToolDetailRouteServer: reads.tool }));
vi.mock("@/modules/market/market-comparison.functions", () => ({ readMarketExternalListingServer: reads.external }));
vi.mock("@/modules/market/market-tool-search.functions", () => ({ searchMarketToolsServer: reads.search }));
vi.mock("@/modules/market/x402-marketplace-home.functions", () => ({ readX402MarketplaceHomeServer: reads.home }));
vi.mock("@/modules/market/market-flow.functions", () => ({ readMarketFlowRankServer: async () => undefined }));
vi.mock("@/modules/market/x402-directory.functions", () => ({
  readX402DirectoryServer: async () => ({ kind: "ok", items: [], offset: 0, limit: 20 }),
}));

beforeEach(() => {
  for (const read of Object.values(reads)) read.mockReset();
  reads.catalogue.mockResolvedValue({ kind: "ok", source: "index", page: { kind: "ok", items: [], offset: 0, limit: 24 }, coverage: { indexedTotal: 4000 }, searchMethod: "native_index", isDone: true });
  reads.providers.mockResolvedValue({ kind: "unavailable", reason: "index_unavailable" });
  reads.overview.mockResolvedValue({ kind: "unavailable", reason: "index_unavailable" });
  reads.resource.mockResolvedValue({ kind: "not_found" });
  reads.tool.mockResolvedValue({ kind: "not_found" });
  reads.external.mockResolvedValue({ kind: "not_found" });
  reads.home.mockResolvedValue({ observedAt: "2026-09-08T00:00:00Z", rails: [] });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

function renderMarketError(error: unknown): string {
  const ErrorComponent = Route.options.errorComponent;
  if (!ErrorComponent) throw new Error('market_error_component_missing');
  const router = createRouter({ routeTree: createRootRoute(), history: createMemoryHistory({ initialEntries: ['/market'] }) });
  return renderToStaticMarkup(
    <RouterContextProvider router={router}>
      <ErrorComponent error={error} reset={vi.fn()} />
    </RouterContextProvider>,
  );
}

describe('market route error recovery', () => {
  it.each([null, undefined, 'private upstream failure', new Error('private upstream failure')])(
    'renders safe retry guidance for an unknown failure: %s', error => {
      const html = renderMarketError(error);
      expect(html).toContain('Try again to fetch the current catalog and comparison. No Tool was called.');
      expect(html).not.toContain('private upstream failure');
    },
  );

  it.each([
    Object.assign(new Error('private validation detail'), { name: 'SearchParamError' }),
    { name: 'ZodError', message: 'private validation detail' },
  ])('retains specific guidance for directory validation failures', error => {
    const html = renderMarketError(error);
    expect(html).toContain('A directory search or filter is invalid. Check the address and try again. No broader search was run.');
    expect(html).not.toContain('private validation detail');
  });
});

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
    const head = await buildHead({ loaderData, match: { search: filters } } as never);
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

it('keeps catalogue results visible when optional directory overview rejects', async () => {
  reads.overview.mockRejectedValue(new Error('derived facet read failed'))
  const loader = Route.options.loader
  if (typeof loader !== 'function') throw new Error('loader_missing')
  const result = await loader({ deps: { view: 'tools' } } as never)
  expect(result.page).toMatchObject({ kind: 'ok', items: [] })
  expect(result.overview).toEqual({ kind: 'unavailable', reason: 'source_unavailable' })
})

describe("market search validation", () => {
  it("drops the retired capability-catalog parameters instead of erroring", () => {
    expect(
      validateMarketSearch({ category: "identity-compliance", capability: "web-search", availability: "routeable", cursor: "page-2" }),
    ).toEqual({});
  });

  it("accepts a 200-character query and preserves the directory filters", () => {
    const query = "x".repeat(SEARCH_QUERY_MAX_LENGTH);
    const filters = { sort: "relevance", provider: "PROVIDER.TEST", network: "base", maxUsdPrice: 0.25 };
    const search = validateMarketSearch({ query, ...filters });

    expect(search).toMatchObject({ query, sort: "relevance", provider: "provider.test", network: "base", maxUsdPrice: 0.25 });
  });

  it("drops an over-limit query instead of failing the page", () => {
    expect(validateMarketSearch({ query: "x".repeat(SEARCH_QUERY_MAX_LENGTH + 1), sort: "relevance", provider: "provider.test" })).toEqual({ sort: "relevance", provider: "provider.test" });
    expect(reads.catalogue).not.toHaveBeenCalled();
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

  it("toggles a compare set and carries it across Market search patches", () => {
    const first = "https://api.example.com/tools/first";
    const second = "https://api.example.com/tools/second";
    const third = "https://api.example.com/tools/third";
    const fourth = "https://api.example.com/tools/fourth";
    const fifth = "https://api.example.com/tools/fifth";

    expect(toggleMarketCompareRef([], first)).toEqual([first]);
    expect(toggleMarketCompareRef([first], first)).toEqual([]);
    expect(toggleMarketCompareRef([first, second, third, fourth], fifth)).toEqual([
      first,
      second,
      third,
      fourth,
    ]);
    expect(marketCompareParam([first, second])).toBe(`${first},${second}`);
    expect(marketCompareParam([])).toBeUndefined();

    const withCompare = { query: "image generation", compare: `${first},${second}` };
    expect(carryMarketCompare(withCompare, { query: "image generation", view: "tools" })).toEqual({
      query: "image generation",
      view: "tools",
      compare: `${first},${second}`,
    });
    expect(carryMarketCompare(withCompare, { view: "tools", compare: undefined })).toEqual({
      view: "tools",
    });
  });

  it("hydrates URL-selected Tools by ref in order and keeps unresolved refs", async () => {
    const first = "https://api.example.com/tools/first";
    const missing = "https://api.example.com/tools/missing";
    const firstEntry = {
      resource: first,
      title: "First Tool",
      description: "First description",
      protocol: "http",
      provider: "example.com",
      prices: [],
      metadataJson: "{}",
    };
    reads.resource.mockImplementation(async ({ data }: { data: { resource: string } }) =>
      data.resource === first
        ? { kind: "found_upstream", item: { entry: firstEntry } }
        : { kind: "not_found" },
    );
    const search = validateMarketSearch({ view: "tools", compare: `${first},${missing}` });

    expect(marketLoaderDeps(search)).toMatchObject({ view: "tools", compare: `${first},${missing}` });
    const loader = Route.options.loader;
    if (typeof loader !== "function") throw new Error("loader_missing");
    const data = await loader({ deps: marketLoaderDeps(search) } as never);

    expect(reads.resource.mock.calls.map(([call]) => ({ data: call.data }))).toEqual([
      { data: { resource: first } },
      { data: { resource: missing } },
    ]);
    expect(data.compareEntries).toEqual([
      { resource: first, entry: firstEntry },
      { resource: missing, missing: true },
    ]);
  });
});

it('keeps valid native filters and drops malformed ones', () => {
  expect(validateMarketSearch({ network: 'eip155:8453', provider: 'EXAMPLE.COM', maxUsdPrice: 0, view: 'providers' })).toEqual({ network: 'eip155:8453', provider: 'example.com', maxUsdPrice: 0, view: 'providers' })
  expect(validateMarketSearch({ provider: 'https://example.com/path', view: 'tools' })).toEqual({ view: 'tools' })
  expect(validateMarketSearch({ maxUsdPrice: -1, network: 'base' })).toEqual({ network: 'base' })
  expect(validateMarketSearch({ network: [], provider: 'example.com' })).toEqual({ provider: 'example.com' })
  expect(validateMarketSearch({ maxUsdPrice: 'oops', provider: 'example.com' })).toEqual({ provider: 'example.com' })
})


describe('indexed directory route', () => {
  it('keeps source categories and pagination separate from canonical market parameters', async () => {
    const search = validateMarketSearch({ directoryCategory: 'CREATIVE', indexCursor: 'native-next', sort: 'repeat' });
    expect(search).toEqual({ directoryCategory: 'creative', indexCursor: 'native-next', sort: 'repeat' });
    const loader = Route.options.loader;
    if (typeof loader !== 'function') throw new Error('loader_missing');
    const data = await loader({ deps: search } as never);
    expect(data).toMatchObject({ catalogue: { coverage: { indexedTotal: 4000 } } });
    expect(reads.catalogue).toHaveBeenCalledWith(expect.objectContaining({ data: { directoryCategory: 'creative', indexCursor: 'native-next', sort: 'repeat' } }));
    expect(reads.home).not.toHaveBeenCalled();
  });

  it('loads discovery without requesting unpainted catalogue sections or facets', async () => {
    const loader = Route.options.loader;
    if (typeof loader !== 'function') throw new Error('loader_missing');
    const data = await loader({ deps: {} } as never);
    expect(data).toMatchObject({ view: 'discover', home: undefined, overview: undefined, page: { items: [] } });
    expect(reads.catalogue).not.toHaveBeenCalled();
    expect(reads.home).not.toHaveBeenCalled();
    expect(reads.overview).not.toHaveBeenCalled();
  });

  it('does not depend on unused collection availability to show discovery', async () => {
    reads.home.mockRejectedValueOnce(new Error('collections unavailable'));
    const loader = Route.options.loader;
    if (typeof loader !== 'function') throw new Error('loader_missing');

    const data = await loader({ deps: {} } as never);

    expect(data).toMatchObject({ view: 'discover', home: undefined });
    expect(reads.home).not.toHaveBeenCalled();
  });

  it('loads the Host index without waiting for unused Tool facets', async () => {
    reads.overview.mockImplementation(() => new Promise(() => {}));
    const loader = Route.options.loader;
    if (typeof loader !== 'function') throw new Error('loader_missing');
    const data = await loader({ deps: { view: 'providers', query: 'example' } } as never);
    expect(data).toMatchObject({ view: 'providers', overview: undefined });
    expect(reads.providers).toHaveBeenCalledWith(expect.objectContaining({ data: { providerPrefix: 'example' } }));
    expect(reads.overview).not.toHaveBeenCalled();
    expect(reads.catalogue).not.toHaveBeenCalled();
  });

  it('does not expose the unfiltered index total as a filtered page match count', async () => {
    const loader = Route.options.loader;
    if (typeof loader !== 'function') throw new Error('loader_missing');
    const data = await loader({ deps: { provider: 'example.com' } } as never);
    expect(data).toMatchObject({ view: 'tools', catalogue: { coverage: { indexedTotal: 4000 } } });
    expect(reads.home).not.toHaveBeenCalled();
    if (data.page.kind !== 'ok') throw new Error('page_missing');
    expect(data.page.total).toBeUndefined();
  });

  it('keeps a keyword search when the sort does not apply and drops other malformed catalogue values', () => {
    expect(validateMarketSearch({ query: ' image ', sort: 'relevance', directoryCategory: 'Creative' })).toMatchObject({ query: 'image', sort: 'relevance', directoryCategory: 'creative' });
    const keyword = { query: 'audit-weather', sort: 'popular' as const }
    const validated = validateMarketSearch(keyword)
    expect(validated.sort).toBeUndefined()
    expect(Object.hasOwn(validated, 'sort')).toBe(true)
    expect({ ...keyword, ...validated }.sort).toBeUndefined()
    expect(marketLoaderDeps({ ...keyword, ...validated })).toEqual({ query: 'audit-weather' })
    expect(validateMarketSearch({ query: 'audit-weather', sort: 'popular' })).toMatchObject({ query: 'audit-weather' });
    expect(validateMarketSearch({ query: 'image', sort: 'updated' })).toEqual({ query: 'image' });
    expect(validateMarketSearch({ indexCursor: 'cursor', offset: 20 })).toEqual({ indexCursor: 'cursor' });
    expect(validateMarketSearch({ directoryCategory: '' })).toEqual({});
    expect(validateMarketSearch({ directoryCategory: 'x'.repeat(81), view: 'tools' })).toEqual({ view: 'tools' });
    expect(validateMarketSearch({ indexCursor: '' })).toEqual({});
    expect(validateMarketSearch({ sort: 'cheapest', view: 'tools' })).toEqual({ view: 'tools' });
    expect(validateMarketSearch({ priceBand: 'nope', query: 'audit-weather' })).toEqual({ query: 'audit-weather' });
    expect(validateMarketSearch({ minUsdPrice: 'not-a-number', view: 'tools' })).toEqual({ view: 'tools' });
    expect(validateMarketSearch({ providerCursor: '' })).toEqual({});
    expect(validateMarketSearch({ providerCursor: 'next-host', view: 'providers' })).toEqual({ providerCursor: 'next-host', view: 'providers' });
    expect(validateMarketSearch({ view: 'tools', page: '2' })).toEqual({ view: 'tools', page: 2 });
    expect(validateMarketSearch({ page: 1 })).toEqual({});
    expect(validateMarketSearch({ page: 'nope' })).toEqual({});
    expect(marketLoaderDeps(validateMarketSearch({ view: 'tools', page: 2 }))).toEqual({ view: 'tools' });
  });

  it('requests adoption for a Tools view with no sort', async () => {
    const loader = Route.options.loader;
    if (typeof loader !== 'function') throw new Error('loader_missing');
    const filters = { priceBand: '0_01_to_0_03', adoptionBand: '0', tags: ['search', 'a&b'], hasInputSchema: false, minPayers30d: 0, maxPayers30d: 4 };
    await loader({ deps: validateMarketSearch({ view: 'tools', ...filters }) } as never);
    expect(reads.catalogue).toHaveBeenLastCalledWith(expect.objectContaining({ data: { ...filters, sort: 'adoption' } }));
    await loader({ deps: validateMarketSearch({ view: 'tools' }) } as never);
    expect(reads.catalogue).toHaveBeenLastCalledWith(expect.objectContaining({ data: { sort: 'adoption' } }));
    reads.catalogue.mockClear();
    await loader({ deps: validateMarketSearch({ view: 'providers', query: 'api.', providerCursor: 'next-host' }) } as never);
    expect(reads.providers).toHaveBeenLastCalledWith(expect.objectContaining({ data: { providerPrefix: 'api.', providerCursor: 'next-host' } }));
    expect(reads.catalogue).not.toHaveBeenCalled();
    await loader({ deps: { providerCursor: 'legacy-host-page' } } as never);
    expect(reads.providers).toHaveBeenLastCalledWith(expect.objectContaining({ data: { providerCursor: 'legacy-host-page' } }));
    // Existing constrained links still group matching Tool results; their constraints are never dropped.
    reads.providers.mockClear();
    await loader({ deps: validateMarketSearch({ view: 'providers', maxUsdPrice: 1 }) } as never);
    expect(reads.catalogue).toHaveBeenLastCalledWith(expect.objectContaining({ data: { maxUsdPrice: 1, sort: 'adoption' } }));
    expect(reads.providers).not.toHaveBeenCalled();
    expect(marketLoaderDeps({ view: 'providers', page: 2 })).toEqual({ view: 'providers', page: 2 });
    await loader({ deps: { view: 'providers', page: 2 } } as never);
    expect(reads.providers).not.toHaveBeenCalled();
  });
});

describe('explorer filter validation', () => {
  it.each([{ minUsdPrice: 0.1, maxUsdPrice: 0.01 }, { minPayers30d: 5, maxPayers30d: 4 }, { minPayers30d: 0.5 }, { priceBand: 'cheap' }, { adoptionBand: 'none' }, { tags: 'search' }])('drops invalid explorer filters: %j', search => {
    expect(validateMarketSearch(search)).toEqual({});
  });

  it('accepts a boolean flag written as text', () => {
    expect(validateMarketSearch({ hasInputSchema: 'false' })).toEqual({ hasInputSchema: false });
  });
});

it('keeps the last catalogue when the next view cannot be read', async () => {
  reads.catalogue.mockRejectedValueOnce(new Error('aborted'));
  const loader = Route.options.loader;
  if (typeof loader !== 'function') throw new Error('loader_missing');
  const failed = await loader({ deps: { view: 'tools' } } as never);
  expect(failed.catalogue).toEqual({ kind: 'unavailable', reason: 'source_unavailable' });
  const previous = { page: { kind: 'ok' }, catalogue: { kind: 'ok', source: 'index' } as const };
  expect(retainedMarketCatalogue(previous, { page: failed.page, catalogue: failed.catalogue })).toEqual({ shown: previous, retainPrevious: true });
  expect(retainedMarketCatalogue(undefined, { page: failed.page, catalogue: failed.catalogue }).retainPrevious).toBe(false);
});

describe('catalogue display preference', () => {
  it('accepts the two layouts, rejects malformed preferences and keeps them out of catalogue loader dependencies', () => {
    const search = { view: 'tools' as const, query: 'weather', sort: 'relevance' as const, network: 'base', indexCursor: 'opaque-next', page: 2, compare: 'https://example.com/tool/1' }
    expect(validateMarketSearch({ ...search, layout: 'grid' })).toMatchObject({ ...search, layout: 'grid' })
    expect(validateMarketSearch({ layout: 'table' })).toEqual({ layout: 'table' })
    expect(validateMarketSearch({ layout: 'cards' })).toEqual({})
    expect(validateMarketSearch({ layout: ['grid'] })).toEqual({})
    expect(marketLoaderDeps({ ...search, layout: 'grid' })).toEqual(marketLoaderDeps({ ...search, layout: 'table' }))
    expect(marketLoaderDeps({ ...search, layout: 'grid' })).not.toHaveProperty('layout')
  })

  it('carries the layout across navigation while respecting explicit overrides', () => {
    const from = { layout: 'grid' as const, compare: 'https://example.com/tool/1' }
    expect(carryMarketCompare(from, { view: 'providers' })).toEqual({ view: 'providers', ...from })
    expect(carryMarketCompare(from, { layout: 'table', compare: undefined })).toEqual({ layout: 'table', compare: undefined })
    expect(carryMarketCompare(from, { layout: undefined })).toEqual({ layout: undefined, compare: from.compare })
  })
})

describe('exact admitted and external comparison reads', () => {
  it('uses canonical Tool identity without reclassifying a Host or endpoint', async () => {
    const toolRef = `operation:v1:${'a'.repeat(64)}`
    const tool = { toolRef, listing: { label: 'Admitted Tool' } }
    reads.tool.mockResolvedValue({ kind: 'found', tool })
    const loader = Route.options.loader
    if (typeof loader !== 'function') throw new Error('market_loader_missing')
    const result = await loader({ deps: { view: 'tools', compare: toolRef } } as never)
    expect(result.compareEntries).toEqual([{ resource: toolRef, tool }])
    expect(reads.tool).toHaveBeenCalledWith(expect.objectContaining({ data: { toolRef } }))
    expect(reads.resource).not.toHaveBeenCalled()
  })
  it('resolves a compact external ID through the exact index and requires current descriptor for its qualified join', async () => {
    const id = `registry:${'b'.repeat(64)}`, toolRef = `operation:v1:${'a'.repeat(64)}`
    reads.external.mockResolvedValue({ kind: 'found', item: { toolRef, entry: { resource: 'https://example.test/weather' } } })
    reads.tool.mockResolvedValue({ kind: 'not_found' })
    const loader = Route.options.loader
    if (typeof loader !== 'function') throw new Error('market_loader_missing')
    const result = await loader({ deps: { view: 'tools', compare: id } } as never)
    expect(reads.external).toHaveBeenCalledWith(expect.objectContaining({ data: { id } }))
    expect(reads.tool).toHaveBeenCalledWith(expect.objectContaining({ data: { toolRef } }))
    expect(result.compareEntries).toEqual([{ resource: id, missing: true }])
  })
})


describe('Router-owned canonical Market search', () => {
  const result = { kind: 'match', query: 'weather', results: [], assessed: { examined: 8 }, pagination: { hasMore: false }, next: [] }
  function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>(done => { resolve = done })
    return { promise, resolve }
  }
  async function routerForSearch() {
    const root = createRootRoute()
    const market = createRoute({
      getParentRoute: () => root, path: '/market', validateSearch: validateMarketSearch,
      loaderDeps: ({ search }) => marketLoaderDeps(search),
      beforeLoad: ({ matches, routeId }) => ({ previousCanonicalSearch: matches.find(match => match.routeId === routeId)?.loaderData as MarketCanonicalSearchPage | undefined }),
      loader: ({ deps, abortController, context }) => loadCanonicalMarketSearch(deps, { signal: abortController.signal, previousCanonicalSearch: context.previousCanonicalSearch }),
      ...(Route.options.staleTime === undefined ? {} : { staleTime: Route.options.staleTime }),
      ...(Route.options.preload === undefined ? {} : { preload: Route.options.preload }),
    })
    const detail = createRoute({ getParentRoute: () => root, path: '/tools/$toolRef' })
    const router = createRouter({ isServer: false, routeTree: root.addChildren([market, detail]), history: createMemoryHistory({ initialEntries: ['/market?view=tools&query=weather&network=eip155%3A8453'] }) })
    await router.load()
    return router
  }
  it('returns to the complete filtered input and loaded continuation without reading again', async () => {
    reads.search.mockResolvedValue(result)
    const router = await routerForSearch()
    await router.navigate({ to: '/market', search: { view: 'tools', query: 'weather', network: 'eip155:8453', indexCursor: 'opaque:page/two', page: 2 } })
    const page = router.state.matches.at(-1)?.loaderData
    await router.navigate({ to: '/tools/$toolRef', params: { toolRef: 'fixture' } })
    await router.navigate({ to: '/market', search: { view: 'tools', query: 'weather', network: 'eip155:8453', indexCursor: 'opaque:page/two', page: 2 } })
    expect(router.state.matches.at(-1)?.loaderData).toEqual(page)
    expect(reads.search).toHaveBeenCalledTimes(2)
    expect(reads.search).toHaveBeenLastCalledWith(expect.objectContaining({ data: { query: 'weather', limit: 8, filters: { networkId: 'eip155:8453' }, cursor: 'opaque:page/two' } }))
    await router.navigate({ to: '/market', search: { view: 'tools', query: 'weather', network: 'eip155:1' } })
    expect(reads.search).toHaveBeenCalledTimes(3)
  })
  it('retires a slow continuation before it can replace a newer search or its cached page', async () => {
    reads.search.mockResolvedValue(result)
    const router = await routerForSearch()
    const old = deferred<typeof result>()
    reads.search.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ ...result, query: 'storm' })
    const obsolete = router.navigate({ to: '/market', search: { view: 'tools', query: 'weather', indexCursor: 'opaque:old', page: 2 } })
    await vi.waitFor(() => expect(reads.search).toHaveBeenCalledTimes(2))
    const signal = reads.search.mock.calls[1]?.[0].signal as AbortSignal
    await router.navigate({ to: '/market', search: { view: 'tools', query: 'storm' } })
    expect(signal.aborted).toBe(true)
    old.resolve(result)
    await obsolete
    expect(router.state.location.search.query).toBe('storm')
    expect(router.state.matches.at(-1)?.loaderData).toMatchObject({ input: { query: 'storm' }, result: { query: 'storm' } })
    reads.search.mockResolvedValueOnce(result)
    await router.navigate({ to: '/market', search: { view: 'tools', query: 'weather', indexCursor: 'opaque:old', page: 2 } })
    expect(reads.search).toHaveBeenCalledTimes(4)
  })
  it('does not launch an external search when a typed-query link is merely preloaded', async () => {
    reads.search.mockResolvedValue(result)
    const router = await routerForSearch()
    await router.preloadRoute({ to: '/market', search: { view: 'tools', query: 'private new draft' } })
    expect(reads.search).toHaveBeenCalledTimes(1)
  })
  it('keeps the exact last-good page in the Router cache after a failed refresh and detail round trip', async () => {
    reads.search.mockResolvedValueOnce(result).mockRejectedValueOnce(new Error('refresh unavailable'))
    const router = await routerForSearch()
    await router.invalidate({ filter: match => match.routeId === '/market' })
    expect(router.state.matches.at(-1)?.loaderData).toMatchObject({ result, refreshFailed: true })
    await router.navigate({ to: '/tools/$toolRef', params: { toolRef: 'fixture' } })
    await router.navigate({ to: '/market', search: { view: 'tools', query: 'weather', network: 'eip155:8453' } })
    expect(router.state.matches.at(-1)?.loaderData).toMatchObject({ result, refreshFailed: true })
    expect(reads.search).toHaveBeenCalledTimes(2)
  })
  it('bounds a transport that never settles and aborts its read signal', async () => {
    vi.useFakeTimers()
    reads.search.mockReturnValue(new Promise(() => {}))
    try {
      const pending = loadCanonicalMarketSearch({ view: 'tools', query: 'weather' })
      const signal = reads.search.mock.calls[0]?.[0].signal as AbortSignal
      await vi.advanceTimersByTimeAsync(15_000)
      await expect(pending).resolves.toMatchObject({ input: { query: 'weather' }, result: undefined })
      expect(signal.aborted).toBe(true)
    } finally { vi.useRealTimers() }
  })
  it('marks failed canonical refreshes for last-good display retention', () => {
    const catalogue = { kind: 'ok', source: 'index' } as const
    const good = { page: { kind: 'ok' }, catalogue, canonicalSearch: { input: { query: 'weather', limit: 8 }, result } }
    const failed = { ...good, canonicalSearch: { ...good.canonicalSearch, result: undefined } }
    expect(retainedMarketCatalogue(good as never, failed as never)).toEqual({ shown: good, retainPrevious: true })
  })
})


describe('complete Market route deadline', () => {
  it('settles hanging catalogue and overview reads as unavailable', async () => {
    vi.useFakeTimers()
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
      const controller = new AbortController()
      setTimeout(() => controller.abort(new DOMException('Read timed out', 'TimeoutError')), ms)
      return controller.signal
    })
    reads.catalogue.mockReturnValue(new Promise(() => {}))
    reads.overview.mockReturnValue(new Promise(() => {}))
    try {
      const loader = Route.options.loader
      if (typeof loader !== 'function') throw new Error('market_loader_missing')
      const pending = loader({ deps: { view: 'tools' } } as never)
      await vi.advanceTimersByTimeAsync(15_000)
      await expect(pending).resolves.toMatchObject({ page: { kind: 'unavailable' }, catalogue: { kind: 'unavailable', reason: 'source_unavailable' }, overview: { kind: 'unavailable', reason: 'source_unavailable' } })
      expect(reads.catalogue.mock.calls[0]?.[0].signal.aborted).toBe(true)
      expect(reads.overview.mock.calls[0]?.[0].signal.aborted).toBe(true)
    } finally { timeout.mockRestore(); vi.useRealTimers() }
  })
  it('keeps a completed catalogue while a selected comparison times out', async () => {
    vi.useFakeTimers()
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
      const controller = new AbortController()
      setTimeout(() => controller.abort(new DOMException('Read timed out', 'TimeoutError')), ms)
      return controller.signal
    })
    const toolRef = `operation:v1:${'a'.repeat(64)}`
    reads.tool.mockReturnValue(new Promise(() => {}))
    try {
      const loader = Route.options.loader
      if (typeof loader !== 'function') throw new Error('market_loader_missing')
      const pending = loader({ deps: { view: 'tools', compare: toolRef } } as never)
      await vi.advanceTimersByTimeAsync(15_000)
      await expect(pending).resolves.toMatchObject({ page: { kind: 'ok' }, catalogue: { kind: 'ok' }, compareEntries: [{ resource: toolRef, missing: true }] })
      expect(reads.tool.mock.calls[0]?.[0].signal.aborted).toBe(true)
    } finally { timeout.mockRestore(); vi.useRealTimers() }
  })
})
