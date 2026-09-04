import { z } from 'zod'

import { jsonValueSchema, type JsonValue } from '@/modules/capability-contract/public'
import { exactAmountSchema } from '@/modules/money/public'
import { FUNDING_HANDOFF_CREATE_PATH } from '@/modules/money/funding-handoff.actions'
import {
  OPERATION_MARKET_DESCRIBE_PATH,
  OPERATION_MARKET_LIST_PATH,
  OPERATION_MARKET_SEARCH_PATH,
} from '@/modules/common/market-operation-paths'

export const OPERATION_INSPECT_ACTION_ID = 'operation.inspect' as const
export const OPERATION_INSPECT_PATH = '/api/v1/operations/inspect' as const

export const operationInspectInputSchema = z.strictObject({
  operationRef: z.string().regex(/^operation:v1:[0-9a-f]{64}$/u),
  input: z.record(z.string(), jsonValueSchema),
})

export type OperationInspectInput = Readonly<{
  operationRef: string
  input: Record<string, JsonValue>
}>

const invokeContinuationSchema = z.strictObject({
  action: z.literal('operation.invoke'),
  method: z.literal('POST'),
  path: z.literal('/api/v1/operations/call'),
  input: z.strictObject({
    commitmentRef: z.string(),
    idempotencyKey: z.string(),
  }),
})

const inspectRefusalCodeValues = [
  'operation_not_found',
  'operation_not_current',
  'operation_not_ready',
  'operation_unsupported',
  'input_invalid',
  'grant_not_found',
  'budget_exceeded',
  'insufficient_balance',
  'treasury_capacity_unavailable',
  'pricing_setup_required',
  'commercial_policy_unavailable',
  'inspection_unavailable',
] as const
export type OperationInspectRefusalCode = (typeof inspectRefusalCodeValues)[number]

const inspectContinuationSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('registry.operations.list'),
    method: z.literal('POST'),
    path: z.literal(OPERATION_MARKET_LIST_PATH),
    input: z.strictObject({ limit: z.literal(10) }),
  }),
  z.strictObject({
    action: z.literal('registry.operations.search'),
    method: z.literal('POST'),
    path: z.literal(OPERATION_MARKET_SEARCH_PATH),
    input: z.strictObject({ query: z.string().min(1), limit: z.literal(10) }),
  }),
  z.strictObject({
    action: z.literal('registry.operations.describe'),
    method: z.literal('POST'),
    path: z.literal(OPERATION_MARKET_DESCRIBE_PATH),
    input: z.strictObject({ operationRef: z.string() }),
  }),
  z.strictObject({
    action: z.literal('operation.inspect'),
    method: z.literal('POST'),
    path: z.literal(OPERATION_INSPECT_PATH),
    input: operationInspectInputSchema,
    retryAfterMs: z.union([z.literal(5000), z.literal(30000)]),
  }),
  z.strictObject({
    action: z.literal('funding.handoff.create'),
    method: z.literal('POST'),
    path: z.literal(FUNDING_HANDOFF_CREATE_PATH),
    input: z.strictObject({
      principalAmount: exactAmountSchema,
      idempotencyKey: z.string().min(1).max(255),
    }),
  }),
])

const requiredActionSchema = z.strictObject({
  action: z.string().min(1),
  blockedCapabilities: z.tuple([z.literal('operation.invoke')]),
  cta: z.union([z.literal('/agent-access'), z.literal('/support'), z.null()]),
  ctaLabel: z.string().min(1),
  description: z.string().min(1),
  iconUrl: z.null(),
  status: z.enum(['required', 'pending']),
  title: z.string().min(1),
})

export const operationInspectResultSchema = z.union([
  z.strictObject({
    kind: z.literal('committed'),
    commitmentRef: z.string(),
    operationRef: z.string(),
    operationRevision: z.number().int().positive(),
    expiresAt: z.number().int().nonnegative(),
    normalizedInput: z.record(z.string(), jsonValueSchema),
    price: exactAmountSchema,
    sourceRequirement: exactAmountSchema.optional(),
    account: z.strictObject({
      accountRef: z.string(),
      available: exactAmountSchema,
    }),
    budget: z.strictObject({
      principalRef: z.string(),
      maximumPerInvocation: exactAmountSchema,
    }),
    policyRefs: z.array(z.string()),
    evidenceDigest: z.string(),
    continuation: invokeContinuationSchema,
  }),
  z.strictObject({
    kind: z.literal('refused'),
    operationRef: z.string(),
    code: z.enum(inspectRefusalCodeValues),
    reason: z.string().min(1).optional(),
    retryable: z.boolean(),
    correlationRef: z.string().min(1),
    continuation: inspectContinuationSchema.optional(),
    requiredActions: z.tuple([requiredActionSchema]).optional(),
  }),
])

