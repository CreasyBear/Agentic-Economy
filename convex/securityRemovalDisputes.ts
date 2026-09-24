import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { admissionKey, assertAdmission } from './lib/platform/rateLimit'
import { requireSourceWrite } from './lib/security/sourceWrite/admission'
import { brandNonEmpty } from '../src/modules/common/ids'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import {
  RemovalDisputeReasonCodeValues,
  openRemovalDispute as openRemovalDisputeModule,
} from '../src/modules/security/public'
import type {
  DisputeEvidenceInput,
  DisputeOpenResult,
  DisputeRecord,
  DisputeSourceState,
  RemovalDisputeReasonCode,
} from '../src/modules/security/public'
import { persistAuditEvent } from './lib/security/audit/persistence'

type OpenRemovalDisputeHandlerArgs = {
  businessId: string
  targetType: 'business' | 'service' | 'capability'
  targetRef: string
  reasonCode?: RemovalDisputeReasonCode
  contactEmail?: string
  contactPhone?: string
  contactName?: string
  evidence: DisputeEvidenceInput[]
  publicMessage?: string
  csrfToken?: string
  csrfCookie?: string
  origin?: string
  operationKey: string
  correlationId: string
  sourceWrite?: unknown
  sourceWriteRequest?: unknown
}


export async function openRemovalDisputeHandler(ctx: MutationCtx, args: OpenRemovalDisputeHandlerArgs) {
  const admission = await assertAdmission(ctx, {
    name: 'dispute-open',
    key: await admissionKey(ctx, disputeRateLimitKey({
      targetRef: args.targetRef,
      ...(args.contactEmail === undefined ? {} : { contactEmail: args.contactEmail }),
      ...(args.contactPhone === undefined ? {} : { contactPhone: args.contactPhone }),
      ...(args.contactName === undefined ? {} : { contactName: args.contactName }),
    })),
  })
  if (!admission.ok) {
    return {
      kind: 'error' as const,
      code: 'dispute_rate_limited' as const,
      retryable: true,
      reason: `Retry after ${admission.retryAfter}.`,
    }
  }
  const sourceWrite = await requireSourceWrite(ctx, args, 'removal_dispute')
  if (sourceWrite.kind === 'rejected') {
    return {
      kind: 'error' as const,
      code: 'dispute_csrf_rejected' as const,
      retryable: false,
      reason: sourceWrite.reason,
    }
  }

  const businessId = brandNonEmpty(args.businessId, 'BusinessId')
  const operationKey = brandNonEmpty(args.operationKey, 'OperationKey')
  const correlationId = brandNonEmpty(args.correlationId, 'CorrelationId')
  const source = await loadDisputeSource(ctx.db, args.targetType, args.targetRef, operationKey)
  const state = disputeSourceState(source)
  const result = openRemovalDisputeModule(state, {
    businessId,
    targetType: args.targetType,
    targetRef: args.targetRef,
    reasonCode: args.reasonCode as RemovalDisputeReasonCode,
    contact: {
      ...(args.contactEmail === undefined ? {} : { email: args.contactEmail }),
      ...(args.contactPhone === undefined ? {} : { phone: args.contactPhone }),
      ...(args.contactName === undefined ? {} : { name: args.contactName }),
    },
    evidence: args.evidence,
    ...(args.publicMessage === undefined ? {} : { publicMessage: args.publicMessage }),
    security: {
      csrf: {
        ...sourceWrite.csrf,
      },
    },
    operationKey,
    correlationId,
    now: Date.now(),
  })
  await persistOpenedDispute(ctx.db, result)
  return result.kind === 'ok'
    ? { kind: 'ok' as const, code: result.code, receipt: result.receipt }
    : result
}


type DisputeReadSource = {
  disputes: Doc<'disputes'>[]
}

async function loadDisputeSource(
  db: QueryCtx['db'],
  targetType: string,
  targetRef: string,
  operationKey: string,
): Promise<DisputeReadSource> {
  const statuses = ['opened', 'updated', 'closed', 'contested'] as const
  const [operationRow, ...targetRows] = await Promise.all([
    db.query('disputes').withIndex('by_operation_key', (query) => query.eq('operationKey', operationKey)).unique(),
    ...statuses.map((status) => db.query('disputes')
      .withIndex('by_target_status', (query) => query.eq('targetType', targetType).eq('targetRef', targetRef).eq('status', status))
      .unique()),
  ])
  const disputes = new Map<string, Doc<'disputes'>>()
  for (const row of [operationRow, ...targetRows]) {
    if (row !== null) disputes.set(String(row._id), row)
  }
  return { disputes: [...disputes.values()] }
}


