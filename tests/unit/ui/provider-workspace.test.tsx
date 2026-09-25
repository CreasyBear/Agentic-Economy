/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const calls = vi.hoisted(() => ({
  earnings: vi.fn(), connect: vi.fn(), identity: vi.fn(), ensure: vi.fn(), rename: vi.fn(), invalidate: vi.fn(async () => undefined),
}))
const tokens = vi.hoisted(() => ({ earnings: Symbol('earnings'), connect: Symbol('connect'), identity: Symbol('identity'), ensure: Symbol('ensure'), rename: Symbol('rename') }))
const routeState = vi.hoisted(() => ({ location: { pathname: '/owner/operations', hash: '', search: {} as Record<string, unknown> } }))
const rendered = vi.hoisted(() => ({ status: vi.fn(), capabilities: vi.fn(), identity: vi.fn() }))

vi.mock('@tanstack/react-start', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-start')>()),
  useServerFn: (token: symbol) => token === tokens.earnings ? calls.earnings
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
    Link: ({ to, children, className, ...props }: { to: string; children: ReactNode; className?: string }) => (
      <a href={to} className={className} {...props}>{children}</a>
    ),
    useLocation: () => routeState.location,
    useRouter: () => ({ invalidate: calls.invalidate }),
  }
})
vi.mock('@/components/ae/offerings/provider-workspace.functions', () => ({
  readProviderWorkspaceIdentityDetailServer: tokens.identity,
}))
vi.mock('@/components/ae/offerings/provider-identity.functions', () => ({ ensureProviderBusinessServer: tokens.ensure }))
vi.mock('@/lib/server/owner-workspace.functions', () => ({ renameProviderDisplayNameServer: tokens.rename }))
vi.mock('@/modules/capability-supply/supply-funnel.functions', () => ({ readOwnerProviderEarningsServer: tokens.earnings }))
vi.mock('@/modules/money/money.functions', () => ({ readOwnerConnectReadinessServer: tokens.connect }))
vi.mock('@/components/ae/layout/AeOperatorPage', () => ({ AeOperatorPage: ({ actions, children }: { actions?: ReactNode; children: ReactNode }) => <main>{actions}{children}</main> }))
vi.mock('@/components/ae/status/AeStatusCard', () => ({ AeStatusCard: (props: unknown) => { rendered.status(props); return <div data-testid="provider-status-card" /> } }))
vi.mock('@/components/ae/status/AeCapabilityList', () => ({ AeCapabilityList: (props: unknown) => { rendered.capabilities(props); return <div data-testid="provider-capability-list" /> } }))
vi.mock('@/components/ae/settings/AeWorkspaceGeneral', () => ({ AeWorkspaceGeneral: (props: unknown) => { rendered.identity(props); return <div data-testid="provider-identity-controls" /> } }))

