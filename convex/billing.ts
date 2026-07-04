import type { UserIdentity } from 'convex/server'
import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

import { resolveAdminAuthority, resolveBusinessActor } from './authz'
import {
  loadAdminBillingSlice,
  loadBillingBusinessSlice,
  loadBillingOperationSlice,
  loadOwnerBillingSlice,
  persistBillingSlice,
} from './billingStore'
import { requireSourceWrite, sourceWriteArgs } from './sourceWriteAdmission'
import { runtimeDb } from './source_state'
import type { RuntimeDb, RuntimeDocument } from './source_state'
import { literalUnion } from '../src/modules/common/convex-literals'
import { brandNonEmpty, type BusinessId } from '../src/modules/common/ids'
import { stableHash } from '../src/modules/common/stable-hash'
import type { AuditEventContract } from '../src/modules/observability/public'
import {
  BillingOfferStatusValues,
  BillingOperationKindValues,
  BillingOperationStatusValues,
  BillingProviderEventRetrievalStatusValues,
  BillingProviderEventStatusValues,
  BillingProviderValues,
  BillingReconciliationStatusValues,
  BillingSupportCapabilityValues,
  BillingSupportStatusValues,
  ingestBillingProviderEvent,
  recordBillingEvidence as recordBillingEvidenceDomain,
  recordBillingReturn,
  readAdminBillingProjection,
  readOwnerBillingProjection,
  readPublicPaidActivationProjection as readPublicPaidActivationProjectionDomain,
  upsertBillingOffer,
} from '../src/modules/billing/public'
import type {
  BillingAdminAuthority,
  BillingOffer,
  BillingOwnerAuthority,
  BillingSourceState,
} from '../src/modules/billing/public'

const billingProvider = literalUnion(BillingProviderValues)
const billingOperationKind = literalUnion(BillingOperationKindValues)
const billingOperationStatus = literalUnion(BillingOperationStatusValues)
const billingProviderEventStatus = literalUnion(BillingProviderEventStatusValues)
const billingProviderEventRetrievalStatus = literalUnion(BillingProviderEventRetrievalStatusValues)
const billingOfferStatus = literalUnion(BillingOfferStatusValues)
const billingReconciliationStatus = literalUnion(BillingReconciliationStatusValues)
const billingSupportStatus = literalUnion(BillingSupportStatusValues)
const billingSupportCapability = literalUnion(BillingSupportCapabilityValues)

const providerRef = v.object({
  provider: billingProvider,
  objectId: v.string(),
  payloadHash: v.string(),
  readAt: v.number(),
})

const billingOffer = v.object({
  id: v.string(),
  businessId: v.string(),
  status: billingOfferStatus,
  publicName: v.string(),
  publicDescription: v.string(),
  publicCtaLabel: v.string(),
  planId: v.string(),
  provider: v.literal('autumn_cloud'),
  priceSummary: v.string(),
  termsSummary: v.string(),
  sourceHash: v.string(),
  updatedAt: v.number(),
})

const billingOperation = v.object({
  id: v.string(),
  businessId: v.string(),
  ownerId: v.string(),
  offerId: v.string(),
  operationKey: v.string(),
  correlationId: v.string(),
  operationKind: billingOperationKind,
  provider: billingProvider,
  status: billingOperationStatus,
  providerCustomerId: v.string(),
  providerSessionId: v.optional(v.string()),
  providerSubscriptionId: v.optional(v.string()),
  providerRefs: v.array(providerRef),
  checkoutUrl: v.optional(v.string()),
  portalUrl: v.optional(v.string()),
  receiptIds: v.array(v.string()),
  supportRecordIds: v.array(v.string()),
  returnPath: v.string(),
  cancelPath: v.string(),
  retryCount: v.number(),
  retryAfter: v.optional(v.number()),
  reason: v.optional(v.string()),
  evidenceRefs: v.array(v.string()),
  sourceHash: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
})

