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

import {
  createSupplyManagementService,
  type SupplyPublishInput,
  type SupplyWithdrawInput,
} from '@/modules/capability-supply/supply-actions'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'

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
    pricingConfig: { version: 'pricing:v2' },
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
      case 'capabilitySupplyOwnerFunnel:readAgentOwnerSourceDraft':
        return { kind: 'not_found' }
      case 'capabilitySupplyOwnerFunnel:saveOwnerSourceDraft':
        return { kind: 'saved', revision: 1, sourceDigest: 'sha256:' + 'c'.repeat(64), preflightStatus: 'pending' }
      case 'capabilitySupplyOwnerFunnel:recordOwnerSourceDraftPreflight':
        return true
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

  it('stores the catalog-origin source with top-level sourceRevision and evidenceRefs', async () => {
    setHappyPublishResponses()
    const service = createSupplyManagementService(new Request('https://agent.example/api'), '{}')
    await service.publish({ input: publishInput, principal, correlationId: 'transport:source-shape' })

    const saveCall = mocks.callPublicSourceMutation.mock.calls.find(
      ([mutation]) => mutation.name === 'capabilitySupplyOwnerFunnel:saveOwnerSourceDraft',
    )
    expect(saveCall).toBeDefined()
    const storedSource = JSON.parse(saveCall?.[1].sourceJson as string) as Record<string, unknown>
    expect(storedSource).toMatchObject({
      sourceRevision: 'owner-api/2026-08-09',
      evidenceRefs: ['evidence:owner-api'],
      catalogOrigin: 'owner-catalog',
    })
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

  it('stops on reservation conflict before draft or preflight effects for changed material', async () => {
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
      if (mutation.name === 'capabilitySupplyOwnerFunnel:readAgentOwnerSourceDraft') return { kind: 'not_found' }
      if (mutation.name === 'capabilitySupplyOwnerFunnel:saveOwnerSourceDraft') return { kind: 'saved', revision: 1, sourceDigest: 'sha256:' + 'c'.repeat(64), preflightStatus: 'pending' }
      if (mutation.name === 'capabilitySupplyOwnerFunnel:recordOwnerSourceDraftPreflight') return true
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
})
