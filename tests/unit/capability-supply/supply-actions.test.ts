import type * as ConvexSourceModule from '@/lib/server/convex-source'
import type * as SourceWriteAdmissionModule from '@/lib/server/source-write-admission'
import type * as PublicationModule from '@/modules/capability-supply/internal/publication'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  callPublicSourceMutation: vi.fn(),
  sourceMutation: vi.fn((name: string) => ({ name })),
  sourceWriteAdmissionFromRequest: vi.fn(),
  sourceWriteRequestFromAdmission: vi.fn(),
  ownerPublicationImport: vi.fn(),
  ownerPublicationWithCatalogOrigin: vi.fn(),
  preparePublicationDraft: vi.fn(),
  inspectX402SellerEndpoint: vi.fn(),
  verifyMessage: vi.fn(),
}))

vi.mock('@/lib/server/convex-source', async (importOriginal) => ({
  ...(await importOriginal<typeof ConvexSourceModule>()),
  callPublicSourceMutation: mocks.callPublicSourceMutation,
  sourceMutation: mocks.sourceMutation,
}))
vi.mock('@/lib/server/source-write-admission', async (importOriginal) => ({
  ...(await importOriginal<typeof SourceWriteAdmissionModule>()),
  sourceWriteAdmissionFromRequest: mocks.sourceWriteAdmissionFromRequest,
  sourceWriteRequestFromAdmission: mocks.sourceWriteRequestFromAdmission,
}))
vi.mock('@/modules/capability-supply/supply-funnel.functions', () => ({
  ownerPublicationImport: mocks.ownerPublicationImport,
  ownerPublicationWithCatalogOrigin: mocks.ownerPublicationWithCatalogOrigin,
}))
vi.mock('@/modules/capability-supply/internal/publication', async (importOriginal) => ({
  ...(await importOriginal<typeof PublicationModule>()),
  preparePublicationDraft: mocks.preparePublicationDraft,
}))
vi.mock('@/modules/capability-supply/internal/schema-deref', () => ({
  dereferenceOpenApiSchema: vi.fn(),
}))
vi.mock('@/modules/capability-supply/internal/x402-seller-endpoint-inspector', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/capability-supply/internal/x402-seller-endpoint-inspector')>()),
  inspectX402SellerEndpoint: mocks.inspectX402SellerEndpoint,
}))
vi.mock('viem', async (importOriginal) => ({
  ...(await importOriginal<typeof import('viem')>()),
  verifyMessage: mocks.verifyMessage,
}))

import {
  createSupplyManagementService,
  type SupplyPublishInput,
  type SupplyWithdrawInput,
} from '@/modules/capability-supply/supply-actions'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import {
  x402SellerClaimDigest,
  x402SellerClaimMessage,
} from '@/modules/capability-supply/public'