const billingReceipt = v.object({
  id: v.string(),
  operationId: v.string(),
  businessId: v.string(),
  provider: billingProvider,
  providerReceiptId: v.string(),
  invoiceUrl: v.optional(v.string()),
  amountSummary: v.optional(v.string()),
  status: v.union(v.literal('paid'), v.literal('refunded'), v.literal('disputed'), v.literal('chargeback')),
  payloadHash: v.string(),
  providerEvidenceRefs: v.array(v.string()),
  paidStateTransition: v.string(),
  refundReversalDisputeRefs: v.array(v.string()),
  correlationId: v.string(),
  issuedAt: v.number(),
  recordedAt: v.number(),
})

const billingProviderEvent = v.object({
  id: v.string(),
  provider: billingProvider,
  providerEventId: v.string(),
  logicalProviderObjectKey: v.string(),
  status: billingProviderEventStatus,
  eventType: v.string(),
  providerCustomerId: v.optional(v.string()),
  providerSubscriptionId: v.optional(v.string()),
  providerSessionId: v.optional(v.string()),
  operationId: v.optional(v.string()),
  businessId: v.optional(v.string()),
  payloadHash: v.string(),
  redactedPayloadJson: v.string(),
  normalizedFieldsJson: v.string(),
  retrievalStatus: billingProviderEventRetrievalStatus,
  signatureVerified: v.boolean(),
  correlationId: v.string(),
  receivedAt: v.number(),
  reason: v.optional(v.string()),
})

const billingReconciliation = v.object({
  id: v.string(),
  operationId: v.optional(v.string()),
  businessId: v.string(),
  status: billingReconciliationStatus,
  provider: billingProvider,
  retryCount: v.number(),
  retryAfter: v.optional(v.number()),
  actorRef: v.optional(v.string()),
  reason: v.optional(v.string()),
  providerRefs: v.array(providerRef),
  evidenceRefs: v.array(v.string()),
  operatorNextAction: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
})

const billingSupportRecord = v.object({
  id: v.string(),
  operationId: v.optional(v.string()),
  businessId: v.string(),
  capability: v.optional(billingSupportCapability),
  status: billingSupportStatus,
  reason: v.string(),
  evidenceRefs: v.array(v.string()),
  primaryOwnerRef: v.optional(v.string()),
  primaryAdminOperatorRef: v.optional(v.string()),
  backupOwnerRef: v.optional(v.string()),
  backupAdminOperatorRef: v.optional(v.string()),
  supportedStage: v.optional(v.union(v.literal('internal_alpha'), v.literal('manual_support'), v.literal('public_alpha'))),
  supportedChannels: v.optional(v.array(v.string())),
  capacityThresholdJson: v.optional(v.string()),
  backlogAgeThresholdMs: v.optional(v.number()),
  phaseIncidentCountsJson: v.optional(v.string()),
  supportEscalationPath: v.optional(v.string()),
  claimDisablePath: v.optional(v.string()),
  perChannelKillRulesJson: v.optional(v.string()),
  sourceHash: v.optional(v.string()),
  correlationId: v.optional(v.string()),
  lastReviewedAt: v.optional(v.number()),
  operatorNextAction: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})

const billingSourceState = v.object({
  offers: v.array(billingOffer),
  operations: v.array(billingOperation),
  providerEvents: v.array(billingProviderEvent),
  receipts: v.array(billingReceipt),
  reconciliations: v.array(billingReconciliation),
  supportRecords: v.array(billingSupportRecord),
})

const redactedPayload = v.object({
  eventType: v.optional(v.string()),
  targetType: v.optional(v.string()),
  targetRef: v.optional(v.string()),
  reasonCode: v.optional(v.union(v.string(), v.null())),
})

const billingAuditEvent = v.object({
  eventId: v.string(),
  eventType: v.string(),
  actorKind: v.union(v.literal('owner'), v.literal('admin'), v.literal('system'), v.literal('anonymous')),
  actorRef: v.string(),
  targetType: v.string(),
  targetRef: v.string(),
  businessId: v.optional(v.string()),
  beforeState: v.string(),
  afterState: v.string(),
  idempotencyKey: v.string(),
  correlationId: v.string(),
  reasonCode: v.optional(v.string()),
  evidenceRefs: v.array(v.string()),
  redactedPayload,
  payloadHash: v.string(),
  createdAt: v.number(),
})

