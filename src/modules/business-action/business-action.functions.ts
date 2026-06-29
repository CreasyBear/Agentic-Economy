import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { callSourceMutation, callSourceQuery, ConvexSourceError, sourceMutation, sourceQuery } from '@/lib/server/convex-source'
import { sourceWriteAdmissionFromContext } from '@/lib/server/source-write-admission'
import type {
  AuthorizationCheckpointDecision,
  BusinessActionCard,
  BusinessActionNoRepairRecord,
  BusinessActionPrivateEvidenceRef,
  BusinessActionSupportRecord,
  BuyerMandate,
} from '@/modules/business-action/public'
import {
  BusinessActionSlug,
  createCapabilityRequest,
  createEmptyBusinessActionSourceState,
  recordActionReceipt,
  recordAuthorizationCheckpoint,
  recordBusinessActionResultArtifact,
  recordGuardrailDecisionEvidence,
  recordHermesEvidenceEvent,
  type BusinessActionOwnerAuthority,
  type BusinessActionSourceState,
} from '@/modules/business-action/public'
import type {
  BusinessActionCardId,
  BusinessActionNoRepairId,
  BusinessActionPrivateEvidenceRefId,
  BusinessActionSupportRecordId,
  BusinessId,
  BuyerMandateId,
  CapabilityRequestId,
  AuthorizationCheckpointId,
  CorrelationId,
  OperationKey,
  OwnerId,
  SourceHash,
} from '@/modules/common/ids'
import type { SourceWriteAdmission } from '@/modules/security/source-write-admission'

const capabilityRequestSchema = z.object({
  cardId: z.string().min(1),
  mandateId: z.string().min(1),
  businessId: z.string().min(1),
  requestedBy: z.enum(['buyer', 'hermes', 'operator']).default('hermes'),
  expiresAt: z.number(),
})

const checkpointSchema = z.object({
  requestId: z.string().min(1),
  decision: z.enum(['accepted', 'refused', 'clarification_required', 'proof_gap', 'expired']),
  ownerDecisionRef: z.string().min(1).max(240),
  reasonCode: z.string().min(1).max(160),
  expiresAt: z.number(),
})

const receiptSchema = z.object({
  requestId: z.string().min(1),
})

const guardrailDecisionSchema = z.object({
  requestId: z.string().min(1),
  provider: z.enum(['nemo_guardrails', 'nemotron']),
  modelName: z.string().min(1).max(160),
  modelVersion: z.string().min(1).max(160),
  decision: z.enum(['allow', 'block', 'refusal']),
  policyHash: z.string().min(1),
  privateTraceRefHash: z.string().min(1),
  payloadHash: z.string().min(1),
})

const hermesEvidenceSchema = z.object({
  requestId: z.string().min(1),
  checkpointId: z.string().min(1),
  evidenceKind: z.enum(['scope', 'select', 'request', 'execute', 'report']),
  providerRefHash: z.string().min(1),
  payloadHash: z.string().min(1),
})

type BrowserMutationAdmission = {
  operationKey: string
  correlationId: string
  sourceWrite?: SourceWriteAdmission
}

type BusinessActionServerErrorResult = {
  kind: 'error'
  code: string
  retryable: boolean
  reason: string
  field?: string
}

type SerializableValue = string | number | boolean | null | SerializableValue[] | { [key: string]: SerializableValue }
type SerializableRecord = { [key: string]: SerializableValue }

type BusinessActionMutationServerResult =
  | {
      kind: 'ok'
      code: string
      request?: SerializableRecord
      checkpoint?: SerializableRecord
      evidence?: SerializableRecord
      receipt?: SerializableRecord
      publicReadback?: SerializableRecord
    }
  | BusinessActionServerErrorResult

type BusinessActionReceiptServerResult =
  | {
      kind: 'ok'
      receipt: SerializableRecord
      publicReadback: SerializableRecord
    }
  | BusinessActionServerErrorResult

