import { v, type Infer } from 'convex/values'

import { internalMutation, internalQuery, query } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { resolveBusinessActor } from './authz'
import { requireSourceWrite, sourceWriteArgs } from './sourceWriteAdmission'
import { readExactSellerCanaryOperationSnapshotHandler } from './capabilitySupplyCurrentTool'
import { reserveHandler } from './lib/callLifecycle/admission'
import {
  enqueueCallDispatch,
  enqueueKnownUnpaidSellerCanaryRearm,
  enqueueRecoveredSellerCanaryReplay,
  enqueueSafeBeforeReleaseSellerCanaryResume,
  knownUnpaidSellerCanaryRefusal,
  safeBeforeReleaseSellerCanaryRefusal,
  SELLER_CANARY_ROUTE_SIGNING_UNAVAILABLE_NEXT_ACTION,
} from './lib/callLifecycle/dispatch'
import {
  jsonObject,
  callResultValue,
  sellerOnboardingCanaryExecutionEnvelopeValue,
} from '@/modules/capability-execution/convex'
import {
  buildCallAuthority,
  type CallGrant,
} from '@/modules/capability-execution/call-authority'
import {
  createSellerOnboardingCanaryCommitment,
  sellerOnboardingCanaryExecutionEnvelope,
} from '@/modules/capability-supply/public'
import {
  materializeRuntimePublishedTool,
  parsePublishedToolSnapshot,
} from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isBoundedJsonValue, type JsonValue } from '@/modules/capability-contract/public'
import { compareExactAmounts } from '@/modules/money/public'
import {
  readExactSellerOnboardingCanaryPlatformGrantHandler,
  sellerOnboardingCanaryPlatformGrantExpectation,
} from './capabilitySupplyCanaryFunding'
import type { AgentAccessGrant } from '@/modules/agent-access/policy'

const requestSellerOnboardingCanaryArgs = {
  businessId: v.id('businesses'),
  offeringRef: v.string(),
  offeringRevision: v.number(),
  offeringSourceHash: v.string(),
  publicationRef: v.string(),
  publicationRevision: v.number(),
  input: v.optional(jsonObject),
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
} as const

const requestSellerOnboardingCanaryResult = v.union(
  v.object({
    kind: v.union(v.literal('enqueued'), v.literal('replayed')),
    canaryRef: v.string(),
    callRef: v.string(),
    toolRef: v.string(),
  }),
  v.object({
    kind: v.literal('refused'),
    code: v.union(
      v.literal('authorization_denied'),
      v.literal('source_write_refused'),
      v.literal('staging_snapshot_missing'),
      v.literal('catalog_revision_changed'),
      v.literal('input_invalid'),
      v.literal('canary_grant_missing'),
      v.literal('canary_grant_ambiguous'),
      v.literal('canary_budget_exceeded'),
      v.literal('canary_identity_conflict'),
      v.literal('canary_dispatch_refused'),
    ),
  }),
)

const sellerOnboardingCanaryEvidenceValue = v.union(v.object({
  sellerOnboardingCanary: sellerOnboardingCanaryExecutionEnvelopeValue,
  toolJson: v.string(),
  state: v.union(
    v.literal('pending'),
    v.literal('completed'),
    v.literal('refused'),
    v.literal('reconciliation_required'),
    v.literal('cancelled'),
  ),
  result: v.optional(callResultValue),
  evidenceHash: v.optional(v.string()),
  attemptRef: v.optional(v.string()),
  updatedAt: v.number(),
}), v.null())

const ownerSellerCanaryReceiptValue = v.object({
  receiptRef: v.string(),
  state: v.union(
    v.literal('settled'),
    v.literal('refunded'),
    v.literal('reconciliation_required'),
  ),
  network: v.string(),
  asset: v.string(),
  paymentIdentifier: v.optional(v.string()),
  settlementTransactionHash: v.optional(v.string()),
  externalSettlementRef: v.optional(v.string()),
  evidenceHash: v.string(),
  issuedAt: v.string(),
  refundState: v.optional(v.union(v.literal('not_applicable'), v.literal('released'), v.literal('unknown'))),
  lossState: v.optional(v.union(v.literal('none'), v.literal('provider_output_invalid'), v.literal('unknown'))),
})