async function persistOpenedDispute(
  db: MutationCtx['db'],
  result: DisputeOpenResult,
): Promise<void> {
  if (result.kind === 'error') {
    return
  }

  if (result.code !== 'dispute_open_replayed') {
    const document = disputeDocument(db, result.dispute)
    const existing = await findDisputeDocument(db, result.dispute.operationKeys)
    if (existing === null) {
      await db.insert('disputes', document)
    } else {
      await db.patch(existing._id, document)
    }
  }

  if (result.auditEvent !== undefined) {
    await persistAuditEvent(db, result.auditEvent)
  }
}


async function findDisputeDocument(
  db: MutationCtx['db'],
  operationKeys: readonly string[],
): Promise<Doc<'disputes'> | null> {
  for (const operationKey of operationKeys) {
    const row = await db
      .query('disputes')
      .withIndex('by_operation_key', (builder) => builder.eq('operationKey', operationKey))
      .unique()
    if (row !== null) {
      return row
    }
  }
  return null
}

function disputeDocument(db: MutationCtx['db'], dispute: DisputeRecord) {
  return {
    businessId: businessIdFromValue(db, dispute.businessId),
    status: dispute.status,
    openedByContactHash: dispute.openedByContactHash,
    targetType: dispute.targetType,
    targetRef: dispute.targetRef,
    reasonCode: dispute.reasonCode,
    evidenceHash: dispute.evidenceHash,
    evidenceRefs: dispute.evidenceRefs,
    publicMessageHash: dispute.publicMessageHash,
    operationKey: dispute.operationKey,
    operationKeys: dispute.operationKeys,
    correlationId: dispute.correlationId,
    requestCount: dispute.requestCount,
    createdAt: dispute.createdAt,
    updatedAt: dispute.updatedAt,
  }
}

function disputeSourceState(source: DisputeReadSource): DisputeSourceState {
  return {
    disputes: source.disputes.map(disputeFromDocument),
    auditEvents: [],
  }
}

function disputeFromDocument(row: Doc<'disputes'>): DisputeRecord {
  return {
    disputeId: String(row._id),
    businessId: brandNonEmpty(String(row.businessId), 'BusinessId'),
    status: row.status,
    openedByContactHash: row.openedByContactHash,
    targetType: row.targetType,
    targetRef: row.targetRef,
    reasonCode: readRemovalDisputeReasonCode(row.reasonCode),
    evidenceHash: row.evidenceHash,
    evidenceRefs: [...row.evidenceRefs],
    publicMessageHash: row.publicMessageHash,
    operationKey: brandNonEmpty(row.operationKey, 'OperationKey'),
    operationKeys: row.operationKeys.map((value) => brandNonEmpty(value, 'OperationKey')),
    correlationId: brandNonEmpty(row.correlationId, 'CorrelationId'),
    requestCount: row.requestCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function readRemovalDisputeReasonCode(value: string): RemovalDisputeReasonCode {
  const reasonCode = RemovalDisputeReasonCodeValues.find((candidate) => candidate === value)
  if (reasonCode === undefined) {
    throw new Error('invalid_dispute_reason_code')
  }
  return reasonCode
}


function disputeRateLimitKey(args: {
  targetRef: string
  contactEmail?: string
  contactPhone?: string
  contactName?: string
}): string {
  return `removal:${canonicalDigest({
    email: args.contactEmail?.toLowerCase().trim() ?? null,
    name: args.contactName?.trim() ?? null,
    phone: args.contactPhone?.trim() ?? null,
    targetRef: args.targetRef,
  })}`
}


function businessIdFromValue(db: MutationCtx['db'], value: string): Id<'businesses'> {
  const id = db.normalizeId('businesses', value)
  if (id === null) {
    throw new Error('invalid_business_id')
  }
  return id
}
