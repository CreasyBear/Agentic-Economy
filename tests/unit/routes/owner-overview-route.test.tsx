/** @vitest-environment jsdom */
import { createElement } from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import { RouterContextProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const reads = vi.hoisted(() => ({ balance: vi.fn(), calls: vi.fn(), agents: vi.fn(), provider: vi.fn() }))
vi.mock('@/modules/money/money.functions', () => ({ readAccountFundingBalanceServer: reads.balance }))
vi.mock('@/lib/server/call-history.functions', () => ({ readOwnerCallsServer: reads.calls }))
vi.mock('@/lib/server/agent-access-console.functions', () => ({ readAgentDirectoryServer: reads.agents }))
vi.mock('@/components/ae/offerings/provider-workspace.functions', () => ({ readProviderWorkspacePublicStatusServer: reads.provider }))

import { Route } from '@/routes/_operator/owner.index'

const availableBalance = { kind: 'available', accountRef: 'acct_one', balance: { currency: 'AUD', units: '25000000', exponent: 6 }, locked: false, version: 3 } as const
const calls = { page: [
  { callRef: 'call_attention', state: 'outcome_unknown', deliveryState: 'unknown', paymentState: 'unknown' },
  { callRef: 'call_done', state: 'completed', deliveryState: 'delivered', paymentState: 'settled' },
], continueCursor: 'next', isDone: false }
const agents = { items: [{ principalRef: 'prn_one', status: 'connected' }, { principalRef: 'prn_two', status: 'attention' }], details: [] }

beforeEach(() => {
  reads.balance.mockReset().mockResolvedValue(availableBalance)
  reads.calls.mockReset().mockResolvedValue(calls)
  reads.agents.mockReset().mockResolvedValue(agents)
  reads.provider.mockReset().mockResolvedValue({ kind: 'not_applicable' })
})
afterEach(cleanup)

async function loadOverview() {
  const loader = Route.options.loader
  if (typeof loader !== 'function') throw new Error('owner_overview_loader_missing')
  return await loader({} as never)
}

function renderOverview(loaderData: Awaited<ReturnType<typeof loadOverview>>) {
  vi.spyOn(Route, 'useLoaderData').mockReturnValue(loaderData)
  const Component = Route.options.component
  if (Component === undefined) throw new Error('owner_overview_component_missing')
  const root = createRootRoute()
  const routeTree = root.addChildren([
    createRoute({ getParentRoute: () => root, path: '/owner' }),
    createRoute({ getParentRoute: () => root, path: '/market' }),
    createRoute({ getParentRoute: () => root, path: '/activity' }),
    createRoute({ getParentRoute: () => root, path: '/agent-access' }),
    createRoute({ getParentRoute: () => root, path: '/owner/credit' }),
    createRoute({ getParentRoute: () => root, path: '/owner/operations' }),
  ])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/owner'] }) })
  render(<RouterContextProvider router={router}>{createElement(Component)}</RouterContextProvider>)
}

describe('owner Overview', () => {
  it('keeps the Account summary recognizable and makes the attention Call the one next action', async () => {
    renderOverview(await loadOverview())

    expect(screen.getByRole('heading', { name: 'Overview' })).toBeTruthy()
    expect(screen.getByText('Review Credit, Calls needing attention, and Agents.')).toBeTruthy()
    expect(screen.getByText('A$25.00')).toBeTruthy()
    expect(screen.getByText('At least 1 Call needs attention')).toBeTruthy()
    expect(screen.queryByText('2 connected Agents')).toBeNull()
    expect(screen.getByRole('link', { name: 'Review Spending policy' }).getAttribute('href')).toBe('/agent-access')
    expect(document.querySelectorAll('a.bg-primary')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Review Call' }).getAttribute('href')).toBe('/activity')
    expect(screen.getAllByRole('link', { name: 'Check Credit' })).toHaveLength(1)
    expect(screen.queryByText('Provider workspace')).toBeNull()
    expect(screen.queryByText('Want to offer a service?')).toBeNull()
    const nextStep = screen.getByRole('region', { name: 'Next step' })
    const summary = screen.getByRole('region', { name: 'Account summary' })
    expect(nextStep.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('preserves known Calls and Agents when the Credit read fails', async () => {
    reads.balance.mockRejectedValueOnce(new Error('balance unavailable'))
    renderOverview(await loadOverview())

    expect(screen.getByText('Credit unavailable')).toBeTruthy()
    expect(screen.getByText('Nothing was charged.')).toBeTruthy()
    expect(screen.queryByText('A$25.00')).toBeNull()
    expect(screen.getByText('At least 1 Call needs attention')).toBeTruthy()
    expect(screen.queryByText('2 connected Agents')).toBeNull()
    expect(screen.getByRole('link', { name: 'Review Call' })).toBeTruthy()
  })

  it('distinguishes unavailable Calls from a complete zero and keeps one Credit action', async () => {
    reads.calls.mockRejectedValueOnce(new Error('calls unavailable'))
    renderOverview(await loadOverview())

    expect(screen.getByText('Calls unavailable')).toBeTruthy()
    expect(screen.getByText('Nothing was charged.')).toBeTruthy()
    expect(screen.queryByText('No Calls need attention')).toBeNull()
    expect(screen.getAllByRole('link', { name: 'Check Credit' })).toHaveLength(1)
    cleanup()

    reads.calls.mockResolvedValueOnce({ page: [], continueCursor: '', isDone: true })
    reads.balance.mockRejectedValueOnce(new Error('balance unavailable'))
    renderOverview(await loadOverview())

    expect(screen.getByText('No Calls need attention')).toBeTruthy()
    expect(screen.queryByText('Calls unavailable')).toBeNull()
    expect(screen.getAllByRole('link', { name: 'Check Credit' })).toHaveLength(1)
  })

  it('does not turn an incomplete Calls page into a complete zero', async () => {
    reads.calls.mockResolvedValueOnce({
      page: [{ callRef: 'call_recent', state: 'completed', deliveryState: 'delivered', paymentState: 'settled' }],
      continueCursor: 'next',
      isDone: false,
    })
    renderOverview(await loadOverview())

    expect(screen.getByText('No attention in recent Calls')).toBeTruthy()
    expect(screen.queryByText('No Calls need attention')).toBeNull()
    expect(screen.getByRole('link', { name: 'Check Calls' }).getAttribute('href')).toBe('/activity')
    expect(screen.queryByRole('link', { name: 'Explore Market' })).toBeNull()
  })

  it('does not advance past unavailable Calls or an incomplete empty Agent directory', async () => {
    reads.calls.mockRejectedValueOnce(new Error('calls unavailable'))
    renderOverview(await loadOverview())
    expect(screen.getByRole('link', { name: 'Check Calls' }).getAttribute('href')).toBe('/activity')
    cleanup()

    reads.calls.mockResolvedValueOnce({ page: [], continueCursor: '', isDone: true })
    reads.agents.mockResolvedValueOnce({ items: [], details: [], nextCursor: 'more' })
    renderOverview(await loadOverview())
    expect(within(screen.getByRole('region', { name: 'Next step' })).getByRole('link', { name: 'Check Agents' }).getAttribute('href')).toBe('/agent-access')
    expect(within(screen.getByRole('region', { name: 'Account summary' })).getByRole('link', { name: 'Check Agents' }).getAttribute('href')).toBe('/agent-access')
    expect(screen.queryByRole('link', { name: 'Connect an Agent' })).toBeNull()
  })

  it('moves a new Customer through Agent connection, funding and Market without guessing', async () => {
    reads.calls.mockResolvedValue({ page: [], continueCursor: '', isDone: true })
    reads.agents.mockResolvedValueOnce({ items: [], details: [] })
    const emptyAccount = { ...availableBalance, balance: { currency: 'AUD', units: '0', exponent: 6 } }
    reads.balance.mockResolvedValueOnce(emptyAccount)
    const first = await loadOverview()
    renderOverview(first)
    expect(within(screen.getByRole('region', { name: 'Account summary' })).getByRole('link', { name: 'Connect an Agent' }).getAttribute('href')).toBe('/agent-access')
    cleanup()

    reads.agents.mockResolvedValueOnce({ items: [{ principalRef: 'prn_one', status: 'connected' }], details: [] })
    reads.balance.mockResolvedValueOnce(emptyAccount)
    const second = await loadOverview()
    renderOverview(second)
    expect(screen.getByRole('link', { name: 'Add credit' }).getAttribute('href')).toBe('/owner/credit#fund')
    cleanup()

    reads.balance.mockResolvedValueOnce(availableBalance)
    const ready = await loadOverview()
    renderOverview(ready)
    expect(screen.getByRole('link', { name: 'Explore Market' }).getAttribute('href')).toBe('/market')
  })

  it('shows Provider status only when the existing Provider projection says it applies', async () => {
    reads.provider.mockResolvedValueOnce({ kind: 'available', value: { catalog: { name: 'Example Provider', offerings: [{ id: 'one' }] } } })
    renderOverview(await loadOverview())

    expect(screen.getByText('Provider workspace')).toBeTruthy()
    expect(screen.getByText('Example Provider · 1 Tool')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open My Tools' }).getAttribute('href')).toBe('/owner/operations')
    expect(screen.queryByRole('link', { name: 'Offer a Tool' })).toBeNull()
  })

  it('does not turn an unavailable Provider read into a second setup invitation', async () => {
    reads.provider.mockRejectedValueOnce(new Error('provider status unavailable'))
    renderOverview(await loadOverview())

    expect(screen.getByText('Provider workspace')).toBeTruthy()
    expect(screen.getByText('Status unavailable')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open My Tools' }).getAttribute('href')).toBe('/owner/operations')
    expect(screen.queryByRole('link', { name: 'Offer a Tool' })).toBeNull()
  })
})
