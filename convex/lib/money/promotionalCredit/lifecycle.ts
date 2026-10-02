import { financialEnvironmentMatches } from '../formance/contracts'
import { v, type Infer } from 'convex/values'
import { env } from '../../../_generated/server'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import { bindWorkloadCronActionContext } from '../../platform/workloadCron/consequence'
import { parseWorkloadCronSnapshot, workloadCronSnapshotValue, type WorkloadCronSnapshot } from '../../platform/workloadCron/context'
import type { ActionCtx, MutationCtx, QueryCtx } from '../../../_generated/server'
import { internal } from '../../../_generated/api'
import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import { brandNonEmpty } from '@/modules/common/ids'
import { promotionalCreditReference } from '@/modules/money/public'
import { validateAuditEvent } from '@/modules/observability/public'
import { persistAuditEvent } from '../../security/audit/persistence'
import type { Doc } from '../../../_generated/dataModel'
import { parseAdminOperationReceipt } from '../../adminConsole/commands/idempotency'
import { ADMIN_ACTION_PERMISSION } from '@/lib/operator/admin-console/contracts'
import { isRecord } from '@/modules/common/is-record'

// Requires surviving original intent, not current admin membership or reconstructed approval.
// Ensures claim and completion bind the same pending receipt, requested audit and grant input.
// Invariant: no native work or local credit initialization from missing/conflicting authority.
// On violation: refuse financial work; claim may renew only its retry clocks to avoid queue
// starvation. Completion is inert. Expiry remains governed by its frozen booked revision.
// One bounded read shared by the two transactional consumers avoids divergent evidence checks.
async function readPendingGrantAuthority(
  ctx: Pick<MutationCtx, 'db'>,
  row: Doc<'moneyPromotionalGrants'>,
): Promise<Doc<'operationKeys'> | null> {
  if (row.auditEventRef === undefined || row.grantRef !== canonicalDigest({
    format: 'ae.promotional-credit-grant:v1', actorRef: row.actorRef, operationKey: row.operationKey,
    input: { accountRef: row.accountRef, environment: row.environment, amountUnits: row.amountUnits, expiresAt: row.expiresAt },
  })) return null
  const operationName = 'admin:grant_promotional_credit'
  const operation = await ctx.db.query('operationKeys').withIndex('by_actor_operation_key', q => q
    .eq('actorRef', row.actorRef).eq('operationName', operationName).eq('key', row.operationKey)).unique()
  if (operation === null || operation.scope !== 'admin_operator' || operation.actorKind !== 'admin'
    || operation.status !== 'in_progress' || operation.resultJson === undefined || operation.resultHash === undefined
    || !isCanonicalDigest(operation.requestHash)) return null
  const expectedAuditRef = `audit:money.promotional_credit_requested:${canonicalDigest({
    actorRef: row.actorRef, operationName, key: row.operationKey, requestHash: operation.requestHash,
  })}`
  if (row.auditEventRef !== expectedAuditRef) return null
  const audit = await ctx.db.query('auditEvents').withIndex('by_eventId', q => q.eq('eventId', expectedAuditRef)).unique()
  if (audit === null || audit.eventType !== 'money.promotional_credit_requested'
    || audit.actorKind !== 'admin' || audit.actorRef !== row.actorRef
    || audit.targetType !== 'account' || audit.targetRef !== row.accountRef
    || audit.idempotencyKey !== row.operationKey || audit.correlationId !== row.correlationId
    || audit.reasonCode !== row.reasonCode || audit.beforeState !== 'absent' || audit.afterState !== 'pending'
    || canonicalDigest(audit.evidenceRefs) !== canonicalDigest(row.evidenceRefs)) return null
  try {
    const receipt = parseAdminOperationReceipt(operation.resultJson, operation.resultHash, 'grant_promotional_credit')
    if (receipt.kind !== 'pending' || receipt.auditEventRef !== expectedAuditRef
      || receipt.correlationId !== row.correlationId || receipt.effectRefs.length !== 1
      || receipt.effectRefs[0] !== row.grantRef) return null
    const payload: unknown = JSON.parse(audit.redactedPayloadJson)
    if (!isRecord(payload) || audit.payloadHash !== canonicalDigest(payload)
      || payload.commandDigest !== row.commandDigest || payload.reasonCode !== row.reasonCode
      || payload.permission !== ADMIN_ACTION_PERMISSION.grant_promotional_credit
      || canonicalDigest(payload.evidenceRefs) !== canonicalDigest(row.evidenceRefs)) return null
  } catch {
    return null
  }
  return operation
}