const ownerSellerCanaryStatusValue = v.union(
  v.object({ kind: v.literal('error'), code: v.union(v.literal('unauthenticated'), v.literal('wrong_owner')) }),
  v.object({ kind: v.literal('not_found') }),
  v.object({ kind: v.literal('conflict') }),
  v.object({
    kind: v.literal('available'),
    canaryRef: v.string(),
    callRef: v.string(),
    toolRef: v.string(),
    offeringRef: v.string(),
    offeringRevision: v.number(),
    publicationRef: v.string(),
    publicationRevision: v.number(),
    state: v.union(
      v.literal('pending'),
      v.literal('completed'),
      v.literal('refused'),
      v.literal('reconciliation_required'),
      v.literal('cancelled'),
    ),
    resultKind: v.optional(v.union(
      v.literal('completed'),
      v.literal('pending'),
      v.literal('needs_authority'),
      v.literal('reconciliation_required'),
      v.literal('refused'),
    )),
    evidenceHash: v.optional(v.string()),
    attemptRef: v.optional(v.string()),
    receipt: v.optional(ownerSellerCanaryReceiptValue),
    reconciliation: v.optional(v.object({
      attemptRef: v.string(),
      effectGeneration: v.number(),
      requiredAt: v.string(),
      retry: v.literal('reconcile_before_retry'),
      evidenceSource: v.string(),
    })),
    refusal: v.optional(v.object({
      code: v.string(),
      retryable: v.boolean(),
      retryKind: v.optional(v.union(
        v.literal('pre_claim_rearm'),
        v.literal('safe_before_release_resume'),
      )),
      nextAction: v.optional(v.string()),
    })),
    promotion: v.union(
      v.object({ state: v.literal('not_promoted') }),
      v.object({ state: v.literal('promoted'), evidenceDigest: v.string() }),
    ),
    updatedAt: v.number(),
  }),
)

type RequestArgs = {
  businessId: Id<'businesses'>
  offeringRef: string
  offeringRevision: number
  offeringSourceHash: string
  publicationRef: string
  publicationRevision: number
  input?: Record<string, JsonValue>
  operationKey: string
  correlationId: string
  sourceWrite?: unknown
  sourceWriteRequest?: unknown
}
type CanaryEnvelope = NonNullable<Doc<'capabilityCalls'>['sellerOnboardingCanary']>

function operationGrant(grant: AgentAccessGrant): CallGrant {
  return {
    grantRef: grant.grantRef,
    principalId: grant.principalId,
    ownerId: grant.ownerId,
    applicationRef: grant.applicationRef,
    credentialId: grant.credentialId,
    environment: grant.environment,
    generation: grant.generation,
    policyDigest: grant.spendingPolicyDigest,
    expiresAt: grant.expiresAt,
    lifecycle: 'active',
    toolAccess: grant.toolAccess,
    toolRefs: grant.toolRefs,
  }
}

function stableCanaryIdentity(envelope: CanaryEnvelope) {
  return {
    executionPurpose: envelope.executionPurpose,
    canaryRef: envelope.canaryRef,
    toolRef: envelope.toolRef,
    ownerId: envelope.ownerId,
    businessId: envelope.businessId,
    offeringRef: envelope.offeringRef,
    offeringRevision: envelope.offeringRevision,
    offeringSourceHash: envelope.offeringSourceHash,
    accessPathRef: envelope.accessPathRef,
    accessPathSourceHash: envelope.accessPathSourceHash,
    publicationRef: envelope.publicationRef,
    publicationRevision: envelope.publicationRevision,
    contractDigest: envelope.contractDigest,
    bindingDigest: envelope.bindingDigest,
    priceDigest: envelope.priceDigest,
    sellerPayTo: envelope.sellerPayTo.toLowerCase(),
  }
}

function persistedCanaryCommitmentIsValid(envelope: CanaryEnvelope): boolean {
  try {
    const reconstructed = createSellerOnboardingCanaryCommitment({
      ownerId: envelope.ownerId,
      businessId: envelope.businessId,
      offeringRef: envelope.offeringRef,
      offeringRevision: envelope.offeringRevision,
      offeringSourceHash: envelope.offeringSourceHash,
      accessPathRef: envelope.accessPathRef,
      accessPathSourceHash: envelope.accessPathSourceHash,
      publicationRef: envelope.publicationRef,
      publicationRevision: envelope.publicationRevision,
      draftOperationRef: envelope.toolRef,
      toolMaterialDigest: envelope.toolMaterialDigest,
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
      expiresAt: envelope.expiresAt,
      now: 0,
    })
    return reconstructed.canaryRef === envelope.canaryRef
      && reconstructed.commitmentDigest === envelope.canaryCommitmentDigest
      && canonicalDigest(sellerOnboardingCanaryExecutionEnvelope(reconstructed) as never)
        === canonicalDigest(envelope as never)
  } catch {
    return false
  }
}

