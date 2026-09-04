// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invalidate: vi.fn().mockResolvedValue(undefined),
  check: vi.fn(),
  connect: vi.fn(),
  inspect: vi.fn(),
  revoke: vi.fn(),
  useReverification: vi.fn((fetcher: (...args: unknown[]) => Promise<unknown>) => fetcher),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>,
  useRouter: () => ({ invalidate: mocks.invalidate }),
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
    expect(screen.getByText(/Operation readiness is checked per Operation/)).toBeTruthy()
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
})