const ownerBillingStateResult = v.union(
  v.object({
    kind: v.literal('ok'),
    ownerId: v.string(),
    businessId: v.string(),
    state: billingSourceState,
  }),
  v.object({
    kind: v.literal('error'),
    code: v.union(v.literal('missing_auth'), v.literal('owner_not_found'), v.literal('owner_business_not_found')),
    retryable: v.boolean(),
    reason: v.string(),
  })
)

const adminBillingStateResult = v.union(
  v.object({
    kind: v.literal('allowed'),
    httpStatus: v.literal(200),
    generatedAt: v.number(),
    actorRef: v.string(),
    state: billingSourceState,
  }),
  v.object({
    kind: v.literal('denied'),
    httpStatus: v.union(v.literal(401), v.literal(403)),
    reason: v.union(v.literal('missing_membership'), v.literal('inactive_membership'), v.literal('action_not_allowed')),
    generatedAt: v.number(),
    publicMessage: v.string(),
    state: billingSourceState,
  })
)

const billingMutationResult = v.union(
  v.object({
    kind: v.literal('ok'),
    code: v.string(),
    state: billingSourceState,
  }),
  v.object({
    kind: v.literal('error'),
    code: v.string(),
    retryable: v.boolean(),
    reason: v.string(),
  })
)

const providerReceipt = v.object({
  providerReceiptId: v.string(),
  invoiceUrl: v.optional(v.string()),
  amountSummary: v.optional(v.string()),
  issuedAt: v.number(),
  status: v.union(v.literal('paid'), v.literal('refunded'), v.literal('disputed'), v.literal('chargeback')),
})

const billingEvidenceSource = v.union(v.literal('provider_readback'), v.literal('route_verification'), v.literal('env'))

export const readCurrentOwnerBillingState = queryGeneric({
  args: {},
  handler: async (ctx) => {
    const owner = await readCurrentOwner({ db: ctx.db, auth: ctx.auth })
    if (owner.kind === 'denied') {
      return ownerError(owner.reason)
    }

    const business = await readPrimaryOwnerBusiness(runtimeDb(ctx.db), owner.ownerId)
    if (business === null) {
      return ownerError('owner_business_not_found')
    }

    return {
      kind: 'ok' as const,
      ownerId: owner.ownerId,
      businessId: business._id,
      state: await loadOwnerBillingSlice(runtimeDb(ctx.db), owner.ownerId),
    }
  },
})

export const readAdminBillingState = queryGeneric({
  args: {
    businessId: v.optional(v.string()),
    operationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const db = runtimeDb(ctx.db)
    const authority = await resolveAdminAuthority({ db, auth: ctx.auth }, 'read_admin_readbacks')
    if (authority.kind === 'denied') {
      return {
        kind: 'denied' as const,
        httpStatus: authority.reason === 'missing_membership' ? 401 as const : 403 as const,
        reason: authority.reason,
        generatedAt: Date.now(),
        publicMessage: 'Admin billing reconstruction requires active source-owned membership.',
        state: emptyState(),
      }
    }

    return {
      kind: 'allowed' as const,
      httpStatus: 200 as const,
      generatedAt: Date.now(),
      actorRef: authority.membership.clerkUserId,
      state: await loadAdminBillingSlice(db, args),
    }
  },
})

export const readPublicPaidActivationProjection = queryGeneric({
  args: {
    businessId: v.string(),
  },
  handler: async (ctx, args) => {
    const businessId = brandNonEmpty(args.businessId, 'BusinessId')
    const state = await loadBillingBusinessSlice(runtimeDb(ctx.db), args.businessId)

    return {
      kind: 'ok' as const,
      publicActivation: readPublicPaidActivationProjectionDomain(state, businessId),
    }
  },
})