export type OwnerBusinessActionSourceStateServerResult =
  | {
      kind: 'ok'
      state: BusinessActionSourceState
    }
  | BusinessActionServerErrorResult

export type AdminBusinessActionSourceStateServerResult =
  | {
      kind: 'allowed'
      httpStatus: 200
      generatedAt: number
      actorRef: string
      state: BusinessActionSourceState
    }
  | {
      kind: 'denied'
      httpStatus: 401 | 403
      reason: 'missing_membership' | 'inactive_membership' | 'action_not_allowed'
      generatedAt: number
      publicMessage: string
      state: BusinessActionSourceState
    }

export const businessActionSourceFunctionRefs = {
  createCapabilityRequest: sourceMutation<z.infer<typeof capabilityRequestSchema> & BrowserMutationAdmission, BusinessActionMutationServerResult>(
    'businessActions:createBusinessActionCapabilityRequest'
  ),
  recordOwnerCheckpoint: sourceMutation<z.infer<typeof checkpointSchema> & BrowserMutationAdmission, BusinessActionMutationServerResult>(
    'businessActions:recordBusinessActionOwnerCheckpoint'
  ),
  recordReceipt: sourceMutation<z.infer<typeof receiptSchema> & BrowserMutationAdmission, BusinessActionMutationServerResult>(
    'businessActions:recordBusinessActionReceipt'
  ),
  recordGuardrailDecision: sourceMutation<
    z.infer<typeof guardrailDecisionSchema> & BrowserMutationAdmission,
    BusinessActionMutationServerResult
  >('businessActions:recordBusinessActionGuardrailDecision'),
  recordHermesEvidence: sourceMutation<
    z.infer<typeof hermesEvidenceSchema> & BrowserMutationAdmission,
    BusinessActionMutationServerResult
  >('businessActions:recordBusinessActionHermesEvidence'),
  readCurrentOwnerReceipt: sourceQuery<z.infer<typeof receiptSchema>, BusinessActionReceiptServerResult>(
    'businessActions:readCurrentOwnerBusinessActionReceipt'
  ),
} as const

const readOwnerQueueSourceQuery = sourceQuery<Record<string, never>, OwnerBusinessActionSourceStateServerResult>(
  'businessActions:readCurrentOwnerBusinessActionQueue'
)
const readOwnerDetailSourceQuery = sourceQuery<z.infer<typeof receiptSchema>, OwnerBusinessActionSourceStateServerResult>(
  'businessActions:readCurrentOwnerBusinessActionDetail'
)
const readAdminReconstructionSourceQuery = sourceQuery<
  { requestId?: string | undefined },
  AdminBusinessActionSourceStateServerResult
>('businessActions:readAdminBusinessActionReconstruction')

export const createBusinessActionCapabilityRequestServer = createServerFn({ method: 'POST' })
  .validator((data) => capabilityRequestSchema.parse(data))
  .handler(async ({ data, context }) => createBusinessActionCapabilityRequestThroughSource(data, context))

export const recordBusinessActionOwnerCheckpointServer = createServerFn({ method: 'POST' })
  .validator((data) => checkpointSchema.parse(data))
  .handler(async ({ data, context }) => recordBusinessActionOwnerCheckpointThroughSource(data, context))

export const recordBusinessActionReceiptServer = createServerFn({ method: 'POST' })
  .validator((data) => receiptSchema.parse(data))
  .handler(async ({ data, context }) => recordBusinessActionReceiptThroughSource(data, context))

export const recordBusinessActionGuardrailDecisionServer = createServerFn({ method: 'POST' })
  .validator((data) => guardrailDecisionSchema.parse(data))
  .handler(async ({ data, context }) => recordBusinessActionGuardrailDecisionThroughSource(data, context))

export const recordBusinessActionHermesEvidenceServer = createServerFn({ method: 'POST' })
  .validator((data) => hermesEvidenceSchema.parse(data))
  .handler(async ({ data, context }) => recordBusinessActionHermesEvidenceThroughSource(data, context))

