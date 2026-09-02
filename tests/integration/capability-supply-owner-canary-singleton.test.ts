import { validatePaymentRequired } from '@x402/core/schemas'
import type { WorkId } from '@convex-dev/workpool'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import { toRow as providerConnectionRow } from '../../convex/lib/providerConnections/codecs'
import {
  createX402ProviderConnection,
} from '@/modules/capability-supply/provider-connection'
import {
  BASE_SEPOLIA_NETWORK,
  BASE_SEPOLIA_USDC_ADDRESS,
  createSellerOnboardingCanaryCommitment,
  sellerOnboardingCanaryExecutionEnvelope,
  x402SellerClaimDigest,
} from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import { withSourceWrite } from '../helpers/source-write-admission'
import { convexTestWithWorkers } from '../helpers/convex-fixtures'
import {
  createPublishedBusinessOwner,
  prepareOwnerPublicationCommand,
  seedCatalogOffering,
  x402Source,
} from './capability-supply-owner-funnel-harness'

const ENDPOINT = 'https://provider.example/paid-lookup'
const PAYEE = '0xbA667287B8Ef89565F8fD7AcD4d22Ce98E0f39cd'

afterEach(() => vi.unstubAllEnvs())

function sandboxSource(
  offeringRef: string,
  offeringSourceHash: string,
  accessPathRef: string,
  connectionRef: string,
  providerRef: string,
) {
  const base = x402Source()
  if (!isRecord(base.resource)) throw new Error('canary_singleton_source_invalid')
  const price = { currency: 'USD', units: '1', exponent: 2 }
  return {
    ...base,
    resource: {
      ...base.resource,
      price,
      network: BASE_SEPOLIA_NETWORK,
      asset: BASE_SEPOLIA_USDC_ADDRESS,
      payTo: PAYEE,
      paymentRequired: validatePaymentRequired({
        x402Version: 2,
        resource: { url: ENDPOINT },
        accepts: [{
          scheme: 'exact',
          network: BASE_SEPOLIA_NETWORK,
          amount: '10000',
          asset: BASE_SEPOLIA_USDC_ADDRESS,
          payTo: PAYEE,
          maxTimeoutSeconds: 60,
          extra: {
            name: 'USD Coin',
            version: '2',
            assetTransferMethod: 'eip3009',
          },
        }],
      }),
    },
    commercial: {
      ...base.commercial,
      offering: {
        ...base.commercial.offering,
        origin: {
          kind: 'catalog_offering' as const,
          offeringRef,
          offeringRevision: 1,
          offeringSourceHash,
          declaredAccessPathRef: accessPathRef,
          accessPathSourceHash: canonicalDigest(`access-path-source:${offeringRef}:v1`),
        },
        presentation: {
          ...base.commercial.offering.presentation,
          price: { kind: 'fixed' as const, amount: price },
        },
      },
      authority: {
        kind: 'provider_connection' as const,
        connectionRef,
        providerRef,
      },
    },
  }
}

async function canaryFixture(suffix: string) {
  const backend = convexTestWithWorkers({ pauseWorkpool: true })
  const identity = await createPublishedBusinessOwner(backend, `canary-singleton-${suffix}`)
  const { businessId, owner, canonicalPrincipalRef, canonicalAccountRef } = identity
  const offeringRef = `catalog-offering:canary-singleton-${suffix}`
  const offeringSourceHash = canonicalDigest(`catalog-source:canary-singleton-${suffix}:v1`)
  const accessPathRef = `access-path:canary-singleton-${suffix}`
  const accessPathSourceHash = canonicalDigest(`access-path-source:${offeringRef}:v1`)
  const connectionRef = `connection:x402:canary-singleton-${suffix}`
  const providerRef = `provider:x402:canary-singleton-${suffix}`
  await backend.run(async (ctx) => {
    await ctx.db.patch(businessId, { publicStatus: 'unpublished', updatedAt: Date.now() })
  })
  await seedCatalogOffering(backend, businessId, offeringRef, 1, 1, offeringSourceHash)
  await backend.run(async (ctx) => {
    await ctx.db.insert('offeringAccessPaths', {
      accessPathRef,
      businessId,
      offeringRef,
      offeringRevision: 1,
      offeringSourceHash,
      status: 'published',
      descriptor: {
        kind: 'external_operation',
        name: 'Paid lookup',
        summary: 'Returns one paid lookup result.',
        url: ENDPOINT,
        method: 'POST',
        provenance: 'business_declared',
      },
      sourceHash: accessPathSourceHash,
      createdAt: 1,
      updatedAt: 1,
    })
  })

  const now = Date.now()
  const sellerClaim = {
    businessId: String(businessId),
    endpointUrl: ENDPOINT,
    method: 'POST' as const,
    observationDigest: canonicalDigest({
      kind: 'official-x402-v2-unpaid-inspection',
      endpoint: ENDPOINT,
      network: BASE_SEPOLIA_NETWORK,
      payTo: PAYEE,
    }),
    payTo: PAYEE,
    expiresAt: now + 5 * 60_000,
  }
  const claimEvidence = `x402-payee-claim:${x402SellerClaimDigest(sellerClaim)}`
  const inspectionEvidence = `x402-endpoint-inspection:${sellerClaim.observationDigest}`
  const connection = createX402ProviderConnection({
    commandId: `connect-canary-singleton-${suffix}`,
    connectionRef,
    businessId: String(businessId),
    providerRef,
    providerAccountRef: `x402:${ENDPOINT}`,
    resourceUrl: ENDPOINT,
    method: sellerClaim.method,
    payee: sellerClaim.payTo,
    evidenceRefs: [claimEvidence, inspectionEvidence],
    owningAccountRef: canonicalAccountRef,
    installedByPrincipalRef: canonicalPrincipalRef,
    authorityGrantRef: `grant:canary-singleton-${suffix}`,
    authorityGrantGeneration: 1,
  }, now)
  if (connection.kind !== 'applied') throw new Error('canary_singleton_connection_failed')
  await backend.run(async (ctx) => {
    await ctx.db.insert('capabilityProviderConnections', providerConnectionRow(
      connection.connection,
      connection.connection.lastCommandId ?? '',
      connection.commandDigest,
    ))
  })

  const source = sandboxSource(
    offeringRef,
    offeringSourceHash,
    accessPathRef,
    connectionRef,
    providerRef,
  )
  const prepared = await prepareOwnerPublicationCommand(
    backend,
    businessId,
    offeringRef,
    1,
    offeringSourceHash,
    source,
    `owner-supply:stage:canary-singleton-${suffix}`,
    source.commercial.offering.origin,
  )
  if (prepared.kind === 'refused') throw new Error('canary_singleton_prepare_failed')
  const {
    runtimeEnvironment: _runtimeEnvironment,
    proof: _proof,
    sourceWrite: _sourceWrite,
    sourceWriteRequest: _sourceWriteRequest,
    ...unsignedCommand
  } = prepared.command
  const staged = await owner.mutation(
    api.capabilitySupply.stageOwnerX402Capability,
    await withSourceWrite('catalog_publish', {
      ...unsignedCommand,
      sellerClaim,
      evidenceRefs: [claimEvidence, inspectionEvidence],
    }),
  )
  if (staged.kind === 'refused') throw new Error(`canary_singleton_stage_failed:${staged.reason}`)
  await backend.run(async (ctx) => {
    const publication = await ctx.db.query('capabilityPublications')
      .withIndex('by_publicationRef_and_revision', (query) => query
        .eq('publicationRef', staged.publicationRef)
        .eq('revision', staged.publicationRevision))
      .unique()
    if (publication === null) throw new Error('canary_singleton_publication_missing')
    const observedAt = Date.now()
    await ctx.db.patch(publication._id, {
      credentialState: 'ready',
      healthState: 'healthy',
      readinessTargetDigest: canonicalDigest({ endpoint: ENDPOINT, method: 'POST' }),
      readinessRequestDigest: canonicalDigest({ input: { request: 'hello' } }),
      readinessResponseStatus: 402,
      readinessResponseContentType: 'application/json',
      readinessResponseDigest: sellerClaim.observationDigest,
      readinessOutcome: 'healthy',
      readinessObservedAt: observedAt,
      readinessValidUntil: observedAt + 5 * 60_000,
      readinessEvidenceRefs: [inspectionEvidence],
      updatedAt: observedAt,
    })
  })
  const snapshot = await backend.query(
    internal.capabilitySupplyCurrentOperation.readExactSellerCanaryOperationSnapshot,
    { publicationRef: staged.publicationRef, revision: staged.publicationRevision },
  )
  if (snapshot === null) throw new Error('canary_singleton_snapshot_missing')
  const funding = await backend.mutation(
    internal.capabilitySupplyCanaryFunding.provisionSellerOnboardingCanaryFunding,
    { now },
  )
  if (funding.kind !== 'ensured') throw new Error('canary_singleton_funding_failed')

  const request = async (
    operationKey: string,
    input: Record<string, string> | undefined = { request: 'hello' },
  ) => owner.mutation(
    internal.capabilitySupplyOwnerCanary.requestSellerOnboardingCanary,
    await withSourceWrite('catalog_publish', {
      businessId,
      offeringRef,
      offeringRevision: 1,
      offeringSourceHash,
      publicationRef: staged.publicationRef,
      publicationRevision: staged.publicationRevision,
      ...(input === undefined ? {} : { input }),
      operationKey,
      correlationId: `correlation:${operationKey}`,
    }),
  )
  return {
    backend,
    owner,
    request,
    statusTarget: {
      businessId,
      offeringRef,
      offeringRevision: 1,
      offeringSourceHash,
      publicationRef: staged.publicationRef,
      publicationRevision: staged.publicationRevision,
    },
  }
}