export const persistCurrentOwnerBillingState = mutationGeneric({
  args: {
    state: billingSourceState,
    auditEvents: v.array(billingAuditEvent),
    ...sourceWriteArgs,
    operationKey: v.string(),
    correlationId: v.string(),
  },
  handler: async (ctx, args) => {
    const sourceWrite = await requireSourceWrite(ctx, args, 'billing')
    if (sourceWrite.kind === 'rejected') {
      return mutationError('billing_csrf_rejected', sourceWrite.reason, false)
    }

    const owner = await readCurrentOwner({ db: ctx.db, auth: ctx.auth })
    if (owner.kind === 'denied') {
      return mutationError(owner.reason, owner.reason, false)
    }

    const businessIds = new Set((await readOwnerBusinesses(runtimeDb(ctx.db), owner.ownerId)).map((row) => row._id))
    const outOfScope = args.state.operations.some((operation) => operation.ownerId !== owner.ownerId || !businessIds.has(operation.businessId))
    if (outOfScope) {
      return mutationError('billing_owner_denied', 'wrong_owner', false)
    }

    await persistBillingSlice(runtimeDb(ctx.db), coerceBillingState(args.state), coerceAuditEvents(args.auditEvents))
    return { kind: 'ok' as const, code: 'billing_state_persisted', state: args.state }
  },
})

export const persistAdminBillingState = mutationGeneric({
  args: {
    state: billingSourceState,
    auditEvents: v.array(billingAuditEvent),
    ...sourceWriteArgs,
    operationKey: v.string(),
    correlationId: v.string(),
  },
  handler: async (ctx, args) => {
    const sourceWrite = await requireSourceWrite(ctx, args, 'billing')
    if (sourceWrite.kind === 'rejected') {
      return mutationError('billing_csrf_rejected', sourceWrite.reason, false)
    }

    const authority = await resolveAdminAuthority({ db: runtimeDb(ctx.db), auth: ctx.auth }, 'set_operator_control')
    if (authority.kind === 'denied') {
      return mutationError('billing_operator_denied', authority.reason, false)
    }

    await persistBillingSlice(runtimeDb(ctx.db), coerceBillingState(args.state), coerceAuditEvents(args.auditEvents))
    return { kind: 'ok' as const, code: 'billing_state_persisted', state: args.state }
  },
})

export const publishBillingOffer = mutationGeneric({
  args: {
    businessId: v.string(),
    publicName: v.string(),
    publicDescription: v.string(),
    publicCtaLabel: v.string(),
    planId: v.string(),
    priceSummary: v.string(),
    termsSummary: v.string(),
    ...sourceWriteArgs,
    operationKey: v.string(),
    correlationId: v.string(),
  },
  handler: async (ctx, args) => {
    const sourceWrite = await requireSourceWrite(ctx, args, 'billing')
    if (sourceWrite.kind === 'rejected') {
      return mutationError('billing_csrf_rejected', sourceWrite.reason, false)
    }

    const authority = await resolveAdminAuthority({ db: runtimeDb(ctx.db), auth: ctx.auth }, 'set_operator_control')
    if (authority.kind === 'denied') {
      return mutationError('billing_operator_denied', authority.reason, false)
    }

    const business = await runtimeDb(ctx.db).get(args.businessId)
    if (business === null) {
      return mutationError('billing_business_not_found', 'business_not_found', false)
    }

    const now = Date.now()
    const offer: BillingOffer = {
      id: brandNonEmpty(`billing_offer:${args.businessId}:${args.planId}`, 'BillingOfferId'),
      businessId: brandNonEmpty(args.businessId, 'BusinessId'),
      status: 'active',
      publicName: args.publicName,
      publicDescription: args.publicDescription,
      publicCtaLabel: args.publicCtaLabel,
      planId: args.planId,
      provider: 'autumn_cloud',
      priceSummary: args.priceSummary,
      termsSummary: args.termsSummary,
      sourceHash: stableHash({
        businessId: args.businessId,
        planId: args.planId,
        publicName: args.publicName,
        priceSummary: args.priceSummary,
      }),
      updatedAt: now,
    }
    const state = upsertBillingOffer(await loadBillingBusinessSlice(runtimeDb(ctx.db), args.businessId), offer)
    await persistBillingSlice(runtimeDb(ctx.db), state)
    return { kind: 'ok' as const, code: 'billing_offer_published', state }
  },
})

