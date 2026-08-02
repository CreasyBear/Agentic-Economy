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
  category: z.enum([
    'incorrect_result',
    'unexpected_cost',
    'duplicate_charge_or_effect',
    'privacy_concern',
    'could_not_stop',
    'other',
  ]),
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
  z.strictObject({ kind: z.literal('unavailable'), rows: z.array(z.never()) }),
])

const supportProblemExportSchema = z.union([
  z.strictObject({
    kind: z.literal('problem_export'),
    reportRef: z.string(),
    requestRef: z.string(),
    version: z.number().int().nonnegative(),
    state: z.enum(['received', 'update_due', 'investigating', 'waiting_for_customer', 'closed']),
    category: z.enum([
      'incorrect_result',
      'unexpected_cost',
      'duplicate_charge_or_effect',
      'privacy_concern',
      'could_not_stop',
      'other',
    ]),
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
    reconstruction: z.strictObject({
      request: z.strictObject({
        revision: z.number().int().nonnegative(),
        ordinaryRequest: z.string(),
      }),
      choice: z.strictObject({
        businesses: z.array(z.string()),
        selectedBecause: z.array(z.string()),
        confirmedAt: z.number().int().nonnegative(),
        validUntil: z.number().int().nonnegative(),
      }),
      authority: z.strictObject({
        state: z.enum(['current', 'expired', 'revoked']),
        source: z.literal('customer_confirmation'),
        spend: z.strictObject({
          limit: z.strictObject({ currency: z.string(), amountMinor: z.number().int().nonnegative() }),
          admitted: z.strictObject({ currency: z.string(), amountMinor: z.number().int().nonnegative() }),
        }),
        dataSharing: z.array(z.strictObject({
          classification: z.enum(['public', 'personal', 'sensitive', 'credential']),
          recipient: z.string(),
          purposes: z.array(z.string()),
          releaseState: z.enum(['authorized', 'business_step_released']),
        })),
        effects: z.array(z.strictObject({
          class: z.enum(['data_release', 'financial_exposure', 'external_state_change']),
          reversibility: z.enum(['not_applicable', 'reversible', 'conditional', 'irreversible']),
          releaseState: z.enum(['authorized', 'business_step_released']),
        })),
      }),
      execution: z.strictObject({
        state: z.enum(['queued', 'running', 'outcome_unknown', 'completed', 'failed', 'cancelled']),
        completedSteps: z.number().int().nonnegative(),
        totalSteps: z.number().int().positive(),
        duplicateRisk: z.enum(['protected_by_required_idempotency', 'mixed_or_not_applicable']),
        steps: z.array(z.strictObject({
          step: z.number().int().positive(),
          business: z.string(),
          state: z.enum([
            'blocked', 'queued', 'leased', 'ready_to_contact', 'contacting', 'awaiting_result',
            'completed', 'failed', 'outcome_unknown', 'cancelled',
          ]),
          evidence: z.array(z.strictObject({ receiptRef: z.string(), label: z.string() })),
        })),
      }),
      recovery: z.strictObject({
        nextActor: z.enum(['ae', 'customer', 'none']),
        nextAction: z.enum(['await_status_update', 'check_status', 'provide_information', 'none']),
        retry: z.enum(['not_needed', 'safe', 'blocked_until_reconciled']),
      }),
    }).optional(),
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
  .handler(async (): Promise<SupportProblemList> => {
    try {
      return supportProblemListSchema.parse(await callSourceAction(listSourceAction, { limit: 50 }))
    } catch {
      return { kind: 'unavailable', rows: [] }
    }
  })

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
