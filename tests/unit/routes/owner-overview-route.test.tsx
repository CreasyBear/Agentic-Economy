/** @vitest-environment jsdom */
import { createElement } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
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
const calls = { page: [{ callRef: 'call_attention', state: 'outcome_unknown' }, { callRef: 'call_done', state: 'completed' }], continueCursor: 'next', isDone: false }
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
    expect(screen.getByText('A$25.00')).toBeTruthy()
    expect(screen.getByText('At least 1 Call needs attention')).toBeTruthy()
    expect(screen.getByText('2 connected Agents')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Review Call' }).getAttribute('href')).toBe('/activity')
    expect(screen.queryByText('Provider workspace')).toBeNull()
  })

  it('preserves known Calls and Agents when the Balance read fails', async () => {
    reads.balance.mockRejectedValueOnce(new Error('balance unavailable'))
    renderOverview(await loadOverview())

    expect(screen.getByText('Balance unavailable')).toBeTruthy()
    expect(screen.getByText('At least 1 Call needs attention')).toBeTruthy()
    expect(screen.getByText('2 connected Agents')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Review Call' })).toBeTruthy()
  })

  it('does not turn an incomplete Calls page into a complete zero', async () => {
    reads.calls.mockResolvedValueOnce({ page: [{ callRef: 'call_recent', state: 'completed' }], continueCursor: 'next', isDone: false })
    renderOverview(await loadOverview())

    expect(screen.getByText('No attention in recent Calls')).toBeTruthy()
    expect(screen.queryByText('No Calls need attention')).toBeNull()
  })

  it('moves a new Customer through Agent connection, funding and Market without guessing', async () => {
    reads.calls.mockResolvedValue({ page: [], continueCursor: '', isDone: true })
    reads.agents.mockResolvedValueOnce({ items: [], details: [] })
    const emptyAccount = { ...availableBalance, balance: { currency: 'AUD', units: '0', exponent: 6 } }
    reads.balance.mockResolvedValueOnce(emptyAccount)
    const first = await loadOverview()
    renderOverview(first)
    expect(screen.getByRole('link', { name: 'Connect an Agent' }).getAttribute('href')).toBe('/agent-access')
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
    expect(screen.getByRole('link', { name: 'Explore Market' }).getAttribute('href')).toBe('/owner/market')
  })

  it('shows Provider status only when the existing Provider projection says it applies', async () => {
    reads.provider.mockResolvedValueOnce({ kind: 'available', value: { catalog: { name: 'Example Provider', offerings: [{ id: 'one' }] } } })
    renderOverview(await loadOverview())

    expect(screen.getByText('Provider workspace')).toBeTruthy()
    expect(screen.getByText('Example Provider · 1 Tool')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open My Tools' }).getAttribute('href')).toBe('/owner/operations')
  })
})