export const recordBillingProviderEvidence = mutationGeneric({
  args: {
    businessId: v.string(),
    provider: billingProvider,
    connectionStatus: v.union(v.literal('ready'), v.literal('unavailable')),
    evidenceSource: billingEvidenceSource,
    providerObjectId: v.optional(v.string()),
    routeEvidenceRef: v.optional(v.string()),
    payloadHash: v.optional(v.string()),
    redactedPayloadJson: v.optional(v.string()),
    operatorNextAction: v.string(),
    ...sourceWriteArgs,
    operationKey: v.string(),
    correlationId: v.string(),
  },
  handler: async (ctx, args) => {
    const sourceWrite = await requireSourceWrite(ctx, args, 'billing')
    if (sourceWrite.kind === 'rejected') {
      return mutationError('billing_csrf_rejected', sourceWrite.reason, false)
    }

    const authority = await resolveAdminAuthority({ db: runtimeDb(ctx.db), auth: ctx.auth }, 'set_operator_control')
    if (authority.kind === 'denied') {
      return mutationError('billing_operator_denied', authority.reason, false)
    }

    const result = recordBillingEvidenceDomain(await loadBillingBusinessSlice(runtimeDb(ctx.db), args.businessId), {
      authority: { role: authority.membership.role, clerkUserId: authority.membership.clerkUserId },
      businessId: brandNonEmpty(args.businessId, 'BusinessId'),
      provider: args.provider,
      connectionStatus: args.connectionStatus,
      evidenceSource: args.evidenceSource,
      ...(args.providerObjectId === undefined ? {} : { providerObjectId: args.providerObjectId }),
      ...(args.routeEvidenceRef === undefined ? {} : { routeEvidenceRef: args.routeEvidenceRef }),
      ...(args.payloadHash === undefined ? {} : { payloadHash: brandNonEmpty(args.payloadHash, 'SourceHash') }),
      ...(args.redactedPayloadJson === undefined ? {} : { redactedPayloadJson: args.redactedPayloadJson }),
      operatorNextAction: args.operatorNextAction,
      operationKey: brandNonEmpty(args.operationKey, 'OperationKey'),
      correlationId: brandNonEmpty(args.correlationId, 'CorrelationId'),
      now: Date.now(),
    })
    if (result.kind === 'error') {
      return mutationError(result.code, result.reason, result.retryable)
    }

    await persistBillingSlice(runtimeDb(ctx.db), result.state, [result.auditEvent])
    return { kind: 'ok' as const, code: result.code, state: result.state }
  },
})

export const recordCurrentOwnerBillingReturn = mutationGeneric({
  args: {
    operationId: v.string(),
    returnedPath: v.string(),
    ...sourceWriteArgs,
    operationKey: v.string(),
    correlationId: v.string(),
  },
  handler: async (ctx, args) => {
    const sourceWrite = await requireSourceWrite(ctx, args, 'billing')
    if (sourceWrite.kind === 'rejected') {
      return mutationError('billing_csrf_rejected', sourceWrite.reason, false)
    }

    const owner = await readCurrentOwner({ db: ctx.db, auth: ctx.auth })
    if (owner.kind === 'denied') {
      return mutationError(owner.reason, owner.reason, false)
    }

    const state = await loadBillingOperationSlice(runtimeDb(ctx.db), args.operationId)
    const operation = state.operations.find((candidate) => candidate.id === args.operationId)
    if (operation === undefined) {
      return mutationError('billing_operation_not_found', 'operation_not_found', false)
    }

    const result = recordBillingReturn(state, {
      authority: { ownerId: brandNonEmpty(owner.ownerId, 'OwnerId'), businessId: operation.businessId },
      businessId: operation.businessId,
      ownerId: brandNonEmpty(owner.ownerId, 'OwnerId'),
      operationId: operation.id,
      operationKey: brandNonEmpty(args.operationKey, 'OperationKey'),
      correlationId: brandNonEmpty(args.correlationId, 'CorrelationId'),
      returnedPath: args.returnedPath,
      now: Date.now(),
    })
    if (result.kind === 'error') {
      return mutationError(result.code, result.reason, result.retryable)
    }

    await persistBillingSlice(runtimeDb(ctx.db), result.state, [result.auditEvent])
    return { kind: 'ok' as const, code: result.code, state: result.state }
  },
})

