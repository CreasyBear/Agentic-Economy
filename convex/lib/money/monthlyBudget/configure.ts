import { v, type Infer } from 'convex/values'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import { brandNonEmpty } from '../../../../src/modules/common/ids'
import { redactPayload, validateAuditEvent } from '../../../../src/modules/observability/public'
import type { MutationCtx } from '../../../_generated/server'
import { InteractiveAuthorityError } from '../../../interactiveAuthority'
import { persistAuditEvent } from '../../security/audit/persistence'
import { requireAuthenticatedAccountContext } from '../billingSettings/authority'

const NON_NEGATIVE_UNITS_PATTERN = /^\d+$/u

type ConfigureMonthlySpendBudgetReceipt = Readonly<
  | { kind: 'updated'; revision: number }
  | { kind: 'replayed'; revision: number }
>

export const configureMonthlySpendBudgetResult = v.union(
  v.object({ kind: v.literal('updated'), revision: v.number() }),
  v.object({ kind: v.literal('replayed'), revision: v.number() }),
)

export const configureMonthlySpendBudgetArgs = v.object({
    enabled: v.boolean(),
    ceilingUnits: v.string(),
    expectedRevision: v.number(),
    correlationRef: v.string(),
    idempotencyRef: v.string(),
})

function validateCeilingUnits(value: string): void {
  if (!NON_NEGATIVE_UNITS_PATTERN.test(value)) {
    throw new InteractiveAuthorityError('monthly_spend_budget_units_invalid')
  }
}

function validateCorrelationRef(value: string): void {
  const sanitized = value.trim()
  if (sanitized.length < 3 || sanitized.length > 128) {
    throw new InteractiveAuthorityError('correlation_ref_invalid')
  }
}

async function recordMonthlySpendCeilingConfiguredAudit(
  db: MutationCtx['db'],
  input: Readonly<{
    actorPrincipalRef: string
    activeAccountRef: string
    authorityGeneration: number
    correlationRef: string
    idempotencyRef: string
    beforeState: string
    afterState: string
    createdAt: number
  }>,
): Promise<void> {
  const commandDigest = canonicalDigest({
    enabled: input.afterState,
    correlationRef: input.correlationRef,
    idempotencyRef: input.idempotencyRef,
  })
  const eventId = `audit:monthly-spend-ceiling:${input.correlationRef}`
  const audit = validateAuditEvent({
    eventId: brandNonEmpty(eventId, 'AuditEventId'),
    eventType: 'billing.monthly_spend_ceiling_configured',
    actorKind: 'owner',
    actorRef: input.actorPrincipalRef,
    activeAccountRef: input.activeAccountRef,
    authorityGeneration: input.authorityGeneration,
    sourceSystem: 'ae_recorded',
    targetType: 'billing',
    targetRef: input.activeAccountRef,
    idempotencyKey: brandNonEmpty(input.idempotencyRef, 'OperationKey'),
    correlationId: brandNonEmpty(input.correlationRef, 'CorrelationId'),
    beforeState: input.beforeState,
    afterState: input.afterState,
    evidenceRefs: [],
    redactedPayload: redactPayload({
      correlationRef: input.correlationRef,
    }),
    payloadHash: brandNonEmpty(commandDigest, 'SourceHash'),
    createdAt: input.createdAt,
  })
  if (!audit.valid) throw new Error(`monthly_spend_ceiling_audit_invalid:${audit.reason}`)
  await persistAuditEvent(db, audit.event)
}

export async function configureMonthlySpendBudgetHandler(ctx: MutationCtx, args: Infer<typeof configureMonthlySpendBudgetArgs>): Promise<ConfigureMonthlySpendBudgetReceipt> {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new InteractiveAuthorityError('identity_invalid')
    const {
      principal,
      canonicalAccountRef,
      authorityGeneration,
    } = await requireAuthenticatedAccountContext(ctx.db, identity)

    validateCorrelationRef(args.correlationRef)
    validateCeilingUnits(args.ceilingUnits)

    const existing = await ctx.db
      .query('moneyMonthlySpendBudgets')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', canonicalAccountRef))
      .unique()

    const currentRevision = existing?.revision ?? 0
    const now = Date.now()

    if (existing !== null && existing.lastCorrelationRef === args.correlationRef) {
      const isSamePayload =
        existing.enabled === args.enabled
        && existing.ceilingUnits === args.ceilingUnits
      if (isSamePayload) {
        return { kind: 'replayed', revision: currentRevision }
      }
      throw new InteractiveAuthorityError('monthly_spend_budget_correlation_mismatch')
    }

    if (args.expectedRevision !== currentRevision) {
      throw new InteractiveAuthorityError('monthly_spend_budget_revision_conflict')
    }

    const nextRevision = currentRevision + 1
    const beforeState = existing === null
      ? 'missing'
      : canonicalDigest({
          enabled: existing.enabled,
          ceilingUnits: existing.ceilingUnits,
        })
    const afterState = canonicalDigest({
      enabled: args.enabled,
      ceilingUnits: args.ceilingUnits,
    })

    if (existing !== null) {
      await ctx.db.patch(existing._id, {
        enabled: args.enabled,
        ceilingUnits: args.ceilingUnits,
        revision: nextRevision,
        lastCorrelationRef: args.correlationRef,
        updatedAt: now,
      })
    } else {
      await ctx.db.insert('moneyMonthlySpendBudgets', {
        accountRef: canonicalAccountRef,
        enabled: args.enabled,
        currency: 'AUD',
        exponent: 6,
        ceilingUnits: args.ceilingUnits,
        revision: nextRevision,
        lastCorrelationRef: args.correlationRef,
        createdAt: now,
        updatedAt: now,
      })
    }

    await recordMonthlySpendCeilingConfiguredAudit(ctx.db, {
      actorPrincipalRef: principal.principalRef,
      activeAccountRef: canonicalAccountRef,
      authorityGeneration,
      correlationRef: args.correlationRef,
      idempotencyRef: args.idempotencyRef,
      beforeState,
      afterState,
      createdAt: now,
    })

    return { kind: 'updated', revision: nextRevision }
}