export type OperationInspectResult = z.infer<typeof operationInspectResultSchema>

type RefusedInspection = Extract<OperationInspectResult, { kind: 'refused' }>

export function projectOperationInspectRefusal(input: Readonly<{
  operationRef: string
  input: Record<string, JsonValue>
  code: OperationInspectRefusalCode
  retryable: boolean
  correlationRef: string
  reason?: string
  capabilityId?: string
  funding?: Readonly<{ principalAmount: z.infer<typeof exactAmountSchema>; idempotencyKey: string }>
}>): RefusedInspection {
  const base = {
    kind: 'refused' as const,
    operationRef: input.operationRef,
    code: input.code,
    retryable: input.retryable,
    correlationRef: input.correlationRef,
    ...(input.reason === undefined ? {} : { reason: input.reason }),
  }
  const list = {
    action: 'registry.operations.list' as const,
    method: 'POST' as const,
    path: OPERATION_MARKET_LIST_PATH,
    input: { limit: 10 as const },
  }
  const inspect = (retryAfterMs: 5000 | 30000) => ({
    action: 'operation.inspect' as const,
    method: 'POST' as const,
    path: OPERATION_INSPECT_PATH,
    input: { operationRef: input.operationRef, input: input.input },
    retryAfterMs,
  })
  const requiredAction = (support: boolean) => ({
    action: support ? 'contact_support' : 'review_agent_access',
    blockedCapabilities: ['operation.invoke'] as ['operation.invoke'],
    cta: support ? '/support' as const : '/agent-access' as const,
    ctaLabel: support ? 'Contact support' : 'Review agent access',
    description: support
      ? 'AE could not establish the commercial policy required to invoke this Operation.'
      : 'The owner must review this agent’s access or budget before it can invoke this Operation.',
    iconUrl: null,
    status: 'required' as const,
    title: support ? 'Contact support' : 'Review agent access',
  })
  switch (input.code) {
    case 'operation_not_ready':
      return { ...base, continuation: inspect(5000) }
    case 'inspection_unavailable':
      return input.retryable
        ? { ...base, continuation: inspect(5000) }
        : { ...base, requiredActions: [requiredAction(true)] }
    case 'treasury_capacity_unavailable':
      return { ...base, continuation: inspect(30000) }
    case 'input_invalid':
      return {
        ...base,
        continuation: {
          action: 'registry.operations.describe', method: 'POST', path: OPERATION_MARKET_DESCRIBE_PATH,
          input: { operationRef: input.operationRef },
        },
      }
    case 'operation_not_current':
    case 'operation_unsupported':
      return input.capabilityId === undefined
        ? { ...base, continuation: list }
        : {
            ...base,
            continuation: {
              action: 'registry.operations.search', method: 'POST', path: OPERATION_MARKET_SEARCH_PATH,
              input: { query: input.capabilityId, limit: 10 },
            },
          }
    case 'grant_not_found':
    case 'budget_exceeded':
      return { ...base, requiredActions: [requiredAction(false)] }
    case 'commercial_policy_unavailable':
      return { ...base, requiredActions: [requiredAction(true)] }
    case 'insufficient_balance':
      return input.funding === undefined
        ? {
            ...base,
            requiredActions: [{
              action: 'review_funding',
              blockedCapabilities: ['operation.invoke'],
              cta: null,
              ctaLabel: 'Review funding',
              description: 'The owner must review funding because one hosted funding session cannot satisfy this shortfall.',
              iconUrl: null,
              status: 'required',
              title: 'Review funding',
            }],
          }
        : {
            ...base,
            continuation: {
              action: 'funding.handoff.create', method: 'POST', path: FUNDING_HANDOFF_CREATE_PATH,
              input: input.funding,
            },
          }
    case 'operation_not_found':
    case 'pricing_setup_required':
      return { ...base, continuation: list }
  }
}