export const readCurrentOwnerBusinessActionReceiptServer = createServerFn()
  .validator((data) => receiptSchema.parse(data))
  .handler(async ({ data }) => readCurrentOwnerBusinessActionReceiptThroughSource(data))

export const readCurrentOwnerBusinessActionQueueServer = createServerFn()
  .handler(() => readCurrentOwnerBusinessActionQueueThroughSource())

export const readCurrentOwnerBusinessActionDetailServer = createServerFn()
  .validator((data) => receiptSchema.parse(data))
  .handler(async ({ data }) => readCurrentOwnerBusinessActionDetailThroughSource(data))

export const readAdminBusinessActionReconstructionServer = createServerFn()
  .validator((data) => z.object({ requestId: z.string().min(1).optional() }).parse(data ?? {}))
  .handler(async ({ data }) => readAdminBusinessActionReconstructionThroughSource(data))

export async function createBusinessActionCapabilityRequestThroughSource(
  data: z.infer<typeof capabilityRequestSchema>,
  context?: unknown
): Promise<BusinessActionMutationServerResult> {
  try {
    return await callSourceMutation(businessActionSourceFunctionRefs.createCapabilityRequest, {
      ...data,
      ...(await browserMutationAdmission(context, 'create-request', data.businessId)),
    })
  } catch (error) {
    return sourceError(error)
  }
}

export async function recordBusinessActionOwnerCheckpointThroughSource(
  data: z.infer<typeof checkpointSchema>,
  context?: unknown
): Promise<BusinessActionMutationServerResult> {
  try {
    return await callSourceMutation(businessActionSourceFunctionRefs.recordOwnerCheckpoint, {
      ...data,
      ...(await browserMutationAdmission(context, 'checkpoint', data.requestId)),
    })
  } catch (error) {
    return sourceError(error)
  }
}

export async function recordBusinessActionReceiptThroughSource(
  data: z.infer<typeof receiptSchema>,
  context?: unknown
): Promise<BusinessActionMutationServerResult> {
  try {
    return await callSourceMutation(businessActionSourceFunctionRefs.recordReceipt, {
      ...data,
      ...(await browserMutationAdmission(context, 'receipt', data.requestId)),
    })
  } catch (error) {
    return sourceError(error)
  }
}

export async function recordBusinessActionGuardrailDecisionThroughSource(
  data: z.infer<typeof guardrailDecisionSchema>,
  context?: unknown
): Promise<BusinessActionMutationServerResult> {
  try {
    return await callSourceMutation(businessActionSourceFunctionRefs.recordGuardrailDecision, {
      ...data,
      ...(await browserMutationAdmission(context, 'guardrail', `${data.requestId}:${data.decision}`)),
    })
  } catch (error) {
    return sourceError(error)
  }
}

export async function recordBusinessActionHermesEvidenceThroughSource(
  data: z.infer<typeof hermesEvidenceSchema>,
  context?: unknown
): Promise<BusinessActionMutationServerResult> {
  try {
    return await callSourceMutation(businessActionSourceFunctionRefs.recordHermesEvidence, {
      ...data,
      ...(await browserMutationAdmission(context, 'hermes-evidence', `${data.requestId}:${data.checkpointId}`)),
    })
  } catch (error) {
    return sourceError(error)
  }
}

export async function readCurrentOwnerBusinessActionReceiptThroughSource(
  data: z.infer<typeof receiptSchema>
): Promise<BusinessActionReceiptServerResult> {
  try {
    return await callSourceQuery(businessActionSourceFunctionRefs.readCurrentOwnerReceipt, data)
  } catch (error) {
    return sourceError(error)
  }
}

export async function readCurrentOwnerBusinessActionQueueThroughSource(): Promise<OwnerBusinessActionSourceStateServerResult> {
  if (usesLocalBusinessActionBypass()) {
    return {
      kind: 'ok',
      state: createLocalBusinessActionSourceState(),
    }
  }

  try {
    return await callSourceQuery(readOwnerQueueSourceQuery, {})
  } catch (error) {
    return sourceError(error)
  }
}

