// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invalidate: vi.fn().mockResolvedValue(undefined),
  navigate: vi.fn().mockResolvedValue(undefined),
  check: vi.fn(),
  connect: vi.fn(),
  inspect: vi.fn(),
  revoke: vi.fn(),
  useReverification: vi.fn((fetcher: (...args: unknown[]) => Promise<unknown>) => fetcher),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>,
  useRouter: () => ({ invalidate: mocks.invalidate }),
  useNavigate: () => mocks.navigate,
}))

vi.mock('@tanstack/react-start', () => ({
  createClientOnlyFn: (fn: unknown) => fn,
  useServerFn: (serverFn: unknown) => serverFn,
}))

vi.mock('@clerk/tanstack-react-start', () => ({ useReverification: mocks.useReverification }))
vi.mock('@clerk/tanstack-react-start/errors', () => ({ isReverificationCancelledError: () => false }))

vi.mock('@/modules/capability-supply/supply-funnel.functions', () => ({
  checkOwnerX402Server: mocks.check,
  connectOwnerX402Server: mocks.connect,
  inspectOwnerX402Server: mocks.inspect,
  revokeOwnerProviderConnectionServer: mocks.revoke,
}))

import { AeOwnerProviderConnections } from '@/components/ae/supply/AeOwnerProviderConnections'

const connection = {
  connectionRef: 'connection:x402:one',
  businessId: 'business:one',
  providerRef: 'provider:x402:seller.example',
  providerAccountRef: 'x402:https://seller.example/paid',
  adapterId: 'x402-fetch:v2',
  grantedScopes: [],
  grantedResources: ['https://seller.example/paid'],
  authorityGeneration: 4,
  authorityDigest: `sha256:${'a'.repeat(64)}`,
  lifecycle: 'active' as const,
  available: true,
  credentialConfigured: false,
  x402Method: 'POST' as const,
  x402Payee: '0x1111111111111111111111111111111111111111',
  observedAt: 1,
  reasonCode: null,
  evidenceRefs: [],
  createdAt: 1,
  updatedAt: 1,
}