const workValue = v.object({
  kind: v.union(v.literal('grant'), v.literal('expiry')),
  grantRef: v.string(), accountRef: v.string(), environment: v.union(v.literal('sandbox'), v.literal('production')),
  amountUnits: v.string(), expiresAt: v.number(), commandDigest: v.string(), revision: v.number(),
})
export const grantRefArgs = v.object({ grantRef: v.string() })
export const claimWorkResult = v.union(v.null(), workValue, v.object({
  kind: v.literal('refused'), code: v.union(v.literal('promotional_credit_authority_invalid'), v.literal('promotional_credit_expiry_invalid')),
}))
export const claimWorkHandler = async (ctx: MutationCtx, args: Infer<typeof grantRefArgs>): Promise<Infer<typeof claimWorkResult>> => {
  const row = await ctx.db.query('moneyPromotionalGrants').withIndex('by_grantRef', q => q.eq('grantRef', args.grantRef)).unique()
  if (row === null || !financialEnvironmentMatches(row.environment)) return null
  const now = Date.now()
  if (row.bookingState === 'pending') {
    const authority = await readPendingGrantAuthority(ctx, row)
    await ctx.db.patch(row._id, { nextWorkAt: now + 60_000, updatedAt: now })
    if (authority === null) return { kind: 'refused', code: 'promotional_credit_authority_invalid' }
    return {
      kind: 'grant' as const, grantRef: row.grantRef, accountRef: row.accountRef, environment: row.environment,
      amountUnits: row.amountUnits, expiresAt: row.expiresAt, commandDigest: row.commandDigest, revision: 1,
    }
  }
  if (row.pendingExpiry !== undefined) {
    await ctx.db.patch(row._id, { nextWorkAt: now + 60_000, updatedAt: now })
    const pending = row.pendingExpiry
    if (row.bookingState !== 'booked' || !Number.isSafeInteger(pending.revision) || pending.revision <= 0
      || pending.revision !== row.expiryRevision
      || pending.commandRef !== promotionalCreditReference(row.grantRef, pending.revision, 'expire')) {
      return { kind: 'refused', code: 'promotional_credit_expiry_invalid' }
    }
    return {
      kind: 'expiry' as const, grantRef: row.grantRef, accountRef: row.accountRef, environment: row.environment,
      amountUnits: row.pendingExpiry.amountUnits, expiresAt: row.expiresAt,
      commandDigest: row.commandDigest, revision: row.pendingExpiry.revision,
    }
  }
  if (row.expiresAt > now) {
    await ctx.db.patch(row._id, { nextWorkAt: row.expiresAt, updatedAt: now })
    return null
  }
  if (BigInt(row.availableUnits) === 0n) {
    await ctx.db.patch(row._id, { nextWorkAt: undefined, updatedAt: now })
    return null
  }
  const revision = row.expiryRevision + 1
  const amountUnits = row.availableUnits
  await ctx.db.patch(row._id, {
    availableUnits: '0', expiryRevision: revision,
    pendingExpiry: {
      revision, amountUnits,
      commandRef: promotionalCreditReference(row.grantRef, revision, 'expire'),
    },
    nextWorkAt: now + 60_000, updatedAt: now,
  })
  return {
    kind: 'expiry' as const, grantRef: row.grantRef, accountRef: row.accountRef, environment: row.environment,
    amountUnits, expiresAt: row.expiresAt, commandDigest: row.commandDigest, revision,
  }
}

