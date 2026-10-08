/** @vitest-environment jsdom */
import { createElement, type ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RouterContextProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

vi.mock('@/components/ae/layout/AePageState', () => ({
  AePageState: ({ title, description, action }: { title: string; description: string; action?: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {action}
    </main>
  ),
}))

import { Route as FundingRoute } from '@/routes/fund.$fundingSessionId'
import { Route as CancelledRoute } from '@/routes/fund.cancelled'

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.spyOn(FundingRoute, 'useParams').mockReturnValue({ fundingSessionId: 'cs_agent_one' })
  vi.spyOn(FundingRoute, 'useSearch').mockReturnValue({})
  vi.spyOn(CancelledRoute, 'useSearch').mockReturnValue({})
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  fetchMock.mockReset()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function funding(state: 'awaiting_payment' | 'processing' | 'ready' | 'expired' | 'failed') {
  return {
    state,
    agentName: 'Research Agent',
    creditAmount: { currency: 'AUD', units: '10000000', exponent: 6 },
  } as const
}

function found(state: ReturnType<typeof funding>['state']): Response {
  return Response.json({ success: true, funding: funding(state) })
}

function renderFundingReturn() {
  const Component = FundingRoute.options.component
  if (Component === undefined) throw new Error('funding_return_component_missing')
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/agent-access' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/owner/credit' }),
  ])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  render(<RouterContextProvider router={router}>{createElement(Component)}</RouterContextProvider>)
}

describe('public funding return', () => {
  it('rechecks processing against the same funding session until credit is ready', async () => {
    fetchMock.mockResolvedValueOnce(found('processing')).mockResolvedValueOnce(found('ready'))

    renderFundingReturn()

    expect(await screen.findByRole('heading', { name: 'Payment received' })).toBeTruthy()
    expect(screen.getByText(/Do not start another payment/u)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Check this payment' }))

    expect(await screen.findByRole('heading', { name: 'Credit added' })).toBeTruthy()
    expect(screen.getByText(/^Paid\. A\$10\.00 is now available/u)).toBeTruthy()
    expect(screen.getByText(/Credit does not grant spending authority/u)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open Agents' }).getAttribute('href')).toBe('/agent-access')
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/account/funding-sessions/public/cs_agent_one',
      '/api/v1/account/funding-sessions/public/cs_agent_one',
    ])
  })

  it('hands confirmed funding back to the original task without duplicating payment or purchase', async () => {
    fetchMock.mockResolvedValueOnce(found('ready'))
    const writeText = vi.fn(async (_text: string) => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    renderFundingReturn()
    fireEvent.click(await screen.findByRole('button', { name: 'Copy instruction for your Agent' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    const instruction = writeText.mock.calls[0]?.[0]
    expect(instruction).toContain('funding.handoff.status for fundingSessionId "cs_agent_one"')
    expect(instruction).toContain('check that same Call')
    expect(instruction).toContain('fresh Quote')
    expect(instruction).toContain('Check current authority')
    expect(instruction).toContain('Do not start another payment')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keeps the same observed payment visible and blocks another native check while pending', async () => {
    let resolveRefresh!: (response: Response) => void
    const refresh = new Promise<Response>((resolve) => { resolveRefresh = resolve })
    fetchMock.mockResolvedValueOnce(found('processing')).mockReturnValueOnce(refresh)

    renderFundingReturn()
    fireEvent.click(await screen.findByRole('button', { name: 'Check this payment' }))
    const pending = await screen.findByRole('button', { name: 'Checking this payment…' })
    expect(pending.hasAttribute('disabled')).toBe(true)
    expect(pending.getAttribute('aria-busy')).toBe('true')
    expect(screen.getByRole('heading', { name: 'Payment received' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Open Credit' })).toBeNull()
    fireEvent.click(pending)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    resolveRefresh(found('ready'))
    expect(await screen.findByRole('heading', { name: 'Credit added' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Check/u })).toBeNull()
  })

  it('keeps transient and awaiting states retryable without offering another payment', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce(found('awaiting_payment'))
      .mockResolvedValueOnce(found('processing'))

    renderFundingReturn()

    expect(await screen.findByRole('heading', { name: 'Funding status unavailable' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Payment not completed' })).toBeTruthy()
    expect(screen.getByText(/original secure checkout/u)).toBeTruthy()
    expect(screen.getByText(/Do not start another payment/u)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Check this payment' }))

    expect(await screen.findByRole('heading', { name: 'Payment received' })).toBeTruthy()
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/account/funding-sessions/public/cs_agent_one',
      '/api/v1/account/funding-sessions/public/cs_agent_one',
      '/api/v1/account/funding-sessions/public/cs_agent_one',
    ])
  })

  it('preserves the last confirmed payment state when a refresh fails', async () => {
    fetchMock.mockResolvedValueOnce(found('processing')).mockRejectedValueOnce(new Error('network unavailable'))

    renderFundingReturn()

    expect(await screen.findByRole('heading', { name: 'Payment received' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Check this payment' }))

    expect(await screen.findByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Payment received' })).toBeTruthy()
    expect(screen.getByText(/last confirmed state/u)).toBeTruthy()
    expect(screen.getByText(/Do not start another payment/u)).toBeTruthy()
  })

  it.each([
    ['expired', 'Funding link expired'],
    ['failed', 'Payment failed'],
  ] as const)('gives terminal %s state one permitted restart path', async (state, title) => {
    fetchMock.mockResolvedValueOnce(found(state))

    renderFundingReturn()

    expect(await screen.findByRole('heading', { name: title })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open Credit' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Check/u })).toBeNull()
  })

  it('distinguishes an invalid funding link from a retryable source failure', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({}, { status: 404 }))

    renderFundingReturn()

    expect(await screen.findByRole('heading', { name: 'Invalid funding link' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open Credit' }).getAttribute('href')).toBe('/owner/credit')
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })
})

describe('Checkout return without a confirmed outcome', () => {
  it('directs the buyer to Credit without offering a new payment', () => {
    const Component = CancelledRoute.options.component
    if (Component === undefined) throw new Error('funding_cancelled_component_missing')
    const rootRoute = createRootRoute()
    const routeTree = rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: '/' }),
      createRoute({ getParentRoute: () => rootRoute, path: '/agent-access' }),
      createRoute({ getParentRoute: () => rootRoute, path: '/owner/credit' }),
    ])
    const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
    render(<RouterContextProvider router={router}>{createElement(Component)}</RouterContextProvider>)
    expect(screen.getByRole('link', { name: 'Open Credit' }).getAttribute('href')).toBe('/owner/credit')
    expect(screen.getByRole('link', { name: 'Open Agents' }).getAttribute('href')).toBe('/agent-access')
    expect(screen.queryByRole('link', { name: 'Try again' })).toBeNull()
  })
})
