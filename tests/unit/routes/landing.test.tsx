/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import type { LandingData } from '@/components/ae/home/landing.functions'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'

vi.mock('@tanstack/react-start', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-start')>()),
  createServerFn: () => ({ handler: (handler: unknown) => handler }),
}))
const reads = vi.hoisted(() => ({ catalogue: vi.fn(), resource: vi.fn(), analytics: vi.fn() }))
vi.mock('@/modules/market/x402-directory-index.functions', () => ({
  readX402DirectoryCatalogueServer: reads.catalogue,
  readX402DirectoryCatalogueResourceServer: reads.resource,
  readX402DirectoryAnalyticsServer: reads.analytics,
  readX402DirectoryProvidersServer: vi.fn(),
}))
vi.mock('@/modules/money/reference-rate.server', () => ({ readPersistedReferenceRate: async () => undefined }))
vi.mock('@/lib/observability/capture-route-exception', () => ({ captureRouteException: vi.fn() }))

const listing = (provider: string, title: string, extra: Partial<X402DirectoryEntry> = {}): X402DirectoryEntry => ({
  resource: `https://${provider}/${title.toLowerCase().replaceAll(' ', '-')}`,
  title,
  description: title,
  protocol: 'http',
  provider,
  metadataJson: '{}',
  slug: title.toLowerCase().replaceAll(' ', '-'),
  prices: [{ network: 'eip155:8453', networkLabel: 'Base', scheme: 'exact', amount: '0.01 USDC', decimalAmount: '0.01', symbol: 'USDC' }],
  ...extra,
})

const ok = (items: readonly X402DirectoryEntry[]) => ({ kind: 'ok', page: { items } })

async function freshLanding() {
  vi.resetModules()
  return import('@/components/ae/home/landing.functions')
}

beforeEach(() => {
  for (const read of Object.values(reads)) read.mockReset()
  reads.catalogue.mockResolvedValue(ok([]))
  reads.resource.mockResolvedValue({ kind: 'not_found' })
  reads.analytics.mockResolvedValue({ kind: 'ok', totalTools: 120, price: { bands: [], knownPriceTools: 0 } })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('landing read', () => {
  it('reads the popular grid in the /market default order, one card per provider', async () => {
    reads.catalogue.mockImplementation(async ({ data }: { data: { query?: string } }) => data.query === undefined
      ? ok([listing('alpha.test', 'Weather now'), listing('alpha.test', 'Weather later'), listing('beta.test', 'Currency rates')])
      : ok([]))
    const { readLandingServer } = await freshLanding()
    const landing = await readLandingServer()
    expect(reads.catalogue).toHaveBeenCalledWith({ data: { sort: 'adoption' } })
    expect(landing.popular.map(entry => entry.provider)).toEqual(['alpha.test', 'beta.test'])
  })

  it('fills a task only from a top match that names its job, with the provider sample and its input', async () => {
    const forecast = listing('gamma.test', 'Weather forecast')
    reads.catalogue.mockImplementation(async ({ data }: { data: { query?: string } }) => data.query === 'weather forecast'
      ? ok([listing('delta.test', 'Image resize'), forecast])
      : ok([]))
    reads.resource.mockResolvedValue({ kind: 'found', item: { entry: {
      ...forecast,
      input: { fields: [], exampleJson: '{"city":"Sydney"}' },
      output: { fields: [], exampleJson: JSON.stringify({ city: 'Sydney', empty: '', a: 1, b: 2, c: 3, d: 4, e: 5 }) },
    } } })
    const { readLandingServer } = await freshLanding()
    const [task] = (await readLandingServer()).tasks
    expect(task?.entry.resource).toBe(forecast.resource)
    expect(task?.input).toBe('{"city":"Sydney"}')
    // Placeholder fields are dropped and the pane keeps five whole lines.
    expect(task?.sample?.split('\n')).toHaveLength(6)
    expect(task?.sample).not.toContain('empty')
  })

  it('keeps serving the landing when the live count fails, without re-reading on every visit', async () => {
    reads.analytics.mockRejectedValue(new Error('analytics down'))
    reads.catalogue.mockImplementation(async ({ data }: { data: { query?: string } }) => data.query === undefined ? ok([listing('alpha.test', 'Weather now')]) : ok([]))
    const { readLandingServer } = await freshLanding()
    const first = await readLandingServer()
    expect(first.stats).toBeUndefined()
    const reads1 = reads.catalogue.mock.calls.length
    await expect(readLandingServer()).resolves.toEqual(first)
    expect(reads.catalogue.mock.calls.length).toBe(reads1)
  })
})

const landing: LandingData = {
  popular: [listing('alpha.test', 'Weather now')],
  rows: [],
  tasks: [
    { id: 'weather', title: 'Get tomorrow’s weather for a city', entry: listing('alpha.test', 'Weather now'), sample: '{\n  "city": "Sydney"\n}', input: '{"city":"Sydney"}' },
    { id: 'fx', title: 'Convert 100 AUD to USD', entry: listing('beta.test', 'Currency rates'), request: 'GET beta.test/currency-rates' },
    { id: 'translate', title: 'Translate a paragraph', entry: listing('gamma.test', 'Translate text'), request: 'POST gamma.test/translate-text' },
  ],
}

async function renderLanding(data: Promise<LandingData>) {
  const { AeLanding, LandingError } = await import('@/components/ae/home/AeLanding')
  const root = createRootRoute()
  const routeTree = root.addChildren([
    createRoute({ getParentRoute: () => root, path: '/', component: () => <AeLanding data={data} />, errorComponent: LandingError }),
    createRoute({ getParentRoute: () => root, path: '/market' }),
  ])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  render(<RouterProvider router={router} />)
}

describe('AeLanding', () => {
  it('names the buyer and the mechanism in the hero', async () => {
    await renderLanding(Promise.resolve(landing))
    expect(await screen.findByText(/AI agents/u)).toBeTruthy()
  })

  it('exposes each task’s example to assistive tech and labels requests as requests', async () => {
    await renderLanding(Promise.resolve(landing))
    const sample = await screen.findByText(/"city": "Sydney"/u)
    expect(sample.closest('[aria-hidden="true"]')).toBeNull()
    expect(screen.getByText('{"city":"Sydney"}').closest('[aria-hidden="true"]')).toBeNull()
    expect(screen.getAllByText('Request')).toHaveLength(2)
    expect(screen.getByText('GET beta.test/currency-rates').closest('[aria-hidden="true"]')).toBeNull()
  })

  it('shows the rows-unavailable state when the directory read rejects', async () => {
    const failed = Promise.reject(new Error('directory down'))
    failed.catch(() => undefined)
    await renderLanding(failed)
    expect(await screen.findByRole('heading', { name: 'Tools are catching up' })).toBeTruthy()
  })
})
