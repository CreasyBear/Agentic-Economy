import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { callSourceAction, sourceAction } from '@/lib/server/convex-source'
import { customerRequestProblemStatusChangeSchema } from '@/modules/customer-request/agent-contract'

const supportProblemRowSchema = z.strictObject({
  reportRef: z.string(),
  requestRef: z.string(),
  version: z.number().int().nonnegative(),
  state: z.enum(['received', 'update_due', 'investigating', 'waiting_for_customer', 'closed']),
  nextActor: z.enum(['ae', 'customer', 'none']),
  category: z.enum(['incorrect_result', 'unexpected_cost', 'privacy_concern', 'could_not_stop', 'other']),
  summary: z.string(),
  business: z.string().optional(),
  reportedAt: z.number().int().nonnegative(),
  lastUpdatedAt: z.number().int().nonnegative(),
})

const supportProblemListSchema = z.union([
  z.strictObject({ kind: z.literal('allowed'), rows: z.array(supportProblemRowSchema) }),
  z.strictObject({
    kind: z.literal('denied'),
    reason: z.enum(['missing_membership', 'inactive_membership', 'action_not_allowed']),
    rows: z.array(z.never()),
  }),
])

const supportProblemExportSchema = z.union([
  z.strictObject({
    kind: z.literal('problem_export'),
    reportRef: z.string(),
    requestRef: z.string(),
    version: z.number().int().nonnegative(),
    state: z.enum(['received', 'update_due', 'investigating', 'waiting_for_customer', 'closed']),
    category: z.enum(['incorrect_result', 'unexpected_cost', 'privacy_concern', 'could_not_stop', 'other']),
    summary: z.string(),
    claimSource: z.literal('customer'),
    causality: z.literal('unknown'),
    resolution: z.literal('not_adjudicated'),
    nextAction: z.enum(['await_status_update', 'check_status', 'provide_information', 'none']),
    nextActor: z.enum(['ae', 'customer', 'none']),
    nextUpdateDueAt: z.number().int().nonnegative().optional(),
    decisionAuthority: z.literal('not_assigned'),
    visibility: z.enum(['customer_and_ae_only', 'share_with_affected_business']),
    evidence: z.array(z.strictObject({ receiptRef: z.string(), label: z.string() })),
    reportedAt: z.number().int().nonnegative(),
    affected: z.strictObject({ step: z.number().int().positive(), business: z.string().optional() }),
    claims: z.array(z.strictObject({
      claimSource: z.enum(['customer', 'business']),
      causalityPosition: z.enum(['reported_problem', 'supports', 'disputes', 'uncertain']),
      statement: z.string(),
      business: z.string().optional(),
      evidence: z.array(z.strictObject({ receiptRef: z.string(), label: z.string() })),
      recordedAt: z.number().int().nonnegative(),
    })).default([]),
    history: z.array(z.strictObject({
      version: z.number().int().nonnegative(),
      state: z.enum(['received', 'investigating', 'waiting_for_customer', 'closed']),
      source: z.enum(['customer', 'ae_support']),
      message: z.string(),
      recordedAt: z.number().int().nonnegative(),
    })),
  }),
  z.strictObject({ kind: z.literal('not_found') }),
  z.strictObject({
    kind: z.literal('denied'),
    reason: z.enum(['missing_membership', 'inactive_membership', 'action_not_allowed']),
  }),
])

const updateInputSchema = z.strictObject({
  reportRef: z.string().trim().min(1).max(300),
  expectedVersion: z.number().int().nonnegative(),
  idempotencyKey: z.string().trim().min(1).max(200),
  state: z.enum(['investigating', 'waiting_for_customer', 'closed']),
  publicMessage: z.string().trim().min(1).max(1_000),
})

export type SupportProblemList = z.infer<typeof supportProblemListSchema>
export type SupportProblemRow = z.infer<typeof supportProblemRowSchema>
export type SupportProblemExport = z.infer<typeof supportProblemExportSchema>

const listSourceAction = sourceAction<{ limit?: number }, SupportProblemList>(
  'customerRequestApplication:listRouteProblemsForSupport',
)
const updateSourceAction = sourceAction<
  z.infer<typeof updateInputSchema>,
  z.infer<typeof customerRequestProblemStatusChangeSchema>
>('customerRequestApplication:updateRouteProblemStatus')
const exportSourceAction = sourceAction<{ reportRef: string }, SupportProblemExport>(
  'customerRequestApplication:exportRouteProblemForSupport',
)

export const readSupportProblemsServer = createServerFn()
  .handler(async () => supportProblemListSchema.parse(
    await callSourceAction(listSourceAction, { limit: 50 }),
  ))

export const updateSupportProblemServer = createServerFn({ method: 'POST' })
  .validator((data) => updateInputSchema.parse(data))
  .handler(async ({ data }) => customerRequestProblemStatusChangeSchema.parse(
    await callSourceAction(updateSourceAction, data),
  ))

export const exportSupportProblemServer = createServerFn({ method: 'POST' })
  .validator((data) => z.strictObject({
    reportRef: z.string().trim().min(1).max(300),
  }).parse(data))
  .handler(async ({ data }) => supportProblemExportSchema.parse(
    await callSourceAction(exportSourceAction, data),
  ))