import { AeProviderWorkspace } from '@/components/ae/offerings/provider-workspace/AeProviderWorkspace'

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
  it('uses one disconnected payout presentation in setup and Earnings', async () => {
    render(<AeProviderWorkspace
      inventory={inventory}
      lifecycle={unavailable}
      connections={unavailable}
      payouts={Promise.resolve({ kind: 'available', value: { currencies: [], earningsAccounts: 0, payoutAccounts: 0, readyAccounts: 0, needsAttention: 0 } })}
      publicStatus={unavailable}
    />)

    await screen.findByRole('heading', { name: 'Provider setup' })
    expect(screen.queryByText('Add a source, then choose a Tool to publish.')).toBeNull()
    const addTool = screen.getAllByRole('link', { name: 'Add Tool' })
    expect(addTool).toHaveLength(1)
    expect(addTool[0]?.getAttribute('href')).toBe('/owner/operations/new')
    expect(addTool[0]?.className).toContain('border')
    expect(addTool[0]?.className).not.toContain('bg-primary')

    const setup = screen.getByRole('heading', { name: 'Provider setup' }).parentElement?.parentElement
    const earnings = screen.getByRole('heading', { name: 'Earnings' }).closest('section')
    expect(setup).not.toBeNull()
    expect(earnings).not.toBeNull()
    expect(within(setup as HTMLElement).getByText('Billing action required')).toBeTruthy()
    expect(within(earnings as HTMLElement).getByText('Billing action required')).toBeTruthy()
    expect(screen.getAllByText('Connect Stripe to receive payouts.')).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Connect Stripe' })).toHaveLength(2)
    expect(screen.queryByText(/nothing is required here/u)).toBeNull()
    expect(screen.queryByText(/monthly settlements/u)).toBeNull()
    const settingsLinks = screen.getAllByRole('link', { name: 'Open Settings' })
    expect(settingsLinks).toHaveLength(2)
    expect(settingsLinks.every(link => link.getAttribute('href') === '/owner/settings')).toBe(true)
  })

  it('renders a provider ownership conflict without lifecycle actions', async () => {
    render(<AeProviderWorkspace inventory={inventory} lifecycle={Promise.resolve({ kind: 'conflict', reason: 'business_mismatch' })} connections={unavailable} payouts={unavailable} publicStatus={unavailable} />)

    expect(await screen.findByText('Provider ownership conflict')).toBeTruthy()
    expect(screen.getByText('Lifecycle records do not belong to the current provider. No Tool action is available.')).toBeTruthy()
    expect(screen.queryByTestId('tools-list')).toBeNull()
  })

  it('keeps provider connection management out of Tools while earnings detail opens in place', async () => {
    calls.earnings.mockResolvedValue({ kind: 'not_found' })
    calls.connect.mockResolvedValue({ kind: 'not_found' })
    render(<AeProviderWorkspace inventory={inventory} lifecycle={unavailable} connections={Promise.resolve({ kind: 'available', value: { total: 0, available: 0, needsAttention: 0 } })} payouts={Promise.resolve({ kind: 'available', value: { currencies: [], earningsAccounts: 0, payoutAccounts: 0, readyAccounts: 0, needsAttention: 0 } })} publicStatus={unavailable} />)
    expect(calls.earnings).not.toHaveBeenCalled()
    const earningsHeading = screen.getByRole('heading', { name: 'Earnings' })
    expect(earningsHeading.closest('details')).toBeNull()
    const administration = screen.getByText('Provider settings and administration').closest('details')
    expect(administration?.textContent).toContain('Provider identity')
    expect(administration?.textContent).not.toContain('Earnings')
    const manage = await screen.findByRole('link', { name: 'Manage connections' })
    expect(manage.getAttribute('href')).toBe('/owner/settings/integrations')
    expect(screen.queryByRole('dialog', { name: 'Connections' })).toBeNull()
    fireEvent.click(within(earningsHeading.closest('section') as HTMLElement).getByRole('button', { name: 'Connect Stripe' }))
    await waitFor(() => expect(calls.earnings).toHaveBeenCalledTimes(1))
    expect(calls.connect).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Billing action required', { selector: '[data-slot="alert-title"]' })).toBeTruthy()
  })

  it('links to settings even when the operational connection summary is available but no endpoint is configured', async () => {
    render(<AeProviderWorkspace inventory={inventory} lifecycle={unavailable} connections={Promise.resolve({ kind: 'available', value: { total: 0, available: 0, needsAttention: 0 } })} payouts={unavailable} publicStatus={unavailable} />)
    expect((await screen.findByRole('link', { name: 'Manage connections' })).getAttribute('href')).toBe('/owner/settings/integrations')
    expect(screen.queryByRole('button', { name: 'Revoke' })).toBeNull()
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
    expect(screen.getAllByText('Billing action required').length).toBeGreaterThan(0)
    expect(screen.queryByText('Earnings unavailable')).toBeNull()
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
    const unavailableTitle = await screen.findByText('Provider identity controls unavailable')
    expect(unavailableTitle.closest('[data-slot="alert"]')?.className).not.toContain('text-destructive')
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
    expect(screen.getByRole('heading', { name: 'Tool availability' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Review public status' })).toBeNull()
  })

  it('opens authoritative earnings readback for a Connect return', async () => {
    routeState.location = { pathname: '/owner/operations', hash: 'earnings', search: { connect: 'return' } }
    calls.earnings.mockResolvedValue({ kind: 'not_found' })
    calls.connect.mockResolvedValue({ kind: 'not_found' })
    render(<AeProviderWorkspace inventory={inventory} lifecycle={unavailable} connections={unavailable} payouts={unavailable} publicStatus={unavailable} />)

    await waitFor(() => expect(calls.earnings).toHaveBeenCalledTimes(1))
    expect(calls.connect).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Billing action required', { selector: '[data-slot="alert-title"]' })).toBeTruthy()
  })

  it('preserves the exact validated x402 source handoff in the Settings link', async () => {
    const handoff = {
      connect: 'x402',
      draft: `sha256:${'a'.repeat(64)}`,
      resourceUrl: 'https://seller.example/paid',
      method: 'GET',
      environment: 'sandbox',
    } as const
    routeState.location = { pathname: '/owner/operations', hash: '', search: handoff }
    render(<AeProviderWorkspace inventory={inventory} lifecycle={unavailable} connections={unavailable} payouts={unavailable} publicStatus={unavailable} />)
    const href = screen.getByRole('link', { name: 'Manage connections' }).getAttribute('href')
    const url = new URL(href ?? '', 'https://example.test')
    expect(url.pathname).toBe('/owner/settings/integrations')
    expect(Object.fromEntries(url.searchParams)).toEqual(handoff)
  })

  it('retries a failed earnings detail read in place', async () => {
    calls.earnings
      .mockRejectedValueOnce(new Error('private earnings outage'))
      .mockResolvedValueOnce({ kind: 'not_found' })
    calls.connect.mockResolvedValue({ kind: 'not_found' })
    render(<AeProviderWorkspace inventory={inventory} lifecycle={unavailable} connections={unavailable} payouts={Promise.resolve({ kind: 'available', value: { currencies: [], earningsAccounts: 0, payoutAccounts: 0, readyAccounts: 0, needsAttention: 0 } })} publicStatus={unavailable} />)

    const earningsSection = screen.getByRole('heading', { name: 'Earnings' }).closest('section')
    fireEvent.click(within(earningsSection as HTMLElement).getByRole('button', { name: 'Connect Stripe' }))
    expect(await screen.findByText('Stripe connection state unavailable')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try connection again' }))

    expect(await screen.findByText('Billing action required', { selector: '[data-slot="alert-title"]' })).toBeTruthy()
    expect(calls.earnings).toHaveBeenCalledTimes(2)
    expect(calls.connect).toHaveBeenCalledTimes(2)
  })

  it('preserves a rebind target and row hash in the Settings link', async () => {
    routeState.location = { pathname: '/owner/operations', hash: 'provider-connection-connection:missing', search: { rebind: 'offering:one' } }
    render(<AeProviderWorkspace inventory={inventory} lifecycle={unavailable} connections={unavailable} payouts={unavailable} publicStatus={unavailable} />)
    const href = screen.getByRole('link', { name: 'Manage connections' }).getAttribute('href')
    expect(href).toBe('/owner/settings/integrations?rebind=offering%3Aone#provider-connection-connection:missing')
  })
})
