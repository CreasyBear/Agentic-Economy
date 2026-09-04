/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const calls = vi.hoisted(() => ({
  connections: vi.fn(), earnings: vi.fn(), connect: vi.fn(), identity: vi.fn(), ensure: vi.fn(), rename: vi.fn(), invalidate: vi.fn(async () => undefined),
}))
const tokens = vi.hoisted(() => ({ connections: Symbol('connections'), earnings: Symbol('earnings'), connect: Symbol('connect'), identity: Symbol('identity'), ensure: Symbol('ensure'), rename: Symbol('rename') }))
const routeState = vi.hoisted(() => ({ location: { pathname: '/owner/offerings', hash: '', search: {} as Record<string, unknown> } }))
const rendered = vi.hoisted(() => ({ status: vi.fn(), capabilities: vi.fn(), identity: vi.fn() }))

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
vi.mock('@/components/ae/offerings/owner-operations.functions', () => ({
  readOwnerOperationsConnectionsDetailServer: tokens.connections,
  readOwnerOperationsIdentityDetailServer: tokens.identity,
}))
vi.mock('@/components/ae/offerings/supplier-identity.functions', () => ({ ensureSupplierBusinessServer: tokens.ensure }))
vi.mock('@/lib/server/owner-workspace.functions', () => ({ renameSupplierDisplayNameServer: tokens.rename }))
vi.mock('@/modules/capability-supply/supply-funnel.functions', () => ({ readOwnerProviderEarningsServer: tokens.earnings }))
vi.mock('@/modules/money/money.functions', () => ({ readOwnerConnectReadinessServer: tokens.connect }))
vi.mock('@/components/ae/layout/AeOperatorShell', () => ({ AeOperatorShell: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
vi.mock('@/components/ae/offerings/AeOwnerOfferings', () => ({ AeOwnerOfferingsList: () => <div data-testid="operations-list" /> }))
vi.mock('@/components/ae/supply/AeOwnerProviderConnections', () => ({ AeOwnerProviderConnections: () => <div data-testid="connection-controls" /> }))
vi.mock('@/components/ae/supply/AeSupplyEarningsCard', () => ({ AeSupplyEarningsCard: () => <div data-testid="earnings-controls" /> }))
vi.mock('@/components/ae/status/AeStatusCard', () => ({ AeStatusCard: (props: unknown) => { rendered.status(props); return <div data-testid="supplier-status-card" /> } }))
vi.mock('@/components/ae/status/AeCapabilityList', () => ({ AeCapabilityList: (props: unknown) => { rendered.capabilities(props); return <div data-testid="supplier-capability-list" /> } }))
vi.mock('@/components/ae/settings/AeWorkspaceGeneral', () => ({ AeWorkspaceGeneral: (props: unknown) => { rendered.identity(props); return <div data-testid="supplier-identity-controls" /> } }))

import { AeOwnerOperationsWorkspace } from '@/components/ae/offerings/AeOwnerOperationsWorkspace'

const inventory = { kind: 'available', supplier: { name: 'Supplier' }, operations: [], projection: 'current', isDone: true, continueCursor: '' } as const
const unavailable = Promise.resolve({ kind: 'not_applicable' as const })

afterEach(() => {
  cleanup()
  for (const mock of Object.values(calls)) mock.mockReset()
  for (const mock of Object.values(rendered)) mock.mockReset()
  calls.invalidate.mockResolvedValue(undefined)
  routeState.location = { pathname: '/owner/offerings', hash: '', search: {} }
})

describe('Operations management disclosure', () => {
  it('renders a supplier ownership conflict without lifecycle actions', async () => {
    render(<AeOwnerOperationsWorkspace inventory={inventory} lifecycle={Promise.resolve({ kind: 'conflict', reason: 'business_mismatch' })} connections={unavailable} payouts={unavailable} publicStatus={unavailable} />)

    expect(await screen.findByText('Supplier ownership conflict')).toBeTruthy()
    expect(screen.getByText('Lifecycle records do not belong to the current supplier. No Operation action is available.')).toBeTruthy()
    expect(screen.queryByTestId('operations-list')).toBeNull()
  })

  it('does not run rich reads until their section opens', async () => {
    calls.connections.mockResolvedValue({ kind: 'available', businessId: 'biz:one', connections: [] })
    calls.earnings.mockResolvedValue({ kind: 'not_found' })
    calls.connect.mockResolvedValue({ kind: 'not_found' })
    render(<AeOwnerOperationsWorkspace inventory={inventory} lifecycle={unavailable} connections={Promise.resolve({ kind: 'available', value: { total: 0, available: 0, needsAttention: 0 } })} payouts={Promise.resolve({ kind: 'available', value: { currencies: [], earningsAccounts: 0, payoutAccounts: 0, readyAccounts: 0, needsAttention: 0 } })} publicStatus={unavailable} />)

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
    render(<AeOwnerOperationsWorkspace inventory={inventory} lifecycle={unavailable} connections={Promise.resolve({ kind: 'available', value: { total: 1, available: 1, needsAttention: 0 } })} payouts={unavailable} publicStatus={unavailable} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Manage connections' }))
    expect(await screen.findByText('Connection ownership conflict')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Try connections again' })).toBeNull()
    expect(screen.queryByTestId('connection-controls')).toBeNull()
  })

  it('distinguishes ownership conflicts and not-configured summaries from outages', async () => {
    render(<AeOwnerOperationsWorkspace
      inventory={inventory}
      lifecycle={unavailable}
      connections={Promise.resolve({ kind: 'conflict', reason: 'business_mismatch' })}
      payouts={Promise.resolve({ kind: 'not_applicable' })}
      publicStatus={Promise.resolve({ kind: 'conflict', reason: 'multiple_suppliers' })}
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
    render(<AeOwnerOperationsWorkspace inventory={inventory} lifecycle={unavailable} connections={Promise.resolve({ kind: 'available', value: { total: 0, available: 0, needsAttention: 0 } })} payouts={unavailable} publicStatus={unavailable} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Manage connections' }))
    expect(await screen.findByText('Connection controls unavailable')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Try connections again' }))

    expect(await screen.findByTestId('connection-controls')).toBeTruthy()
    expect(calls.connections).toHaveBeenCalledTimes(2)
  })

  it('loads supplier identity controls only after their section opens', async () => {
    calls.identity.mockResolvedValue({ kind: 'available', businessId: 'biz:one', name: 'Supplier', slug: 'supplier', publicStatus: 'published' })
    render(<AeOwnerOperationsWorkspace inventory={inventory} lifecycle={unavailable} connections={unavailable} payouts={unavailable} publicStatus={unavailable} />)

    expect(calls.identity).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Manage supplier identity' }))

    await waitFor(() => expect(calls.identity).toHaveBeenCalledTimes(1))
    expect(await screen.findByTestId('supplier-identity-controls')).toBeTruthy()
  })

  it('retries a failed supplier identity detail read in place', async () => {
    calls.identity
      .mockRejectedValueOnce(new Error('private identity outage'))
      .mockResolvedValueOnce({ kind: 'available', businessId: 'biz:one', name: 'Supplier', slug: 'supplier', publicStatus: 'published' })
    render(<AeOwnerOperationsWorkspace inventory={inventory} lifecycle={unavailable} connections={unavailable} payouts={unavailable} publicStatus={unavailable} />)

    fireEvent.click(screen.getByRole('button', { name: 'Manage supplier identity' }))
    expect(await screen.findByText('Supplier identity controls unavailable')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try supplier identity again' }))

    expect(await screen.findByTestId('supplier-identity-controls')).toBeTruthy()
    expect(calls.identity).toHaveBeenCalledTimes(2)
  })

  it('renders one current-owner public status and capability projection', async () => {
    const readback = { catalog: { businessId: 'biz:one', offerings: [] } }
    render(<AeOwnerOperationsWorkspace inventory={inventory} lifecycle={unavailable} connections={unavailable} payouts={unavailable} publicStatus={Promise.resolve({ kind: 'available', value: readback } as never)} />)

    expect(await screen.findByTestId('supplier-status-card')).toBeTruthy()
    expect(screen.getAllByTestId('supplier-capability-list')).toHaveLength(1)
    expect(rendered.status).toHaveBeenCalledWith({ readback })
    expect(rendered.capabilities).toHaveBeenCalledWith({ catalog: readback.catalog })
  })

  it('opens authoritative earnings readback for a Connect return', async () => {
    routeState.location = { pathname: '/owner/offerings', hash: 'earnings', search: { connect: 'return' } }
    calls.earnings.mockResolvedValue({ kind: 'not_found' })
    calls.connect.mockResolvedValue({ kind: 'not_found' })
    render(<AeOwnerOperationsWorkspace inventory={inventory} lifecycle={unavailable} connections={unavailable} payouts={unavailable} publicStatus={unavailable} />)

    await waitFor(() => expect(calls.earnings).toHaveBeenCalledTimes(1))
    expect(calls.connect).toHaveBeenCalledTimes(1)
    expect(await screen.findByTestId('earnings-controls')).toBeTruthy()
  })

  it('retries a failed earnings detail read in place', async () => {
    calls.earnings
      .mockRejectedValueOnce(new Error('private earnings outage'))
      .mockResolvedValueOnce({ kind: 'not_found' })
    calls.connect.mockResolvedValue({ kind: 'not_found' })
    render(<AeOwnerOperationsWorkspace inventory={inventory} lifecycle={unavailable} connections={unavailable} payouts={Promise.resolve({ kind: 'available', value: { currencies: [], earningsAccounts: 0, payoutAccounts: 0, readyAccounts: 0, needsAttention: 0 } })} publicStatus={unavailable} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Manage earnings' }))
    expect(await screen.findByText('Earnings controls unavailable')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try earnings again' }))

    expect(await screen.findByTestId('earnings-controls')).toBeTruthy()
    expect(calls.earnings).toHaveBeenCalledTimes(2)
    expect(calls.connect).toHaveBeenCalledTimes(2)
  })

  it('owns a missing rebind target without changing a connection', async () => {
    routeState.location = { pathname: '/owner/offerings', hash: 'provider-connection-connection:missing', search: { rebind: 'offering:one' } }
    calls.connections.mockResolvedValue({ kind: 'available', businessId: 'biz:one', connections: [] })
    render(<AeOwnerOperationsWorkspace inventory={inventory} lifecycle={unavailable} connections={unavailable} payouts={unavailable} publicStatus={unavailable} />)

    expect(await screen.findByText('Connection target unavailable')).toBeTruthy()
    expect(screen.getByText('The requested connection is not in the current supplier readback. No connection was changed.')).toBeTruthy()
    expect(calls.connections).toHaveBeenCalledTimes(1)
  })
})
