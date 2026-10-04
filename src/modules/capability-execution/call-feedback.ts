import { v, type Infer } from 'convex/values'
import { z } from 'zod'

export const CALL_FEEDBACK_RETENTION_MS = 90 * 24 * 60 * 60 * 1_000
export const callFeedbackReasons = ['incorrect', 'incomplete', 'irrelevant', 'too_slow'] as const
export const callFeedbackValue = v.union(
  v.object({ choice: v.literal('useful') }),
  v.object({ choice: v.union(v.literal('partly_useful'), v.literal('not_useful')),
    reason: v.optional(v.union(...callFeedbackReasons.map(reason => v.literal(reason)))) }),
)
export type CallFeedback = Infer<typeof callFeedbackValue>
export const callFeedbackSchema = z.discriminatedUnion('choice', [
  z.strictObject({ choice: z.literal('useful') }),
  z.strictObject({ choice: z.enum(['partly_useful', 'not_useful']), reason: z.enum(callFeedbackReasons).optional() }),
]).transform((value): CallFeedback => value.choice === 'useful' || value.reason === undefined
  ? { choice: value.choice } : { choice: value.choice, reason: value.reason })
export const callFeedbackInputSchema = z.strictObject({ callRef: z.string().trim().min(1).max(256), feedback: callFeedbackSchema })
const codes = ['owner_required', 'call_not_eligible', 'source_unavailable'] as const
export const callFeedbackViewValue = v.union(
  v.object({ kind: v.literal('ready'), callRef: v.string(), feedback: v.union(callFeedbackValue, v.null()), expiresAt: v.union(v.number(), v.null()) }),
  v.object({ kind: v.literal('refused'), code: v.union(...codes.map(code => v.literal(code))) }),
)
export type CallFeedbackView = Infer<typeof callFeedbackViewValue>
export const callFeedbackViewSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('ready'), callRef: z.string(), feedback: callFeedbackSchema.nullable(), expiresAt: z.number().nullable() }),
  z.strictObject({ kind: z.literal('refused'), code: z.enum(codes) }),
])
