import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { callSourceMutation, callSourceQuery, ConvexSourceError, sourceMutation, sourceQuery } from '@/lib/server/convex-source'
import { sourceWriteAdmissionFromContext } from '@/lib/server/source-write-admission'
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
