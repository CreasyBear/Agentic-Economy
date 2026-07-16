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

const updateInputSchema = z.strictObject({
  reportRef: z.string().trim().min(1).max(300),
  expectedVersion: z.number().int().nonnegative(),
  idempotencyKey: z.string().trim().min(1).max(200),
  state: z.enum(['investigating', 'waiting_for_customer', 'closed']),
  publicMessage: z.string().trim().min(1).max(1_000),
})

export type SupportProblemList = z.infer<typeof supportProblemListSchema>
export type SupportProblemRow = z.infer<typeof supportProblemRowSchema>

const listSourceAction = sourceAction<{ limit?: number }, SupportProblemList>(
  'customerRequestApplication:listRouteProblemsForSupport',
)
const updateSourceAction = sourceAction<
  z.infer<typeof updateInputSchema>,
  z.infer<typeof customerRequestProblemStatusChangeSchema>
>('customerRequestApplication:updateRouteProblemStatus')

export const readSupportProblemsServer = createServerFn()
  .handler(async () => supportProblemListSchema.parse(
    await callSourceAction(listSourceAction, { limit: 50 }),
  ))

export const updateSupportProblemServer = createServerFn({ method: 'POST' })
  .validator((data) => updateInputSchema.parse(data))
  .handler(async ({ data }) => customerRequestProblemStatusChangeSchema.parse(
    await callSourceAction(updateSourceAction, data),
  ))
