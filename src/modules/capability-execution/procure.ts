import { z } from 'zod'

export const TOOL_PROCURE_ACTION_ID = 'tool.procure' as const
export const TOOL_PROCURE_PATH = '/api/v1/tools/procure' as const

export const toolProcureInputSchema = z.strictObject({
  need: z.string().trim().min(3).max(4096),
  maxSpendAud: z
    .string()
    .trim()
    .regex(/^\d+(?:\.\d{1,6})?$/)
    .optional(),
  simulateProviderFailure: z.boolean().optional(),
})

export type ToolProcureInput = z.infer<typeof toolProcureInputSchema>

export const diagnosticTripletSchema = z.strictObject({
  whatHappened: z.string(),
  financialImpact: z.string(),
  nextStep: z.string(),
})

export const toolProcureResultSchema = z.discriminatedUnion('status', [
  z.strictObject({
    schemaVersion: z.literal('tool.procure:v1'),
    kind: z.literal('delivered'),
    status: z.literal('delivered'),
    toolRef: z.string(),
    toolName: z.string(),
    quoteRef: z.string(),
    endpoint: z.string(),
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
    schemaVersion: z.literal('tool.procure:v1'),
    kind: z.literal('remedied'),
    status: z.literal('remedied'),
    toolRef: z.string(),
    toolName: z.string(),
    quoteRef: z.string(),
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
    schemaVersion: z.literal('tool.procure:v1'),
    kind: z.literal('refused'),
    status: z.literal('refused'),
    code: z.enum(['budget_exceeded', 'no_matching_tool', 'ambiguous_intent']),
    detail: z.string(),
  }),
])

export type ToolProcureResult = z.infer<typeof toolProcureResultSchema>