function exactPersistedCanaryIdentity(
  row: Doc<'capabilityCalls'>,
  requested: CanaryEnvelope,
): boolean {
  const existing = row.sellerOnboardingCanary
  return existing !== undefined
    && persistedCanaryCommitmentIsValid(existing)
    && existing.canaryRef === requested.canaryRef
    && canonicalDigest(stableCanaryIdentity(existing) as never)
      === canonicalDigest(stableCanaryIdentity(requested) as never)
    && row.callRef === existing.callRef
    && row.toolRef === existing.toolRef
    && row.inputDigest === existing.inputDigest
    && row.idempotencyKey === existing.idempotencyKey
    && row.principalId === existing.funding.principalId
    && row.ownerId === existing.funding.ownerId
    && row.credentialId === existing.funding.credentialId
    && row.applicationRef === existing.funding.applicationRef
    && row.grantRef === existing.funding.grantRef
    && row.grantGeneration === existing.funding.grantGeneration
    && row.policyDigest === existing.funding.policyDigest
}

async function exactCatalogIdentity(
  ctx: MutationCtx,
  args: RequestArgs,
): Promise<boolean> {
  const [offering, revision] = await Promise.all([
    ctx.db.query('businessOfferings')
      .withIndex('by_offeringRef', (query) => query.eq('offeringRef', args.offeringRef))
      .unique(),
    ctx.db.query('businessOfferingRevisions')
      .withIndex('by_offeringRef_and_revision', (query) => (
        query.eq('offeringRef', args.offeringRef).eq('revision', args.offeringRevision)
      ))
      .unique(),
  ])
  return offering !== null
    && revision !== null
    && offering.businessId === args.businessId
    && revision.businessId === args.businessId
    && offering.currentRevision === args.offeringRevision
    && offering.status === 'published'
    && revision.sourceHash === args.offeringSourceHash
}

