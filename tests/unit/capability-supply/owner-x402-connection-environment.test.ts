import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  inspect: vi.fn(),
  query: vi.fn(),
  mutation: vi.fn(),
  verifyMessage: vi.fn(),
  sourceWrite: vi.fn(),
  sourceWriteRequest: vi.fn(),
}))

vi.mock('@/modules/capability-supply/internal/x402-seller-endpoint-inspector', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/capability-supply/internal/x402-seller-endpoint-inspector')>()),
  inspectX402SellerEndpoint: mocks.inspect,
}))

vi.mock('@/lib/server/convex-source', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/convex-source')>()),
  callSourceQuery: mocks.query,
  callSourceMutation: mocks.mutation,
}))

vi.mock('viem', async (importOriginal) => ({
  ...(await importOriginal<typeof import('viem')>()),
  verifyMessage: mocks.verifyMessage,
}))

vi.mock('@/lib/server/source-write-admission', () => ({
  sourceWriteAdmissionFromContext: mocks.sourceWrite,
}))

vi.mock('@/modules/security/source-write-admission', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/security/source-write-admission')>()),
  sourceWriteRequestFromAdmission: mocks.sourceWriteRequest,
}))

vi.mock('@/lib/server/clerk-consequence-proof', () => ({
  requireStrictClerkConsequenceProof: vi.fn().mockResolvedValue({
    reverificationId: 'rev_test_x402',
    firstFactorAgeMinutes: 0,
    secondFactorAgeMinutes: -1,
  }),
}))

import {
  checkOwnerX402,
  connectOwnerX402,
  inspectOwnerX402,
} from '@/modules/capability-supply/supply-funnel.functions'

const endpoint = 'https://seller.example/v1/normalize'
const payTo = '0x1111111111111111111111111111111111111111'
const observation = {
  kind: 'observed' as const,
  authority: 'observed_external' as const,
  canonical: false as const,
  usageVerified: false as const,
  endpoint: { endpointId: 'sha256:endpoint', url: endpoint },
  backend: { backendId: 'sha256:backend', method: 'POST' as const, resource: endpoint },
  payment: {
    profile: 'base-sepolia-usdc-exact' as const,
    accepts: [{
      alternativeId: 'sha256:alternative',
      scheme: 'exact',
      network: 'eip155:84532',
      amount: '10000',
      asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      payTo,
      maxTimeoutSeconds: 60,
      extra: { name: 'USDC', version: '2' },
      supportedByAe: true,
    }],
    selection: { kind: 'selected' as const, alternativeId: 'sha256:alternative' },
  },
  discovery: {
    kind: 'admitted' as const,
    method: 'POST' as const,
    inputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
      additionalProperties: false,
    },
    inputExample: { text: 'hello' },
    outputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { normalized: { type: 'string' } },
      required: ['normalized'],
      additionalProperties: false,
    },
    query: undefined,
  },
  probe: { status: 'payment_required' as const, httpStatus: 402 as const, observedAt: 1 },
  digest: `sha256:${'a'.repeat(64)}`,
}