export const ingestAutumnBillingProviderEvent = mutationGeneric({
  args: {
    providerEventId: v.string(),
    eventType: v.string(),
    payloadHash: v.string(),
    redactedPayloadJson: v.string(),
    providerCustomerId: v.optional(v.string()),
    providerSessionId: v.optional(v.string()),
    providerSubscriptionId: v.optional(v.string()),
    operationId: v.optional(v.string()),
    planId: v.optional(v.string()),
    providerStatus: v.optional(v.union(
      v.literal('active'),
      v.literal('past_due'),
      v.literal('payment_failed'),
      v.literal('refunded'),
      v.literal('disputed'),
      v.literal('chargeback'),
      v.literal('cancelled'),
      v.literal('expired'),
      v.literal('requires_action')
    )),
    receipt: v.optional(providerReceipt),
    ...sourceWriteArgs,
    operationKey: v.string(),
    correlationId: v.string(),
  },
  handler: async (ctx, args) => {
    const sourceWrite = await requireSourceWrite(ctx, args, 'billing')
    if (sourceWrite.kind === 'rejected') {
      return mutationError('billing_csrf_rejected', sourceWrite.reason, false)
    }

    const state = args.operationId === undefined
      ? await loadAdminBillingSlice(runtimeDb(ctx.db))
      : await loadBillingOperationSlice(runtimeDb(ctx.db), args.operationId)
    const result = ingestBillingProviderEvent(state, {
      operationKey: brandNonEmpty(args.operationKey, 'OperationKey'),
      correlationId: brandNonEmpty(args.correlationId, 'CorrelationId'),
      provider: 'autumn_cloud',
      providerEventId: args.providerEventId,
      eventType: args.eventType,
      payloadHash: brandNonEmpty(args.payloadHash, 'SourceHash'),
      redactedPayloadJson: args.redactedPayloadJson,
      signatureVerified: true,
      receivedAt: Date.now(),
      ...(args.providerCustomerId === undefined ? {} : { providerCustomerId: args.providerCustomerId }),
      ...(args.providerSessionId === undefined ? {} : { providerSessionId: args.providerSessionId }),
      ...(args.providerSubscriptionId === undefined ? {} : { providerSubscriptionId: args.providerSubscriptionId }),
      ...(args.operationId === undefined ? {} : { operationId: brandNonEmpty(args.operationId, 'BillingOperationId') }),
      ...(args.planId === undefined ? {} : { planId: args.planId }),
      ...(args.providerStatus === undefined ? {} : { providerStatus: args.providerStatus }),
      ...(args.receipt === undefined ? {} : { receipt: args.receipt }),
    })
    if (result.kind === 'error') {
      return mutationError(result.code, result.reason, result.retryable)
    }

    await persistBillingSlice(runtimeDb(ctx.db), result.state, [result.auditEvent])
    return { kind: 'ok' as const, code: result.code, state: result.state }
  },
})