export const finishWorkArgs = v.object({
  ...workValue.fields,
  transactionRefs: v.array(v.string()),
})
export const finishWorkResult = v.boolean()
export const finishWorkHandler = async (ctx: MutationCtx, args: Infer<typeof finishWorkArgs>) => {
  const row = await ctx.db.query('moneyPromotionalGrants').withIndex('by_grantRef', q => q.eq('grantRef', args.grantRef)).unique()
  const [transactionRef] = args.transactionRefs
  if (row === null || args.transactionRefs.length !== 1 || transactionRef === undefined
    || row.accountRef !== args.accountRef || row.environment !== args.environment
    || !financialEnvironmentMatches(row.environment)
    || row.commandDigest !== args.commandDigest || row.expiresAt !== args.expiresAt) return false
  const now = Date.now()
  if (args.kind === 'grant') {
    if (args.revision !== 1 || row.amountUnits !== args.amountUnits
      || transactionRef !== promotionalCreditReference(row.grantRef, 1, 'grant')) return false
    if (row.bookingState === 'booked') return row.transactionRef === transactionRef
    if (row.bookingState !== 'pending') return false
    const operation = await readPendingGrantAuthority(ctx, row)
    if (operation === null || row.auditEventRef === undefined) return false
    const eventId = brandNonEmpty(`audit:money.promotional_credit_granted:${canonicalDigest({ grantRef: row.grantRef, transactionRef })}`, 'AuditEventId')
    const payload = { grantRef: row.grantRef, commandDigest: row.commandDigest, transactionRef, requestAuditEventRef: row.auditEventRef }
    const audit = validateAuditEvent({
      eventId, eventType: 'money.promotional_credit_granted', actorKind: 'admin', actorRef: row.actorRef,
      targetType: 'account', targetRef: row.accountRef,
      idempotencyKey: brandNonEmpty(row.operationKey, 'OperationKey'),
      correlationId: brandNonEmpty(row.correlationId, 'CorrelationId'),
      beforeState: 'pending', afterState: 'booked', reasonCode: row.reasonCode,
      evidenceRefs: [row.auditEventRef, ...row.evidenceRefs].slice(0, 8),
      redactedPayload: payload, payloadHash: canonicalDigest(payload), createdAt: now,
    })
    if (!audit.valid) return false
    await persistAuditEvent(ctx.db, audit.event)
    const receipt = {
      kind: 'completed' as const, action: 'grant_promotional_credit' as const,
      code: 'promotional_credit_granted' as const, effectRefs: [row.grantRef, transactionRef],
      auditEventRef: eventId, correlationId: row.correlationId,
    }
    await ctx.db.patch(operation._id, {
      status: 'succeeded', resultJson: JSON.stringify(receipt), resultHash: canonicalDigest(receipt),
      effectRefs: [...receipt.effectRefs], updatedAt: now,
    })
    await ctx.db.patch(row._id, {
      bookingState: 'booked', transactionRef,
      availableUnits: row.amountUnits,
      nextWorkAt: row.expiresAt <= now ? now : row.expiresAt,
      updatedAt: now,
    })
    return true
  }
  const pending = row.pendingExpiry
  if (row.bookingState !== 'booked' || pending === undefined
    || !Number.isSafeInteger(pending.revision) || pending.revision <= 0 || pending.revision !== row.expiryRevision
    || pending.revision !== args.revision || pending.amountUnits !== args.amountUnits
    || pending.commandRef !== transactionRef
    || transactionRef !== promotionalCreditReference(row.grantRef, pending.revision, 'expire')) return false
  const payload = { grantRef: row.grantRef, revision: args.revision, amountUnits: args.amountUnits, transactionRef }
  const audit = validateAuditEvent({
    eventId: brandNonEmpty(`audit:money.promotional_credit_expired:${canonicalDigest(payload)}`, 'AuditEventId'),
    eventType: 'money.promotional_credit_expired', actorKind: 'system', actorRef: 'system:promotional-credit-expiry',
    targetType: 'account', targetRef: row.accountRef,
    idempotencyKey: brandNonEmpty(transactionRef, 'OperationKey'),
    correlationId: brandNonEmpty(row.correlationId, 'CorrelationId'),
    beforeState: 'expiry_pending', afterState: 'expired', reasonCode: 'expired',
    evidenceRefs: [transactionRef], redactedPayload: payload, payloadHash: canonicalDigest(payload), createdAt: now,
  })
  if (!audit.valid) throw new Error(`promotional_credit_expiry_audit_invalid:${audit.reason}`)
  await persistAuditEvent(ctx.db, audit.event)
  const remaining = BigInt(row.availableUnits)
  await ctx.db.patch(row._id, {
    pendingExpiry: undefined,
    nextWorkAt: remaining > 0n ? now : undefined,
    updatedAt: now,
  })
  return true
}

export const dueArgs = v.object({ now: v.number() })
export const dueResult = v.array(v.string())
export const dueHandler = async (ctx: QueryCtx, args: Infer<typeof dueArgs>) => {
  const environment = deploymentPaymentEnvironment(env)
  if (environment === undefined) return []
  const rows = await ctx.db.query('moneyPromotionalGrants')
    .withIndex('by_environment_and_nextWorkAt', q => q.eq('environment', environment).gt('nextWorkAt', 0).lte('nextWorkAt', args.now)).take(25)
  return rows.filter(row => row.nextWorkAt !== undefined).map(row => row.grantRef)
}

export const processResult = v.boolean()
export const processHandler = async (ctx: ActionCtx, args: Infer<typeof grantRefArgs>): Promise<boolean> => {
  const work = await ctx.runMutation(internal.moneyPromotionalCredit.claimWork, args)
  if (work === null) return true
  if (work.kind === 'refused') return false
  const { kind: _, environment: expectedEnvironment, ...booking } = work
  void _
  const result = work.kind === 'grant'
    ? await ctx.runAction(internal.moneyFormance.grantPromotionalCredit, { ...booking, expectedEnvironment })
    : await ctx.runAction(internal.moneyFormance.expirePromotionalCredit, { ...booking, expectedEnvironment })
  if (result.kind !== 'completed') return false
  return await ctx.runMutation(internal.moneyPromotionalCredit.finishWork, {
    ...work, transactionRefs: [...result.transactionRefs],
  })
}

export const sweepArgs = v.object({ workload: workloadCronSnapshotValue })
export const sweepResult = v.number()
export const sweepHandler = async (ctx: ActionCtx, args: Infer<typeof sweepArgs>): Promise<number> => {
  const workload: WorkloadCronSnapshot = await ctx.runQuery(internal.workloadCron.reconcile, {
    name: 'reconcile promotional credit', snapshot: parseWorkloadCronSnapshot(args.workload),
  })
  const admitted = bindWorkloadCronActionContext(ctx, { name: 'reconcile promotional credit', snapshot: workload })
  const due = await ctx.runQuery(internal.moneyPromotionalCredit.due, { now: Date.now() })
  for (const grantRef of due) await processHandler(admitted, { grantRef })
  return due.length
}