const principal: AgentAccessPrincipal = {
  principalId: 'principal:supply-actions',
  ownerId: 'owner:supply-actions',
  credentialId: 'credential:supply-actions',
  applicationRef: 'agentic-economy',
  environment: 'production',
  scopes: ['market_supply:manage'],
  authorityMode: 'full_yolo',
}
const validSource = {
  kind: 'openapi_http',
  document: { openapi: '3.0.0', info: { title: 'Owner API', version: '1' } },
  operation: { path: '/lookup', method: 'get' },
  contract: { capabilityId: 'owner.lookup', version: 1 },
  commercial: {
    offering: {
      presentation: {
        price: {
          kind: 'fixed',
          amount: { currency: 'USD', units: '10', exponent: 2 },
        },
      },
    },
  },
  evidenceRefs: ['evidence:owner-api'],
}
const preparedMaterial = {
  sourceKind: 'openapi_http',
  sourceRevision: 'owner-api/2026-08-09',
  sourceDigest: 'sha256:' + 'a'.repeat(64),
  priceDigest: 'sha256:' + 'b'.repeat(64),
  evidenceRefs: ['evidence:owner-api'],
  marker: 'prepared',
}
const publishInput: SupplyPublishInput = {
  version: 'supply-publication:v1',
  businessId: 'business:supply-actions',
  offeringRef: 'offering:one',
  offeringRevision: 1,
  offeringSourceHash: 'source-hash:one',
  source: validSource as SupplyPublishInput['source'],
  evidenceRefs: ['evidence:owner-api'],
  idempotencyKey: 'idempotency:supply-actions',
}
const withdrawInput: SupplyWithdrawInput = {
  businessId: publishInput.businessId,
  offeringRef: publishInput.offeringRef,
  offeringRevision: publishInput.offeringRevision,
  offeringSourceHash: publishInput.offeringSourceHash,
  publicationRef: 'publication:one',
  publicationRevision: 1,
  idempotencyKey: 'idempotency:withdraw-supply-actions',
}
const sellerEndpoint = 'https://provider.example/x402'
const sellerPayTo = '0x1111111111111111111111111111111111111111'
const sellerObservationDigest = `sha256:${'c'.repeat(64)}`
const sellerClaimSignature = `0x${'ab'.repeat(65)}`
const sellerObservation = {
  kind: 'observed' as const,
  endpoint: { url: sellerEndpoint },
  payment: {
    selection: { kind: 'selected' as const, alternativeId: 'alternative:base-mainnet' },
    accepts: [{
      alternativeId: 'alternative:base-mainnet',
      payTo: sellerPayTo,
    }],
  },
  discovery: { kind: 'admitted' as const },
  digest: sellerObservationDigest,
}
const connectedProjection = {
  connectionRef: 'connection:x402:one',
  businessId: 'business:supply-actions',
  providerRef: 'provider:x402:provider.example',
  providerAccountRef: `x402:${sellerEndpoint}`,
  adapterId: 'x402-fetch:v2',
  grantedScopes: [],
  grantedResources: [sellerEndpoint],
  authorityGeneration: 1,
  authorityDigest: `sha256:${'d'.repeat(64)}`,
  lifecycle: 'active' as const,
  available: true,
  credentialConfigured: false,
  observedAt: 10,
  reasonCode: null,
  evidenceRefs: [`x402-endpoint-inspection:${sellerObservationDigest}`],
  createdAt: 10,
  updatedAt: 10,
}

function setHappyPublishResponses() {
  const readback = {
    kind: 'available',
    offerings: [
      { offeringRef: 'offering:one', revision: 1, sourceHash: 'source-hash:one' },
      { offeringRef: 'offering:two', revision: 1, sourceHash: 'source-hash:two' },
    ],
  }
  mocks.ownerPublicationImport.mockReturnValue({
    source: validSource,
    sourceRevision: 'owner-api/2026-08-09',
    pricingConfig: { version: 'pricing:v3' },
  })
  mocks.ownerPublicationWithCatalogOrigin.mockImplementation((source: unknown) => ({
    ...(source as Record<string, unknown>),
    catalogOrigin: 'owner-catalog',
  }))
  mocks.preparePublicationDraft.mockResolvedValue({ kind: 'prepared', prepared: preparedMaterial })
  mocks.callPublicSourceMutation.mockImplementation(async (mutation: { name: string }) => {
    switch (mutation.name) {
      case 'capabilitySupplyOwnerFunnel:readAgentOwnerSupplyFunnel':
        return readback
      case 'capabilitySupplyOwnerFunnel:reserveOwnerCapabilityPublication':
        return { kind: 'reserved' }
      case 'capabilitySupply:publishPreparedCapability':
        return {
          kind: 'published',
          publicationRef: 'publication:one',
          publicationRevision: 1,
          operationRef: 'operation:one',
          lifecycle: { state: 'active', reasons: [] },
        }
      default:
        throw new Error(`unexpected_source_mutation:${mutation.name}`)
    }
  })
}

beforeEach(() => {
  mocks.callPublicSourceMutation.mockReset()
  mocks.sourceWriteAdmissionFromRequest.mockReset()
  mocks.sourceWriteRequestFromAdmission.mockReset()
  mocks.ownerPublicationImport.mockReset()
  mocks.ownerPublicationWithCatalogOrigin.mockReset()
  mocks.preparePublicationDraft.mockReset()
  mocks.inspectX402SellerEndpoint.mockReset()
  mocks.verifyMessage.mockReset()
  mocks.sourceWriteAdmissionFromRequest.mockImplementation(async ({ operationKey, correlationId }: { operationKey: string; correlationId: string }) => ({
    version: 'source-write:v2',
    operationKey,
    correlationId,
  }))
  mocks.sourceWriteRequestFromAdmission.mockImplementation((admission: { operationKey: string; correlationId: string }) => ({
    operationKey: admission.operationKey,
    correlationId: admission.correlationId,
  }))
})

