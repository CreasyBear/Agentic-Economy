import { z } from 'zod'
import { jsonValueSchema } from '@/modules/capability-contract/public'
import { expireProcureResultContent, toolProcureResultSchema, type ToolProcureResult } from './procure'

// Frozen storage readers for historical terminal caches. These display strings
// are never accepted by live output validators or converted into exact money.
const legacyDiagnosticSchema = z.strictObject({ whatHappened: z.string(), financialImpact: z.string(), nextStep: z.string() })
const legacyCompletedFields = {
  schemaVersion: z.literal('tool.procure:v1'), idempotencyKey: z.string().min(8).max(200),
  quoteRef: z.string().min(1), callRef: z.string().min(1), toolRef: z.string(),
  toolName: z.string().optional(),
} as const
const legacyDeliveredFields = {
  ...legacyCompletedFields, kind: z.literal('delivered'), status: z.literal('delivered'),
  price: z.strictObject({ totalAud: z.string(), netAud: z.string(), gstAud: z.string() }),
  audit: z.strictObject({ routingLatencyMs: z.number(), executionLatencyMs: z.number(),
    totalLatencyMs: z.number(), jevDecisionsCostAud: z.string() }),
} as const
const legacyProcureResultSchema = z.union([
  z.strictObject({ ...legacyDeliveredFields, endpoint: z.string().optional(),
    input: z.record(z.string(), jsonValueSchema), output: z.unknown() }),
  z.strictObject({ ...legacyDeliveredFields, contentExpiredAt: z.number().int().nonnegative() }),
  z.strictObject({ ...legacyCompletedFields, kind: z.literal('remedied'), status: z.literal('remedied'),
    refundedAmountAud: z.string(), netChargeAud: z.literal('A$0.00'), diagnostic: legacyDiagnosticSchema,
    alternativeTool: z.string().optional(), audit: z.strictObject({ adjudicator: z.string(), confidence: z.number(),
      remedyLatencyMs: z.number(), totalLatencyMs: z.number() }) }),
])

export const storedToolProcureResultSchema = z.union([toolProcureResultSchema, legacyProcureResultSchema])
type StoredToolProcureResult = z.infer<typeof storedToolProcureResultSchema>

/** Project a retained result without updating its original JSON, hash or refs. */
export function projectStoredProcureResult(value: unknown): ToolProcureResult {
  const current = toolProcureResultSchema.safeParse(value)
  if (current.success) return current.data
  const legacy = legacyProcureResultSchema.parse(value)
  if (legacy.kind === 'delivered') {
    const { price: _displayPrice, ...facts } = legacy
    return { ...facts, money: { kind: 'historical_display_only' } }
  }
  const { refundedAmountAud: _displayRefund, netChargeAud: _displayNet, ...facts } = legacy
  return { ...facts, money: { kind: 'historical_display_only' }, diagnostic: {
    ...facts.diagnostic,
    financialImpact: 'Exact financial amounts are unavailable in this historical procurement cache. Read the original Call usage and receipt.',
  } }
}

/** Content expiry preserves a historical cache's own financial shape and digest. */
export function expireStoredProcureResultContent(value: StoredToolProcureResult, expiredAt: number): StoredToolProcureResult | null {
  const current = toolProcureResultSchema.safeParse(value)
  if (current.success) return expireProcureResultContent(current.data, expiredAt)
  const legacy = legacyProcureResultSchema.parse(value)
  if (legacy.kind === 'delivered') {
    if (!('input' in legacy)) return legacy
    const { input: _input, output: _output, endpoint: _endpoint, ...facts } = legacy
    return { ...facts, contentExpiredAt: expiredAt }
  }
  return { ...legacy, diagnostic: {
    whatHappened: 'Original diagnostic content expired.',
    financialImpact: 'Exact financial amounts are unavailable in this historical procurement cache. Read the original Call usage and receipt.',
    nextStep: 'The purchase record remains available.',
  } }
}