describe('owner x402 connection controls', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.invalidate.mockResolvedValue(undefined)
  })

  it('separates exact authority, connection health, credential custody, and Operation readiness', () => {
    render(<AeOwnerProviderConnections businessId="business:one" connections={[connection]} />)

    expect(screen.getByText('POST https://seller.example/paid')).toBeTruthy()
    expect(screen.getByText(/Permission: route x402 payment to 0x1111/)).toBeTruthy()
    expect(screen.getByText('Authority generation 4')).toBeTruthy()
    expect(screen.getByText('No scheduled authority expiry')).toBeTruthy()
    expect(screen.getByText('Connection health not checked yet')).toBeTruthy()
    expect(screen.getByText(/Credential rotation: not applicable/)).toBeTruthy()
    expect(screen.getByText(/Tool readiness is checked per Tool/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Check connection' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reauthorize' })).toBeTruthy()
    expect(mocks.useReverification).toHaveBeenCalledWith(mocks.connect)
  })

  it('starts reauthorization with the exact stored method and resource instead of one-click generation advance', () => {
    render(<AeOwnerProviderConnections businessId="business:one" connections={[connection]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Reauthorize' }))

    const resource = screen.getByLabelText('x402 resource URL') as HTMLInputElement
    const method = screen.getByLabelText('Request method') as HTMLSelectElement
    expect(resource.value).toBe('https://seller.example/paid')
    expect(resource.readOnly).toBe(true)
    expect(method.value).toBe('POST')
    expect(method.disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Reauthorize verified endpoint' }) as HTMLButtonElement).disabled).toBe(true)
    expect(mocks.connect).not.toHaveBeenCalled()
  })

  it('accepts a canonical-equivalent handoff for reauthorization and prefills the stored source', () => {
    const handoff = {
      connect: 'x402' as const,
      draft: `sha256:${'7'.repeat(64)}`,
      resourceUrl: 'https://seller.example',
      method: 'POST' as const,
      environment: 'production' as const,
    }
    const storedResource = 'https://seller.example:443/'
    const storedConnection = {
      ...connection,
      grantedResources: [storedResource],
      sourceEnvironment: 'production' as const,
    }
    render(<AeOwnerProviderConnections businessId="business:one" connections={[storedConnection]} x402Handoff={handoff} />)

    fireEvent.click(screen.getByRole('button', { name: 'Reauthorize' }))

    expect((screen.getByLabelText('x402 resource URL') as HTMLInputElement).value).toBe(storedResource)
    expect((screen.getByLabelText('Request method') as HTMLSelectElement).value).toBe(handoff.method)
    expect(screen.queryByText('This connection does not match the saved source. The exact source handoff remains selected.')).toBeNull()
  })

  it('checks the current connection generation and refreshes authoritative health', async () => {
    mocks.check.mockResolvedValue({
      kind: 'applied',
      connection: { ...connection, healthStatus: 'healthy', healthCheckedAt: Date.now() },
      commandDigest: `sha256:${'b'.repeat(64)}`,
    })
    render(<AeOwnerProviderConnections businessId="business:one" connections={[connection]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Check connection' }))

    await waitFor(() => expect(mocks.check).toHaveBeenCalledWith({
      data: expect.objectContaining({
        connectionRef: connection.connectionRef,
        expectedAuthorityGeneration: connection.authorityGeneration,
        expectedAuthorityDigest: connection.authorityDigest,
      }),
    }))
    expect(mocks.invalidate).toHaveBeenCalledTimes(1)
  })

  it.each([
    { name: 'router invalidation', failure: 'invalidate' as const, invalidateCount: 2, navigationCount: 1 },
    { name: 'return navigation', failure: 'navigate' as const, invalidateCount: 2, navigationCount: 2 },
  ])('locks the source-first x402 handoff and retries the saved draft after $name fails once', async ({ failure, invalidateCount, navigationCount }) => {
    const handoff = {
      connect: 'x402' as const,
      draft: `sha256:${'c'.repeat(64)}`,
      resourceUrl: 'https://seller.example/sandbox-paid',
      method: 'GET' as const,
      environment: 'sandbox' as const,
    }
    const signature = `0x${'d'.repeat(130)}`
    const walletRequest = vi.fn().mockResolvedValue(signature)
    mocks.invalidate.mockResolvedValue(undefined)
    mocks.navigate.mockResolvedValue(undefined)
    if (failure === 'invalidate') {
      mocks.invalidate.mockRejectedValueOnce(new Error('refresh outage'))
    } else {
      mocks.navigate.mockRejectedValueOnce(new Error('return navigation outage'))
    }
    mocks.inspect.mockResolvedValue({
      kind: 'observed',
      digest: `sha256:${'e'.repeat(64)}`,
      endpoint: { url: handoff.resourceUrl },
      payment: {
        selection: { kind: 'selected', alternativeId: 'base-usdc' },
        accepts: [{ alternativeId: 'base-usdc', payTo: '0x1111111111111111111111111111111111111111', amount: '1', network: 'base', asset: 'USDC' }],
      },
      claim: { payTo: '0x1111111111111111111111111111111111111111', expiresAt: Date.now() + 600_000, message: 'claim' },
    })
    mocks.connect.mockResolvedValue({
      kind: 'applied',
      connection: { ...connection, connectionRef: 'connection:x402:confirmed' },
      commandDigest: `sha256:${'f'.repeat(64)}`,
    })
    Object.defineProperty(window, 'ethereum', {
      configurable: true,
      value: { request: walletRequest },
    })

    render(<AeOwnerProviderConnections businessId="business:one" connections={[]} x402Handoff={handoff} />)

    const resource = screen.getByLabelText('x402 resource URL') as HTMLInputElement
    const method = screen.getByLabelText('Request method') as HTMLSelectElement
    expect(resource.value).toBe(handoff.resourceUrl)
    expect(resource.readOnly).toBe(true)
    expect(method.value).toBe(handoff.method)
    expect(method.disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Inspect endpoint' }))
    await waitFor(() => expect(mocks.inspect).toHaveBeenCalledWith({
      data: {
        businessId: 'business:one',
        resourceUrl: handoff.resourceUrl,
        method: handoff.method,
        environment: handoff.environment,
      },
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Prove payee control' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Payee control proved' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Connect verified endpoint' }))

    await waitFor(() => expect(mocks.connect).toHaveBeenCalledWith({
      data: expect.objectContaining({
        businessId: 'business:one',
        resourceUrl: handoff.resourceUrl,
        method: handoff.method,
        environment: handoff.environment,
        claimSignature: signature,
      }),
    }))
    expect((screen.getByLabelText('x402 resource URL') as HTMLInputElement).value).toBe(handoff.resourceUrl)
    expect(await screen.findByRole('button', { name: 'Reload current connections' })).toBeTruthy()
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledTimes(failure === 'navigate' ? 1 : 0))

    fireEvent.click(screen.getByRole('button', { name: 'Reload current connections' }))
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledTimes(navigationCount))
    expect(mocks.navigate).toHaveBeenLastCalledWith({
      to: '/owner/offerings/new',
      search: {
        draft: handoff.draft,
        connection: 'connection:x402:confirmed',
        environment: handoff.environment,
      },
      replace: true,
    })
    expect(walletRequest).toHaveBeenCalledTimes(1)
    expect(mocks.connect).toHaveBeenCalledTimes(1)
    expect(mocks.invalidate).toHaveBeenCalledTimes(invalidateCount)
  })

  it('drops an obsolete pending return when a new handoff replaces the source during refresh', async () => {
    const oldHandoff = {
      connect: 'x402' as const,
      draft: `sha256:${'8'.repeat(64)}`,
      resourceUrl: 'https://seller.example/old-paid',
      method: 'POST' as const,
      environment: 'sandbox' as const,
    }
    const newHandoff = {
      connect: 'x402' as const,
      draft: `sha256:${'9'.repeat(64)}`,
      resourceUrl: 'https://seller.example/new-paid',
      method: 'GET' as const,
      environment: 'sandbox' as const,
    }
    const signature = `0x${'a'.repeat(130)}`
    const walletRequest = vi.fn().mockResolvedValue(signature)
    let rejectRefresh: (cause: Error) => void = () => undefined
    const refreshFailure = new Promise<never>((_, reject) => {
      rejectRefresh = reject
    })
    mocks.invalidate.mockReturnValueOnce(refreshFailure)
    mocks.inspect.mockImplementation(async ({ data }: { data: { resourceUrl: string } }) => ({
      kind: 'observed' as const,
      digest: `sha256:${'b'.repeat(64)}`,
      endpoint: { url: data.resourceUrl },
      payment: {
        selection: { kind: 'selected' as const, alternativeId: 'base-usdc' },
        accepts: [{ alternativeId: 'base-usdc', payTo: '0x1111111111111111111111111111111111111111', amount: '1', network: 'base', asset: 'USDC' }],
      },
      claim: { payTo: '0x1111111111111111111111111111111111111111', expiresAt: Date.now() + 600_000, message: 'claim' },
    }))
    mocks.connect.mockResolvedValue({
      kind: 'applied',
      connection: { ...connection, connectionRef: 'connection:x402:old-confirmed' },
      commandDigest: `sha256:${'c'.repeat(64)}`,
    })
    Object.defineProperty(window, 'ethereum', { configurable: true, value: { request: walletRequest } })

    const view = render(<AeOwnerProviderConnections businessId="business:one" connections={[]} x402Handoff={oldHandoff} />)
    fireEvent.click(screen.getByRole('button', { name: 'Inspect endpoint' }))
    await waitFor(() => expect(mocks.inspect).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'Prove payee control' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Payee control proved' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Connect verified endpoint' }))
    await waitFor(() => expect(mocks.connect).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(mocks.invalidate).toHaveBeenCalledTimes(1))

    view.rerender(<AeOwnerProviderConnections businessId="business:one" connections={[]} x402Handoff={newHandoff} />)
    await waitFor(() => expect((screen.getByLabelText('x402 resource URL') as HTMLInputElement).value).toBe(newHandoff.resourceUrl))
    rejectRefresh(new Error('old refresh outage'))
    await waitFor(() => expect((screen.getByRole('button', { name: 'Inspect endpoint' }) as HTMLButtonElement).disabled).toBe(false))

    expect(screen.queryByRole('button', { name: 'Reload current connections' })).toBeNull()
    expect(mocks.navigate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Inspect endpoint' }))
    await waitFor(() => expect(mocks.inspect).toHaveBeenCalledTimes(2))
    expect(mocks.inspect).toHaveBeenLastCalledWith({ data: {
      businessId: 'business:one',
      resourceUrl: newHandoff.resourceUrl,
      method: newHandoff.method,
      environment: newHandoff.environment,
    } })
    expect(mocks.connect).toHaveBeenCalledTimes(1)
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it('keeps the exact handoff after wallet signature cancellation without connecting or navigating', async () => {
    const handoff = {
      connect: 'x402' as const,
      draft: `sha256:${'1'.repeat(64)}`,
      resourceUrl: 'https://seller.example/cancelled-paid',
      method: 'POST' as const,
      environment: 'sandbox' as const,
    }
    const walletRequest = vi.fn().mockRejectedValue(new Error('user_rejected'))
    mocks.inspect.mockResolvedValue({
      kind: 'observed',
      digest: `sha256:${'2'.repeat(64)}`,
      endpoint: { url: handoff.resourceUrl },
      payment: {
        selection: { kind: 'selected', alternativeId: 'base-usdc' },
        accepts: [{ alternativeId: 'base-usdc', payTo: '0x1111111111111111111111111111111111111111', amount: '1', network: 'base', asset: 'USDC' }],
      },
      claim: { payTo: '0x1111111111111111111111111111111111111111', expiresAt: Date.now() + 600_000, message: 'claim' },
    })
    Object.defineProperty(window, 'ethereum', { configurable: true, value: { request: walletRequest } })

    render(<AeOwnerProviderConnections businessId="business:one" connections={[]} x402Handoff={handoff} />)
    fireEvent.click(screen.getByRole('button', { name: 'Inspect endpoint' }))
    await waitFor(() => expect(mocks.inspect).toHaveBeenCalledWith({ data: {
      businessId: 'business:one',
      resourceUrl: handoff.resourceUrl,
      method: handoff.method,
      environment: handoff.environment,
    } }))
    fireEvent.click(screen.getByRole('button', { name: 'Prove payee control' }))

    expect(await screen.findByText('The payee ownership signature was not completed.')).toBeTruthy()
    expect(walletRequest).toHaveBeenCalledTimes(1)
    expect((screen.getByLabelText('x402 resource URL') as HTMLInputElement).value).toBe(handoff.resourceUrl)
    expect((screen.getByLabelText('x402 resource URL') as HTMLInputElement).readOnly).toBe(true)
    expect(mocks.connect).not.toHaveBeenCalled()
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it('keeps the exact handoff after a refused claim and allows reinspection with the same source', async () => {
    const handoff = {
      connect: 'x402' as const,
      draft: `sha256:${'3'.repeat(64)}`,
      resourceUrl: 'https://seller.example/expired-paid',
      method: 'GET' as const,
      environment: 'sandbox' as const,
    }
    const signature = `0x${'4'.repeat(130)}`
    const walletRequest = vi.fn().mockResolvedValue(signature)
    mocks.inspect
      .mockResolvedValueOnce({
        kind: 'observed',
        digest: `sha256:${'5'.repeat(64)}`,
        endpoint: { url: handoff.resourceUrl },
        payment: {
          selection: { kind: 'selected', alternativeId: 'base-usdc' },
          accepts: [{ alternativeId: 'base-usdc', payTo: '0x1111111111111111111111111111111111111111', amount: '1', network: 'base', asset: 'USDC' }],
        },
        claim: { payTo: '0x1111111111111111111111111111111111111111', expiresAt: Date.now() - 1, message: 'expired-claim' },
      })
      .mockResolvedValueOnce({
        kind: 'observed',
        digest: `sha256:${'6'.repeat(64)}`,
        endpoint: { url: handoff.resourceUrl },
        payment: {
          selection: { kind: 'selected', alternativeId: 'base-usdc' },
          accepts: [{ alternativeId: 'base-usdc', payTo: '0x1111111111111111111111111111111111111111', amount: '1', network: 'base', asset: 'USDC' }],
        },
        claim: { payTo: '0x1111111111111111111111111111111111111111', expiresAt: Date.now() + 600_000, message: 'fresh-claim' },
      })
    mocks.connect.mockResolvedValue({ kind: 'refused', code: 'claim_invalid' })
    Object.defineProperty(window, 'ethereum', { configurable: true, value: { request: walletRequest } })

    render(<AeOwnerProviderConnections businessId="business:one" connections={[]} x402Handoff={handoff} />)
    fireEvent.click(screen.getByRole('button', { name: 'Inspect endpoint' }))
    await waitFor(() => expect(mocks.inspect).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'Prove payee control' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Payee control proved' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Connect verified endpoint' }))
    expect(await screen.findByText('The payee claim expired or no longer matches this provider and endpoint. Inspect it and sign again.')).toBeTruthy()
    expect(mocks.navigate).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Inspect endpoint' }))
    await waitFor(() => expect(mocks.inspect).toHaveBeenCalledTimes(2))
    expect(mocks.inspect).toHaveBeenLastCalledWith({ data: {
      businessId: 'business:one',
      resourceUrl: handoff.resourceUrl,
      method: handoff.method,
      environment: handoff.environment,
    } })
    expect((screen.getByLabelText('x402 resource URL') as HTMLInputElement).value).toBe(handoff.resourceUrl)
    expect(walletRequest).toHaveBeenCalledTimes(1)
  })
})