describe('owner x402 connection payment environment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.query.mockResolvedValue(true)
    mocks.inspect.mockResolvedValue(observation)
    mocks.verifyMessage.mockResolvedValue(true)
    mocks.sourceWrite.mockResolvedValue({ proof: 'source-write' })
    mocks.sourceWriteRequest.mockReturnValue({ proof: 'source-write-request' })
    mocks.mutation.mockResolvedValue({
      kind: 'applied',
      connection: {},
      commandDigest: `sha256:${'b'.repeat(64)}`,
    })
  })

  it('inspects a seller using the explicitly selected sandbox profile', async () => {
    const result = await inspectOwnerX402({
      data: {
        businessId: 'business-1',
        resourceUrl: endpoint,
        method: 'POST',
        environment: 'sandbox',
      },
    })

    expect(result.kind).toBe('observed')
    expect(mocks.inspect).toHaveBeenCalledWith({
      endpointUrl: endpoint,
      method: 'POST',
      aeEnvironment: 'sandbox',
    })
  })

  it('offers the wallet-control claim when Bazaar metadata is absent', async () => {
    mocks.inspect.mockResolvedValue({ ...observation, discovery: { kind: 'absent' } })

    await expect(inspectOwnerX402({
      data: {
        businessId: 'business-1',
        resourceUrl: endpoint,
        method: 'POST',
        environment: 'sandbox',
      },
    })).resolves.toMatchObject({
      kind: 'observed',
      claim: { payTo },
      discovery: { kind: 'absent' },
    })
  })

  it('re-inspects the same environment before saving the signed payee claim', async () => {
    await expect(connectOwnerX402({
      context: {},
      data: {
        businessId: 'business-1',
        resourceUrl: endpoint,
        method: 'POST',
        environment: 'sandbox',
        claimExpiresAt: Date.now() + 60_000,
        claimSignature: `0x${'ab'.repeat(65)}`,
        commandId: 'connect-sandbox-seller',
      },
    })).resolves.toMatchObject({ kind: 'applied' })

    expect(mocks.inspect).toHaveBeenCalledWith({
      endpointUrl: endpoint,
      method: 'POST',
      aeEnvironment: 'sandbox',
    })
    expect(mocks.mutation).toHaveBeenCalledOnce()
  })

  it('uses wallet control and live x402 readback even when Bazaar metadata is absent', async () => {
    mocks.inspect.mockResolvedValue({ ...observation, discovery: { kind: 'absent' } })

    await expect(connectOwnerX402({
      context: {},
      data: {
        businessId: 'business-1',
        resourceUrl: endpoint,
        method: 'POST',
        environment: 'sandbox',
        claimExpiresAt: Date.now() + 60_000,
        claimSignature: `0x${'ab'.repeat(65)}`,
        commandId: 'connect-sandbox-seller',
      },
    })).resolves.toMatchObject({ kind: 'applied' })

    expect(mocks.sourceWrite).toHaveBeenCalledOnce()
    expect(mocks.mutation).toHaveBeenCalledOnce()
  })

  it('refuses an invalid payee signature before any write', async () => {
    mocks.verifyMessage.mockResolvedValue(false)

    await expect(connectOwnerX402({
      context: {},
      data: {
        businessId: 'business-1',
        resourceUrl: endpoint,
        method: 'POST',
        environment: 'sandbox',
        claimExpiresAt: Date.now() + 60_000,
        claimSignature: `0x${'ab'.repeat(65)}`,
        commandId: 'connect-sandbox-seller',
      },
    })).resolves.toEqual({ kind: 'refused', code: 'claim_invalid' })

    expect(mocks.sourceWrite).not.toHaveBeenCalled()
    expect(mocks.mutation).not.toHaveBeenCalled()
  })

  it('reuses the exact stored method and resource for a bounded health observation', async () => {
    mocks.query.mockResolvedValueOnce([{
      connectionRef: 'connection:x402:one',
      adapterId: 'x402-fetch:v2',
      grantedResources: [endpoint],
      x402Method: 'POST',
      x402Payee: payTo,
      authorityGeneration: 3,
      authorityDigest: `sha256:${'c'.repeat(64)}`,
    }])

    await expect(checkOwnerX402({
      context: {},
      data: {
        connectionRef: 'connection:x402:one',
        commandId: 'check-x402-one',
        expectedAuthorityGeneration: 3,
        expectedAuthorityDigest: `sha256:${'c'.repeat(64)}`,
        environment: 'sandbox',
      },
    })).resolves.toMatchObject({ kind: 'applied' })

    expect(mocks.inspect).toHaveBeenCalledWith({
      endpointUrl: endpoint,
      method: 'POST',
      aeEnvironment: 'sandbox',
    })
    expect(mocks.mutation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      connectionRef: 'connection:x402:one',
      method: 'POST',
      resourceUrl: endpoint,
      payee: payTo,
      status: 'healthy',
      observationDigest: observation.digest,
    }))
    expect(JSON.stringify(mocks.mutation.mock.calls)).not.toMatch(/signature|payment-required|private[_-]?key/iu)
  })

  it('records payee drift as unhealthy instead of advancing authority', async () => {
    mocks.query.mockResolvedValueOnce([{
      connectionRef: 'connection:x402:one',
      adapterId: 'x402-fetch:v2',
      grantedResources: [endpoint],
      x402Method: 'POST',
      x402Payee: '0x2222222222222222222222222222222222222222',
      authorityGeneration: 3,
      authorityDigest: `sha256:${'c'.repeat(64)}`,
    }])

    await checkOwnerX402({
      context: {},
      data: {
        connectionRef: 'connection:x402:one',
        commandId: 'check-x402-drift',
        expectedAuthorityGeneration: 3,
        expectedAuthorityDigest: `sha256:${'c'.repeat(64)}`,
        environment: 'sandbox',
      },
    })

    expect(mocks.mutation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      status: 'unhealthy',
      reasonCode: 'payee_changed',
    }))
    expect(mocks.mutation.mock.calls.at(-1)?.[1]).not.toHaveProperty('authorityGeneration')
  })
})
