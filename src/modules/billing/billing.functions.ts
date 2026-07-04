import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import {
  callPublicSourceMutation,
  callPublicSourceQuery,
  callSourceMutation,
  callSourceQuery,
  ConvexSourceError,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'
import { sourceWriteAdmissionFromContext, sourceWriteAdmissionFromRequest } from '@/lib/server/source-write-admission'
import { brandNonEmpty } from '@/modules/common/ids'
import type { AuditEventContract } from '@/modules/observability/public'
import { SourceWriteAdmissionError, type SourceWriteAdmission } from '@/modules/security/source-write-admission'
import {
  disablePaidActivation,
  markBillingNoRepair,
  readAdminBillingProjection,
  readOwnerBillingProjection,
  readReceipt,
  recordBillingEvidence,
  retryBillingReconciliation,
  startCustomerPortal,
  startPaidActivation,
  type AdminBillingProjection,
  type BillingAdminAuthority,
  type BillingOffer,
  type BillingOperation,
  type BillingSourceState,
  type BillingReceipt,
  type BillingReconciliation,
  type BillingSupportRecord,
  type OwnerBillingProjection,
  type PublicPaidActivationProjection,
} from '@/modules/billing/public'

const emptyBillingSourceState: BillingSourceState = {
  offers: [],
  operations: [],
  providerEvents: [],
  receipts: [],
  reconciliations: [],
  supportRecords: [],
}

const publishOfferSchema = z.object({
  businessId: z.string().min(1),
  publicName: z.string().min(1).max(120),
  publicDescription: z.string().min(1).max(280),
  publicCtaLabel: z.string().min(1).max(80).default('Start activation'),
  planId: z.string().min(1).max(160),
  priceSummary: z.string().min(1).max(120),
  termsSummary: z.string().min(1).max(220),
})

const startActivationSchema = z.object({
  offerId: z.string().min(1).optional(),
})

const operationSchema = z.object({
  operationId: z.string().min(1),
})

const receiptSchema = z.object({
  receiptId: z.string().min(1),
})

const providerEvidenceSchema = z.object({
  businessId: z.string().min(1),
  provider: z.enum(['autumn_cloud', 'stripe_psp']).default('autumn_cloud'),
  connectionStatus: z.enum(['ready', 'unavailable']),
  evidenceSource: z.enum(['provider_readback', 'route_verification', 'env']),
  providerObjectId: z.string().min(1).optional(),
  routeEvidenceRef: z.string().min(1).optional(),
  payloadHash: z.string().min(1).optional(),
  redactedPayloadJson: z.string().min(1).optional(),
  operatorNextAction: z.string().min(1).max(500),
})

const noRepairSchema = z.object({
  businessId: z.string().min(1),
  operationId: z.string().min(1).optional(),
  reconciliationId: z.string().min(1).optional(),
  reason: z.string().min(1).max(500),
  evidenceRefs: z.array(z.string().min(1)).max(20).default([]),
})

const disableSchema = z.object({
  businessId: z.string().min(1),
  reason: z.string().min(1).max(500),
  evidenceRefs: z.array(z.string().min(1)).max(20).default([]),
})

const providerEventSchema = z.object({
  providerEventId: z.string().min(1),
  eventType: z.string().min(1),
  payloadHash: z.string().min(1),
  redactedPayloadJson: z.string().min(1),
  providerCustomerId: z.string().min(1).optional(),
  providerSessionId: z.string().min(1).optional(),
  providerSubscriptionId: z.string().min(1).optional(),
  operationId: z.string().min(1).optional(),
  planId: z.string().min(1).optional(),
  providerStatus: z
    .enum(['active', 'past_due', 'payment_failed', 'refunded', 'disputed', 'chargeback', 'cancelled', 'expired', 'requires_action'])
    .optional(),
  receipt: z
    .object({
      providerReceiptId: z.string().min(1),
      invoiceUrl: z.url().optional(),
      amountSummary: z.string().min(1).optional(),
      issuedAt: z.number(),
      status: z.enum(['paid', 'refunded', 'disputed', 'chargeback']),
    })
    .optional(),
})

type BrowserMutationAdmission = {
  operationKey: string
  correlationId: string
  sourceWrite?: SourceWriteAdmission
}

type BillingServerErrorResult = {
  kind: 'error'
  code: string
  retryable: boolean
  reason: string
}

export type OwnerBillingServerReadback = {
  publicActivation: PublicPaidActivationProjection
  owner: OwnerBillingProjection
  ownerOffers: Array<{
    id: BillingOffer['id']
    name: string
    description: string
    ctaLabel: string
    priceSummary: string
    termsSummary: string
    updatedAt: number
  }>
  latestOperation?: OwnerBillingProjection['operations'][number]
}

export type OwnerBillingServerResult =
  | {
      kind: 'ok'
      readback: OwnerBillingServerReadback
    }
  | BillingServerErrorResult

export type OwnerBillingMutationServerResult =
  | {
      kind: 'ok'
      code: string
      readback: OwnerBillingServerReadback
      operation?: BillingOperation
      receipt?: BillingReceipt
    }
  | BillingServerErrorResult

export type OwnerBillingReceiptServerResult =
  | {
      kind: 'ok'
      receipt: BillingReceipt
    }
  | BillingServerErrorResult

export type AdminBillingServerResult =
  | {
      kind: 'allowed'
      httpStatus: 200
      generatedAt: number
      actorRef: string
      projection: AdminBillingProjection
      state: BillingSourceState
    }
  | {
      kind: 'denied'
      httpStatus: 401 | 403
      reason: 'missing_membership' | 'inactive_membership' | 'action_not_allowed'
      generatedAt: number
      publicMessage: string
      projection: AdminBillingProjection
      state: BillingSourceState
    }

export type AdminBillingMutationServerResult =
  | {
      kind: 'ok'
      code: string
      projection: AdminBillingProjection
      reconciliation?: BillingReconciliation
      supportRecord?: BillingSupportRecord
    }
  | BillingServerErrorResult

type OwnerBillingStateResult =
  | {
      kind: 'ok'
      ownerId: string
      businessId: string
      state: BillingSourceState
    }
  | BillingServerErrorResult

type SourceBillingProjectionResult =
  | ({ kind: 'ok'; ownerId: string; businessId: string } & OwnerBillingServerReadback)
  | BillingServerErrorResult

type SourcePublicPaidActivationProjectionResult =
  | {
      kind: 'ok'
      publicActivation: PublicPaidActivationProjection
    }
  | BillingServerErrorResult

type AdminBillingStateSourceResult =
  | {
      kind: 'allowed'
      httpStatus: 200
      generatedAt: number
      actorRef: string
      state: BillingSourceState
    }
  | {
      kind: 'denied'
      httpStatus: 401 | 403
      reason: 'missing_membership' | 'inactive_membership' | 'action_not_allowed'
      generatedAt: number
      publicMessage: string
      state: BillingSourceState
    }

type BillingPersistResult =
  | {
      kind: 'ok'
      code: string
      state: BillingSourceState
    }
  | BillingServerErrorResult

const readOwnerBillingStateQuery = sourceQuery<Record<string, never>, OwnerBillingStateResult>('billing:readCurrentOwnerBillingState')
const readOwnerBillingProjectionQuery = sourceQuery<Record<string, never>, SourceBillingProjectionResult>('billing:readCurrentOwnerBillingProjection')
const readPublicPaidActivationProjectionQuery = sourceQuery<
  { businessId: string },
  SourcePublicPaidActivationProjectionResult
>('billing:readPublicPaidActivationProjection')
const readAdminBillingStateQuery = sourceQuery<{ businessId?: string; operationId?: string }, AdminBillingStateSourceResult>(
  'billing:readAdminBillingState'
)
const persistOwnerBillingStateMutation = sourceMutation<
  { state: BillingSourceState; auditEvents: readonly AuditEventContract[] } & BrowserMutationAdmission,
  BillingPersistResult
>('billing:persistCurrentOwnerBillingState')
const persistAdminBillingStateMutation = sourceMutation<
  { state: BillingSourceState; auditEvents: readonly AuditEventContract[] } & BrowserMutationAdmission,
  BillingPersistResult
>('billing:persistAdminBillingState')
const publishBillingOfferMutation = sourceMutation<z.infer<typeof publishOfferSchema> & BrowserMutationAdmission, BillingPersistResult>(
  'billing:publishBillingOffer'
)
const recordBillingReturnMutation = sourceMutation<
  { operationId: string; returnedPath: string } & BrowserMutationAdmission,
  BillingPersistResult
>('billing:recordCurrentOwnerBillingReturn')
const ingestProviderEventMutation = sourceMutation<z.infer<typeof providerEventSchema> & BrowserMutationAdmission, BillingPersistResult>(
  'billing:ingestAutumnBillingProviderEvent'
)

export const readCurrentOwnerBillingServer = createServerFn().handler(() => readCurrentOwnerBillingThroughSource())

export const readPublicPaidActivationServer = createServerFn()
  .validator((data) => z.object({ targetRef: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => readPublicPaidActivationThroughSource(data.targetRef))

export const startCurrentOwnerPaidActivationServer = createServerFn({ method: 'POST' })
  .validator((data) => startActivationSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => startCurrentOwnerPaidActivationThroughSource(data, context))

export const openCurrentOwnerBillingPortalServer = createServerFn({ method: 'POST' })
  .validator((data) => operationSchema.parse(data))
  .handler(async ({ data, context }) => openCurrentOwnerBillingPortalThroughSource(data, context))

export const recordCurrentOwnerBillingReturnServer = createServerFn({ method: 'POST' })
  .validator((data) => operationSchema.extend({ returnedPath: z.string().min(1) }).parse(data))
  .handler(async ({ data, context }) => recordCurrentOwnerBillingReturnThroughSource(data, context))

export const readCurrentOwnerBillingReceiptServer = createServerFn()
  .validator((data) => receiptSchema.parse(data))
  .handler(async ({ data }) => readCurrentOwnerBillingReceiptThroughSource(data))

export const readAdminBillingServer = createServerFn()
  .validator((data) => z.object({ businessId: z.string().min(1).optional(), operationId: z.string().min(1).optional() }).parse(data ?? {}))
  .handler(async ({ data }) => readAdminBillingThroughSource(data))

export const publishAdminBillingOfferServer = createServerFn({ method: 'POST' })
  .validator((data) => publishOfferSchema.parse(data))
  .handler(async ({ data, context }) => publishAdminBillingOfferThroughSource(data, context))

export const reconcileAdminBillingOperationServer = createServerFn({ method: 'POST' })
  .validator((data) => operationSchema.extend({ businessId: z.string().min(1) }).parse(data))
  .handler(async ({ data, context }) => reconcileAdminBillingOperationThroughSource(data, context))

export const recordAdminBillingEvidenceServer = createServerFn({ method: 'POST' })
  .validator((data) => providerEvidenceSchema.parse(data))
  .handler(async ({ data, context }) => recordAdminBillingEvidenceThroughSource(data, context))

export const markAdminBillingNoRepairServer = createServerFn({ method: 'POST' })
  .validator((data) => noRepairSchema.parse(data))
  .handler(async ({ data, context }) => markAdminBillingNoRepairThroughSource(data, context))

export const disableAdminPaidActivationServer = createServerFn({ method: 'POST' })
  .validator((data) => disableSchema.parse(data))
  .handler(async ({ data, context }) => disableAdminPaidActivationThroughSource(data, context))

export async function readCurrentOwnerBillingThroughSource(): Promise<OwnerBillingServerResult> {
  try {
    const result = await callSourceQuery(readOwnerBillingProjectionQuery, {})
    if (result.kind === 'error') {
      return result
    }

    return {
      kind: 'ok',
      readback: {
        publicActivation: result.publicActivation,
        owner: result.owner,
        ownerOffers: result.ownerOffers,
        ...(result.latestOperation === undefined ? {} : { latestOperation: result.latestOperation }),
      },
    }
  } catch (error) {
    return sourceError(error)
  }
}

export async function readPublicPaidActivationThroughSource(
  businessId: string
): Promise<{ kind: 'ok'; publicActivation: PublicPaidActivationProjection } | BillingServerErrorResult> {
  try {
    const result = await callPublicSourceQuery(readPublicPaidActivationProjectionQuery, { businessId })
    return result
  } catch (error) {
    return sourceError(error)
  }
}

export async function startCurrentOwnerPaidActivationThroughSource(
  data: z.infer<typeof startActivationSchema>,
  context?: unknown
): Promise<OwnerBillingMutationServerResult> {
  try {
    const source = await callSourceQuery(readOwnerBillingStateQuery, {})
    if (source.kind === 'error') {
      return source
    }

    const offer = selectOwnerOffer(source.state, source.businessId, data.offerId)
    if (offer === undefined) {
      return serverError('billing_offer_unavailable', 'active_offer_not_found', false)
    }

    const operationKey = `billing:checkout:${source.businessId}:${crypto.randomUUID()}`
    const correlationId = `correlation:${operationKey}`
    const result = await startPaidActivation(source.state, {
      authority: {
        ownerId: brandNonEmpty(source.ownerId, 'OwnerId'),
        businessId: brandNonEmpty(source.businessId, 'BusinessId'),
      },
      businessId: brandNonEmpty(source.businessId, 'BusinessId'),
      ownerId: brandNonEmpty(source.ownerId, 'OwnerId'),
      offerId: offer.id,
      operationKey: brandNonEmpty(operationKey, 'OperationKey'),
      correlationId: brandNonEmpty(correlationId, 'CorrelationId'),
      appBaseUrl: readAppBaseUrl(),
      now: Date.now(),
    }, await createAutumnProviderFromServerEnv())
    if (result.kind === 'error') {
      return serverError(result.code, result.reason, result.retryable)
    }

    const persisted = await callSourceMutation(persistOwnerBillingStateMutation, {
      state: result.state,
      auditEvents: [result.auditEvent],
      ...(await billingAdmission(context, operationKey, correlationId)),
    })
    if (persisted.kind === 'error') {
      return persisted
    }

    return {
      kind: 'ok',
      code: result.code,
      readback: ownerReadbackFromState(result.state, source.businessId, source.ownerId),
      operation: result.operation,
    }
  } catch (error) {
    return sourceError(error)
  }
}

export async function openCurrentOwnerBillingPortalThroughSource(
  data: z.infer<typeof operationSchema>,
  context?: unknown
): Promise<OwnerBillingMutationServerResult> {
  try {
    const source = await callSourceQuery(readOwnerBillingStateQuery, {})
    if (source.kind === 'error') {
      return source
    }

    const operation = source.state.operations.find((candidate) => candidate.id === data.operationId)
    if (operation === undefined) {
      return serverError('billing_operation_not_found', 'operation_not_found', false)
    }

    const operationKey = `billing:portal:${data.operationId}:${crypto.randomUUID()}`
    const correlationId = `correlation:${operationKey}`
    const result = await startCustomerPortal(source.state, {
      authority: {
        ownerId: brandNonEmpty(source.ownerId, 'OwnerId'),
        businessId: operation.businessId,
      },
      businessId: operation.businessId,
      ownerId: brandNonEmpty(source.ownerId, 'OwnerId'),
      operationId: operation.id,
      operationKey: brandNonEmpty(operationKey, 'OperationKey'),
      correlationId: brandNonEmpty(correlationId, 'CorrelationId'),
      appBaseUrl: readAppBaseUrl(),
      now: Date.now(),
    }, await createAutumnProviderFromServerEnv())
    if (result.kind === 'error') {
      return serverError(result.code, result.reason, result.retryable)
    }

    const persisted = await callSourceMutation(persistOwnerBillingStateMutation, {
      state: result.state,
      auditEvents: [result.auditEvent],
      ...(await billingAdmission(context, operationKey, correlationId)),
    })
    if (persisted.kind === 'error') {
      return persisted
    }

    return {
      kind: 'ok',
      code: result.code,
      readback: ownerReadbackFromState(result.state, source.businessId, source.ownerId),
      operation: result.operation,
    }
  } catch (error) {
    return sourceError(error)
  }
}

export async function recordCurrentOwnerBillingReturnThroughSource(
  data: z.infer<typeof operationSchema> & { returnedPath: string },
  context?: unknown
): Promise<OwnerBillingMutationServerResult> {
  const operationKey = `billing:return:${data.operationId}:${crypto.randomUUID()}`
  const correlationId = `correlation:${operationKey}`
  try {
    const persisted = await callSourceMutation(recordBillingReturnMutation, {
      operationId: data.operationId,
      returnedPath: data.returnedPath,
      ...(await billingAdmission(context, operationKey, correlationId)),
    })
    if (persisted.kind === 'error') {
      return persisted
    }

    const operation = persisted.state.operations.find((candidate) => candidate.id === data.operationId)
    if (operation === undefined) {
      return serverError('billing_operation_not_found', 'operation_not_found', false)
    }

    return {
      kind: 'ok',
      code: persisted.code,
      readback: ownerReadbackFromState(persisted.state, operation.businessId, operation.ownerId),
      operation,
    }
  } catch (error) {
    return sourceError(error)
  }
}

export async function readCurrentOwnerBillingReceiptThroughSource(
  data: z.infer<typeof receiptSchema>
): Promise<OwnerBillingReceiptServerResult> {
  try {
    const source = await callSourceQuery(readOwnerBillingStateQuery, {})
    if (source.kind === 'error') {
      return source
    }

    const result = readReceipt(source.state, {
      authority: {
        ownerId: brandNonEmpty(source.ownerId, 'OwnerId'),
        businessId: brandNonEmpty(source.businessId, 'BusinessId'),
      },
      businessId: brandNonEmpty(source.businessId, 'BusinessId'),
      ownerId: brandNonEmpty(source.ownerId, 'OwnerId'),
      receiptId: brandNonEmpty(data.receiptId, 'BillingReceiptId'),
    })
    if (result.kind === 'error') {
      return serverError(result.code, result.reason, result.retryable)
    }

    return { kind: 'ok', receipt: result.receipt }
  } catch (error) {
    return sourceError(error)
  }
}

export async function readAdminBillingThroughSource(
  filter: { businessId?: string | undefined; operationId?: string | undefined } = {}
): Promise<AdminBillingServerResult> {
  try {
    const result = await callSourceQuery(readAdminBillingStateQuery, compactAdminFilter(filter))
    if (result.kind === 'denied') {
      return {
        ...result,
        projection: readAdminBillingProjection(emptyBillingSourceState, 'business:unknown' as AdminBillingProjection['businessId'], undefined),
      }
    }

    const businessId = selectAdminBusinessId(result.state, filter)
    return {
      ...result,
      projection: readAdminBillingProjection(result.state, businessId, adminAuthority(result.actorRef)),
    }
  } catch {
    return {
      kind: 'denied',
      httpStatus: 401,
      reason: 'missing_membership',
      generatedAt: Date.now(),
      publicMessage: 'Admin billing reconstruction requires source access.',
      projection: readAdminBillingProjection(emptyBillingSourceState, 'business:unknown' as AdminBillingProjection['businessId'], undefined),
      state: emptyBillingSourceState,
    }
  }
}

export async function publishAdminBillingOfferThroughSource(
  data: z.infer<typeof publishOfferSchema>,
  context?: unknown
): Promise<AdminBillingMutationServerResult> {
  const operationKey = `billing:offer:${data.businessId}:${crypto.randomUUID()}`
  const correlationId = `correlation:${operationKey}`
  try {
    const result = await callSourceMutation(publishBillingOfferMutation, {
      ...data,
      ...(await billingAdmission(context, operationKey, correlationId)),
    })
    if (result.kind === 'error') {
      return result
    }

    return {
      kind: 'ok',
      code: result.code,
      projection: readAdminBillingProjection(result.state, brandNonEmpty(data.businessId, 'BusinessId'), adminAuthority('current_admin')),
    }
  } catch (error) {
    return sourceError(error)
  }
}

export async function reconcileAdminBillingOperationThroughSource(
  data: { businessId: string; operationId: string },
  context?: unknown
): Promise<AdminBillingMutationServerResult> {
  try {
    const source = await callSourceQuery(readAdminBillingStateQuery, { operationId: data.operationId })
    if (source.kind === 'denied') {
      return serverError('billing_operator_denied', source.publicMessage, false)
    }

    const operationKey = `billing:reconcile:${data.operationId}:${crypto.randomUUID()}`
    const correlationId = `correlation:${operationKey}`
    const result = await retryBillingReconciliation(source.state, {
      authority: adminAuthority(source.actorRef),
      businessId: brandNonEmpty(data.businessId, 'BusinessId'),
      operationId: brandNonEmpty(data.operationId, 'BillingOperationId'),
      operationKey: brandNonEmpty(operationKey, 'OperationKey'),
      correlationId: brandNonEmpty(correlationId, 'CorrelationId'),
      now: Date.now(),
    }, await createAutumnProviderFromServerEnv())
    if (result.kind === 'error') {
      return serverError(result.code, result.reason, result.retryable)
    }

    const persisted = await callSourceMutation(persistAdminBillingStateMutation, {
      state: result.state,
      auditEvents: [result.auditEvent],
      ...(await billingAdmission(context, operationKey, correlationId)),
    })
    if (persisted.kind === 'error') {
      return persisted
    }

    return {
      kind: 'ok',
      code: result.code,
      projection: readAdminBillingProjection(result.state, brandNonEmpty(data.businessId, 'BusinessId'), adminAuthority(source.actorRef)),
      reconciliation: result.reconciliation,
    }
  } catch (error) {
    return sourceError(error)
  }
}

export async function recordAdminBillingEvidenceThroughSource(
  data: z.infer<typeof providerEvidenceSchema>,
  context?: unknown
): Promise<AdminBillingMutationServerResult> {
  try {
    const source = await callSourceQuery(readAdminBillingStateQuery, { businessId: data.businessId })
    if (source.kind === 'denied') {
      return serverError('billing_operator_denied', source.publicMessage, false)
    }

    const operationKey = `billing:evidence:${data.businessId}:${crypto.randomUUID()}`
    const correlationId = `correlation:${operationKey}`
    const result = recordBillingEvidence(source.state, {
      authority: adminAuthority(source.actorRef),
      businessId: brandNonEmpty(data.businessId, 'BusinessId'),
      provider: data.provider,
      connectionStatus: data.connectionStatus,
      evidenceSource: data.evidenceSource,
      ...(data.providerObjectId === undefined ? {} : { providerObjectId: data.providerObjectId }),
      ...(data.routeEvidenceRef === undefined ? {} : { routeEvidenceRef: data.routeEvidenceRef }),
      ...(data.payloadHash === undefined ? {} : { payloadHash: brandNonEmpty(data.payloadHash, 'SourceHash') }),
      ...(data.redactedPayloadJson === undefined ? {} : { redactedPayloadJson: data.redactedPayloadJson }),
      operatorNextAction: data.operatorNextAction,
      operationKey: brandNonEmpty(operationKey, 'OperationKey'),
      correlationId: brandNonEmpty(correlationId, 'CorrelationId'),
      now: Date.now(),
    })
    if (result.kind === 'error') {
      return serverError(result.code, result.reason, result.retryable)
    }

    const persisted = await callSourceMutation(persistAdminBillingStateMutation, {
      state: result.state,
      auditEvents: [result.auditEvent],
      ...(await billingAdmission(context, operationKey, correlationId)),
    })
    if (persisted.kind === 'error') {
      return persisted
    }

    return {
      kind: 'ok',
      code: result.code,
      projection: readAdminBillingProjection(result.state, brandNonEmpty(data.businessId, 'BusinessId'), adminAuthority(source.actorRef)),
      supportRecord: result.supportRecord,
    }
  } catch (error) {
    return sourceError(error)
  }
}

export async function markAdminBillingNoRepairThroughSource(
  data: z.infer<typeof noRepairSchema>,
  context?: unknown
): Promise<AdminBillingMutationServerResult> {
  try {
    const source = await callSourceQuery(readAdminBillingStateQuery, compactAdminFilter(data))
    if (source.kind === 'denied') {
      return serverError('billing_operator_denied', source.publicMessage, false)
    }

    const operationKey = `billing:no-repair:${data.businessId}:${crypto.randomUUID()}`
    const correlationId = `correlation:${operationKey}`
    const result = markBillingNoRepair(source.state, {
      authority: adminAuthority(source.actorRef),
      businessId: brandNonEmpty(data.businessId, 'BusinessId'),
      ...(data.operationId === undefined ? {} : { operationId: brandNonEmpty(data.operationId, 'BillingOperationId') }),
      ...(data.reconciliationId === undefined ? {} : { reconciliationId: brandNonEmpty(data.reconciliationId, 'BillingReconciliationId') }),
      reason: data.reason,
      evidenceRefs: data.evidenceRefs,
      operationKey: brandNonEmpty(operationKey, 'OperationKey'),
      correlationId: brandNonEmpty(correlationId, 'CorrelationId'),
      now: Date.now(),
    })
    if (result.kind === 'error') {
      return serverError(result.code, result.reason, result.retryable)
    }

    const persisted = await callSourceMutation(persistAdminBillingStateMutation, {
      state: result.state,
      auditEvents: [result.auditEvent],
      ...(await billingAdmission(context, operationKey, correlationId)),
    })
    if (persisted.kind === 'error') {
      return persisted
    }

    return {
      kind: 'ok',
      code: result.code,
      projection: readAdminBillingProjection(result.state, brandNonEmpty(data.businessId, 'BusinessId'), adminAuthority(source.actorRef)),
      supportRecord: result.supportRecord,
    }
  } catch (error) {
    return sourceError(error)
  }
}

export async function disableAdminPaidActivationThroughSource(
  data: z.infer<typeof disableSchema>,
  context?: unknown
): Promise<AdminBillingMutationServerResult> {
  try {
    const source = await callSourceQuery(readAdminBillingStateQuery, { businessId: data.businessId })
    if (source.kind === 'denied') {
      return serverError('billing_operator_denied', source.publicMessage, false)
    }

    const operationKey = `billing:disable:${data.businessId}:${crypto.randomUUID()}`
    const correlationId = `correlation:${operationKey}`
    const result = disablePaidActivation(source.state, {
      authority: adminAuthority(source.actorRef),
      businessId: brandNonEmpty(data.businessId, 'BusinessId'),
      reason: data.reason,
      evidenceRefs: data.evidenceRefs,
      operationKey: brandNonEmpty(operationKey, 'OperationKey'),
      correlationId: brandNonEmpty(correlationId, 'CorrelationId'),
      now: Date.now(),
    })
    if (result.kind === 'error') {
      return serverError(result.code, result.reason, result.retryable)
    }

    const persisted = await callSourceMutation(persistAdminBillingStateMutation, {
      state: result.state,
      auditEvents: [result.auditEvent],
      ...(await billingAdmission(context, operationKey, correlationId)),
    })
    if (persisted.kind === 'error') {
      return persisted
    }

    return {
      kind: 'ok',
      code: result.code,
      projection: readAdminBillingProjection(result.state, brandNonEmpty(data.businessId, 'BusinessId'), adminAuthority(source.actorRef)),
      supportRecord: result.supportRecord,
    }
  } catch (error) {
    return sourceError(error)
  }
}

export async function admitAutumnBillingWebhookThroughSource(
  data: z.infer<typeof providerEventSchema>,
  options: { request: Request; env?: Record<string, string | undefined> }
): Promise<BillingPersistResult> {
  const operationKey = `billing:webhook:${data.payloadHash}`
  const correlationId = `correlation:${operationKey}`
  try {
    return await callPublicSourceMutation(ingestProviderEventMutation, {
      ...data,
      operationKey,
      correlationId,
      sourceWrite: await sourceWriteAdmissionFromRequest({
        request: options.request,
        scope: 'billing',
        operationKey,
        correlationId,
        ...(options.env === undefined ? {} : { env: options.env }),
      }),
    })
  } catch (error) {
    return sourceError(error)
  }
}

function selectOwnerOffer(state: BillingSourceState, businessId: string, offerId?: string | undefined): BillingOffer | undefined {
  const offers = state.offers.filter((offer) => offer.businessId === businessId && offer.status === 'active')
  return offerId === undefined ? offers[0] : offers.find((offer) => offer.id === offerId)
}

function ownerReadbackFromState(state: BillingSourceState, businessId: string, ownerId: string): OwnerBillingServerReadback {
  const owner = readOwnerBillingProjection(state, brandNonEmpty(businessId, 'BusinessId'), brandNonEmpty(ownerId, 'OwnerId'))
  const latestOperation = owner.operations.reduce<OwnerBillingProjection['operations'][number] | undefined>((latest, operation) => {
    if (latest === undefined) {
      return operation
    }
    if (operation.updatedAt !== latest.updatedAt) {
      return operation.updatedAt > latest.updatedAt ? operation : latest
    }
    return operation.createdAt > latest.createdAt ? operation : latest
  }, undefined)
  const ownerOffers: {
    id: BillingOffer['id']
    name: string
    description: string
    ctaLabel: string
    priceSummary: string
    termsSummary: string
    updatedAt: number
  }[] = []
  for (const offer of state.offers) {
    if (offer.businessId !== businessId || offer.status !== 'active') {
      continue
    }
    ownerOffers.push({
      id: offer.id,
      name: offer.publicName,
      description: offer.publicDescription,
      ctaLabel: offer.publicCtaLabel,
      priceSummary: offer.priceSummary,
      termsSummary: offer.termsSummary,
      updatedAt: offer.updatedAt,
    })
  }
  return {
    publicActivation: {
      businessId: brandNonEmpty(businessId, 'BusinessId'),
      available: false,
      offers: [],
      reason: 'degraded',
    },
    owner,
    ownerOffers,
    ...(latestOperation === undefined ? {} : { latestOperation }),
  }
}

async function billingAdmission(context: unknown, operationKey: string, correlationId: string): Promise<BrowserMutationAdmission> {
  return {
    operationKey,
    correlationId,
    sourceWrite: await sourceWriteAdmissionFromContext({
      context,
      scope: 'billing',
      operationKey,
      correlationId,
    }),
  }
}

function adminAuthority(actorRef: string): BillingAdminAuthority {
  return {
    role: 'owner_admin',
    clerkUserId: actorRef,
  }
}

function compactAdminFilter(filter: {
  businessId?: string | undefined
  operationId?: string | undefined
}): { businessId?: string; operationId?: string } {
  return {
    ...(filter.businessId === undefined || filter.businessId.trim().length === 0 ? {} : { businessId: filter.businessId.trim() }),
    ...(filter.operationId === undefined || filter.operationId.trim().length === 0 ? {} : { operationId: filter.operationId.trim() }),
  }
}

function selectAdminBusinessId(
  state: BillingSourceState,
  filter: { businessId?: string | undefined; operationId?: string | undefined }
): AdminBillingProjection['businessId'] {
  if (filter.businessId !== undefined) {
    return brandNonEmpty(filter.businessId, 'BusinessId')
  }
  const operation = filter.operationId === undefined ? undefined : state.operations.find((candidate) => candidate.id === filter.operationId)
  return operation?.businessId ?? state.operations[0]?.businessId ?? state.offers[0]?.businessId ?? ('business:unknown' as AdminBillingProjection['businessId'])
}

async function createAutumnProviderFromServerEnv() {
  if (import.meta.env.SSR) {
    const { createAutumnProviderFromEnv } = await import('@/lib/server/billing-provider')
    return createAutumnProviderFromEnv()
  }

  throw new Error('Autumn billing provider is only available on the server.')
}

function readAppBaseUrl(): string {
  const explicit = readEnv('AE_APP_BASE_URL') ?? readEnv('VITE_AE_APP_BASE_URL')
  if (explicit !== undefined) {
    return explicit
  }

  const vercelUrl = readEnv('VERCEL_URL')
  return vercelUrl === undefined ? 'http://127.0.0.1:3200' : `https://${vercelUrl}`
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]
  return value === undefined || value.trim().length === 0 ? undefined : value.trim()
}

function sourceError(error: unknown): BillingServerErrorResult {
  if (error instanceof ConvexSourceError) {
    return serverError(error.code, error.message, false)
  }
  if (error instanceof SourceWriteAdmissionError) {
    return serverError(error.code, error.message, false)
  }
  if (error instanceof Error) {
    return serverError('billing_source_unavailable', error.message, true)
  }
  return serverError('billing_source_unavailable', 'Billing source is unavailable.', true)
}

function serverError(code: string, reason: string, retryable: boolean): BillingServerErrorResult {
  return {
    kind: 'error',
    code,
    retryable,
    reason,
  }
}