export const readCurrentOwnerBillingProjection = queryGeneric({
  args: {},
  handler: async (ctx) => {
    const owner = await readCurrentOwner({ db: ctx.db, auth: ctx.auth })
    if (owner.kind === 'denied') {
      return ownerError(owner.reason)
    }

    const business = await readPrimaryOwnerBusiness(runtimeDb(ctx.db), owner.ownerId)
    if (business === null) {
      return ownerError('owner_business_not_found')
    }

    const state = await loadOwnerBillingSlice(runtimeDb(ctx.db), owner.ownerId)
    const businessId = brandNonEmpty(business._id, 'BusinessId')
    const ownerId = brandNonEmpty(owner.ownerId, 'OwnerId')
    const publicActivation = readPublicPaidActivationProjectionDomain(state, businessId)
    const ownerProjection = readOwnerBillingProjection(state, businessId, ownerId)
    const latestOperation = ownerProjection.operations.reduce((latest: (typeof ownerProjection.operations)[number] | undefined, operation) => {
      if (latest === undefined) {
        return operation
      }
      if (operation.updatedAt !== latest.updatedAt) {
        return operation.updatedAt > latest.updatedAt ? operation : latest
      }
      return operation.createdAt > latest.createdAt ? operation : latest
    }, undefined)
    return {
      kind: 'ok' as const,
      ownerId,
      businessId,
      publicActivation,
      owner: ownerProjection,
      ownerOffers: activeOwnerOffers(state.offers, businessId),
      ...(latestOperation === undefined ? {} : { latestOperation }),
    }
  },
})

function emptyState(): BillingSourceState {
  return {
    offers: [],
    operations: [],
    providerEvents: [],
    receipts: [],
    reconciliations: [],
    supportRecords: [],
  }
}

async function readCurrentOwner(ctx: {
  db: object
  auth: {
    getUserIdentity: () => Promise<UserIdentity | null>
  }
}): Promise<{ kind: 'allowed'; ownerId: string; actorRef: string } | { kind: 'denied'; reason: 'missing_auth' | 'owner_not_found' }> {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') {
    return { kind: 'denied', reason: 'missing_auth' }
  }

  const owner = await runtimeDb(ctx.db)
    .query('owners')
    .withIndex('by_clerkUserId', (query) => query.eq('clerkUserId', actor.clerkUserId))
    .unique()
  return owner === null ? { kind: 'denied', reason: 'owner_not_found' } : { kind: 'allowed', ownerId: owner._id, actorRef: actor.clerkUserId }
}

function activeOwnerOffers(offers: readonly BillingOffer[], businessId: BusinessId) {
  const result: {
    id: BillingOffer['id']
    name: string
    description: string
    ctaLabel: string
    priceSummary: string
    termsSummary: string
    updatedAt: number
  }[] = []
  for (const offer of offers) {
    if (offer.businessId !== businessId || offer.status !== 'active') {
      continue
    }
    result.push({
      id: offer.id,
      name: offer.publicName,
      description: offer.publicDescription,
      ctaLabel: offer.publicCtaLabel,
      priceSummary: offer.priceSummary,
      termsSummary: offer.termsSummary,
      updatedAt: offer.updatedAt,
    })
  }
  return result
}

async function readPrimaryOwnerBusiness(db: RuntimeDb, ownerId: string): Promise<RuntimeDocument | null> {
  return (await readOwnerBusinesses(db, ownerId)).reduce<RuntimeDocument | null>((latest, business) => {
    if (latest === null) {
      return business
    }
    return numberField(business, 'updatedAt') > numberField(latest, 'updatedAt') ? business : latest
  }, null)
}

async function readOwnerBusinesses(db: RuntimeDb, ownerId: string): Promise<RuntimeDocument[]> {
  return (await db.query('businesses').collect()).filter((row) => stringField(row, 'ownerId') === ownerId)
}

function ownerError(code: 'missing_auth' | 'owner_not_found' | 'owner_business_not_found') {
  return {
    kind: 'error' as const,
    code,
    retryable: false,
    reason: code,
  }
}

function mutationError(code: string, reason: string, retryable: boolean) {
  return {
    kind: 'error' as const,
    code,
    retryable,
    reason,
  }
}

function coerceBillingState(state: object): BillingSourceState {
  return state as BillingSourceState
}

function coerceAuditEvents(events: readonly object[]): AuditEventContract[] {
  return events as AuditEventContract[]
}

function stringField(row: RuntimeDocument, field: string): string {
  const value = row[field]
  return typeof value === 'string' ? value : ''
}

function numberField(row: RuntimeDocument, field: string): number {
  const value = row[field]
  return typeof value === 'number' ? value : 0
}
