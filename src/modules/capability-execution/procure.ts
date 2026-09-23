import { idempotencyKeySchema } from '@/modules/common/action'
import { jsonValueSchema } from '@/modules/capability-contract/public'
import { isPublicToolRef, type PublicToolRef } from '@/modules/common/tool-ref'
import { z } from 'zod'
import { callRefusalCodeSchema } from './call-contracts'

export const TOOL_PROCURE_ACTION_ID = 'tool.procure' as const
export const TOOL_PROCURE_PATH = '/api/v1/tools/procure' as const

export const toolProcureInputSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('need'),
    need: z.string().trim().min(3).max(4096),
    maxSpendAud: z.string().trim().regex(/^\d+(?:\.\d{1,6})?$/),
    idempotencyKey: idempotencyKeySchema,
  }),
  z.strictObject({
    kind: z.literal('exact'),
    toolRef: z.string().refine(isPublicToolRef).transform((ref): PublicToolRef => ref as PublicToolRef),
    input: z.record(z.string(), jsonValueSchema),
    maxSpendAud: z.string().trim().regex(/^\d+(?:\.\d{1,6})?$/),
    idempotencyKey: idempotencyKeySchema,
  }),
])

export type ToolProcureInput = z.infer<typeof toolProcureInputSchema>

export const diagnosticTripletSchema = z.strictObject({
  whatHappened: z.string(),
  financialImpact: z.string(),
  nextStep: z.string(),
})

const commonResult = {
  schemaVersion: z.literal('tool.procure:v1'),
  idempotencyKey: idempotencyKeySchema,
} as const
const committedResult = {
  ...commonResult,
  quoteRef: z.string().min(1),
  callRef: z.string().min(1),
} as const

export const toolProcureResultSchema = z.discriminatedUnion('status', [
  z.strictObject({
    ...committedResult,
    kind: z.literal('delivered'),
    status: z.literal('delivered'),
    toolRef: z.string(),
    toolName: z.string().optional(),
    quoteRef: z.string().min(1),
    endpoint: z.string().optional(),
    price: z.strictObject({
      totalAud: z.string(),
      netAud: z.string(),
      gstAud: z.string(),
    }),
    synthesizedParams: z.record(z.string(), z.unknown()),
    output: z.unknown(),
    audit: z.strictObject({
      routingLatencyMs: z.number(),
      executionLatencyMs: z.number(),
      totalLatencyMs: z.number(),
      jevDecisionsCostAud: z.string(),
    }),
  }),
  z.strictObject({
    ...committedResult,
    kind: z.literal('remedied'),
    status: z.literal('remedied'),
    toolRef: z.string(),
    toolName: z.string().optional(),
    quoteRef: z.string().min(1),
    refundedAmountAud: z.string(),
    netChargeAud: z.literal('A$0.00'),
    diagnostic: diagnosticTripletSchema,
    alternativeTool: z.string().optional(),
    audit: z.strictObject({
      adjudicator: z.string(),
      confidence: z.number(),
      remedyLatencyMs: z.number(),
      totalLatencyMs: z.number(),
    }),
  }),
  z.strictObject({
    ...commonResult,
    kind: z.literal('refused'),
    status: z.literal('refused'),
    quoteRef: z.string().min(1).optional(),
    code: z.union([z.enum(['budget_exceeded', 'no_matching_tool', 'ambiguous_intent']), callRefusalCodeSchema]),
    retryable: z.boolean(),
    detail: z.string(),
  }),
  z.strictObject({
    ...committedResult,
    kind: z.literal('refused_after_dispatch'),
    status: z.literal('refused_after_dispatch'),
    code: z.literal('call_refused'),
    detail: z.string(),
  }),
  z.strictObject({
    ...committedResult,
    kind: z.literal('pending'),
    status: z.literal('pending'),
    retryAfterMs: z.number().int().positive().optional(),
  }),
  z.strictObject({
    ...committedResult,
    kind: z.literal('outcome_unknown'),
    status: z.literal('outcome_unknown'),
  }),
])

export type ToolProcureResult = z.infer<typeof toolProcureResultSchema>