export async function requestSellerOnboardingCanaryHandler(
  ctx: MutationCtx,
  args: RequestArgs,
): Promise<Infer<typeof requestSellerOnboardingCanaryResult>> {
  if (args.input !== undefined && !isBoundedJsonValue(args.input)) {
    return { kind: 'refused', code: 'input_invalid' }
  }
  const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
  if (sourceWrite.kind === 'rejected') return { kind: 'refused', code: 'source_write_refused' }
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return { kind: 'refused', code: 'authorization_denied' }
  const business = await ctx.db.get(args.businessId)
  if (business === null || business.owningAccountRef !== actor.canonicalAccountRef) {
    return { kind: 'refused', code: 'authorization_denied' }
  }
  if (!await exactCatalogIdentity(ctx, args)) return { kind: 'refused', code: 'catalog_revision_changed' }

  const snapshot = await readExactSellerCanaryOperationSnapshotHandler(ctx, {
    publicationRef: args.publicationRef,
    revision: args.publicationRevision,
  })
  if (
    snapshot === null
    || snapshot.offeringRef !== args.offeringRef
    || snapshot.offeringRevision !== args.offeringRevision
    || snapshot.offeringSourceHash !== args.offeringSourceHash
  ) return { kind: 'refused', code: 'staging_snapshot_missing' }
  const operation = parsePublishedToolSnapshot(snapshot.toolJson)
  if (operation === undefined || operation.runtimeEnvironment !== 'sandbox') {
    return { kind: 'refused', code: 'staging_snapshot_missing' }
  }
  const descriptor = materializeRuntimePublishedTool(operation)
  const canaryInput = operation.contract.inputExamples?.find(({ input }) => (
    isBoundedJsonValue(input) && descriptor.validateInput(input)
  ))?.input
  if (
    canaryInput === undefined
    || operation.pricingConfig.kind !== 'managed_x402'
    || operation.identity.payment.kind !== 'x402'
    || (args.input !== undefined
      && canonicalDigest(args.input) !== canonicalDigest(canaryInput))
  ) {
    return { kind: 'refused', code: 'input_invalid' }
  }
  const requestedSpend = {
    currency: operation.identity.payment.currency,
    units: operation.pricingConfig.sourceRequirement.atomicUnits,
    exponent: operation.identity.payment.assetAmountExponent,
  }

  const now = Date.now()
  const grant = await readExactSellerOnboardingCanaryPlatformGrantHandler(
    ctx,
    sellerOnboardingCanaryPlatformGrantExpectation(actor.canonicalAccountRef, now),
  )
  if (grant === null) return { kind: 'refused', code: 'canary_grant_missing' }
  const maximumSpend = grant.spendingPolicy.budget.maximumSpendPerCall
  if (compareExactAmounts(requestedSpend, maximumSpend) !== -1
    && compareExactAmounts(requestedSpend, maximumSpend) !== 0) {
    return { kind: 'refused', code: 'canary_budget_exceeded' }
  }
  const inputDigest = canonicalDigest(canaryInput)
  const canaryCommitment = (idempotencyKey: string) => createSellerOnboardingCanaryCommitment({
    ownerId: actor.canonicalAccountRef,
    businessId: String(args.businessId),
    offeringRef: snapshot.offeringRef,
    offeringRevision: snapshot.offeringRevision,
    offeringSourceHash: snapshot.offeringSourceHash,
    accessPathRef: snapshot.accessPathRef,
    accessPathSourceHash: snapshot.accessPathSourceHash,
    publicationRef: snapshot.publicationRef,
    publicationRevision: snapshot.publicationRevision,
    draftOperationRef: snapshot.toolRef,
    toolMaterialDigest: operation.materialDigest,
    contractDigest: operation.identity.contractDigest,
    bindingDigest: operation.identity.bindingDigest,
    priceDigest: operation.priceDigest,
    sellerPayTo: snapshot.sellerPayTo,
    sellerClaimDigest: snapshot.sellerClaimDigest,
    readinessDigest: snapshot.readinessDigest,
    readinessObservedAt: snapshot.readinessObservedAt,
    readinessValidUntil: snapshot.readinessValidUntil,
    expectedOutputSchemaDigest: canonicalDigest(operation.contract.outputSchema),
    expectedOutputEvidenceDigest: canonicalDigest({
      kind: 'seller_onboarding_canary_expected_output:v1',
      toolMaterialDigest: operation.materialDigest,
      contractDigest: operation.identity.contractDigest,
      inputDigest,
      outputSchema: operation.contract.outputSchema,
      evidence: operation.contract.evidence,
    }),
    inputDigest,
    idempotencyKey,
    fundingBudgetRef: grant.budgetPolicyRef,
    fundingPrincipalId: grant.principalId,
    fundingOwnerId: grant.ownerId,
    fundingCredentialId: grant.credentialId,
    fundingApplicationRef: grant.applicationRef,
    fundingGrantRef: grant.grantRef,
    fundingGrantGeneration: grant.generation,
    fundingPolicyDigest: grant.spendingPolicyDigest,
    requestedSpend,
    maximumSpend,
    expiresAt: Math.min(snapshot.readinessValidUntil, grant.expiresAt, now + 5 * 60_000),
    now,
  })
  const commitment = canaryCommitment(args.operationKey)
  const envelope = sellerOnboardingCanaryExecutionEnvelope(commitment)
  const authorityForEnvelope = (target: CanaryEnvelope) => buildCallAuthority({
    authority: {
      kind: 'approved',
      basis: {
        kind: 'spending_policy_use',
        spendingPolicyRef: `agent-access-grant:${grant.grantRef}`,
        spendingPolicyVersion: 1,
        spendingPolicyGeneration: grant.generation,
        authorityUseRef: `operation-authority-use:${target.callRef}`,
        grantEvidenceRef: `agent-access-grant-evidence:${grant.spendingPolicyDigest}`,
      },
      expiresAt: new Date(target.expiresAt).toISOString(),
    },
    grant: operationGrant(grant),
    operation,
    descriptor,
    toolRef: snapshot.toolRef,
    callRef: target.callRef,
    inputDigest,
    decisionPrice: target.funding.requestedSpend,
    now,
  })
  const existingRows = await ctx.db.query('capabilityCalls')
    .withIndex('by_sellerOnboardingCanary_canaryRef', (query) => (
      query.eq('sellerOnboardingCanary.canaryRef', envelope.canaryRef)
    ))
    .take(2)
  if (existingRows.length > 0) {
    const existing = existingRows.length === 1 ? existingRows[0] : undefined
    if (existing === undefined || !exactPersistedCanaryIdentity(existing, envelope)) {
      return { kind: 'refused', code: 'canary_identity_conflict' }
    }
    const refreshedCommitment = canaryCommitment(existing.idempotencyKey)
    const refreshedEnvelope = sellerOnboardingCanaryExecutionEnvelope(refreshedCommitment)
    const refreshedAuthority = authorityForEnvelope(refreshedEnvelope)
    if (
      refreshedAuthority !== undefined
      && refreshedEnvelope.canaryRef === existing.sellerOnboardingCanary?.canaryRef
      && refreshedEnvelope.callRef === existing.callRef
    ) {
      const refreshed = {
        envelope: refreshedEnvelope,
        authority: refreshedAuthority,
        grantGeneration: grant.generation,
        policyDigest: grant.spendingPolicyDigest,
        grantExpiresAt: grant.expiresAt,
        toolJson: snapshot.toolJson,
        inputJson: JSON.stringify(canaryInput),
        inputDigest,
        requestDigest: canonicalDigest({
          purpose: refreshedEnvelope.executionPurpose,
          toolRef: snapshot.toolRef,
          input: canaryInput,
          canaryCommitmentDigest: refreshedEnvelope.canaryCommitmentDigest,
        }),
        idempotencyKey: existing.idempotencyKey,
        now,
      }
      const rearmed = await enqueueKnownUnpaidSellerCanaryRearm(ctx, existing, refreshed)
      if (rearmed.kind === 'enqueued') {
        return {
          kind: 'enqueued',
          canaryRef: refreshedEnvelope.canaryRef,
          callRef: refreshedEnvelope.callRef,
          toolRef: refreshedEnvelope.toolRef,
        }
      }
      const resumed = await enqueueSafeBeforeReleaseSellerCanaryResume(ctx, existing, refreshed)
      if (resumed.kind === 'enqueued') {
        return {
          kind: 'enqueued',
          canaryRef: refreshedEnvelope.canaryRef,
          callRef: refreshedEnvelope.callRef,
          toolRef: refreshedEnvelope.toolRef,
        }
      }
      const recoveredWorkless = existing.state === 'pending'
        && existing.result === undefined
        && existing.workId === undefined
        && existing.attemptRef === undefined
        && existing.dispatchState === undefined
        && existing.authority !== undefined
      if (recoveredWorkless) {
        const dispatch = await enqueueRecoveredSellerCanaryReplay(ctx, existing, refreshed)
        if (dispatch.kind === 'refused') {
          return { kind: 'refused', code: 'canary_dispatch_refused' }
        }
        return {
          kind: dispatch.kind,
          canaryRef: refreshedEnvelope.canaryRef,
          callRef: refreshedEnvelope.callRef,
          toolRef: refreshedEnvelope.toolRef,
        }
      }
    }
    return {
      kind: 'replayed',
      canaryRef: existing.sellerOnboardingCanary!.canaryRef,
      callRef: existing.callRef,
      toolRef: existing.toolRef,
    }
  }
  const requestDigest = canonicalDigest({
    purpose: envelope.executionPurpose,
    toolRef: snapshot.toolRef,
    input: canaryInput,
    canaryCommitmentDigest: envelope.canaryCommitmentDigest,
  })
  const authority = authorityForEnvelope(envelope)
  if (authority === undefined) return { kind: 'refused', code: 'canary_identity_conflict' }
  const reserved = await reserveHandler(ctx, {
    quoteRef: envelope.canaryRef,
    callRef: envelope.callRef,
    principalId: grant.principalId,
    ownerId: grant.ownerId,
    credentialId: grant.credentialId,
    applicationRef: grant.applicationRef,
    grantRef: grant.grantRef,
    environment: 'sandbox',
    toolRef: snapshot.toolRef,
    idempotencyKey: args.operationKey,
    inputDigest,
    requestDigest,
    grantGeneration: grant.generation,
    policyDigest: grant.spendingPolicyDigest,
    grantExpiresAt: grant.expiresAt,
    toolJson: snapshot.toolJson,
    inputJson: JSON.stringify(canaryInput),
    sellerOnboardingCanary: envelope,
    now,
  })
  if (reserved.kind === 'conflict') return { kind: 'refused', code: 'canary_identity_conflict' }
  if (reserved.kind === 'refused') return { kind: 'refused', code: 'canary_dispatch_refused' }
  const row = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', envelope.callRef))
    .unique()
  if (row === null) return { kind: 'refused', code: 'canary_identity_conflict' }
  const dispatch = await enqueueCallDispatch(ctx, row, authority, now)
  if (dispatch.kind === 'refused') return { kind: 'refused', code: 'canary_dispatch_refused' }
  return {
    kind: dispatch.kind,
    canaryRef: envelope.canaryRef,
    callRef: envelope.callRef,
    toolRef: envelope.toolRef,
  }
}