async function invocationRows(
  backend: ReturnType<typeof convexTestWithWorkers>,
) {
  return await backend.run(async (ctx) => (
    await ctx.db.query('capabilityOperationInvocations').collect()
  ))
}

async function projectPreClaimRefusal(
  backend: ReturnType<typeof convexTestWithWorkers>,
  code: 'grant_not_found' | 'grant_generation_stale' | 'grant_revoked' | 'operation_not_current' | 'provider_refused',
) {
  return await backend.run(async (ctx) => {
    const row = await ctx.db.query('capabilityOperationInvocations').unique()
    if (row === null || row.workId === undefined) {
      throw new Error('canary_preclaim_refusal_invocation_missing')
    }
    await ctx.db.patch(row._id, {
      state: 'refused',
      dispatchState: 'failed',
      result: {
        kind: 'refused',
        operationRef: row.operationRef,
        code,
        retryable: false,
        nextAction: code === 'operation_not_current'
          ? 'The operation publication changed; retry discovery.'
          : code === 'provider_refused'
            ? 'Provider approval is not current.'
            : 'Refresh the agent grant and retry.',
      },
      updatedAt: Date.now(),
    })
    return row
  })
}

async function projectSafeBeforeReleaseRefusal(
  backend: ReturnType<typeof convexTestWithWorkers>,
) {
  return await backend.run(async (ctx) => {
    const row = await ctx.db.query('capabilityOperationInvocations').unique()
    if (row === null || row.workId === undefined || row.authority === undefined || row.operationJson === undefined) {
      throw new Error('canary_safe_before_release_invocation_missing')
    }
    const operation = JSON.parse(row.operationJson) as {
      operationId: string
      contract: { version: string }
    }
    const attemptRef = `operation-attempt:${row.invocationRef}:1`
    const actor = { callerRef: row.credentialId, principalRef: row.principalId }
    const origin = { kind: 'standalone' as const, ...actor }
    const recordedAt = new Date().toISOString()
    const authorityBinding = {
      reference: row.authority.reference,
      invocationRef: row.invocationRef,
      actor,
      origin,
      invocationVersion: 2,
      actionId: operation.operationId,
      contractVersion: String(operation.contract.version),
      digest: row.authority.decisionDigest,
      targetDigest: row.authority.targetDigest,
      consequence: row.authority.consequence,
      limits: row.authority.limits,
      expiresAt: row.authority.expiresAt,
      acceptedBasis: row.authority.acceptedBasis,
    }
    await ctx.db.insert('actionInvocationControls', {
      invocationRef: row.invocationRef,
      invocationVersion: 2,
      sourceRef: `operation-invocation-source:${row.invocationRef}`,
      preparedMaterialDigest: row.inputDigest,
      preparedTargetDigest: row.authority.targetDigest,
      consequence: row.authority.consequence,
      dataLimitSummary: row.authority.limits,
      authorityBinding,
      authorityDecisionAt: recordedAt,
      currentAttemptRef: attemptRef,
      currentEffectGeneration: 1,
      currentLeaseOwner: `operation-worker:${row.invocationRef}`,
      currentLeaseExpiresAt: row.authority.expiresAt,
      updatedAt: recordedAt,
      control: {
        invocationRef: row.invocationRef,
        invocationVersion: 2,
        origin,
        owner: actor,
        action: { id: operation.operationId, contractVersion: String(operation.contract.version) },
        desired: { state: 'invoke' },
        authority: { reference: row.authority.reference, expiresAt: row.authority.expiresAt },
        acceptedAuthority: row.authority.acceptedBasis,
        freshness: { state: 'current', observedAt: recordedAt },
        control: { state: 'retryable', reason: 'pre_release_failure' },
      },
    })
    await ctx.db.insert('actionInvocationAttempts', {
      invocationRef: row.invocationRef,
      attemptRef,
      attemptNumber: 1,
      effectGeneration: 1,
      actor,
      idempotency: {
        operationKey: row.operationRef,
        materialInputDigest: row.inputDigest,
        effectIdentity: canonicalDigest({ invocationRef: row.invocationRef, effectGeneration: 1 }),
      },
      lease: { owner: `operation-worker:${row.invocationRef}`, expiresAt: row.authority.expiresAt },
      release: { state: 'not_released' },
      outcome: { state: 'failed', retry: 'safe_before_release' },
      recordedAt,
    })
    await ctx.db.patch(row._id, {
      state: 'refused',
      dispatchState: 'failed',
      attemptRef,
      result: {
        kind: 'refused',
        operationRef: row.operationRef,
        code: 'pre_release_failed',
        retryable: false,
        nextAction: 'Route call signing is unavailable.',
      },
      updatedAt: Date.now(),
    })
    return { ...row, attemptRef }
  })
}

