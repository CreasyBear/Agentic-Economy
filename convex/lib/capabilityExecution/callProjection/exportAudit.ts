import { v, type ObjectType } from 'convex/values'
import type { MutationCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { brandNonEmpty } from '@/modules/common/ids'
import { redactPayload, validateAuditEvent } from '@/modules/observability/public'
import { persistAuditEvent } from '../../security/audit/persistence'
import { validUsagePeriod } from './contracts'
import { callExportSourceDigest } from './exportSnapshot'

export const beginCallExportArgs = {
  exportRef: v.string(), principalRef: v.optional(v.string()),
  periodStartAt: v.number(), periodEndAt: v.number(),
  status: v.union(v.literal('all'), v.literal('completed'), v.literal('refused'), v.literal('outcome_unknown')),
}
export const beginCallExportResult = v.object({ accountRef: v.string(), snapshotAt: v.number() })
export function callExportScope(accountRef: string, actorRef: string, args: ObjectType<typeof beginCallExportArgs>) {
  return { accountRef, actorRef, exportRef: args.exportRef,
    principalRef: args.principalRef ?? null, periodStartAt: args.periodStartAt, periodEndAt: args.periodEndAt, status: args.status }
}
export function callExportAuditId(accountRef: string, exportRef: string) { return `audit:${accountRef}:${exportRef}` }

/** Audit requested access, not a claimed download or accounting consequence.
 * Keep bounded scope metadata only and derive Account/actor from owner authority. */
export async function beginCallExportHandler(ctx: MutationCtx, args: ObjectType<typeof beginCallExportArgs>) {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') throw new Error('call_history_authentication_required')
  if (!validUsagePeriod(args.periodStartAt, args.periodEndAt)
    || !/^call-usage-export:[a-f0-9-]{36}$/u.test(args.exportRef)
    || (args.principalRef !== undefined && (args.principalRef.length === 0 || args.principalRef.length > 500))) {
    throw new Error('call_export_scope_invalid')
  }
  const scope = callExportScope(actor.canonicalAccountRef, actor.canonicalPrincipalRef, args)
  const digest = canonicalDigest(scope)
  const eventId = callExportAuditId(actor.canonicalAccountRef, args.exportRef)
  const existing = await ctx.db.query('auditEvents').withIndex('by_eventId', (index) => index.eq('eventId', eventId)).unique()
  if (existing !== null) {
    if (existing.payloadHash !== digest) throw new Error('call_export_scope_conflict')
    return { accountRef: actor.canonicalAccountRef, snapshotAt: Math.max(0, existing.createdAt - 1) }
  }
  const createdAt = Date.now()
  const sourceDigest = await callExportSourceDigest(ctx, { ...args, accountRef: actor.canonicalAccountRef, snapshotAt: Math.max(0, createdAt - 1) })
  const audit = validateAuditEvent({
    eventId: brandNonEmpty(eventId, 'AuditEventId'), eventType: 'billing.call_usage_export_requested',
    actorKind: 'owner', actorRef: actor.canonicalPrincipalRef, activeAccountRef: actor.canonicalAccountRef,
    authorityGeneration: actor.authorityRevision.account, sourceSystem: 'ae_recorded',
    targetType: 'billing', targetRef: actor.canonicalAccountRef,
    idempotencyKey: brandNonEmpty(args.exportRef, 'OperationKey'),
    correlationId: brandNonEmpty(args.exportRef, 'CorrelationId'),
    beforeState: 'not_requested', afterState: 'requested', evidenceRefs: [],
    redactedPayload: redactPayload({ ...scope, sourceDigest }), payloadHash: brandNonEmpty(digest, 'SourceHash'), createdAt,
  })
  if (!audit.valid) throw new Error(`call_export_audit_invalid:${audit.reason}`)
  await persistAuditEvent(ctx.db, audit.event)
  return { accountRef: actor.canonicalAccountRef, snapshotAt: Math.max(0, createdAt - 1) }
}
