import { z } from 'zod'

import { jsonValueSchema, type JsonValue } from '@/modules/capability-contract/public'
import { exactAmountSchema } from '@/modules/money/public'

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

const continuationSchema = z.strictObject({
  action: z.literal('operation.invoke'),
  method: z.literal('POST'),
  path: z.literal('/api/v1/operations/call'),
  input: z.strictObject({
    commitmentRef: z.string(),
    idempotencyKey: z.string(),
  }),
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
    treasury: z.strictObject({
      spendable: exactAmountSchema,
    }).optional(),
    policyRefs: z.array(z.string()),
    evidenceDigest: z.string(),
    continuation: continuationSchema,
  }),
  z.strictObject({
    kind: z.literal('refused'),
    operationRef: z.string(),
    code: z.enum([
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
    ]),
    retryable: z.boolean(),
    reinspection: z.strictObject({
      action: z.literal('operation.inspect'),
      operationRef: z.string(),
    }).optional(),
  }),
])

export type OperationInspectResult = z.infer<typeof operationInspectResultSchema>