async function projectManagedUnsignedRefundAfterReconciledAttempt(
  backend: ReturnType<typeof convexTestWithWorkers>,
) {
  const projected = await projectSafeBeforeReleaseRefusal(backend)
  return await backend.run(async (ctx) => {
    const row = await ctx.db.get(projected._id)
    const control = await ctx.db.query('actionInvocationControls').unique()
    const attemptOne = await ctx.db.query('actionInvocationAttempts').unique()
    if (
      row === null
      || control === null
      || attemptOne === null
      || row.sellerOnboardingCanary === undefined
    ) throw new Error('managed_unsigned_refund_fixture_missing')
    const canary = row.sellerOnboardingCanary
    const operation = JSON.parse(row.operationJson ?? '') as {
      binding: { authority: { providerRef: string } }
    }
    const actor = { callerRef: row.credentialId, principalRef: row.principalId }
    const attemptTwoRef = `operation-attempt:${row.invocationRef}:2`
    const attemptThreeRef = `operation-attempt:${row.invocationRef}:3`
    const paymentTwo = 'payment:managed-unsigned-refund:2'
    const paymentThree = 'payment:managed-unsigned-refund:3'
    const reservationTwo = 'reservation:managed-unsigned-refund:2'
    const reservationThree = 'reservation:managed-unsigned-refund:3'
    const reconciliationRef = 'reconciliation:managed-unsigned-refund:2'
    const reconciliationDigest = canonicalDigest(reconciliationRef)
    const paymentResponseDigest = canonicalDigest('payment-response:managed-unsigned-refund:2')
    const evidenceHash = canonicalDigest('managed-unsigned-refund:evidence:3')
    const recordedAt = new Date().toISOString()
    const attemptRow = (
      attemptRef: string,
      attemptNumber: number,
      outcome: typeof attemptOne.outcome,
    ) => ({
      invocationRef: row.invocationRef,
      attemptRef,
      attemptNumber,
      effectGeneration: attemptNumber,
      actor,
      idempotency: {
        operationKey: row.operationRef,
        materialInputDigest: row.inputDigest,
        effectIdentity: attemptOne.idempotency.effectIdentity,
      },
      lease: attemptOne.lease,
      release: { state: 'not_released' as const },
      outcome,
      recordedAt,
    })
    await ctx.db.insert('actionInvocationAttempts', attemptRow(
      attemptTwoRef,
      2,
      {
        state: 'reconciled_not_released',
        retry: 'safe_after_reconciliation',
        observedAt: recordedAt,
      },
    ))
    await ctx.db.insert('actionInvocationAttempts', attemptRow(
      attemptThreeRef,
      3,
      { state: 'failed', retry: 'safe_before_release', errorDigest: evidenceHash },
    ))
    await ctx.db.patch(control._id, {
      invocationVersion: 9,
      currentAttemptRef: attemptThreeRef,
      currentEffectGeneration: 3,
      authorityBinding: control.authorityBinding === undefined
        ? undefined
        : { ...control.authorityBinding, invocationVersion: 9 },
      control: { ...control.control, invocationVersion: 9 },
    })
    const reservationBase = {
      principalId: row.principalId,
      credentialId: row.credentialId,
      grantRef: row.grantRef,
      grantGeneration: row.grantGeneration,
      environment: 'sandbox' as const,
      budgetPolicyRef: canary.funding.budgetRef,
      budgetDayStart: '2026-08-31',
      budgetMonthStart: '2026-08',
      custodyRef: 'custody-budget:managed-unsigned-refund',
      custodyGeneration: 1,
      invocationRef: row.invocationRef,
      operationRef: row.operationRef,
      providerRef: operation.binding.authority.providerRef,
      challengeDigest: canonicalDigest('challenge:managed-unsigned-refund'),
      executionContext: {
        kind: 'seller_onboarding_canary' as const,
        paymentProfile: 'base-sepolia-usdc-exact' as const,
        canaryRef: canary.canaryRef,
        canaryCommitmentDigest: canary.canaryCommitmentDigest,
        fundingBudgetRef: canary.funding.budgetRef,
      },
      currency: 'USD',
      amountUnits: '10000',
      exponent: 6,
      state: 'released' as const,
      finalizationDigest: canonicalDigest('finalization:managed-unsigned-refund'),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      finalizedAt: Date.now(),
    }
    await ctx.db.insert('moneyExternalSpendReservations', {
      ...reservationBase,
      reservationRef: reservationTwo,
      attemptRef: attemptTwoRef,
      effectGeneration: 2,
      paymentIdentifier: paymentTwo,
      idempotencyDigest: canonicalDigest(reservationTwo),
      identityDigest: canonicalDigest(`${reservationTwo}:identity`),
      submissionStatus: 'unknown',
      paymentResponseDigest,
      reconciliationEvidenceRef: reconciliationRef,
      reconciliationEvidenceDigest: reconciliationDigest,
      evidenceRefs: [],
    })
    await ctx.db.insert('moneyExternalSpendReservations', {
      ...reservationBase,
      reservationRef: reservationThree,
      attemptRef: attemptThreeRef,
      effectGeneration: 3,
      paymentIdentifier: paymentThree,
      idempotencyDigest: canonicalDigest(reservationThree),
      identityDigest: canonicalDigest(`${reservationThree}:identity`),
      submissionStatus: 'not_submitted',
      evidenceRefs: [evidenceHash],
    })
    const paymentBase = {
      dispatchRef: row.invocationRef,
      operationRef: row.operationRef,
      inputDigest: row.inputDigest,
      challengeDigest: reservationBase.challengeDigest,
      challengeJson: '{}',
      selectedRequirementJson: '{}',
      providerEndpoint: ENDPOINT,
      credentialRef: 'env:AE_X402_CDP_ACCOUNT_NAME',
      scheme: 'exact',
      network: BASE_SEPOLIA_NETWORK,
      asset: BASE_SEPOLIA_USDC_ADDRESS,
      payTo: PAYEE,
      amountUnits: '10000',
      currency: 'USD',
      exponent: 6,
      custodyRef: 'custody:managed-unsigned-refund',
      custodyBudgetRef: reservationBase.custodyRef,
      custodyGeneration: 1,
      authorizationDigest: canonicalDigest('authorization:managed-unsigned-refund'),
      state: 'observed' as const,
      preparedAt: Date.now(),
      observedAt: Date.now(),
      settlementStatus: 'not_settled' as const,
      evidenceRefs: [],
    }
    await ctx.db.insert('moneyX402PaymentAttempts', {
      ...paymentBase,
      attemptRef: attemptTwoRef,
      effectGeneration: 2,
      paymentIdentifier: paymentTwo,
      operationKeyDigest: paymentTwo,
      reservationRef: reservationTwo,
      paymentResponseDigest,
      reconciliationEvidenceRef: reconciliationRef,
      reconciliationEvidenceDigest: reconciliationDigest,
    })
    await ctx.db.insert('moneyX402PaymentAttempts', {
      ...paymentBase,
      attemptRef: attemptThreeRef,
      effectGeneration: 3,
      paymentIdentifier: paymentThree,
      operationKeyDigest: paymentThree,
      reservationRef: reservationThree,
      transportObservationDigest: evidenceHash,
      authorizationFailureCode: 'provider_authority_invalid',
      authorizationFailureDetail: 'stale_generation',
      authorizationFailureObservedAt: Date.now(),
    })
    const historyBase = {
      invocationRef: row.invocationRef,
      commandResult: 'applied' as const,
      current: true,
      effectGeneration: 3,
      actorRef: row.credentialId,
      recordedAt,
    }
    await ctx.db.insert('actionInvocationHistory', {
      ...historyBase,
      commandId: 'managed-unsigned-refund:claim',
      commandDigest: canonicalDigest('managed-unsigned-refund:claim'),
      invocationVersion: 7,
      kind: 'claim_before_effect',
    })
    await ctx.db.insert('actionInvocationHistory', {
      ...historyBase,
      commandId: 'managed-unsigned-refund:fence',
      commandDigest: canonicalDigest('managed-unsigned-refund:fence'),
      invocationVersion: 8,
      kind: 'release_fence_before_network',
      attemptTransition: {
        attemptRef: attemptThreeRef,
        effectGeneration: 3,
        priorReleaseState: 'not_released',
        nextReleaseState: 'possibly_released',
        priorOutcomeState: 'running',
        nextOutcomeState: 'running',
        priorDigest: canonicalDigest('managed-unsigned-refund:fence:prior'),
        nextDigest: canonicalDigest('managed-unsigned-refund:fence:next'),
      },
    })
    await ctx.db.insert('actionInvocationHistory', {
      ...historyBase,
      commandId: 'managed-unsigned-refund:terminal',
      commandDigest: canonicalDigest('managed-unsigned-refund:terminal'),
      invocationVersion: 9,
      kind: 'terminal_failed',
      attemptTransition: {
        attemptRef: attemptThreeRef,
        effectGeneration: 3,
        priorReleaseState: 'possibly_released',
        nextReleaseState: 'not_released',
        priorOutcomeState: 'running',
        nextOutcomeState: 'failed',
        priorDigest: canonicalDigest('managed-unsigned-refund:terminal:prior'),
        nextDigest: canonicalDigest('managed-unsigned-refund:terminal:next'),
      },
    })
    const zero = { currency: 'USD', units: '0', exponent: 6 }
    await ctx.db.patch(row._id, {
      attemptRef: attemptThreeRef,
      evidenceHash,
      result: {
        kind: 'refused',
        operationRef: row.operationRef,
        code: 'payment_signature_unavailable',
        retryable: false,
        receipt: {
          commercialModel: 'seller_canary_x402',
          receiptRef: `seller-canary-receipt:${canary.canaryRef}:${attemptThreeRef}`,
          state: 'refunded',
          network: BASE_SEPOLIA_NETWORK,
          asset: BASE_SEPOLIA_USDC_ADDRESS,
          providerQuotedAmount: canary.funding.requestedSpend,
          agenticEconomyFee: zero,
          totalBuyerAuthorization: zero,
          priceDigest: canary.priceDigest,
          paymentIdentifier: paymentThree,
          externalSettlementRef: reservationThree,
          refundState: 'released',
          lossState: 'none',
          evidenceHash,
          issuedAt: recordedAt,
        },
      },
      updatedAt: Date.now(),
    })
    return { row, attemptThreeRef, evidenceHash }
  })
}

