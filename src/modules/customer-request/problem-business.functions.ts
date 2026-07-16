import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { callSourceAction, sourceAction } from '@/lib/server/convex-source'

const evidenceItemSchema = z.strictObject({
  receiptRef: z.string(),
  label: z.string(),
})

const businessProblemSchema = z.union([
  z.strictObject({
    kind: z.literal('business_problem'),
    reportRef: z.string(),
    business: z.string(),
    category: z.enum([
      'incorrect_result',
      'unexpected_cost',
      'duplicate_charge_or_effect',
      'privacy_concern',
      'could_not_stop',
      'other',
    ]),
    customerStatement: z.string(),
    causality: z.literal('unknown'),
    resolution: z.literal('not_adjudicated'),
    decisionAuthority: z.literal('not_assigned'),
    evidence: z.array(evidenceItemSchema),
    availableEvidence: z.array(evidenceItemSchema),
    businessClaims: z.array(z.strictObject({
      statementRef: z.string(),
      causalityPosition: z.enum(['supports', 'disputes', 'uncertain']),
      statement: z.string(),
      evidence: z.array(evidenceItemSchema),
      recordedAt: z.number().int().nonnegative(),
    })),
  }),
  z.strictObject({
    kind: z.literal('refused'),
    reason: z.enum([
      'authentication_required',
      'authority_denied',
      'report_not_found',
      'sharing_not_authorized',
    ]),
  }),
])

const businessProblemStatementSchema = z.union([
  z.strictObject({
    kind: z.literal('business_report_recorded'),
    statementRef: z.string(),
    reportRef: z.string(),
    business: z.string(),
    claimSource: z.literal('business'),
    causalityPosition: z.enum(['supports', 'disputes', 'uncertain']),
    causality: z.literal('unknown'),
    resolution: z.literal('not_adjudicated'),
    decisionAuthority: z.literal('not_assigned'),
    statement: z.string(),
    evidence: z.array(evidenceItemSchema),
    recordedAt: z.number().int().nonnegative(),
  }),
  z.strictObject({ kind: z.literal('conflict'), reason: z.literal('idempotency_key_reused') }),
  z.strictObject({
    kind: z.literal('refused'),
    reason: z.enum([
      'authentication_required',
      'authority_denied',
      'report_not_found',
      'sharing_not_authorized',
      'evidence_not_found',
      'invalid_report',
    ]),
  }),
])

const readInputSchema = z.strictObject({
  reportRef: z.string().trim().min(1).max(300),
})
const statementInputSchema = z.strictObject({
  reportRef: z.string().trim().min(1).max(300),
  idempotencyKey: z.string().trim().min(1).max(200),
  causalityPosition: z.enum(['supports', 'disputes', 'uncertain']),
  statement: z.string().trim().min(1).max(1_000),
  evidenceReceiptRefs: z.array(z.string().trim().min(1).max(300)).max(20),
})

export type BusinessProblem = z.infer<typeof businessProblemSchema>
export type BusinessProblemStatement = z.infer<typeof businessProblemStatementSchema>
export type BusinessProblemStatementInput = z.infer<typeof statementInputSchema>

const readSourceAction = sourceAction<{ reportRef: string }, BusinessProblem>(
  'customerRequestApplication:readRouteProblemForBusiness',
)
const recordSourceAction = sourceAction<BusinessProblemStatementInput, BusinessProblemStatement>(
  'customerRequestApplication:recordRouteProblemBusinessReport',
)

export const readBusinessProblemServer = createServerFn()
  .validator((data) => readInputSchema.parse(data))
  .handler(async ({ data }) => businessProblemSchema.parse(
    await callSourceAction(readSourceAction, data),
  ))

export const recordBusinessProblemStatementServer = createServerFn({ method: 'POST' })
  .validator((data) => statementInputSchema.parse(data))
  .handler(async ({ data }) => businessProblemStatementSchema.parse(
    await callSourceAction(recordSourceAction, data),
  ))