export async function readCurrentOwnerBusinessActionDetailThroughSource(
  data: z.infer<typeof receiptSchema>
): Promise<OwnerBusinessActionSourceStateServerResult> {
  if (usesLocalBusinessActionBypass()) {
    const state = createLocalBusinessActionSourceState()
    const hasRequest = state.requests.some((request) => request.id === data.requestId)
    if (!hasRequest) {
      return {
        kind: 'error',
        code: 'business_action_not_found',
        retryable: false,
        reason: 'business_action_owner_readback_not_found',
      }
    }

    return { kind: 'ok', state }
  }

  try {
    return await callSourceQuery(readOwnerDetailSourceQuery, data)
  } catch (error) {
    return sourceError(error)
  }
}

export async function readAdminBusinessActionReconstructionThroughSource(
  filter: { requestId?: string | undefined } = {}
): Promise<AdminBusinessActionSourceStateServerResult> {
  if (usesLocalBusinessActionBypass()) {
    const state = createLocalBusinessActionSourceState()
    return {
      kind: 'allowed',
      httpStatus: 200,
      generatedAt: localBusinessActionNow,
      actorRef: 'admin:local-business-action',
      state:
        filter.requestId === undefined
          ? state
          : filterBusinessActionStateForRequests(state, new Set([filter.requestId])),
    }
  }

  try {
    return await callSourceQuery(readAdminReconstructionSourceQuery, compactAdminFilter(filter))
  } catch {
    return {
      kind: 'denied',
      httpStatus: 401,
      reason: 'missing_membership',
      generatedAt: Date.now(),
      publicMessage: 'Admin business-action reconstruction requires active source-owned membership.',
      state: createEmptyBusinessActionSourceState(),
    }
  }
}

async function browserMutationAdmission(
  context: unknown,
  operation: string,
  targetRef: string
): Promise<BrowserMutationAdmission> {
  const operationKey = `business-action:${operation}:${targetRef}`
  const correlationId = `correlation:business-action:${operation}:${targetRef}`
  return {
    operationKey,
    correlationId,
    sourceWrite: await sourceWriteAdmissionFromContext({
      context,
      scope: 'protected_action',
      operationKey,
      correlationId,
    }),
  }
}

const localBusinessActionNow = 9_000
const localBusinessId = 'business:local-business-action' as BusinessId
const localOwnerId = 'owner:local-business-action' as OwnerId

function usesLocalBusinessActionBypass(): boolean {
  return process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E === 'true'
}

function compactAdminFilter(filter: { requestId?: string | undefined }): { requestId?: string } {
  return filter.requestId === undefined || filter.requestId.trim().length === 0 ? {} : { requestId: filter.requestId }
}

function createLocalBusinessActionSourceState(): BusinessActionSourceState {
  return mergeBusinessActionStates([
    createLocalBusinessActionFlow('success', 'accepted', 'complete'),
    createLocalBusinessActionFlow('refused', 'refused', 'none'),
    createLocalBusinessActionFlow('proof-gap', 'accepted', 'proof_gap'),
  ])
}

