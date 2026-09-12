/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterContextProvider } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const mocks = vi.hoisted(() => ({
  getRequest: vi.fn(),
  readServerReadiness: vi.fn(),
  buildSiteDiscoveryManifest: vi.fn(),
  readCatalogueFreshness: vi.fn(),
  invalidate: vi.fn(async () => undefined),
}))

vi.mock('@tanstack/react-start', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-start')>()),
  createServerFn: () => ({ handler: (handler: unknown) => handler }),
}))
vi.mock('@tanstack/react-start/server', () => ({
  getRequest: mocks.getRequest,
}))
vi.mock('@/lib/server/readiness', () => ({
  readServerReadiness: mocks.readServerReadiness,
}))
vi.mock('@/modules/discovery/public', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/discovery/public')>()),
  buildSiteDiscoveryManifest: mocks.buildSiteDiscoveryManifest,
}))
vi.mock('@/modules/market/x402-directory-index.server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/market/x402-directory-index.server')>()),
  readCatalogueFreshness: mocks.readCatalogueFreshness,
}))
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useRouter: () => ({ invalidate: mocks.invalidate }),
}))
vi.mock('@/components/ae/layout/AePublicPage', () => ({
  AePublicPage: ({ actions, children, title }: { actions: ReactNode; children: ReactNode; title: string }) => (
    <main>
      <h1>{title}</h1>
      <div>{actions}</div>
      {children}
    </main>
  ),
}))

import { readStatusProbesServer, type StatusProbesResult } from '@/routes/-status.functions'
import { Route } from '@/routes/status'

function operationalManifest() {
  return { schemaVersion: 'ae-site-discovery:v2', name: 'Agentic Economy', origin: 'https://ae.test', endpoints: [], toolGateway: {} }
}

function readyDefaults() {
  mocks.getRequest.mockReturnValue(new Request('http://localhost/status'))
  mocks.readServerReadiness.mockResolvedValue({ status: 'ready' })
  mocks.buildSiteDiscoveryManifest.mockReturnValue(operationalManifest())
  mocks.readCatalogueFreshness.mockResolvedValue({ schemaVersion: 'catalogue-status:v1', status: 'fresh' })
}