export const requestSellerOnboardingCanary = internalMutation({
  args: requestSellerOnboardingCanaryArgs,
  returns: requestSellerOnboardingCanaryResult,
  handler: requestSellerOnboardingCanaryHandler,
})

export const readSellerOnboardingCanaryEvidence = internalQuery({
  args: { canaryRef: v.string() },
  returns: sellerOnboardingCanaryEvidenceValue,
  handler: async (ctx, args) => {
    const row = await ctx.db.query('capabilityCalls')
      .withIndex('by_sellerOnboardingCanary_canaryRef', (query) => (
        query.eq('sellerOnboardingCanary.canaryRef', args.canaryRef)
      ))
      .unique()
    if (
      row === null
      || row.sellerOnboardingCanary === undefined
      || row.toolJson === undefined
      || row.sellerOnboardingCanary.canaryRef !== args.canaryRef
      || row.sellerOnboardingCanary.callRef !== row.callRef
      || row.sellerOnboardingCanary.toolRef !== row.toolRef
      || row.sellerOnboardingCanary.inputDigest !== row.inputDigest
      || row.sellerOnboardingCanary.idempotencyKey !== row.idempotencyKey
    ) return null
    return {
      sellerOnboardingCanary: structuredClone(row.sellerOnboardingCanary),
      toolJson: row.toolJson,
      state: row.state,
      ...(row.result === undefined ? {} : { result: structuredClone(row.result) }),
      ...(row.evidenceHash === undefined ? {} : { evidenceHash: row.evidenceHash }),
      ...(row.attemptRef === undefined ? {} : { attemptRef: row.attemptRef }),
      updatedAt: row.updatedAt,
    }
  },
})