function createLocalBusinessActionFlow(
  suffix: string,
  checkpointDecision: AuthorizationCheckpointDecision,
  artifactMode: 'complete' | 'proof_gap' | 'none'
): BusinessActionSourceState {
  const created = expectLocalOk(
    createCapabilityRequest(createEmptyBusinessActionSourceState({ cards: [localCard(suffix)], mandates: [localMandate(suffix)] }), {
      actionSlug: BusinessActionSlug,
      cardId: localCardId(suffix),
      mandateId: localMandateId(suffix),
      businessId: localBusinessId,
      amountCents: 4_500,
      currency: 'aud',
      requestedBy: 'hermes',
      idempotencyKey: operationKey(`local-business-action:request:${suffix}`),
      correlationId: correlationId(`local-business-action:request:${suffix}`),
      now: localBusinessActionNow,
      expiresAt: localBusinessActionNow + 60_000,
    })
  )
  const guarded = expectLocalOk(
    recordGuardrailDecisionEvidence(created.state, {
      requestId: created.request.id,
      provider: 'nemo_guardrails',
      modelName: 'nemotron',
      modelVersion: 'local-test',
      decision: checkpointDecision === 'refused' ? 'block' : 'allow',
      policyHash: sourceHash(`local-business-action:policy:${suffix}`),
      privateTraceRefHash: sourceHash(`local-business-action:trace:${suffix}`),
      payloadHash: sourceHash(`local-business-action:guardrail:${suffix}`),
      idempotencyKey: operationKey(`local-business-action:guardrail:${suffix}`),
      correlationId: correlationId(`local-business-action:guardrail:${suffix}`),
      recordedAt: localBusinessActionNow + 5,
    })
  )
  const checkpointed = expectLocalOk(
    recordAuthorizationCheckpoint(guarded.state, {
      requestId: created.request.id,
      decision: checkpointDecision,
      authority: localAuthority(),
      ownerDecisionRef: `owner-decision:local-business-action:${suffix}`,
      reasonCode: `local_${checkpointDecision}`,
      idempotencyKey: operationKey(`local-business-action:checkpoint:${suffix}`),
      correlationId: correlationId(`local-business-action:checkpoint:${suffix}`),
      now: localBusinessActionNow + 10,
      expiresAt: localBusinessActionNow + 60_000,
    })
  )

  const evidenced =
    checkpointDecision === 'accepted'
      ? expectLocalOk(
          recordHermesEvidenceEvent(checkpointed.state, {
            requestId: created.request.id,
            checkpointId: checkpointed.checkpoint.id,
            evidenceKind: 'execute',
            providerRefHash: sourceHash(`local-business-action:hermes-ref:${suffix}`),
            payloadHash: sourceHash(`local-business-action:hermes:${suffix}`),
            idempotencyKey: operationKey(`local-business-action:hermes:${suffix}`),
            correlationId: correlationId(`local-business-action:hermes:${suffix}`),
            receivedAt: localBusinessActionNow + 20,
          })
        ).state
      : checkpointed.state

  const artifacted =
    artifactMode === 'none'
      ? evidenced
      : expectLocalOk(
          recordBusinessActionResultArtifact(evidenced, {
            requestId: created.request.id,
            checkpointId: checkpointed.checkpoint.id,
            ...(artifactMode === 'complete'
              ? {
                  endpointDescriptorHash: sourceHash(`local-business-action:endpoint:${suffix}`),
                  jsonSchemaHash: sourceHash(`local-business-action:schema:${suffix}`),
                  privateEndpointProvisioningPaymentGateRefHash: sourceHash(`local-business-action:private-endpoint:${suffix}`),
                  supportingEvidenceLabels: ['hermes_execute'],
                }
              : {}),
            idempotencyKey: operationKey(`local-business-action:artifact:${suffix}`),
            correlationId: correlationId(`local-business-action:artifact:${suffix}`),
            recordedAt: localBusinessActionNow + 30,
          })
        ).state
  const receipted = expectLocalOk(
    recordActionReceipt(artifacted, {
      requestId: created.request.id,
      idempotencyKey: operationKey(`local-business-action:receipt:${suffix}`),
      correlationId: correlationId(`local-business-action:receipt:${suffix}`),
      recordedAt: localBusinessActionNow + 40,
    })
  )

  return {
    ...receipted.state,
    privateEvidenceRefs: [localPrivateEvidenceRef(created.request.id, suffix)],
    supportRecords: [localSupportRecord(suffix)],
    noRepairRecords: artifactMode === 'proof_gap' ? [localNoRepairRecord(created.request.id, suffix)] : [],
  }
}