beforeEach(() => {
  readyDefaults()
  vi.stubEnv('AE_RELEASE_SOURCE_REVISION', 'a'.repeat(40))
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('readStatusProbesServer', () => {
  it('reports every probe operational when every reader is healthy', async () => {
    const result = await readStatusProbesServer()
    expect(result.checks).toHaveLength(5)
    expect(result.checks.map((check) => check.id)).toEqual(['site', 'market', 'discovery', 'release', 'catalogue'])
    for (const check of result.checks) {
      expect(check.state).toBe('operational')
      expect(check.requestRef).toBeUndefined()
    }
    expect(result.checkedAt).toEqual(expect.any(String))
  })

  it('degrades the market probe when readiness is not ready and attaches a request reference', async () => {
    mocks.readServerReadiness.mockResolvedValue({ status: 'not_ready' })
    const result = await readStatusProbesServer()
    const market = result.checks.find((check) => check.id === 'market')
    expect(market?.state).toBe('degraded')
    expect(market?.detail).toMatch(/New Calls may fail/)
    expect(market?.requestRef).toEqual(expect.any(String))
  })

  it('degrades discovery when the manifest contract is invalid', async () => {
    mocks.buildSiteDiscoveryManifest.mockReturnValue({ ...operationalManifest(), name: 'Wrong Name' })
    const result = await readStatusProbesServer()
    const discovery = result.checks.find((check) => check.id === 'discovery')
    expect(discovery?.state).toBe('degraded')
    expect(discovery?.detail).toMatch(/machine-discovery contract is invalid/)
  })

  it('degrades release identity when the environment contract is unmet', async () => {
    vi.stubEnv('AE_RELEASE_SOURCE_REVISION', '')
    const result = await readStatusProbesServer()
    const release = result.checks.find((check) => check.id === 'release')
    expect(release?.state).toBe('degraded')
    expect(release?.detail).toMatch(/Release identity is unavailable/)
  })

  it('degrades catalogue freshness when the directory reports stale coverage', async () => {
    mocks.readCatalogueFreshness.mockResolvedValue({ schemaVersion: 'catalogue-status:v1', status: 'stale' })
    const result = await readStatusProbesServer()
    const catalogue = result.checks.find((check) => check.id === 'catalogue')
    expect(catalogue?.state).toBe('degraded')
    expect(catalogue?.detail).toMatch(/catalogue is stale/)
  })

  it('settles a rejected reader as an explicit unreachable degradation instead of failing the page', async () => {
    mocks.readCatalogueFreshness.mockRejectedValue(new Error('convex_unreachable'))
    const result = await readStatusProbesServer()
    const catalogue = result.checks.find((check) => check.id === 'catalogue')
    expect(catalogue?.state).toBe('degraded')
    expect(catalogue?.detail).toMatch(/could not be checked/)
  })

  it('bounds a hung reader with the per-probe timeout instead of hanging the page', async () => {
    mocks.readServerReadiness.mockReturnValue(new Promise(() => {}))
    const result = await readStatusProbesServer()
    const market = result.checks.find((check) => check.id === 'market')
    expect(market?.state).toBe('degraded')
    expect(market?.detail).toMatch(/could not be reached/)
  }, 10_000)
})

describe('/status route', () => {
  it('renders every probe from the initial loader data with no client refetch', () => {
    renderRoute({
      checkedAt: '9:05:06 AM',
      checks: [
        { id: 'site', state: 'operational', detail: 'Public pages are responding.' },
        { id: 'market', state: 'operational', detail: 'Tool search and new Calls are ready.' },
        { id: 'discovery', state: 'operational', detail: 'Agents can discover the current AE interfaces.' },
        { id: 'release', state: 'operational', detail: 'Deployment identity is available.' },
        { id: 'catalogue', state: 'operational', detail: 'The Tool catalogue was refreshed within the last 36 hours.' },
      ],
    })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('All systems operational.')
    expect(screen.getAllByText('Operational')).toHaveLength(5)
    expect(screen.getByRole('status').textContent).toBe('Status checked. All 5 systems are operational. Last checked 9:05:06 AM.')
    expect(screen.getByRole('button', { name: 'Refresh status' })).toBeTruthy()
  })

  it('renders a degraded probe with its request reference and call-safety recovery guidance', () => {
    renderRoute({
      checkedAt: '9:06:07 AM',
      checks: [
        { id: 'site', state: 'operational', detail: 'Public pages are responding.' },
        { id: 'market', state: 'degraded', detail: 'New Calls may fail. Check existing Calls before retrying.', requestRef: 'corr_status_01' },
        { id: 'discovery', state: 'operational', detail: 'Agents can discover the current AE interfaces.' },
        { id: 'release', state: 'operational', detail: 'Deployment identity is available.' },
        { id: 'catalogue', state: 'operational', detail: 'The Tool catalogue was refreshed within the last 36 hours.' },
      ],
    })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Some systems are degraded.')
    expect(screen.getByText('Degraded')).toBeTruthy()
    expect(screen.getByText(
      'Status checked. 1 of 5 systems needs attention: Tool API. Last checked 9:06:07 AM.',
    ).getAttribute('role')).toBe('status')
    expect(screen.getByText('Request reference').textContent).toBe('Request reference')
    expect(screen.getByText('corr_status_01').tagName).toBe('CODE')
    expect(screen.getByRole('heading', { level: 2, name: 'Check existing calls before retrying' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open Calls' }).getAttribute('href')).toBe('/activity')
  })

  it('routes non-call-safety degradations to the support recovery path', () => {
    renderRoute({
      checkedAt: '9:07:08 AM',
      checks: [
        { id: 'site', state: 'operational', detail: 'Public pages are responding.' },
        { id: 'market', state: 'operational', detail: 'Tool search and new Calls are ready.' },
        { id: 'discovery', state: 'degraded', detail: 'Machine discovery could not be reached. Agent setup may fail.', requestRef: 'corr_status_02' },
        { id: 'release', state: 'operational', detail: 'Deployment identity is available.' },
        { id: 'catalogue', state: 'operational', detail: 'The Tool catalogue was refreshed within the last 36 hours.' },
      ],
    })
    const region = screen.getByRole('region', { name: 'Retry after the affected system recovers' })
    expect(within(region).getByRole('link', { name: 'Help' }).getAttribute('href')).toBe('/support')
  })

  it('copies a degraded probe request reference to the clipboard', async () => {
    renderRoute({
      checkedAt: '9:08:09 AM',
      checks: [
        { id: 'site', state: 'operational', detail: 'Public pages are responding.' },
        { id: 'market', state: 'degraded', detail: 'New Calls may fail. Check existing Calls before retrying.', requestRef: 'corr_status_03' },
        { id: 'discovery', state: 'operational', detail: 'Agents can discover the current AE interfaces.' },
        { id: 'release', state: 'operational', detail: 'Deployment identity is available.' },
        { id: 'catalogue', state: 'operational', detail: 'The Tool catalogue was refreshed within the last 36 hours.' },
      ],
    })
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    fireEvent.click(screen.getByRole('button', { name: 'Copy Tool API request reference' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('corr_status_03'))
  })

  it('marks the list busy and disables the button while a manual refresh reloads the loader', async () => {
    let releaseInvalidate: () => void = () => {}
    mocks.invalidate.mockImplementation(() => new Promise<undefined>((resolve) => { releaseInvalidate = () => resolve(undefined) }))
    renderRoute({
      checkedAt: '9:09:10 AM',
      checks: [
        { id: 'site', state: 'operational', detail: 'Public pages are responding.' },
        { id: 'market', state: 'operational', detail: 'Tool search and new Calls are ready.' },
        { id: 'discovery', state: 'operational', detail: 'Agents can discover the current AE interfaces.' },
        { id: 'release', state: 'operational', detail: 'Deployment identity is available.' },
        { id: 'catalogue', state: 'operational', detail: 'The Tool catalogue was refreshed within the last 36 hours.' },
      ],
    })

    fireEvent.click(screen.getByRole('button', { name: 'Refresh status' }))
    const busyButton = screen.getByRole('button', { name: 'Checking status…' })
    expect(busyButton).toHaveProperty('disabled', true)
    expect(busyButton.getAttribute('aria-busy')).toBe('true')
    expect(screen.getByRole('list').getAttribute('aria-busy')).toBe('true')
    expect(screen.getByRole('status').textContent).toBe('Checking all systems…')
    expect(mocks.invalidate).toHaveBeenCalledTimes(1)

    releaseInvalidate()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh status' })).toHaveProperty('disabled', false))
  })
})

function renderRoute(loaderData: StatusProbesResult) {
  vi.spyOn(Route, 'useLoaderData').mockReturnValue(loaderData as never)
  const Component = Route.options.component
  if (Component === undefined) throw new Error('status_route_component_missing')
  const rootRoute = createRootRoute()
  const router = createRouter({
    routeTree: rootRoute.addChildren([createRoute({ getParentRoute: () => rootRoute, path: '/' })]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return render(
    <RouterContextProvider router={router}>
      <Component />
    </RouterContextProvider>,
  )
}