describe('supply action runtime boundaries', () => {
  it('projects one canonical lifecycle status without endpoint or provider authority material', async () => {
    mocks.callPublicSourceMutation.mockResolvedValue({
      kind: 'available',
      businessId: 'business:supply-actions',
      business: { name: 'Supplier', slug: 'supplier' },
      offerings: [{
        offeringRef: 'offering:one',
        revision: 1,
        name: 'Lookup',
        summary: 'Look something up.',
        status: 'published',
        endpointUrl: 'https://private-provider.example/lookup',
        authority: { kind: 'provider_connection', providerRef: 'provider:secret' },
        admission: { state: 'admitted' },
        publication: {
          state: 'current',
          publicationRef: 'publication:one',
          publicationRevision: 1,
          operationRef: 'operation:one',
        },
        lifecycle: { state: 'active', reasons: [] },
        readiness: { outcome: 'healthy', observedAt: 10, validUntil: 20, evidenceRefs: [] },
        live: { available: true },
        currentStep: 'test',
        stepStates: { describe: 'completed', admission: 'completed', readiness: 'completed', test: 'completed' },
        accessPaths: [],
      }],
      callLog: [],
      activityTruncated: false,
      liquidity: { fillCount: 0, zeroCount: 0, depthSamples: 0, environment: 'production' },
    })
    const service = createSupplyManagementService(new Request('https://agent.example/api'), '{}')

    const result = await service.status({
      input: { businessId: 'business:supply-actions', offeringRef: 'offering:one' },
      principal,
      correlationId: 'status:one',
    })

    expect(result).toMatchObject({
      kind: 'available',
      operations: [{
        offeringRef: 'offering:one',
        lifecycle: { state: 'active' },
        readiness: { outcome: 'healthy' },
        publication: { operationRef: 'operation:one' },
      }],
    })
    expect(JSON.stringify(result)).not.toContain('private-provider')
    expect(JSON.stringify(result)).not.toContain('provider:secret')
  })

  it('refuses raw unknown apiKey material before any source mutation', async () => {
    setHappyPublishResponses()
    const service = createSupplyManagementService(new Request('https://agent.example/api'), '{}')
    const result = await service.publish({
      input: { ...publishInput, source: { ...validSource, apiKey: 'sk_live_unknown-field-secret' } },
      principal,
      correlationId: 'transport:raw-credential',
    })

    expect(result).toEqual({ kind: 'refused', reason: 'source_invalid' })
    expect(mocks.callPublicSourceMutation).not.toHaveBeenCalled()
    expect(mocks.sourceWriteAdmissionFromRequest).not.toHaveBeenCalled()
  })

  it('publishes prepared material without a source draft round-trip', async () => {
    setHappyPublishResponses()
    const service = createSupplyManagementService(new Request('https://agent.example/api'), '{}')
    await service.publish({ input: publishInput, principal, correlationId: 'transport:source-shape' })

    const publishCall = mocks.callPublicSourceMutation.mock.calls.find(
      ([mutation]) => mutation.name === 'capabilitySupply:publishPreparedCapability',
    )
    expect(publishCall).toBeDefined()
    expect(publishCall?.[1]).toMatchObject({
      offeringRef: 'offering:one',
      revision: 1,
      sourceHash: 'source-hash:one',
      runtimeEnvironment: 'production',
      prepared: preparedMaterial,
    })
    expect(publishCall?.[1]).not.toHaveProperty('sourceDraftRevision')
    expect(publishCall?.[1]).not.toHaveProperty('sourceDigest')
    expect(
      mocks.callPublicSourceMutation.mock.calls.map(([mutation]) => mutation.name),
    ).toEqual([
      'capabilitySupplyOwnerFunnel:readAgentOwnerSupplyFunnel',
      'capabilitySupplyOwnerFunnel:reserveOwnerCapabilityPublication',
      'capabilitySupply:publishPreparedCapability',
    ])
  })

  it('reuses publish command identity across transport correlation and credential rotation', async () => {
    setHappyPublishResponses()
    const service = createSupplyManagementService(new Request('https://agent.example/api'), '{}')
    const rotatedPrincipal = { ...principal, credentialId: 'credential:supply-actions-rotated' }
    await service.publish({ input: publishInput, principal, correlationId: 'transport:first' })
    const firstReservation = mocks.callPublicSourceMutation.mock.calls.find(
      ([mutation]) => mutation.name === 'capabilitySupplyOwnerFunnel:reserveOwnerCapabilityPublication',
    )
    mocks.callPublicSourceMutation.mockClear()
    await service.publish({ input: publishInput, principal: rotatedPrincipal, correlationId: 'transport:second' })
    const secondReservation = mocks.callPublicSourceMutation.mock.calls.find(
      ([mutation]) => mutation.name === 'capabilitySupplyOwnerFunnel:reserveOwnerCapabilityPublication',
    )

    expect(firstReservation?.[1].operationKey).toBe(secondReservation?.[1].operationKey)
    expect(firstReservation?.[1].correlationId).toBe(secondReservation?.[1].correlationId)
    expect(secondReservation?.[1].correlationId).not.toBe('transport:second')
    const finalPublish = mocks.callPublicSourceMutation.mock.calls.find(
      ([mutation]) => mutation.name === 'capabilitySupply:publishPreparedCapability',
    )
    expect(finalPublish?.[1].operationKey).toBe(secondReservation?.[1].operationKey)
    expect(finalPublish?.[1].correlationId).toBe(secondReservation?.[1].correlationId)
  })

  it('stops on reservation conflict before publish for changed material', async () => {
    setHappyPublishResponses()
    let reservationCalls = 0
    mocks.callPublicSourceMutation.mockImplementation(async (mutation: { name: string }) => {
      if (mutation.name === 'capabilitySupplyOwnerFunnel:reserveOwnerCapabilityPublication') {
        reservationCalls += 1
        return reservationCalls === 1 ? { kind: 'reserved' } : { kind: 'refused', reason: 'operation_key_conflict' }
      }
      if (mutation.name === 'capabilitySupplyOwnerFunnel:readAgentOwnerSupplyFunnel') {
        return {
          kind: 'available',
          offerings: [
            { offeringRef: 'offering:one', revision: 1, sourceHash: 'source-hash:one' },
            { offeringRef: 'offering:two', revision: 1, sourceHash: 'source-hash:two' },
          ],
        }
      }
      if (mutation.name === 'capabilitySupply:publishPreparedCapability') return { kind: 'published', publicationRef: 'publication:one', publicationRevision: 1, operationRef: 'operation:one', lifecycle: { state: 'active', reasons: [] } }
      throw new Error(`unexpected_source_mutation:${mutation.name}`)
    })
    const service = createSupplyManagementService(new Request('https://agent.example/api'), '{}')
    await service.publish({ input: publishInput, principal, correlationId: 'transport:first' })
    const beforeEvidenceRetry = mocks.callPublicSourceMutation.mock.calls.length
    const changedEvidence: SupplyPublishInput = {
      ...publishInput,
      evidenceRefs: ['evidence:changed'],
    }
    const evidenceRetry = await service.publish({ input: changedEvidence, principal, correlationId: 'transport:evidence-changed' })
    expect(evidenceRetry).toEqual({ kind: 'refused', reason: 'operation_key_conflict' })
    const evidenceRetryNames = mocks.callPublicSourceMutation.mock.calls.slice(beforeEvidenceRetry).map(([mutation]) => mutation.name)
    expect(evidenceRetryNames).toEqual([
      'capabilitySupplyOwnerFunnel:readAgentOwnerSupplyFunnel',
      'capabilitySupplyOwnerFunnel:reserveOwnerCapabilityPublication',
    ])
    const beforeOfferingRetry = mocks.callPublicSourceMutation.mock.calls.length
    const changedOffering: SupplyPublishInput = {
      ...publishInput,
      offeringRef: 'offering:two',
      offeringSourceHash: 'source-hash:two',
    }
    const offeringRetry = await service.publish({ input: changedOffering, principal, correlationId: 'transport:offering-changed' })
    expect(offeringRetry).toEqual({ kind: 'refused', reason: 'operation_key_conflict' })
    const offeringRetryNames = mocks.callPublicSourceMutation.mock.calls.slice(beforeOfferingRetry).map(([mutation]) => mutation.name)
    expect(offeringRetryNames).toEqual([
      'capabilitySupplyOwnerFunnel:readAgentOwnerSupplyFunnel',
      'capabilitySupplyOwnerFunnel:reserveOwnerCapabilityPublication',
    ])
  })

  it('binds withdraw operationKey and correlationId identically through source admission', async () => {
    mocks.callPublicSourceMutation.mockResolvedValue({
      kind: 'withdrawn',
      publicationRef: withdrawInput.publicationRef,
      revision: withdrawInput.publicationRevision,
      lifecycle: { state: 'withdrawn', reasons: ['withdrawn'] },
    })
    const service = createSupplyManagementService(new Request('https://agent.example/api'), '{}')
    const result = await service.withdraw({ input: withdrawInput, principal, correlationId: 'transport:withdraw' })
    const call = mocks.callPublicSourceMutation.mock.calls[0]
    const admission = mocks.sourceWriteAdmissionFromRequest.mock.calls[0]

    expect(result).toMatchObject({ kind: 'withdrawn', publicationRef: withdrawInput.publicationRef })
    expect(call?.[1].operationKey).toBe(admission?.[0].operationKey)
    expect(call?.[1].correlationId).toBe(admission?.[0].correlationId)
    expect(call?.[1].operationKey).toBe(call?.[1].correlationId)
  })

  it('rechecks and republishes through the same exact-revision maintenance seam', async () => {
    mocks.callPublicSourceMutation
      .mockResolvedValueOnce({
        kind: 'refreshed',
        publicationRef: withdrawInput.publicationRef,
        revision: 1,
        disposition: 'current',
        lifecycle: { state: 'inactive', reasons: ['health_unobserved'] },
      })
      .mockResolvedValueOnce({
        kind: 'republished',
        publicationRef: withdrawInput.publicationRef,
        revision: 2,
        operationRef: 'operation:one',
        bindingId: 'binding:one',
        lifecycle: { state: 'active', reasons: [] },
      })
    const service = createSupplyManagementService(new Request('https://agent.example/api'), '{}')

    await expect(service.recheck({ input: withdrawInput, principal, correlationId: 'transport:recheck' })).resolves.toMatchObject({ kind: 'refreshed' })
    await expect(service.republish({ input: withdrawInput, principal, correlationId: 'transport:republish' })).resolves.toMatchObject({ kind: 'republished', revision: 2 })

    expect(mocks.callPublicSourceMutation.mock.calls.map(([mutation]) => mutation.name)).toEqual([
      'capabilitySupplyOwnerFunnel:refreshOwnerCapability',
      'capabilitySupplyOwnerFunnel:republishOwnerCapability',
    ])
    expect(mocks.callPublicSourceMutation.mock.calls[0]?.[1]).toMatchObject({
      offeringRef: withdrawInput.offeringRef,
      publicationRef: withdrawInput.publicationRef,
      reasonCode: 'supply.recheck',
      agentPrincipal: principal,
    })
    expect(mocks.callPublicSourceMutation.mock.calls[1]?.[1]).toMatchObject({
      reasonCode: 'supply.republish',
      agentPrincipal: principal,
    })
  })

  it('returns not_found when the requested earnings currency has no account', async () => {
    mocks.callPublicSourceMutation.mockResolvedValue({
      kind: 'available',
      businessId: 'business:supply-actions',
      accounts: [{ currency: 'EUR', earnings: { kind: 'ok' }, payout: { kind: 'ok' } }],
      accountsTruncated: false,
    })
    const service = createSupplyManagementService(new Request('https://agent.example/api'), '{}')

    await expect(service.earnings({ input: { currency: 'USD' }, principal, correlationId: 'transport:earnings' })).resolves.toEqual({ kind: 'not_found' })
  })

  it('strips payout connection and control identifiers while preserving exact public accounting output', async () => {
    const amount = { currency: 'USD', units: '100', exponent: 2 }
    mocks.callPublicSourceMutation.mockResolvedValue({
      kind: 'available',
      businessId: 'business:supply-actions',
      accounts: [{
        currency: 'USD',
        earnings: {
          kind: 'ok',
          businessId: 'business:supply-actions',
          grossAccrual: amount,
          rake: { ...amount, units: '10' },
          providerNet: { ...amount, units: '90' },
          paidOut: { ...amount, units: '0' },
          held: { ...amount, units: '90' },
          recoveryDue: { ...amount, units: '0' },
          truncated: false,
          evidence: 'source',
        },
        payout: {
          kind: 'ok',
          businessId: 'business:supply-actions',
          accountState: 'ready',
          payoutState: 'transfer_pending',
          payoutRef: 'payout:supply-actions',
          payoutCommandId: 'command:internal',
          idempotencyKey: 'idempotency:internal',
          providerNet: { ...amount, units: '90' },
          minimumPayout: { ...amount, units: '50' },
          stripeTransferId: 'tr_internal',
          destinationAccountId: 'acct_internal',
          requestDigest: 'sha256:request',
          transferRequestDigest: 'sha256:transfer-request',
          transferResultDigest: 'sha256:transfer-result',
          stripeAccountId: 'acct_internal',
          accountVersion: 7,
          lastStripeEventId: 'evt_internal',
          lastStripePayloadDigest: 'sha256:stripe-payload',
          providerObjectDigest: 'sha256:provider-object',
          transferStatus: 'pending',
          providerRecoveryDeadlineAt: 123456789,
          recoveryState: 'idempotency_key',
          evidenceDigest: 'sha256:evidence',
          reversalEvidenceDigest: 'sha256:reversal-evidence',
          providerHeldBefore: { ...amount, units: '90' },
          providerHeldAfter: { ...amount, units: '90' },
          providerPaidBefore: { ...amount, units: '0' },
          providerPaidAfter: { ...amount, units: '0' },
          failureCode: 'internal-failure',
          transferObservedAt: 123456788,
          evidence: 'source',
          version: 7,
          digest: 'internal-digest',
        },
      }],
      accountsTruncated: false,
    })
    const service = createSupplyManagementService(new Request('https://agent.example/api'), '{}')

    await expect(service.earnings({ input: { currency: 'USD' }, principal, correlationId: 'transport:payout' })).resolves.toEqual({
      kind: 'available',
      businessId: 'business:supply-actions',
      currency: 'USD',
      earnings: {
        businessId: 'business:supply-actions',
        grossAccrual: amount,
        rake: { ...amount, units: '10' },
        providerNet: { ...amount, units: '90' },
        paidOut: { ...amount, units: '0' },
        held: { ...amount, units: '90' },
        recoveryDue: { ...amount, units: '0' },
        truncated: false,
        evidence: 'source',
      },
      payout: {
        businessId: 'business:supply-actions',
        accountState: 'ready',
        payoutState: 'transfer_pending',
        providerNet: { ...amount, units: '90' },
        minimumPayout: { ...amount, units: '50' },
        transferStatus: 'pending',
        providerRecoveryDeadlineAt: 123456789,
        recoveryState: 'idempotency_key',
        evidenceDigest: 'sha256:evidence',
        reversalEvidenceDigest: 'sha256:reversal-evidence',
        providerHeldBefore: { ...amount, units: '90' },
        providerHeldAfter: { ...amount, units: '90' },
        providerPaidBefore: { ...amount, units: '0' },
        providerPaidAfter: { ...amount, units: '0' },
        evidence: 'source',
      },
    })
  })

  it('lists provider connections through the agent-aware source mutation without exposing credential material', async () => {
    const connection = {
      connectionRef: 'connection:x402:one',
      businessId: 'business:supply-actions',
      providerRef: 'provider:x402:provider.example',
      providerAccountRef: 'x402:https://provider.example/pay',
      adapterId: 'x402:v1',
      grantedScopes: ['x402:pay'],
      grantedResources: ['https://provider.example/pay'],
      authorityGeneration: 1,
      authorityDigest: 'sha256:authority',
      lifecycle: 'active',
      available: true,
      credentialConfigured: false,
      observedAt: 10,
      reasonCode: null,
      evidenceRefs: ['evidence:connection'],
      createdAt: 10,
      updatedAt: 10,
    }
    mocks.callPublicSourceMutation.mockResolvedValue({
      kind: 'available',
      businessId: 'business:supply-actions',
      connections: [connection],
    })
    const service = createSupplyManagementService(new Request('https://agent.example/api/v1/supply/connections/list'), '{}')

    const result = await service.connectionList({
      input: { businessId: 'business:supply-actions', limit: 25 },
      principal,
      correlationId: 'transport:connections',
    })

    expect(result).toEqual({ kind: 'available', businessId: 'business:supply-actions', connections: [connection] })
    expect(mocks.callPublicSourceMutation).toHaveBeenCalledWith(
      { name: 'capabilityProviderConnectionAgents:list' },
      expect.objectContaining({
        businessId: 'business:supply-actions',
        limit: 25,
        agentPrincipal: principal,
      }),
    )
    expect(JSON.stringify(result)).not.toContain('credentialRef')
  })

  it('reinspects and verifies the exact seller claim before admitting an agent connection write', async () => {
    const claimExpiresAt = Date.now() + 10 * 60_000
    const claim = {
      businessId: 'business:supply-actions',
      endpointUrl: sellerEndpoint,
      method: 'POST' as const,
      observationDigest: sellerObservationDigest,
      payTo: sellerPayTo,
      expiresAt: claimExpiresAt,
    }
    mocks.inspectX402SellerEndpoint.mockResolvedValue(sellerObservation)
    mocks.verifyMessage.mockResolvedValue(true)
    mocks.callPublicSourceMutation.mockResolvedValue({
      kind: 'applied',
      connection: connectedProjection,
      commandDigest: `sha256:${'e'.repeat(64)}`,
    })
    const service = createSupplyManagementService(
      new Request('https://agent.example/api/v1/supply/connections/connect'),
      '{}',
    )

    const result = await service.connectionConnect({
      input: {
        businessId: claim.businessId,
        resourceUrl: sellerEndpoint,
        method: claim.method,
        environment: 'production',
        observationDigest: claim.observationDigest,
        payTo: claim.payTo,
        claimExpiresAt,
        claimSignature: sellerClaimSignature,
        evidenceRefs: ['seller-submission:one'],
        idempotencyKey: 'connect-command-one',
      },
      principal,
      correlationId: 'transport-only-correlation',
    })

    expect(result).toMatchObject({ kind: 'applied', connection: { connectionRef: connectedProjection.connectionRef } })
    expect(mocks.inspectX402SellerEndpoint).toHaveBeenCalledWith({
      endpointUrl: sellerEndpoint,
      method: 'POST',
      aeEnvironment: 'production',
    })
    expect(mocks.verifyMessage).toHaveBeenCalledWith({
      address: sellerPayTo,
      message: x402SellerClaimMessage(claim),
      signature: sellerClaimSignature,
    })
    const command = mocks.callPublicSourceMutation.mock.calls[0]?.[1] as Record<string, unknown>
    expect(mocks.callPublicSourceMutation.mock.calls[0]?.[0]).toEqual({
      name: 'capabilityProviderConnectionAgents:connectX402',
    })
    expect(command).toMatchObject({
      businessId: claim.businessId,
      resourceUrl: sellerEndpoint,
      method: claim.method,
      observationDigest: claim.observationDigest,
      payTo: claim.payTo,
      claimExpiresAt,
      claimDigest: x402SellerClaimDigest(claim),
      claimSignature: sellerClaimSignature,
      evidenceRefs: [
        'seller-submission:one',
        `x402-endpoint-inspection:${sellerObservationDigest}`,
      ],
      agentPrincipal: principal,
    })
    expect(command.commandId).toBe(command.operationKey)
    expect(command.correlationId).toBe(command.operationKey)
  })

  it('refuses stale or unsigned agent seller claims before source-write admission', async () => {
    mocks.inspectX402SellerEndpoint.mockResolvedValue(sellerObservation)
    mocks.verifyMessage.mockResolvedValue(false)
    const service = createSupplyManagementService(
      new Request('https://agent.example/api/v1/supply/connections/connect'),
      '{}',
    )
    const baseInput = {
      businessId: 'business:supply-actions',
      resourceUrl: sellerEndpoint,
      method: 'POST' as const,
      environment: 'production' as const,
      observationDigest: sellerObservationDigest,
      payTo: sellerPayTo,
      claimExpiresAt: Date.now() + 10 * 60_000,
      claimSignature: sellerClaimSignature,
      evidenceRefs: [],
      idempotencyKey: 'connect-command-refused',
    }

    await expect(service.connectionConnect({
      input: { ...baseInput, observationDigest: `sha256:${'f'.repeat(64)}` },
      principal,
      correlationId: 'stale-observation',
    })).resolves.toEqual({ kind: 'refused', reason: 'claim_invalid' })
    expect(mocks.verifyMessage).not.toHaveBeenCalled()
    expect(mocks.sourceWriteAdmissionFromRequest).not.toHaveBeenCalled()
    expect(mocks.callPublicSourceMutation).not.toHaveBeenCalled()

    await expect(service.connectionConnect({
      input: baseInput,
      principal,
      correlationId: 'invalid-signature',
    })).resolves.toEqual({ kind: 'refused', reason: 'claim_invalid' })
    expect(mocks.verifyMessage).toHaveBeenCalledOnce()
    expect(mocks.sourceWriteAdmissionFromRequest).not.toHaveBeenCalled()
    expect(mocks.callPublicSourceMutation).not.toHaveBeenCalled()
  })

  it.each([
    [{ kind: 'absent' as const }, 'inspection_bazaar_missing'],
    [{ kind: 'refused' as const, reason: 'bazaar_discovery_invalid' as const }, 'inspection_bazaar_discovery_invalid'],
  ])('refuses missing or invalid Bazaar admission before source-write admission', async (discovery, reason) => {
    mocks.inspectX402SellerEndpoint.mockResolvedValue({ ...sellerObservation, discovery })
    mocks.verifyMessage.mockResolvedValue(true)
    const service = createSupplyManagementService(
      new Request('https://agent.example/api/v1/supply/connections/connect'),
      '{}',
    )

    await expect(service.connectionConnect({
      input: {
        businessId: 'business:supply-actions',
        resourceUrl: sellerEndpoint,
        method: 'POST',
        environment: 'production',
        observationDigest: sellerObservationDigest,
        payTo: sellerPayTo,
        claimExpiresAt: Date.now() + 10 * 60_000,
        claimSignature: sellerClaimSignature,
        evidenceRefs: [],
        idempotencyKey: 'connect-bazaar-refused',
      },
      principal,
      correlationId: 'bazaar-refused',
    })).resolves.toEqual({ kind: 'refused', reason })
    expect(mocks.verifyMessage).not.toHaveBeenCalled()
    expect(mocks.sourceWriteAdmissionFromRequest).not.toHaveBeenCalled()
    expect(mocks.callPublicSourceMutation).not.toHaveBeenCalled()
  })

  it('uses one durable command identity for connection writes and preserves typed stale-authority refusal', async () => {
    mocks.callPublicSourceMutation.mockResolvedValue({ kind: 'refused', code: 'invalid_generation' })
    const service = createSupplyManagementService(new Request('https://agent.example/api/v1/supply/connections/reconnect'), '{}')

    const result = await service.connectionReconnect({
      input: {
        connectionRef: 'connection:x402:one',
        expectedAuthorityGeneration: 7,
        expectedAuthorityDigest: 'sha256:authority',
        evidenceRefs: [],
        idempotencyKey: 'reconnect-command-one',
      },
      principal,
      correlationId: 'transport-only-correlation',
    })

    expect(result).toEqual({ kind: 'refused', reason: 'invalid_generation' })
    const command = mocks.callPublicSourceMutation.mock.calls[0]?.[1] as Record<string, unknown>
    expect(mocks.callPublicSourceMutation.mock.calls[0]?.[0]).toEqual({ name: 'capabilityProviderConnectionAgents:reconnect' })
    expect(command.commandId).toBe(command.operationKey)
    expect(command.correlationId).toBe(command.operationKey)
    expect(command).not.toHaveProperty('idempotencyKey')
  })

  it('fails closed when a connection detail source attempts to return a credential reference', async () => {
    mocks.callPublicSourceMutation.mockResolvedValue({
      kind: 'found',
      connection: {
        connectionRef: 'connection:x402:one',
        credentialRef: 'secret:must-not-cross-boundary',
      },
    })
    const service = createSupplyManagementService(new Request('https://agent.example/api/v1/supply/connections/detail'), '{}')

    await expect(service.connectionDetail({
      input: { connectionRef: 'connection:x402:one' },
      principal,
      correlationId: 'transport:connection-detail',
    })).resolves.toEqual({ kind: 'error', code: 'source_unavailable' })
  })
})