function filterBusinessActionStateForRequests(
  state: BusinessActionSourceState,
  requestIds: ReadonlySet<string>
): BusinessActionSourceState {
  const requests = state.requests.filter((request) => requestIds.has(request.id))
  const cardIds = new Set(requests.map((request) => String(request.cardId)))
  const mandateIds = new Set(requests.map((request) => String(request.mandateId)))
  const businessIds = new Set(requests.map((request) => String(request.businessId)))

  return createEmptyBusinessActionSourceState({
    cards: state.cards.filter((card) => cardIds.has(String(card.id))),
    mandates: state.mandates.filter((mandate) => mandateIds.has(String(mandate.id))),
    requests,
    checkpoints: state.checkpoints.filter((checkpoint) => requestIds.has(checkpoint.requestId)),
    guardrailDecisions: state.guardrailDecisions.filter((decision) => requestIds.has(decision.requestId)),
    externalEvidenceEvents: state.externalEvidenceEvents.filter((event) => requestIds.has(event.requestId)),
    hermesEvidenceEvents: state.hermesEvidenceEvents.filter((event) => requestIds.has(event.requestId)),
    resultArtifacts: state.resultArtifacts.filter((artifact) => requestIds.has(artifact.requestId)),
    receipts: state.receipts.filter((receipt) => requestIds.has(receipt.requestId)),
    privateEvidenceRefs: state.privateEvidenceRefs.filter((ref) => requestIds.has(ref.requestId)),
    supportRecords: state.supportRecords.filter((record) => businessIds.has(String(record.businessId))),
    noRepairRecords: state.noRepairRecords.filter((record) => requestIds.has(record.requestId)),
  })
}

function mergeBusinessActionStates(states: readonly BusinessActionSourceState[]): BusinessActionSourceState {
  return createEmptyBusinessActionSourceState({
    cards: uniqueBy(states.flatMap((state) => state.cards), (entry) => String(entry.id)),
    mandates: uniqueBy(states.flatMap((state) => state.mandates), (entry) => String(entry.id)),
    requests: uniqueBy(states.flatMap((state) => state.requests), (entry) => String(entry.id)),
    checkpoints: uniqueBy(states.flatMap((state) => state.checkpoints), (entry) => String(entry.id)),
    guardrailDecisions: uniqueBy(states.flatMap((state) => state.guardrailDecisions), (entry) => String(entry.id)),
    externalEvidenceEvents: uniqueBy(states.flatMap((state) => state.externalEvidenceEvents), (entry) => String(entry.id)),
    hermesEvidenceEvents: uniqueBy(states.flatMap((state) => state.hermesEvidenceEvents), (entry) => String(entry.id)),
    resultArtifacts: uniqueBy(states.flatMap((state) => state.resultArtifacts), (entry) => String(entry.id)),
    receipts: uniqueBy(states.flatMap((state) => state.receipts), (entry) => String(entry.id)),
    privateEvidenceRefs: uniqueBy(states.flatMap((state) => state.privateEvidenceRefs), (entry) => String(entry.id)),
    supportRecords: uniqueBy(states.flatMap((state) => state.supportRecords), (entry) => String(entry.id)),
    noRepairRecords: uniqueBy(states.flatMap((state) => state.noRepairRecords), (entry) => String(entry.id)),
  })
}

function localCard(suffix: string): BusinessActionCard {
  return {
    id: localCardId(suffix),
    actionSlug: BusinessActionSlug,
    version: 1,
    ownerId: localOwnerId,
    sourceHash: sourceHash(`local-business-action:card:${suffix}`),
    status: 'active',
    publicLabel: 'Provision paid intake endpoint',
    posture: 'proposal_only',
    callable: false,
    paymentRequired: false,
    ownerApprovalRequired: true,
    receiptRequired: true,
    updatedAt: localBusinessActionNow - 10,
  }
}

function localMandate(suffix: string): BuyerMandate {
  return {
    id: localMandateId(suffix),
    buyerRef: `buyer:local-business-action:${suffix}`,
    allowedBusinessId: localBusinessId,
    allowedActionSlug: BusinessActionSlug,
    maxAmountCents: 5_000,
    currency: 'aud',
    status: 'active',
    mandateHash: sourceHash(`local-business-action:mandate:${suffix}`),
    idempotencyKey: operationKey(`local-business-action:mandate:${suffix}`),
    correlationId: correlationId(`local-business-action:mandate:${suffix}`),
    createdAt: localBusinessActionNow - 100,
    expiresAt: localBusinessActionNow + 120_000,
  }
}