describe('owner seller canary singleton admission', () => {
  it('seals a dispatch that the shared exact worker grant reader accepts field-for-field', async () => {
    const { backend, request } = await canaryFixture('grant-reader-parity')
    const admitted = await request('canary:grant-reader-parity')
    if (admitted.kind === 'refused') throw new Error(`canary_grant_reader_parity_refused:${admitted.code}`)
    const dispatch = await backend.run(async (ctx) => await ctx.db.query('capabilityOperationInvocations')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', admitted.invocationRef))
      .unique())
    if (dispatch?.sellerOnboardingCanary === undefined) {
      throw new Error('canary_grant_reader_parity_dispatch_missing')
    }

    const exactWorkerRead = {
      sellerOwnerId: dispatch.sellerOnboardingCanary.ownerId,
      expected: {
        kind: 'persisted_dispatch' as const,
        grantRef: dispatch.grantRef,
        principalId: dispatch.principalId,
        ownerId: dispatch.ownerId,
        credentialId: dispatch.credentialId,
        applicationRef: dispatch.applicationRef,
        environment: 'sandbox' as const,
        generation: dispatch.grantGeneration,
        policyDigest: dispatch.policyDigest,
        expiresAt: dispatch.grantExpiresAt,
      },
      now: Date.now(),
    }
    await expect(backend.query(
      internal.capabilitySupplyCanaryFunding.readExactSellerOnboardingCanaryPlatformGrant,
      exactWorkerRead,
    )).resolves.toMatchObject({
      grantRef: dispatch.grantRef,
      principalId: dispatch.principalId,
      ownerId: dispatch.ownerId,
      credentialId: dispatch.credentialId,
      applicationRef: dispatch.applicationRef,
      generation: dispatch.grantGeneration,
      policyDigest: dispatch.policyDigest,
      expiresAt: dispatch.grantExpiresAt,
    })
    await expect(backend.mutation(
      internal.capabilityOperationInvocations.reconcileInvocationWorkloadAuthority,
      { invocationRef: admitted.invocationRef },
    )).resolves.toEqual({
      kind: 'authorized',
      authority: {
        principalId: dispatch.principalId,
        accountRef: dispatch.ownerId,
        credentialId: dispatch.credentialId,
        grantRef: dispatch.grantRef,
        grantGeneration: dispatch.grantGeneration,
        policyDigest: dispatch.policyDigest,
        expiresAt: dispatch.grantExpiresAt,
      },
    })
    await expect(backend.query(
      internal.capabilitySupplyCanaryFunding.readExactSellerOnboardingCanaryPlatformGrant,
      {
        ...exactWorkerRead,
        expected: {
          ...exactWorkerRead.expected,
          policyDigest: canonicalDigest('stale-dispatch-policy'),
        },
      },
    )).resolves.toBeNull()
  })

  it('refuses a seller-canary workload before preparation when sealed grant fields drift', async () => {
    const { backend, request } = await canaryFixture('grant-reader-drift')
    const admitted = await request('canary:grant-reader-drift')
    if (admitted.kind === 'refused') throw new Error(`canary_grant_reader_drift_refused:${admitted.code}`)
    await backend.run(async (ctx) => {
      const row = await ctx.db.query('capabilityOperationInvocations')
        .withIndex('by_invocationRef', (query) => query.eq('invocationRef', admitted.invocationRef))
        .unique()
      if (row === null) throw new Error('canary_grant_reader_drift_dispatch_missing')
      await ctx.db.patch(row._id, { policyDigest: canonicalDigest('stale-dispatch-policy') })
    })

    await expect(backend.mutation(
      internal.capabilityOperationInvocations.reconcileInvocationWorkloadAuthority,
      { invocationRef: admitted.invocationRef },
    )).resolves.toEqual({ kind: 'refused' })
    await expect(backend.run(async (ctx) => await ctx.db.query('capabilityOperationInvocations')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', admitted.invocationRef))
      .unique())).resolves.toMatchObject({
      state: 'refused',
      dispatchState: 'failed',
      result: { kind: 'refused', code: 'grant_not_found' },
    })
  })

  it('retains the exact active canary reference for owner refreshes without exposing funding material', async () => {
    const { owner, request, statusTarget } = await canaryFixture('owner-readback')
    const admitted = await request('canary:owner-readback')
    if (admitted.kind === 'refused') throw new Error(`canary_owner_readback_refused:${admitted.code}`)

    const status = await owner.query(
      api.capabilitySupplyOwnerCanary.readOwnerSellerOnboardingCanaryStatus,
      statusTarget,
    )

    expect(status).toMatchObject({
      kind: 'available',
      canaryRef: admitted.canaryRef,
      invocationRef: admitted.invocationRef,
      operationRef: admitted.operationRef,
      offeringRef: statusTarget.offeringRef,
      offeringRevision: statusTarget.offeringRevision,
      publicationRef: statusTarget.publicationRef,
      publicationRevision: statusTarget.publicationRevision,
      state: 'pending',
      promotion: { state: 'not_promoted' },
    })
    expect(JSON.stringify(status)).not.toMatch(/funding|credential|authorization|signature|secret/i)
  })

  it('replays sequential different-key retries in every persisted invocation state', async () => {
    const { backend, request } = await canaryFixture('sequential')
    const first = await request('canary:sequential:first-random-key')
    const retry = await request('canary:sequential:second-random-key')

    expect(first).toMatchObject({ kind: 'enqueued' })
    expect(retry).toEqual({ ...first, kind: 'replayed' })
    const rows = await invocationRows(backend)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      invocationRef: first.kind === 'refused' ? undefined : first.invocationRef,
      workId: expect.any(String),
      dispatchState: 'enqueued',
    })

    const originalWorkId = rows[0]?.workId
    for (const state of [
      'pending',
      'completed',
      'reconciliation_required',
      'refused',
      'cancelled',
    ] as const) {
      await backend.run(async (ctx) => {
        const row = await ctx.db.query('capabilityOperationInvocations')
          .withIndex('by_sellerOnboardingCanary_canaryRef', (query) => query.eq(
            'sellerOnboardingCanary.canaryRef',
            first.kind === 'refused' ? '' : first.canaryRef,
          ))
          .unique()
        if (row === null) throw new Error('canary_singleton_invocation_missing')
        await ctx.db.patch(row._id, { state })
      })
      await expect(request(`canary:sequential:${state}:different-key`)).resolves.toEqual({
        ...first,
        kind: 'replayed',
      })
      const currentRows = await invocationRows(backend)
      expect(currentRows).toHaveLength(1)
      expect(currentRows[0]?.workId).toBe(originalWorkId)
    }

    await backend.run(async (ctx) => {
      const row = await ctx.db.query('capabilityOperationInvocations')
        .withIndex('by_sellerOnboardingCanary_canaryRef', (query) => query.eq(
          'sellerOnboardingCanary.canaryRef',
          first.kind === 'refused' ? '' : first.canaryRef,
        ))
        .unique()
      if (row?.sellerOnboardingCanary === undefined) {
        throw new Error('canary_singleton_envelope_missing')
      }
      await ctx.db.patch(row._id, {
        sellerOnboardingCanary: {
          ...row.sellerOnboardingCanary,
          sellerPayTo: `0x${'2'.repeat(40)}`,
        },
      })
    })
    await expect(request('canary:sequential:drifted-persisted-identity')).resolves.toEqual({
      kind: 'refused',
      code: 'canary_identity_conflict',
    })
    expect(await invocationRows(backend)).toHaveLength(1)
  })

  it('uses the admitted contract example as canonical input and rejects a caller-selected variant', async () => {
    const { backend, request } = await canaryFixture('canonical-input')
    await expect(request('canary:canonical-input:wrong', { request: 'charge something else' }))
      .resolves.toEqual({ kind: 'refused', code: 'input_invalid' })
    await expect(request('canary:canonical-input:server-owned', undefined))
      .resolves.toMatchObject({ kind: 'enqueued' })

    const rows = await invocationRows(backend)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.inputJson).toBe(JSON.stringify({ request: 'hello' }))
  })

  it('replays the retained charge after platform funding and readiness rotate', async () => {
    const { backend, request, statusTarget } = await canaryFixture('funding-rotation')
    const first = await request('canary:funding-rotation:first')
    if (first.kind === 'refused') throw new Error(`canary_funding_rotation_refused:${first.code}`)

    await backend.run(async (ctx) => {
      const grant = await ctx.db.query('agentAccessGrants')
        .withIndex('by_grantRef', (query) => query.eq(
          'grantRef',
          'agent-access-grant:platform:seller-onboarding-canary:sandbox:v1',
      ))
        .unique()
      if (grant === null) throw new Error('canary_funding_rotation_grant_missing')
      const generation = grant.generation + 1
      const policy = {
        ...grant.policy,
        budget: { ...grant.policy.budget, generation },
        rate: { ...grant.policy.rate, generation },
      }
      const policyDigest = canonicalDigest(policy)
      await ctx.db.patch(grant._id, {
        generation,
        policy,
        policyDigest,
      })
      const principal = await ctx.db.query('agentAccessPrincipals')
        .withIndex('by_principalId', (query) => query.eq('principalId', grant.principalId))
        .unique()
      if (principal === null) throw new Error('canary_funding_rotation_principal_missing')
      await ctx.db.patch(principal._id, {
        grantGeneration: generation,
        policyDigest,
      })
      const publication = await ctx.db.query('capabilityPublications')
        .withIndex('by_publicationRef_and_revision', (query) => query
          .eq('publicationRef', statusTarget.publicationRef)
          .eq('revision', statusTarget.publicationRevision))
        .unique()
      if (publication === null) throw new Error('canary_funding_rotation_publication_missing')
      const refreshedAt = Date.now()
      await ctx.db.patch(publication._id, {
        readinessObservedAt: refreshedAt,
        readinessValidUntil: refreshedAt + 5 * 60_000,
        readinessResponseDigest: canonicalDigest({ refreshedAt }),
        updatedAt: refreshedAt,
      })
    })

    await expect(request('canary:funding-rotation:second'))
      .resolves.toEqual({ ...first, kind: 'replayed' })
    expect(await invocationRows(backend)).toHaveLength(1)
  })

  it('serializes concurrent different-key requests into one invocation and one dispatch', async () => {
    const { backend, request } = await canaryFixture('concurrent')
    const results = await Promise.all([
      request('canary:concurrent:first-random-key'),
      request('canary:concurrent:second-random-key'),
    ])

    expect(results.map((result) => result.kind).sort()).toEqual(['enqueued', 'replayed'])
    expect(new Set(results.flatMap((result) => (
      result.kind === 'refused' ? [] : [result.canaryRef, result.invocationRef]
    ))).size).toBe(2)
    const rows = await invocationRows(backend)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ workId: expect.any(String), dispatchState: 'enqueued' })
  })

  it('atomically re-enqueues only an exact recovered workless canary', async () => {
    const { backend, request } = await canaryFixture('recovered-workless')
    const first = await request('canary:recovered-workless:first')
    if (first.kind === 'refused') throw new Error(`canary_recovered_workless_refused:${first.code}`)
    const before = (await invocationRows(backend))[0]
    if (before?.workId === undefined) throw new Error('canary_recovered_workless_initial_work_missing')

    await backend.run(async (ctx) => {
      await ctx.db.patch(before._id, {
        state: 'pending',
        result: undefined,
        workId: undefined,
        attemptRef: undefined,
        dispatchState: undefined,
      })
    })
    const results = await Promise.all([
      request('canary:recovered-workless:retry-one'),
      request('canary:recovered-workless:retry-two'),
    ])
    expect(results.map((result) => result.kind).sort()).toEqual(['enqueued', 'replayed'])

    const rows = await invocationRows(backend)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.workId).toEqual(expect.any(String))
    expect(rows[0]?.workId).not.toBe(before.workId)
    expect(rows[0]?.dispatchState).toBe('enqueued')
  })

  it('refreshes expired authority while re-enqueuing an exact recovered workless canary', async () => {
    const { backend, request } = await canaryFixture('recovered-workless-expired')
    const first = await request('canary:recovered-workless-expired:first')
    if (first.kind === 'refused') throw new Error(`canary_recovered_workless_expired_refused:${first.code}`)
    const before = (await invocationRows(backend))[0]
    if (before?.workId === undefined || before.sellerOnboardingCanary === undefined) {
      throw new Error('canary_recovered_workless_expired_initial_work_missing')
    }
    const priorWorkId = before.workId
    const expiredAt = Date.now() - 1

    await backend.run(async (ctx) => {
      const envelope = before.sellerOnboardingCanary!
      const expiredEnvelope = sellerOnboardingCanaryExecutionEnvelope(
        createSellerOnboardingCanaryCommitment({
          ownerId: envelope.ownerId,
          businessId: envelope.businessId,
          offeringRef: envelope.offeringRef,
          offeringRevision: envelope.offeringRevision,
          offeringSourceHash: envelope.offeringSourceHash,
          accessPathRef: envelope.accessPathRef,
          accessPathSourceHash: envelope.accessPathSourceHash,
          publicationRef: envelope.publicationRef,
          publicationRevision: envelope.publicationRevision,
          draftOperationRef: envelope.operationRef,
          operationMaterialDigest: envelope.operationMaterialDigest,
          contractDigest: envelope.contractDigest,
          bindingDigest: envelope.bindingDigest,
          priceDigest: envelope.priceDigest,
          sellerPayTo: envelope.sellerPayTo,
          sellerClaimDigest: envelope.sellerClaimDigest,
          readinessDigest: envelope.readinessDigest,
          readinessObservedAt: envelope.readinessObservedAt,
          readinessValidUntil: envelope.readinessValidUntil,
          expectedOutputSchemaDigest: envelope.expectedOutputSchemaDigest,
          expectedOutputEvidenceDigest: envelope.expectedOutputEvidenceDigest,
          inputDigest: envelope.inputDigest,
          idempotencyKey: envelope.idempotencyKey,
          fundingBudgetRef: envelope.funding.budgetRef,
          fundingPrincipalId: envelope.funding.principalId,
          fundingOwnerId: envelope.funding.ownerId,
          fundingCredentialId: envelope.funding.credentialId,
          fundingApplicationRef: envelope.funding.applicationRef,
          fundingGrantRef: envelope.funding.grantRef,
          fundingGrantGeneration: envelope.funding.grantGeneration,
          fundingPolicyDigest: envelope.funding.policyDigest,
          requestedSpend: envelope.funding.requestedSpend,
          maximumSpend: envelope.funding.maximumSpend,
          expiresAt: expiredAt,
          now: 0,
        }),
      )
      await ctx.db.patch(before._id, {
        sellerOnboardingCanary: expiredEnvelope,
        state: 'pending',
        result: undefined,
        workId: undefined,
        attemptRef: undefined,
        dispatchState: undefined,
      })
    })

    await expect(request('canary:recovered-workless-expired:retry'))
      .resolves.toMatchObject({ kind: 'enqueued', invocationRef: first.invocationRef })
    const after = (await invocationRows(backend))[0]
    expect(after).toMatchObject({ workId: expect.any(String), dispatchState: 'enqueued' })
    expect(after?.workId).not.toBe(priorWorkId)
    expect(after?.sellerOnboardingCanary?.expiresAt).toBeGreaterThan(expiredAt)
    expect(after?.authority?.expiresAt).toBe(
      new Date(after?.sellerOnboardingCanary?.expiresAt ?? 0).toISOString(),
    )
  })

  it.each(['grant_not_found', 'grant_generation_stale', 'operation_not_current', 'provider_refused'] as const)(
    're-arms the same known-unpaid canary after a pre-claim %s refusal',
    async (code) => {
      const { backend, owner, request, statusTarget } = await canaryFixture(`known-unpaid-${code}`)
      const first = await request(`canary:known-unpaid-${code}:first`)
      if (first.kind === 'refused') throw new Error(`canary_known_unpaid_initial_refused:${first.code}`)
      const before = await projectPreClaimRefusal(backend, code)
      if (code === 'grant_generation_stale') {
        await backend.run(async (ctx) => {
          const grant = await ctx.db.query('agentAccessGrants')
            .withIndex('by_grantRef', (query) => query.eq('grantRef', before.grantRef))
            .unique()
          if (grant === null) throw new Error('canary_rearm_grant_missing')
          const generation = grant.generation + 1
          const policy = {
            ...grant.policy,
            budget: { ...grant.policy.budget, generation },
            rate: { ...grant.policy.rate, generation },
          }
          const policyDigest = canonicalDigest(policy)
          await ctx.db.patch(grant._id, {
            generation,
            policy,
            policyDigest,
          })
          const principal = await ctx.db.query('agentAccessPrincipals')
            .withIndex('by_principalId', (query) => query.eq('principalId', grant.principalId))
            .unique()
          if (principal === null) throw new Error('canary_rearm_principal_missing')
          await ctx.db.patch(principal._id, {
            grantGeneration: generation,
            policyDigest,
          })
        })
      }
      await expect(owner.query(
        api.capabilitySupplyOwnerCanary.readOwnerSellerOnboardingCanaryStatus,
        statusTarget,
      )).resolves.toMatchObject({
        kind: 'available',
        state: 'refused',
        refusal: { code, retryable: true },
      })

      const retried = await request(`canary:known-unpaid-${code}:retry-key-is-ignored`)

      expect(retried).toEqual({ ...first, kind: 'enqueued' })
      const row = (await invocationRows(backend))[0]
      expect(row).toMatchObject({
        invocationRef: first.invocationRef,
        state: 'pending',
        dispatchState: 'enqueued',
        result: {
          kind: 'pending',
          invocationRef: first.invocationRef,
          operationRef: first.operationRef,
        },
      })
      expect(row?.sellerOnboardingCanary?.canaryRef).toBe(first.canaryRef)
      expect(row?.sellerOnboardingCanary?.invocationRef).toBe(first.invocationRef)
      expect(row?.idempotencyKey).toBe(before.idempotencyKey)
      expect(row?.workId).toEqual(expect.any(String))
      expect(row?.workId).not.toBe(before.workId)
      expect(row?.grantGeneration).toBe(code === 'grant_generation_stale'
        ? before.grantGeneration + 1
        : before.grantGeneration)
      expect(row?.sellerOnboardingCanary?.funding.grantGeneration).toBe(row?.grantGeneration)

      const audits = await backend.run(async (ctx) => (
        await ctx.db.query('sellerOnboardingCanaryRearmAudits')
          .withIndex('by_invocationRef', (query) => query.eq('invocationRef', first.invocationRef))
          .collect()
      ))
      expect(audits).toHaveLength(1)
      expect(audits[0]).toMatchObject({
        canaryRef: first.canaryRef,
        invocationRef: first.invocationRef,
        priorWorkId: before.workId,
        rearmedWorkId: row?.workId,
        refusalCode: code,
        refusalProvenance: {
          phase: 'pre_claim',
          source: code === 'provider_refused'
            ? 'legacy_exact_provider_approval'
            : 'known_preclaim_code',
        },
      })
    },
  )

  it('serializes concurrent known-unpaid rearm requests into one new work generation', async () => {
    const { backend, request } = await canaryFixture('known-unpaid-concurrent')
    const first = await request('canary:known-unpaid-concurrent:first')
    if (first.kind === 'refused') throw new Error(`canary_known_unpaid_concurrent_refused:${first.code}`)
    const before = await projectPreClaimRefusal(backend, 'grant_not_found')

    const results = await Promise.all([
      request('canary:known-unpaid-concurrent:retry-one'),
      request('canary:known-unpaid-concurrent:retry-two'),
    ])

    expect(results.map((result) => result.kind).sort()).toEqual(['enqueued', 'replayed'])
    const rows = await invocationRows(backend)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.workId).not.toBe(before.workId)
    const audits = await backend.run(async (ctx) => (
      await ctx.db.query('sellerOnboardingCanaryRearmAudits').collect()
    ))
    expect(audits).toHaveLength(1)
  })

  it('serializes an exact safe-before-release resume and preserves attempt 1 for the next worker claim', async () => {
    const { backend, owner, request, statusTarget } = await canaryFixture('safe-before-release-concurrent')
    const first = await request('canary:safe-before-release-concurrent:first')
    if (first.kind === 'refused') throw new Error(`canary_safe_before_release_initial_refused:${first.code}`)
    const before = await projectSafeBeforeReleaseRefusal(backend)

    await expect(owner.query(
      api.capabilitySupplyOwnerCanary.readOwnerSellerOnboardingCanaryStatus,
      statusTarget,
    )).resolves.toMatchObject({
      kind: 'available',
      state: 'refused',
      attemptRef: before.attemptRef,
      refusal: {
        code: 'pre_release_failed',
        retryable: true,
        retryKind: 'safe_before_release_resume',
        nextAction: 'Route call signing is unavailable.',
      },
    })

    const results = await Promise.all([
      request('canary:safe-before-release-concurrent:retry-one'),
      request('canary:safe-before-release-concurrent:retry-two'),
    ])

    expect(results.map((result) => result.kind).sort()).toEqual(['enqueued', 'replayed'])
    const row = (await invocationRows(backend))[0]
    expect(row).toMatchObject({
      invocationRef: first.invocationRef,
      state: 'pending',
      dispatchState: 'enqueued',
      attemptRef: before.attemptRef,
      result: { kind: 'pending', invocationRef: first.invocationRef },
    })
    expect(row?.workId).not.toBe(before.workId)
    if (before.workId === undefined) throw new Error('canary_safe_before_release_prior_work_missing')
    await backend.mutation(internal.capabilityOperationInvocations.completeWork, {
      workId: before.workId as WorkId,
      context: { invocationRef: first.invocationRef },
      result: { kind: 'failed', error: 'late prior-generation callback' },
    })
    expect((await invocationRows(backend))[0]).toMatchObject({
      state: 'pending',
      dispatchState: 'enqueued',
      workId: row?.workId,
      attemptRef: before.attemptRef,
    })
    const attempts = await backend.run(async (ctx) => await ctx.db.query('actionInvocationAttempts')
      .withIndex('by_invocationRef_and_attemptNumber', (query) => query.eq('invocationRef', first.invocationRef))
      .collect())
    expect(attempts).toHaveLength(1)
    expect(attempts[0]).toMatchObject({
      attemptNumber: 1,
      effectGeneration: 1,
      release: { state: 'not_released' },
      outcome: { state: 'failed', retry: 'safe_before_release' },
    })
    const audits = await backend.run(async (ctx) => await ctx.db.query('sellerOnboardingCanaryRearmAudits')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', first.invocationRef))
      .collect())
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({
      refusalCode: 'pre_release_failed',
      priorWorkId: before.workId,
      rearmedWorkId: row?.workId,
      refusalProvenance: {
        phase: 'safe_before_release',
        source: 'canonical_retryable_attempt',
        priorAttemptRef: before.attemptRef,
        priorAttemptNumber: 1,
        priorEffectGeneration: 1,
        controlDigest: expect.stringMatching(/^sha256:/),
        attemptDigest: expect.stringMatching(/^sha256:/),
      },
    })
  })

  it('resumes one managed unsigned refund after a prior reconciled unpaid attempt', async () => {
    const { backend, owner, request, statusTarget } = await canaryFixture('managed-unsigned-refund')
    const first = await request('canary:managed-unsigned-refund:first')
    if (first.kind === 'refused') throw new Error(`managed_unsigned_refund_initial_refused:${first.code}`)
    const before = await projectManagedUnsignedRefundAfterReconciledAttempt(backend)

    await expect(owner.query(
      api.capabilitySupplyOwnerCanary.readOwnerSellerOnboardingCanaryStatus,
      statusTarget,
    )).resolves.toMatchObject({
      kind: 'available',
      state: 'refused',
      attemptRef: before.attemptThreeRef,
      evidenceHash: before.evidenceHash,
      receipt: {
        state: 'refunded',
        refundState: 'released',
        lossState: 'none',
      },
      refusal: {
        code: 'payment_signature_unavailable',
        retryable: true,
        authorizationFailureCode: 'provider_authority_invalid',
        authorizationFailureDetail: 'stale_generation',
        retryKind: 'safe_before_release_resume',
        nextAction: 'Route call signing is unavailable.',
      },
    })

    const results = await Promise.all([
      request('canary:managed-unsigned-refund:retry-one'),
      request('canary:managed-unsigned-refund:retry-two'),
    ])
    expect(results.map((result) => result.kind).sort()).toEqual(['enqueued', 'replayed'])
    const rows = await invocationRows(backend)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      state: 'pending',
      dispatchState: 'enqueued',
      attemptRef: before.attemptThreeRef,
      result: { kind: 'pending', invocationRef: first.invocationRef },
    })
    const attempts = await backend.run(async (ctx) => await ctx.db.query('actionInvocationAttempts')
      .withIndex('by_invocationRef_and_attemptNumber', (query) => query.eq('invocationRef', first.invocationRef))
      .order('asc')
      .collect())
    expect(attempts.map((attempt) => attempt.attemptNumber)).toEqual([1, 2, 3])
    const audits = await backend.run(async (ctx) => await ctx.db.query('sellerOnboardingCanaryRearmAudits')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', first.invocationRef))
      .collect())
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({
      refusalCode: 'payment_signature_unavailable',
      refusalProvenance: {
        phase: 'safe_before_release',
        source: 'managed_x402_unsigned_refund',
        priorAttemptRef: before.attemptThreeRef,
        priorAttemptNumber: 3,
        priorEffectGeneration: 3,
        paymentAttemptDigest: expect.stringMatching(/^sha256:/),
        reservationDigest: expect.stringMatching(/^sha256:/),
        currentHistoryDigest: expect.stringMatching(/^sha256:/),
      },
    })
  })

  it.each([
    'signing_claim',
    'unknown_settlement',
    'possibly_submitted_reservation',
    'settlement_transaction',
    'prior_reconciliation_mismatch',
    'current_history_observation',
    'provider_identity_mismatch',
  ] as const)('blocks a managed unsigned refund with %s', async (variant) => {
    const { backend, owner, request, statusTarget } = await canaryFixture(`managed-unsigned-block-${variant}`)
    const first = await request(`canary:managed-unsigned-block-${variant}:first`)
    if (first.kind === 'refused') throw new Error(`managed_unsigned_block_initial_refused:${first.code}`)
    const before = await projectManagedUnsignedRefundAfterReconciledAttempt(backend)
    await backend.run(async (ctx) => {
      const row = await ctx.db.query('capabilityOperationInvocations').unique()
      const payments = await ctx.db.query('moneyX402PaymentAttempts')
        .filter((query) => query.eq(query.field('dispatchRef'), first.invocationRef))
        .collect()
      const reservations = await ctx.db.query('moneyExternalSpendReservations')
        .withIndex('by_invocationRef_and_attemptRef_and_effectGeneration', (query) => query.eq('invocationRef', first.invocationRef))
        .collect()
      const currentPayment = payments.find((payment) => payment.effectGeneration === 3)
      const priorPayment = payments.find((payment) => payment.effectGeneration === 2)
      const currentReservation = reservations.find((reservation) => reservation.effectGeneration === 3)
      if (row === null || currentPayment === undefined || priorPayment === undefined || currentReservation === undefined) {
        throw new Error('managed_unsigned_block_fixture_missing')
      }
      if (variant === 'signing_claim') {
        await ctx.db.patch(currentPayment._id, { paymentSigningClaimedAt: Date.now() })
      }
      if (variant === 'unknown_settlement') {
        await ctx.db.patch(currentPayment._id, { settlementStatus: 'unknown' })
      }
      if (variant === 'possibly_submitted_reservation') {
        await ctx.db.patch(currentReservation._id, { submissionStatus: 'possibly_submitted' })
      }
      if (variant === 'settlement_transaction') {
        const result = row.result
        if (result?.kind !== 'refused' || result.receipt === undefined) throw new Error('managed_unsigned_receipt_missing')
        if (result.receipt.commercialModel !== 'seller_canary_x402') throw new Error('managed_unsigned_canary_receipt_expected')
        await ctx.db.patch(row._id, {
          result: { ...result, receipt: { ...result.receipt, settlementTransactionHash: `0x${'1'.repeat(64)}` } },
        })
      }
      if (variant === 'prior_reconciliation_mismatch') {
        await ctx.db.patch(priorPayment._id, { reconciliationEvidenceDigest: canonicalDigest('mismatch') })
      }
      if (variant === 'current_history_observation') {
        await ctx.db.insert('actionInvocationHistory', {
          invocationRef: first.invocationRef,
          commandId: `managed-unsigned-block:${variant}`,
          commandDigest: canonicalDigest(`managed-unsigned-block:${variant}`),
          commandResult: 'applied',
          invocationVersion: 10,
          effectGeneration: 3,
          kind: 'late_observation',
          current: false,
          actorRef: row.credentialId,
          sourceEvidenceRef: 'evidence:late',
          observation: {
            kind: 'release_observation',
            release: 'not_released',
            evidenceDigest: canonicalDigest('managed-unsigned-block:late-observation'),
          },
          recordedAt: new Date().toISOString(),
        })
      }
      if (variant === 'provider_identity_mismatch') {
        await ctx.db.patch(currentReservation._id, { providerRef: 'provider:mismatch' })
      }
    })

    await expect(owner.query(
      api.capabilitySupplyOwnerCanary.readOwnerSellerOnboardingCanaryStatus,
      statusTarget,
    )).resolves.toMatchObject({
      kind: 'available',
      state: 'refused',
      refusal: { code: 'payment_signature_unavailable', retryable: false },
    })
    await expect(request(`canary:managed-unsigned-block-${variant}:retry`))
      .resolves.toEqual({ ...first, kind: 'replayed' })
    expect((await invocationRows(backend))[0]?.attemptRef).toBe(before.attemptThreeRef)
  })

  it('lets the resumed worker claim attempt 2 while retaining attempt 1', async () => {
    const { backend, request } = await canaryFixture('safe-before-release-attempt-two')
    const first = await request('canary:safe-before-release-attempt-two:first')
    if (first.kind === 'refused') throw new Error(`canary_safe_before_release_attempt_two_refused:${first.code}`)
    await projectSafeBeforeReleaseRefusal(backend)
    await expect(request('canary:safe-before-release-attempt-two:retry')).resolves.toMatchObject({ kind: 'enqueued' })

    vi.stubEnv('CDP_API_KEY_ID', 'test-key-id')
    vi.stubEnv('CDP_API_KEY_SECRET', 'test-key-secret')
    vi.stubEnv('CDP_WALLET_SECRET', 'test-wallet-secret')
    vi.stubEnv('AE_X402_CDP_ACCOUNT_NAME', 'ae-x402-base-sepolia-v1')
    vi.stubEnv('AE_X402_CDP_EXPECTED_EVM_ADDRESS', `0x${'1'.repeat(40)}`)
    vi.stubEnv('AE_X402_CDP_ACCOUNT_POLICY_ID', '11111111-1111-4111-8111-111111111111')
    vi.stubEnv('AE_X402_CDP_PROJECT_POLICY_ID', '22222222-2222-4222-8222-222222222222')
    vi.stubEnv('AE_X402_CDP_POLICY_RULES_DIGEST', canonicalDigest('policy-rules'))
    vi.stubEnv('AE_X402_CDP_CREDENTIAL_GENERATION', '1')
    vi.stubEnv('AE_X402_CUSTODY_ENABLED', 'true')
    vi.stubEnv('AE_X402_CUSTODY_MAX_ATOMIC', '10000')
    vi.stubEnv('AE_X402_CUSTODY_DAILY_MAX_ATOMIC', '50000')
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_KEY_ID', '')
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_SECRET', '')

    await backend.action(internal.capabilityOperationInvocationWorker.run, {
      invocationRef: first.invocationRef,
    })

    const attempts = await backend.run(async (ctx) => await ctx.db.query('actionInvocationAttempts')
      .withIndex('by_invocationRef_and_attemptNumber', (query) => query.eq('invocationRef', first.invocationRef))
      .order('asc')
      .collect())
    expect(attempts).toHaveLength(2)
    expect(attempts.map((attempt) => ({
      attemptNumber: attempt.attemptNumber,
      effectGeneration: attempt.effectGeneration,
      release: attempt.release,
    }))).toEqual([
      { attemptNumber: 1, effectGeneration: 1, release: { state: 'not_released' } },
      { attemptNumber: 2, effectGeneration: 2, release: { state: 'not_released' } },
    ])
  })

  it.each([
    ['outer evidence', 'outer_evidence'],
    ['outer reconciliation', 'outer_reconciliation'],
    ['canonical attempt mismatch', 'attempt_mismatch'],
    ['released attempt', 'released_attempt'],
    ['unsafe attempt outcome', 'unsafe_outcome'],
    ['external spend reservation', 'external_spend'],
    ['x402 payment authorization', 'x402_attempt'],
    ['usage', 'usage'],
    ['qualified use', 'qualified_use'],
    ['provider consequence journal', 'provider_journal'],
    ['late release observation', 'late_observation'],
  ] as const)('blocks safe-before-release resume when %s exists', async (_label, variant) => {
    const { backend, owner, request, statusTarget } = await canaryFixture(`safe-resume-block-${variant}`)
    const first = await request(`canary:safe-resume-block-${variant}:first`)
    if (first.kind === 'refused') throw new Error(`canary_safe_resume_block_initial_refused:${first.code}`)
    const before = await projectSafeBeforeReleaseRefusal(backend)
    await backend.run(async (ctx) => {
      const row = await ctx.db.query('capabilityOperationInvocations').unique()
      const control = await ctx.db.query('actionInvocationControls').unique()
      const attempt = await ctx.db.query('actionInvocationAttempts').unique()
      if (row === null || control === null || attempt === null) throw new Error('canary_safe_resume_block_fixture_missing')
      const now = Date.now()
      if (variant === 'outer_evidence') await ctx.db.patch(row._id, { evidenceHash: canonicalDigest('effect') })
      if (variant === 'outer_reconciliation') await ctx.db.patch(row._id, {
        reconciliation: { attemptCount: 1, nextAttemptAt: now + 1_000, disposition: 'manual_review', reason: 'unknown_settlement' },
      })
      if (variant === 'attempt_mismatch') await ctx.db.patch(control._id, { currentAttemptRef: `${before.attemptRef}:other` })
      if (variant === 'released_attempt') await ctx.db.patch(attempt._id, { release: { state: 'released', observedAt: new Date(now).toISOString() } })
      if (variant === 'unsafe_outcome') await ctx.db.patch(attempt._id, {
        outcome: { state: 'uncertain', retry: 'reconcile_before_retry', reconciliationRequiredAt: new Date(now).toISOString() },
      })
      if (variant === 'external_spend') await ctx.db.insert('moneyExternalSpendReservations', {
        reservationRef: `reservation:${variant}`,
        principalId: row.principalId,
        credentialId: row.credentialId,
        grantRef: row.grantRef,
        grantGeneration: row.grantGeneration,
        environment: 'sandbox',
        budgetPolicyRef: row.sellerOnboardingCanary!.funding.budgetRef,
        budgetDayStart: '2026-08-31',
        budgetMonthStart: '2026-08',
        invocationRef: row.invocationRef,
        attemptRef: before.attemptRef,
        effectGeneration: 1,
        operationRef: row.operationRef,
        providerRef: 'provider:test',
        paymentIdentifier: 'payment:test',
        challengeDigest: canonicalDigest('challenge'),
        executionContext: {
          kind: 'seller_onboarding_canary',
          paymentProfile: 'base-sepolia-usdc-exact',
          canaryRef: row.sellerOnboardingCanary!.canaryRef,
          canaryCommitmentDigest: row.sellerOnboardingCanary!.canaryCommitmentDigest,
          fundingBudgetRef: row.sellerOnboardingCanary!.funding.budgetRef,
        },
        idempotencyDigest: canonicalDigest('idempotency'),
        identityDigest: canonicalDigest('identity'),
        currency: 'USD',
        amountUnits: '10000',
        exponent: 6,
        state: 'reserved',
        evidenceRefs: [],
        createdAt: now,
        updatedAt: now,
      })
      if (variant === 'x402_attempt') await ctx.db.insert('moneyX402PaymentAttempts', {
        dispatchRef: row.invocationRef,
        attemptRef: before.attemptRef,
        effectGeneration: 1,
        operationRef: row.operationRef,
        inputDigest: row.inputDigest,
        paymentIdentifier: 'payment:test',
        operationKeyDigest: canonicalDigest('operation-key'),
        challengeDigest: canonicalDigest('challenge'),
        challengeJson: '{}',
        selectedRequirementJson: '{}',
        providerEndpoint: ENDPOINT,
        credentialRef: row.credentialId,
        scheme: 'exact',
        network: BASE_SEPOLIA_NETWORK,
        asset: BASE_SEPOLIA_USDC_ADDRESS,
        payTo: PAYEE,
        amountUnits: '10000',
        currency: 'USD',
        exponent: 6,
        custodyRef: 'custody:test',
        authorizationDigest: canonicalDigest('authorization'),
        state: 'prepared',
        preparedAt: now,
        evidenceRefs: [],
      })
      if (variant === 'usage') await ctx.db.insert('moneyUsageEvents', {
        usageRef: 'usage:test', principalId: row.principalId, credentialId: row.credentialId,
        currency: 'USD', exponent: 2, serviceRef: row.operationRef,
        offeringRef: row.sellerOnboardingCanary!.offeringRef, businessId: row.sellerOnboardingCanary!.businessId,
        invocationRef: row.invocationRef, attemptRef: before.attemptRef, operationKey: row.idempotencyKey,
        priceDigest: row.sellerOnboardingCanary!.priceDigest, chargeState: 'paid', amountUnits: '1', observedAt: now,
      })
      if (variant === 'qualified_use') await ctx.db.insert('qualifiedUseReceipts', {
        qualifiedUseRef: 'qualified:test', materialDigest: canonicalDigest('qualified'),
        invocationRef: row.invocationRef, attemptRef: before.attemptRef, effectGeneration: 1,
        businessId: row.sellerOnboardingCanary!.businessId, operationRef: row.operationRef,
        publicationRef: row.sellerOnboardingCanary!.publicationRef,
        publicationRevision: row.sellerOnboardingCanary!.publicationRevision,
        contractDigest: row.sellerOnboardingCanary!.contractDigest,
        bindingDigest: row.sellerOnboardingCanary!.bindingDigest,
        principalClass: 'service', requestDigest: row.requestDigest, responseDigest: canonicalDigest('response'),
        evidenceRefs: [], environment: 'production', qualifiedAt: now,
      })
      if (variant === 'provider_journal') await ctx.db.insert('providerConsequenceJournal', {
        ticketRef: 'ticket:test', effectRef: 'effect:test', commandId: 'command:test', state: 'pending',
        journalTokenDigest: canonicalDigest('token'), requestDigest: row.requestDigest,
        invocationDigest: canonicalDigest(row.invocationRef), operationKeyDigest: canonicalDigest(row.idempotencyKey),
        ticketClaimsDigest: canonicalDigest('claims'), invocationRef: row.invocationRef, operationRef: row.operationRef,
        attemptRef: before.attemptRef, effectGeneration: 1, leaseRef: 'lease:test', connectionRef: 'connection:test',
        authorityGeneration: 1, providerRef: 'provider:test', adapterId: 'x402-fetch:v2', authorityDigest: canonicalDigest('authority'),
        grantedScopes: [], grantedResources: [], readinessValidUntil: now + 60_000,
        owningAccountRef: row.ownerId, activeAccountRef: row.ownerId, actorPrincipalRef: row.principalId,
        grantRef: row.grantRef, grantGeneration: row.grantGeneration, secretRef: 'secret:test', secretGeneration: '1',
        secretPointerRevision: 1, signingSecretRef: 'signing:test', signingSecretGeneration: '1',
        signingSecretPointerRevision: 1, signingAccountRef: row.ownerId, issuedAt: now, expiresAt: now + 60_000, updatedAt: now,
      })
      if (variant === 'late_observation') await ctx.db.insert('actionInvocationHistory', {
        invocationRef: row.invocationRef, commandId: 'late:test', commandDigest: canonicalDigest('late'),
        commandResult: 'applied', invocationVersion: 2, effectGeneration: 1, kind: 'late_observation', current: false,
        actorRef: row.credentialId, sourceEvidenceRef: 'evidence:test',
        observation: { kind: 'release_observation', release: 'not_released', evidenceDigest: canonicalDigest('observation') },
        recordedAt: new Date(now).toISOString(),
      })
    })

    await expect(owner.query(
      api.capabilitySupplyOwnerCanary.readOwnerSellerOnboardingCanaryStatus,
      statusTarget,
    )).resolves.toMatchObject({
      kind: 'available',
      refusal: { code: 'pre_release_failed', retryable: false },
    })
    await expect(request(`canary:safe-resume-block-${variant}:retry`))
      .resolves.toEqual({ ...first, kind: 'replayed' })
    expect((await invocationRows(backend))[0]?.workId).toBe(before.workId)
  })

  it.each([
    ['non-allowlisted refusal', { resultCode: 'grant_revoked' }],
    ['operation_not_current attempt projection', {
      resultCode: 'operation_not_current',
      attemptRef: 'operation-attempt:effect:1',
    }],
    ['operation_not_current effect evidence', {
      resultCode: 'operation_not_current',
      evidenceHash: canonicalDigest('effect-evidence'),
    }],
    ['provider_refused wrong next action', {
      resultCode: 'provider_refused',
      nextAction: 'Provider connection authority is stale.',
    }],
    ['provider_refused already retryable', {
      resultCode: 'provider_refused',
      retryable: true,
    }],
    ['provider_refused reconciliation state', {
      resultCode: 'provider_refused',
      reconciliation: true,
    }],
  ] as const)(
    'never re-arms a refused canary with %s',
    async (_label, variant) => {
      const { backend, request } = await canaryFixture(`blocked-rearm-${_label.replaceAll(' ', '-')}`)
      const first = await request(`canary:blocked-rearm:${_label}:first`)
      if (first.kind === 'refused') throw new Error(`canary_blocked_rearm_refused:${first.code}`)
      const before = await projectPreClaimRefusal(
        backend,
        variant.resultCode,
      )
      await backend.run(async (ctx) => {
        const current = await ctx.db.get(before._id)
        const result = current?.result
        if (result?.kind !== 'refused') throw new Error('canary_blocked_rearm_result_missing')
        await ctx.db.patch(before._id, {
          ...('attemptRef' in variant ? { attemptRef: variant.attemptRef } : {}),
          ...('evidenceHash' in variant ? { evidenceHash: variant.evidenceHash } : {}),
          ...('nextAction' in variant
            ? { result: { ...result, nextAction: variant.nextAction } }
            : {}),
          ...('retryable' in variant
            ? { result: { ...result, retryable: variant.retryable } }
            : {}),
          ...('reconciliation' in variant
            ? {
                reconciliation: {
                  attemptCount: 1,
                  nextAttemptAt: Date.now() + 1_000,
                  disposition: 'manual_review' as const,
                  reason: 'unknown_settlement' as const,
                },
              }
            : {}),
        })
      })

      await expect(request(`canary:blocked-rearm:${_label}:retry`))
        .resolves.toEqual({ ...first, kind: 'replayed' })
      expect((await invocationRows(backend))[0]?.workId).toBe(before.workId)
    },
  )

  it('never re-arms the legacy provider refusal for a non-x402 persisted route', async () => {
    const { backend, request } = await canaryFixture('blocked-rearm-provider-non-x402')
    const first = await request('canary:blocked-rearm-provider-non-x402:first')
    if (first.kind === 'refused') throw new Error(`canary_provider_route_initial_refused:${first.code}`)
    const before = await projectPreClaimRefusal(backend, 'provider_refused')
    await backend.run(async (ctx) => {
      if (before.operationJson === undefined) throw new Error('canary_provider_route_operation_missing')
      const operation = JSON.parse(before.operationJson) as Record<string, unknown>
      const identity = operation.identity as Record<string, unknown>
      const binding = operation.binding as Record<string, unknown>
      const adapter = binding.adapter as Record<string, unknown>
      await ctx.db.patch(before._id, {
        operationJson: JSON.stringify({
          ...operation,
          identity: { ...identity, adapterId: 'http-json:v1' },
          binding: { ...binding, adapter: { ...adapter, adapterId: 'http-json:v1' } },
        }),
      })
    })

    await expect(request('canary:blocked-rearm-provider-non-x402:retry'))
      .resolves.toEqual({ ...first, kind: 'replayed' })
    expect((await invocationRows(backend))[0]?.workId).toBe(before.workId)
  })

  it('never re-arms the legacy provider refusal when a receipt is attached', async () => {
    const { backend, request } = await canaryFixture('blocked-rearm-provider-receipt')
    const first = await request('canary:blocked-rearm-provider-receipt:first')
    if (first.kind === 'refused') throw new Error(`canary_provider_receipt_initial_refused:${first.code}`)
    const before = await projectPreClaimRefusal(backend, 'provider_refused')
    await backend.run(async (ctx) => {
      const current = await ctx.db.get(before._id)
      const result = current?.result
      if (result?.kind !== 'refused') throw new Error('canary_provider_receipt_result_missing')
      const amount = { currency: 'USD', units: '1', exponent: 2 }
      await ctx.db.patch(before._id, {
        result: {
          ...result,
          receipt: {
            commercialModel: 'seller_canary_x402',
            receiptRef: 'receipt:legacy-provider-refusal',
            state: 'settled',
            network: BASE_SEPOLIA_NETWORK,
            asset: BASE_SEPOLIA_USDC_ADDRESS,
            providerQuotedAmount: amount,
            agenticEconomyFee: { currency: 'USD', units: '0', exponent: 2 },
            totalBuyerAuthorization: amount,
            priceDigest: 'price:legacy-provider-refusal',
            transactionRef: 'transaction:legacy-provider-refusal',
            refundState: 'not_applicable',
            lossState: 'none',
            evidenceHash: 'evidence:legacy-provider-refusal',
            issuedAt: new Date().toISOString(),
          },
        },
      })
    })

    await expect(request('canary:blocked-rearm-provider-receipt:retry'))
      .resolves.toEqual({ ...first, kind: 'replayed' })
    expect((await invocationRows(backend))[0]?.workId).toBe(before.workId)
  })

  it('never re-arms when a canonical attempt exists even if the outer projection lost it', async () => {
    const { backend, owner, request, statusTarget } = await canaryFixture('blocked-rearm-canonical-attempt')
    const first = await request('canary:blocked-rearm-canonical-attempt:first')
    if (first.kind === 'refused') throw new Error(`canary_canonical_attempt_initial_refused:${first.code}`)
    const before = await projectPreClaimRefusal(backend, 'grant_not_found')
    await backend.run(async (ctx) => {
      await ctx.db.insert('actionInvocationAttempts', {
        invocationRef: first.invocationRef,
        attemptRef: `operation-attempt:${first.invocationRef}:1`,
        attemptNumber: 1,
        effectGeneration: 1,
        actor: { callerRef: before.credentialId, principalRef: before.principalId },
        idempotency: {
          operationKey: before.operationRef,
          materialInputDigest: before.inputDigest,
          effectIdentity: canonicalDigest({ invocationRef: first.invocationRef, generation: 1 }),
        },
        lease: { owner: 'worker:prior', expiresAt: new Date(Date.now() + 60_000).toISOString() },
        release: { state: 'not_released' },
        outcome: { state: 'failed', retry: 'safe_before_release' },
        recordedAt: new Date().toISOString(),
      })
    })

    await expect(owner.query(
      api.capabilitySupplyOwnerCanary.readOwnerSellerOnboardingCanaryStatus,
      statusTarget,
    )).resolves.toMatchObject({
      kind: 'available',
      state: 'refused',
      refusal: { code: 'grant_not_found', retryable: false },
    })

    await expect(request('canary:blocked-rearm-canonical-attempt:retry'))
      .resolves.toEqual({ ...first, kind: 'replayed' })
    expect((await invocationRows(backend))[0]?.workId).toBe(before.workId)
  })

  it('never re-arms the legacy provider refusal when any x402 payment attempt names the dispatch', async () => {
    const { backend, owner, request, statusTarget } = await canaryFixture('blocked-rearm-provider-payment-attempt')
    const first = await request('canary:blocked-rearm-provider-payment-attempt:first')
    if (first.kind === 'refused') throw new Error(`canary_provider_payment_initial_refused:${first.code}`)
    const before = await projectPreClaimRefusal(backend, 'provider_refused')
    await backend.run(async (ctx) => {
      await ctx.db.insert('moneyX402PaymentAttempts', {
        dispatchRef: first.invocationRef,
        // Deliberately non-canonical: the no-effect proof keys payment attempts
        // by dispatchRef so legacy or malformed attempt identities still block.
        attemptRef: 'operation-attempt:unexpected:99',
        effectGeneration: 99,
        operationRef: before.operationRef,
        inputDigest: before.inputDigest,
        paymentIdentifier: 'payment:blocked-rearm-provider',
        operationKeyDigest: canonicalDigest('operation-key:blocked-rearm-provider'),
        challengeDigest: canonicalDigest('challenge:blocked-rearm-provider'),
        challengeJson: '{}',
        selectedRequirementJson: '{}',
        providerEndpoint: ENDPOINT,
        credentialRef: 'credential:blocked-rearm-provider',
        scheme: 'exact',
        network: BASE_SEPOLIA_NETWORK,
        asset: BASE_SEPOLIA_USDC_ADDRESS,
        payTo: PAYEE,
        amountUnits: '10000',
        currency: 'USD',
        exponent: 2,
        custodyRef: 'custody:blocked-rearm-provider',
        authorizationDigest: canonicalDigest('authorization:blocked-rearm-provider'),
        state: 'prepared',
        preparedAt: Date.now(),
        evidenceRefs: [],
      })
    })

    await expect(owner.query(
      api.capabilitySupplyOwnerCanary.readOwnerSellerOnboardingCanaryStatus,
      statusTarget,
    )).resolves.toMatchObject({
      kind: 'available',
      state: 'refused',
      refusal: { code: 'provider_refused', retryable: false },
    })
    await expect(request('canary:blocked-rearm-provider-payment-attempt:retry'))
      .resolves.toEqual({ ...first, kind: 'replayed' })
    expect((await invocationRows(backend))[0]?.workId).toBe(before.workId)
  })

  it.each(['completed', 'refused', 'cancelled', 'reconciliation_required'] as const)(
    'never re-enqueues a workless %s terminal',
    async (state) => {
      const { backend, request } = await canaryFixture(`workless-${state}`)
      const first = await request(`canary:workless-${state}:first`)
      if (first.kind === 'refused') throw new Error(`canary_workless_terminal_refused:${first.code}`)
      const row = (await invocationRows(backend))[0]
      if (row === undefined) throw new Error('canary_workless_terminal_missing')
      await backend.run(async (ctx) => {
        await ctx.db.patch(row._id, {
          state,
          result: undefined,
          workId: undefined,
          attemptRef: undefined,
          dispatchState: undefined,
        })
      })

      await expect(request(`canary:workless-${state}:retry`))
        .resolves.toEqual({ ...first, kind: 'replayed' })
      expect((await invocationRows(backend))[0]).toMatchObject({ state })
      expect((await invocationRows(backend))[0]?.workId).toBeUndefined()
    },
  )
})