/** Authenticated, bounded owner read of the exact current seller canary target. */
export const readOwnerSellerOnboardingCanaryStatus = query({
  args: {
    businessId: v.id('businesses'),
    offeringRef: v.string(),
    offeringRevision: v.number(),
    offeringSourceHash: v.string(),
    publicationRef: v.string(),
    publicationRevision: v.number(),
  },
  returns: ownerSellerCanaryStatusValue,
  handler: async (ctx, args) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return { kind: 'error' as const, code: 'unauthenticated' as const }
    const business = await ctx.db.get(args.businessId)
    if (business === null || business.owningAccountRef !== actor.canonicalAccountRef) {
      return { kind: 'error' as const, code: 'wrong_owner' as const }
    }

    const rows = await ctx.db.query('capabilityCalls')
      .withIndex('by_sellerOnboardingCanary_target', (index) => index
        .eq('sellerOnboardingCanary.businessId', String(args.businessId))
        .eq('sellerOnboardingCanary.offeringRef', args.offeringRef)
        .eq('sellerOnboardingCanary.offeringRevision', args.offeringRevision)
        .eq('sellerOnboardingCanary.offeringSourceHash', args.offeringSourceHash)
        .eq('sellerOnboardingCanary.publicationRef', args.publicationRef)
        .eq('sellerOnboardingCanary.publicationRevision', args.publicationRevision))
      .order('desc')
      .take(2)
    if (rows.length === 0) return { kind: 'not_found' as const }
    if (rows.length !== 1) return { kind: 'conflict' as const }
    const row = rows[0]
    if (row === undefined) return { kind: 'conflict' as const }
    const canary = row.sellerOnboardingCanary
    if (canary === undefined
      || canary.ownerId !== actor.canonicalAccountRef
      || canary.businessId !== String(args.businessId)
      || canary.offeringRef !== args.offeringRef
      || canary.offeringRevision !== args.offeringRevision
      || canary.offeringSourceHash !== args.offeringSourceHash
      || canary.publicationRef !== args.publicationRef
      || canary.publicationRevision !== args.publicationRevision
      || canary.callRef !== row.callRef
      || canary.toolRef !== row.toolRef
      || canary.inputDigest !== row.inputDigest
      || canary.idempotencyKey !== row.idempotencyKey) {
      return { kind: 'conflict' as const }
    }

    const promotionMarker = await ctx.db.query('operationKeys')
      .withIndex('by_actor_operation_key', (index) => index
        .eq('actorRef', actor.canonicalAccountRef)
        .eq('operationName', 'promoteX402SellerCanary')
        .eq('key', canary.canaryRef))
      .unique()
    const promotion = promotionMarker === null
      ? { state: 'not_promoted' as const }
      : promotionMarker.scope === 'catalog_offering'
        && promotionMarker.status === 'succeeded'
        && promotionMarker.resultHash !== undefined
        ? { state: 'promoted' as const, evidenceDigest: promotionMarker.resultHash }
        : undefined
    if (promotion === undefined) return { kind: 'conflict' as const }

    const result = row.result
    const receipt = result !== undefined && 'receipt' in result ? result.receipt : undefined
    const knownUnpaidRefusal = result?.kind === 'refused'
      ? await knownUnpaidSellerCanaryRefusal(ctx, row)
      : undefined
    const safeBeforeReleaseRefusal = result?.kind === 'refused'
      ? await safeBeforeReleaseSellerCanaryRefusal(ctx, row)
      : undefined
    return {
      kind: 'available' as const,
      canaryRef: canary.canaryRef,
      callRef: canary.callRef,
      toolRef: canary.toolRef,
      offeringRef: canary.offeringRef,
      offeringRevision: canary.offeringRevision,
      publicationRef: canary.publicationRef,
      publicationRevision: canary.publicationRevision,
      state: row.state,
      ...(result === undefined ? {} : { resultKind: result.kind }),
      ...(row.evidenceHash === undefined ? {} : { evidenceHash: row.evidenceHash }),
      ...(row.attemptRef === undefined ? {} : { attemptRef: row.attemptRef }),
      ...(receipt === undefined || receipt.commercialModel !== 'seller_canary_x402'
        ? {}
        : {
            receipt: {
              receiptRef: receipt.receiptRef,
              state: receipt.state,
              network: receipt.network,
              asset: receipt.asset,
              ...(receipt.paymentIdentifier === undefined ? {} : { paymentIdentifier: receipt.paymentIdentifier }),
              ...(receipt.settlementTransactionHash === undefined ? {} : { settlementTransactionHash: receipt.settlementTransactionHash }),
              ...(receipt.externalSettlementRef === undefined ? {} : { externalSettlementRef: receipt.externalSettlementRef }),
              evidenceHash: receipt.evidenceHash,
              issuedAt: receipt.issuedAt,
              ...(receipt.refundState === undefined ? {} : { refundState: receipt.refundState }),
              ...(receipt.lossState === undefined ? {} : { lossState: receipt.lossState }),
            },
          }),
      ...(result?.kind === 'reconciliation_required'
        ? { reconciliation: structuredClone(result.evidence) }
        : {}),
      ...(result?.kind === 'refused'
        ? {
            refusal: {
              code: result.code,
              retryable: knownUnpaidRefusal !== undefined || safeBeforeReleaseRefusal !== undefined,
              ...(knownUnpaidRefusal !== undefined
                ? { retryKind: 'pre_claim_rearm' as const }
                : safeBeforeReleaseRefusal !== undefined
                  ? { retryKind: 'safe_before_release_resume' as const }
                  : {}),
              ...(safeBeforeReleaseRefusal !== undefined
                ? { nextAction: SELLER_CANARY_ROUTE_SIGNING_UNAVAILABLE_NEXT_ACTION }
                : result.nextAction === undefined ? {} : { nextAction: result.nextAction }),
            },
          }
        : {}),
      promotion,
      updatedAt: row.updatedAt,
    }
  },
})