function localPrivateEvidenceRef(requestId: CapabilityRequestId, suffix: string): BusinessActionPrivateEvidenceRef {
  return {
    id: `business_action_private_evidence:local:${suffix}` as BusinessActionPrivateEvidenceRefId,
    requestId,
    retentionClass: 'business_action_private_evidence',
    accessPolicy: 'owner_admin_operator_only',
    payloadHash: sourceHash(`local-business-action:private-payload:${suffix}`),
    privatePayloadRef: `private-endpoint://local-business-action/${suffix}`,
    ttlExpiresAt: localBusinessActionNow + 86_400_000,
  }
}

function localSupportRecord(suffix: string): BusinessActionSupportRecord {
  return {
    id: `business_action_support:local:${suffix}` as BusinessActionSupportRecordId,
    actionSlug: BusinessActionSlug,
    businessId: localBusinessId,
    status: 'open',
    reason: 'source-local business-action support record',
    evidenceRefs: [`support:local-business-action:${suffix}`],
    claimDisablePath: 'business_actions_enabled',
    operatorNextAction: 'operator_review_required',
    sourceHash: sourceHash(`local-business-action:support:${suffix}`),
    correlationId: correlationId(`local-business-action:support:${suffix}`),
    createdAt: localBusinessActionNow,
    updatedAt: localBusinessActionNow,
  }
}

function localNoRepairRecord(requestId: CapabilityRequestId, suffix: string): BusinessActionNoRepairRecord {
  return {
    id: `business_action_no_repair:local:${suffix}` as BusinessActionNoRepairId,
    requestId,
    reason: 'No private endpoint artifact can be reconstructed.',
    evidenceRefs: [`private-evidence:local-business-action:${suffix}`],
    noRepairHash: sourceHash(`local-business-action:no-repair:${suffix}`),
    idempotencyKey: operationKey(`local-business-action:no-repair:${suffix}`),
    correlationId: correlationId(`local-business-action:no-repair:${suffix}`),
    markedBy: 'operator:local-business-action',
    markedAt: localBusinessActionNow + 50,
  }
}

function localAuthority(): BusinessActionOwnerAuthority {
  return {
    ownerId: localOwnerId,
    actorRef: 'owner:local-business-action',
    businessIds: [localBusinessId],
    status: 'active',
  }
}

function localCardId(suffix: string): BusinessActionCardId {
  return `business_action_card:local:${suffix}` as BusinessActionCardId
}

function localMandateId(suffix: string): BuyerMandateId {
  return `buyer_mandate:local:${suffix}` as BuyerMandateId
}

function operationKey(value: string): OperationKey {
  return `operation:${value}` as OperationKey
}

function correlationId(value: string): CorrelationId {
  return `correlation:${value}` as CorrelationId
}

function sourceHash(value: string): SourceHash {
  return `hash:${value}` as SourceHash
}

function uniqueBy<T>(items: readonly T[], keyFor: (item: T) => string): readonly T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = keyFor(item)
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function expectLocalOk<Result extends { kind: 'ok'; code: string } | { kind: 'error'; code: string }>(
  result: Result
): Extract<Result, { kind: 'ok' }> {
  if (result.kind !== 'ok') {
    throw new Error(`Expected local business-action source state, received ${result.code}`)
  }

  return result as Extract<Result, { kind: 'ok' }>
}

function sourceError(error: unknown): BusinessActionServerErrorResult {
  if (error instanceof ConvexSourceError) {
    return {
      kind: 'error',
      code: error.code,
      retryable: false,
      reason: error.message,
    }
  }

  return {
    kind: 'error',
    code: 'business_action_source_unavailable',
    retryable: true,
    reason: error instanceof Error ? error.message : 'business_action_source_unavailable',
  }
}
