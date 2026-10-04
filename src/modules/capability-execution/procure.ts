import { idempotencyKeySchema } from '@/modules/common/action'
import { jsonValueSchema } from '@/modules/capability-contract/public'
import { isPublicToolRef, type PublicToolRef } from '@/modules/common/tool-ref'
import { z } from 'zod'
import { TOOL_SELECTION_PREFERENCES } from '@/modules/common/tool-selection-score'
import { callRefusalCodeSchema } from './call-contracts'
import { toolQuoteRefusalCodeSchema } from './quote'

export const TOOL_PROCURE_ACTION_ID = 'tool.procure' as const
export const TOOL_PROCURE_PATH = '/api/v1/tools/procure' as const

export const toolProcureInputSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('need'),
    need: z.string().trim().min(3).max(4096),
    prefer: z.enum(TOOL_SELECTION_PREFERENCES).describe('How to choose between matching Tools: cheapest, balanced (default), or reliable').optional(),
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

const quoteSnapshotFields = {
  quoteRef: z.string().min(1),
  price: z.strictObject({ currency: z.literal('AUD'), units: z.string(), exponent: z.number() }),
  toolRef: z.string(),
  toolName: z.string().optional(),
  routingLatencyMs: z.number(),
} as const

/** An internal procurement checkpoint keeps its Quote identity after input expiry. */
export const procureQuoteSnapshotSchema = z.union([
  z.strictObject({ ...quoteSnapshotFields, input: z.record(z.string(), jsonValueSchema), endpoint: z.string().optional() }),
  z.strictObject({ ...quoteSnapshotFields, contentExpiredAt: z.number().int().nonnegative() }),
])

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

const deliveredResultFields = {
    ...committedResult,
    kind: z.literal('delivered'),
    status: z.literal('delivered'),
    toolRef: z.string(),
    toolName: z.string().optional(),
    quoteRef: z.string().min(1),
    price: z.strictObject({
      totalAud: z.string(),
      netAud: z.string(),
      gstAud: z.string(),
    }),
    audit: z.strictObject({
      routingLatencyMs: z.number(),
      executionLatencyMs: z.number(),
      totalLatencyMs: z.number(),
      jevDecisionsCostAud: z.string(),
    }),
} as const

export const toolProcureResultSchema = z.union([
  z.strictObject({
    ...deliveredResultFields,
    endpoint: z.string().optional(),
    input: z.record(z.string(), jsonValueSchema),
    output: z.unknown(),
  }),
  z.strictObject({
    ...deliveredResultFields,
    contentExpiredAt: z.number().int().nonnegative(),
  }),
  z.strictObject({
    schemaVersion: z.literal('tool.procure:v1'),
    kind: z.literal('needs_input'),
    status: z.literal('needs_input'),
    toolRef: z.string().refine(isPublicToolRef).transform((ref): PublicToolRef => ref as PublicToolRef),
    toolName: z.string(),
    reasons: z.array(z.string()),
    alternates: z.array(z.strictObject({
      toolRef: z.string().refine(isPublicToolRef).transform((ref): PublicToolRef => ref as PublicToolRef),
      title: z.string(),
      reasons: z.array(z.string()),
    })).max(2),
    inputJsonSchema: z.record(z.string(), jsonValueSchema),
    requiredFields: z.array(z.string()),
    next: z.strictObject({
      kind: z.literal('exact'),
      toolRef: z.string().refine(isPublicToolRef).transform((ref): PublicToolRef => ref as PublicToolRef),
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
    idempotencyKey: idempotencyKeySchema.optional(),
    quoteRef: z.string().min(1).optional(),
    code: z.union([z.enum(['no_matching_tool', 'ambiguous_intent', 'selection_unavailable']), toolQuoteRefusalCodeSchema, callRefusalCodeSchema]),
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

/** Retain the purchase outcome while removing content-bearing result fields. */
export function expireProcureResultContent(result: ToolProcureResult, expiredAt: number): ToolProcureResult | null {
  if (result.kind === 'delivered') {
    if (!('input' in result)) return result
    const { input: _input, output: _output, endpoint: _endpoint, ...purchase } = result
    return { ...purchase, contentExpiredAt: expiredAt }
  }
  if (result.kind === 'refused' || result.kind === 'refused_after_dispatch') {
    return { ...result, detail: 'Original diagnostic content expired.' }
  }
  if (result.kind === 'remedied') return { ...result, diagnostic: {
    whatHappened: 'Original diagnostic content expired.', financialImpact: `Refund recorded: ${result.refundedAmountAud}`,
    nextStep: 'The purchase record remains available.',
  } }
  return null
}
