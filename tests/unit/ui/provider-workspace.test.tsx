/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const calls = vi.hoisted(() => ({
  connections: vi.fn(), earnings: vi.fn(), connect: vi.fn(), identity: vi.fn(), ensure: vi.fn(), rename: vi.fn(), invalidate: vi.fn(async () => undefined),
}))
const tokens = vi.hoisted(() => ({ connections: Symbol('connections'), earnings: Symbol('earnings'), connect: Symbol('connect'), identity: Symbol('identity'), ensure: Symbol('ensure'), rename: Symbol('rename') }))
const routeState = vi.hoisted(() => ({ location: { pathname: '/owner/operations', hash: '', search: {} as Record<string, unknown> } }))
const rendered = vi.hoisted(() => ({ status: vi.fn(), capabilities: vi.fn(), identity: vi.fn(), connections: vi.fn() }))

vi.mock('@tanstack/react-start', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-start')>()),
  useServerFn: (token: symbol) => token === tokens.connections ? calls.connections
    : token === tokens.earnings ? calls.earnings
      : token === tokens.connect ? calls.connect
        : token === tokens.identity ? calls.identity
          : token === tokens.rename ? calls.rename
            : calls.ensure,
}))
vi.mock('@tanstack/react-router', async () => {
  const React = await import('react')
  return {
    Await: ({ promise, children }: { promise: Promise<unknown>; children: (value: unknown) => ReactNode }) => {
      const [value, setValue] = React.useState<unknown>()
      React.useEffect(() => { void promise.then(setValue) }, [promise])
      return value === undefined ? null : children(value)
    },
    Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
    useLocation: () => routeState.location,
    useRouter: () => ({ invalidate: calls.invalidate }),
  }
})
vi.mock('@/components/ae/offerings/provider-workspace.functions', () => ({
  readProviderWorkspaceConnectionsDetailServer: tokens.connections,
  readProviderWorkspaceIdentityDetailServer: tokens.identity,
}))
vi.mock('@/components/ae/offerings/provider-identity.functions', () => ({ ensureProviderBusinessServer: tokens.ensure }))
vi.mock('@/lib/server/owner-workspace.functions', () => ({ renameProviderDisplayNameServer: tokens.rename }))
vi.mock('@/modules/capability-supply/supply-funnel.functions', () => ({ readOwnerProviderEarningsServer: tokens.earnings }))
vi.mock('@/modules/money/money.functions', () => ({ readOwnerConnectReadinessServer: tokens.connect }))
vi.mock('@/components/ae/layout/AeOperatorPage', () => ({ AeOperatorPage: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
vi.mock('@/components/ae/offerings/AeOwnerOfferings', () => ({ AeOwnerOfferingsList: () => <div data-testid="tools-list" /> }))
vi.mock('@/components/ae/supply/AeOwnerProviderConnections', () => ({ AeOwnerProviderConnections: (props: unknown) => { rendered.connections(props); return <div data-testid="connection-controls" /> } }))
vi.mock('@/components/ae/supply/AeSupplyEarningsCard', () => ({ AeSupplyEarningsCard: () => <div data-testid="earnings-controls" /> }))
vi.mock('@/components/ae/status/AeStatusCard', () => ({ AeStatusCard: (props: unknown) => { rendered.status(props); return <div data-testid="provider-status-card" /> } }))
vi.mock('@/components/ae/status/AeCapabilityList', () => ({ AeCapabilityList: (props: unknown) => { rendered.capabilities(props); return <div data-testid="provider-capability-list" /> } }))
vi.mock('@/components/ae/settings/AeWorkspaceGeneral', () => ({ AeWorkspaceGeneral: (props: unknown) => { rendered.identity(props); return <div data-testid="provider-identity-controls" /> } }))

import { AeProviderWorkspace } from '@/components/ae/offerings/AeProviderWorkspace'

const inventory = { kind: 'available', provider: { name: 'Provider' }, tools: [], projection: 'current', isDone: true, continueCursor: '' } as const
const unavailable = Promise.resolve({ kind: 'not_applicable' as const })

afterEach(() => {
  cleanup()
  for (const mock of Object.values(calls)) mock.mockReset()
  for (const mock of Object.values(rendered)) mock.mockReset()
  calls.invalidate.mockResolvedValue(undefined)
  routeState.location = { pathname: '/owner/operations', hash: '', search: {} }
})

describe('Tools management disclosure', () => {
  it('renders a provider ownership conflict without lifecycle actions', async () => {
    render(<AeProviderWorkspace inventory={inventory} lifecycle={Promise.resolve({ kind: 'conflict', reason: 'business_mismatch' })} connections={unavailable} payouts={unavailable} publicStatus={unavailable} />)

    expect(await screen.findByText('Provider ownership conflict')).toBeTruthy()
    expect(screen.getByText('Lifecycle records do not belong to the current provider. No Tool action is available.')).toBeTruthy()
    expect(screen.queryByTestId('tools-list')).toBeNull()
  })

  it('does not run rich reads until their section opens', async () => {
    calls.connections.mockResolvedValue({ kind: 'available', businessId: 'biz:one', connections: [] })
    calls.earnings.mockResolvedValue({ kind: 'not_found' })
    calls.connect.mockResolvedValue({ kind: 'not_found' })
    render(<AeProviderWorkspace inventory={inventory} lifecycle={unavailable} connections={Promise.resolve({ kind: 'available', value: { total: 0, available: 0, needsAttention: 0 } })} payouts={Promise.resolve({ kind: 'available', value: { currencies: [], earningsAccounts: 0, payoutAccounts: 0, readyAccounts: 0, needsAttention: 0 } })} publicStatus={unavailable} />)

    expect(calls.connections).not.toHaveBeenCalled()
    expect(calls.earnings).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'Manage connections' }))
    await waitFor(() => expect(calls.connections).toHaveBeenCalledTimes(1))
    expect(await screen.findByTestId('connection-controls')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Manage earnings' }))
    await waitFor(() => expect(calls.earnings).toHaveBeenCalledTimes(1))
    expect(calls.connect).toHaveBeenCalledTimes(1)
    expect(await screen.findByTestId('earnings-controls')).toBeTruthy()
  })

  it('keeps controls absent on a business mismatch', async () => {
    calls.connections.mockResolvedValue({ kind: 'conflict', reason: 'business_mismatch' })
    render(<AeProviderWorkspace inventory={inventory} lifecycle={unavailable} connections={Promise.resolve({ kind: 'available', value: { total: 1, available: 1, needsAttention: 0 } })} payouts={unavailable} publicStatus={unavailable} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Manage connections' }))
    expect(await screen.findByText('Connection ownership conflict')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Try connections again' })).toBeNull()
    expect(screen.queryByTestId('connection-controls')).toBeNull()
  })

  it('distinguishes ownership conflicts and not-configured summaries from outages', async () => {
    render(<AeProviderWorkspace
      inventory={inventory}
      lifecycle={unavailable}
      connections={Promise.resolve({ kind: 'conflict', reason: 'business_mismatch' })}
      payouts={Promise.resolve({ kind: 'not_applicable' })}
      publicStatus={Promise.resolve({ kind: 'conflict', reason: 'multiple_providers' })}
    />)

    expect(await screen.findByText('Connections ownership conflict')).toBeTruthy()
    expect(screen.getAllByText('Public status ownership conflict').length).toBeGreaterThan(0)
    expect(screen.getByText('Payout readiness not configured')).toBeTruthy()
    expect(screen.queryByText('Earnings unavailable')).toBeNull()
  })

  it('retries a failed connection detail read in place', async () => {
    calls.connections
      .mockRejectedValueOnce(new Error('private connection outage'))
      .mockResolvedValueOnce({ kind: 'available', businessId: 'biz:one', connections: [] })
    render(<AeProviderWorkspace inventory={inventory} lifecycle={unavailable} connections={Promise.resolve({ kind: 'available', value: { total: 0, available: 0, needsAttention: 0 } })} payouts={unavailable} publicStatus={unavailable} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Manage connections' }))
    expect(await screen.findByText('Connection controls unavailable')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Try connections again' }))

    expect(await screen.findByTestId('connection-controls')).toBeTruthy()
    expect(calls.connections).toHaveBeenCalledTimes(2)
  })

  it('loads provider identity controls only after their section opens', async () => {
    calls.identity.mockResolvedValue({ kind: 'available', businessId: 'biz:one', name: 'Provider', slug: 'provider', publicStatus: 'published' })
    render(<AeProviderWorkspace inventory={inventory} lifecycle={unavailable} connections={unavailable} payouts={unavailable} publicStatus={unavailable} />)

    expect(calls.identity).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Manage provider identity' }))

    await waitFor(() => expect(calls.identity).toHaveBeenCalledTimes(1))
    expect(await screen.findByTestId('provider-identity-controls')).toBeTruthy()
  })

  it('retries a failed provider identity detail read in place', async () => {
    calls.identity
      .mockRejectedValueOnce(new Error('private identity outage'))
      .mockResolvedValueOnce({ kind: 'available', businessId: 'biz:one', name: 'Provider', slug: 'provider', publicStatus: 'published' })
    render(<AeProviderWorkspace inventory={inventory} lifecycle={unavailable} connections={unavailable} payouts={unavailable} publicStatus={unavailable} />)

    fireEvent.click(screen.getByRole('button', { name: 'Manage provider identity' }))
    expect(await screen.findByText('Provider identity controls unavailable')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try provider identity again' }))

    expect(await screen.findByTestId('provider-identity-controls')).toBeTruthy()
    expect(calls.identity).toHaveBeenCalledTimes(2)
  })

  it('renders one current-owner public status and capability projection', async () => {
    const readback = { catalog: { businessId: 'biz:one', offerings: [] } }
    render(<AeProviderWorkspace inventory={inventory} lifecycle={unavailable} connections={unavailable} payouts={unavailable} publicStatus={Promise.resolve({ kind: 'available', value: readback } as never)} />)

    expect(await screen.findByTestId('provider-status-card')).toBeTruthy()
    expect(screen.getAllByTestId('provider-capability-list')).toHaveLength(1)
    expect(rendered.status).toHaveBeenCalledWith({ readback })
    expect(rendered.capabilities).toHaveBeenCalledWith({ catalog: readback.catalog })
  })

  it('opens authoritative earnings readback for a Connect return', async () => {
    routeState.location = { pathname: '/owner/operations', hash: 'earnings', search: { connect: 'return' } }
    calls.earnings.mockResolvedValue({ kind: 'not_found' })
    calls.connect.mockResolvedValue({ kind: 'not_found' })
    render(<AeProviderWorkspace inventory={inventory} lifecycle={unavailable} connections={unavailable} payouts={unavailable} publicStatus={unavailable} />)

    await waitFor(() => expect(calls.earnings).toHaveBeenCalledTimes(1))
    expect(calls.connect).toHaveBeenCalledTimes(1)
    expect(await screen.findByTestId('earnings-controls')).toBeTruthy()
  })

  it('opens provider connections and carries the exact x402 source handoff from the CTA', async () => {
    const handoff = {
      connect: 'x402',
      draft: `sha256:${'a'.repeat(64)}`,
      resourceUrl: 'https://seller.example/paid',
      method: 'GET',
      environment: 'sandbox',
    } as const
    routeState.location = { pathname: '/owner/operations', hash: '', search: handoff }
    calls.connections.mockResolvedValue({ kind: 'available', businessId: 'biz:one', connections: [] })
    render(<AeProviderWorkspace inventory={inventory} lifecycle={unavailable} connections={unavailable} payouts={unavailable} publicStatus={unavailable} />)

    expect(await screen.findByTestId('connection-controls')).toBeTruthy()
    await waitFor(() => expect(rendered.connections).toHaveBeenCalledWith(expect.objectContaining({ x402Handoff: handoff })))
    expect(calls.connections).toHaveBeenCalledTimes(1)
  })

  it('retries a failed earnings detail read in place', async () => {
    calls.earnings
      .mockRejectedValueOnce(new Error('private earnings outage'))
      .mockResolvedValueOnce({ kind: 'not_found' })
    calls.connect.mockResolvedValue({ kind: 'not_found' })
    render(<AeProviderWorkspace inventory={inventory} lifecycle={unavailable} connections={unavailable} payouts={Promise.resolve({ kind: 'available', value: { currencies: [], earningsAccounts: 0, payoutAccounts: 0, readyAccounts: 0, needsAttention: 0 } })} publicStatus={unavailable} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Manage earnings' }))
    expect(await screen.findByText('Earnings controls unavailable')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try earnings again' }))

    expect(await screen.findByTestId('earnings-controls')).toBeTruthy()
    expect(calls.earnings).toHaveBeenCalledTimes(2)
    expect(calls.connect).toHaveBeenCalledTimes(2)
  })

  it('owns a missing rebind target without changing a connection', async () => {
    routeState.location = { pathname: '/owner/operations', hash: 'provider-connection-connection:missing', search: { rebind: 'offering:one' } }
    calls.connections.mockResolvedValue({ kind: 'available', businessId: 'biz:one', connections: [] })
    render(<AeProviderWorkspace inventory={inventory} lifecycle={unavailable} connections={unavailable} payouts={unavailable} publicStatus={unavailable} />)

    expect(await screen.findByText('Connection target unavailable')).toBeTruthy()
    expect(screen.getByText('The requested connection is not in the current provider readback. No connection was changed.')).toBeTruthy()
    expect(calls.connections).toHaveBeenCalledTimes(1)
  })
})
