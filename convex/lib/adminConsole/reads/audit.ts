import type { AdminAuditFilter, AdminAuditRow } from '@/lib/operator/admin-console/audit.contracts'
import { isRecord } from '@/modules/common/is-record'
import type { Doc, DataModel } from '../../../_generated/dataModel'
import type { QueryCtx } from '../../../_generated/server'
import {
  type Expression,
  type FilterBuilder,
  type PaginationOptions,
  type PaginationResult,
} from 'convex/server'
import { v } from 'convex/values'

export const adminAuditFilterValue = v.object({
  eventType: v.optional(v.string()),
  actorRef: v.optional(v.string()),
  target: v.optional(v.object({ type: v.string(), ref: v.string() })),
  correlationId: v.optional(v.string()),
  from: v.optional(v.number()),
  to: v.optional(v.number()),
})

export const adminAuditRowValue = v.object({
  id: v.string(),
  createdAt: v.number(),
  eventType: v.string(),
  actorRef: v.union(v.string(), v.null()),
  targetType: v.union(v.string(), v.null()),
  targetRef: v.union(v.string(), v.null()),
  outcome: v.union(v.string(), v.null()),
  correlationId: v.union(v.string(), v.null()),
  admin: v.union(v.object({
    permission: v.string(),
    reasonCode: v.string(),
    evidenceRefs: v.array(v.string()),
    beforeState: v.union(v.string(), v.null()),
    afterState: v.union(v.string(), v.null()),
  }), v.null()),
})

export const adminApprovalProposalValue = v.object({
  proposalRef: v.string(),
  action: v.union(
    v.literal('set_business_suppression'),
    v.literal('change_commercial_policy'),
    v.literal('grant_promotional_credit'),
    v.literal('grant_admin_membership'),
    v.literal('revoke_admin_membership'),
  ),
  commandJson: v.union(v.string(), v.null()),
  proposerRef: v.string(),
  createdAt: v.number(),
  expiresAt: v.number(),
})

type AuditIndex = 'correlationId' | 'target' | 'actorRef' | 'eventType' | 'createdAt'

export async function listAdminAuditEventsPage(
  ctx: QueryCtx,
  filter: AdminAuditFilter,
  paginationOpts: PaginationOptions,
): Promise<PaginationResult<AdminAuditRow>> {
  const indexedBy = selectAuditIndex(filter)
  const query = indexedAuditQuery(ctx, filter, indexedBy)
  const result = await query
    .filter((builder) => builder.and(...remainingAuditFilters(builder, filter, indexedBy)))
    .order('desc')
    .paginate(paginationOpts)
  const now = Date.now()
  return {
    ...result,
    page: await Promise.all(result.page.map(async (event) => {
      const audit = toAdminAuditRow(event)
      const proposalRef = event.targetRef
      if (event.eventType !== 'admin.action_proposed' || proposalRef === null
        || audit.admin?.afterState !== 'awaiting_second_approval') return audit
      const proposal = await ctx.db.query('adminApprovalProposals')
        .withIndex('by_proposalRef', (q) => q.eq('proposalRef', proposalRef)).unique()
      return proposal !== null && proposal.status === 'awaiting_second_approval' && proposal.expiresAt <= now
        ? { ...audit, admin: { ...audit.admin, afterState: 'expired' } }
        : audit
    })),
  }
}

function selectAuditIndex(filter: AdminAuditFilter): AuditIndex {
  if (filter.correlationId !== undefined) return 'correlationId'
  if (filter.target !== undefined) return 'target'
  if (filter.actorRef !== undefined) return 'actorRef'
  if (filter.eventType !== undefined) return 'eventType'
  return 'createdAt'
}

function indexedAuditQuery(
  ctx: QueryCtx,
  filter: AdminAuditFilter,
  indexedBy: AuditIndex,
) {
  if (indexedBy === 'correlationId' && filter.correlationId !== undefined) {
    const correlationId = filter.correlationId
    return ctx.db.query('auditEvents').withIndex('by_correlationId_and_createdAt', (builder) => {
      const prefix = builder.eq('correlationId', correlationId)
      if (filter.from === undefined) {
        return filter.to === undefined ? prefix : prefix.lt('createdAt', filter.to)
      }
      const lowerBounded = prefix.gte('createdAt', filter.from)
      return filter.to === undefined ? lowerBounded : lowerBounded.lt('createdAt', filter.to)
    })
  }
  if (indexedBy === 'target' && filter.target !== undefined) {
    const target = filter.target
    return ctx.db.query('auditEvents').withIndex(
      'by_targetType_and_targetRef_and_createdAt',
      (builder) => {
        const prefix = builder.eq('targetType', target.type).eq('targetRef', target.ref)
        if (filter.from === undefined) {
          return filter.to === undefined ? prefix : prefix.lt('createdAt', filter.to)
        }
        const lowerBounded = prefix.gte('createdAt', filter.from)
        return filter.to === undefined ? lowerBounded : lowerBounded.lt('createdAt', filter.to)
      },
    )
  }
  if (indexedBy === 'actorRef' && filter.actorRef !== undefined) {
    const actorRef = filter.actorRef
    return ctx.db.query('auditEvents').withIndex('by_actorRef_and_createdAt', (builder) => {
      const prefix = builder.eq('actorRef', actorRef)
      if (filter.from === undefined) {
        return filter.to === undefined ? prefix : prefix.lt('createdAt', filter.to)
      }
      const lowerBounded = prefix.gte('createdAt', filter.from)
      return filter.to === undefined ? lowerBounded : lowerBounded.lt('createdAt', filter.to)
    })
  }
  if (indexedBy === 'eventType' && filter.eventType !== undefined) {
    const eventType = filter.eventType
    return ctx.db.query('auditEvents').withIndex('by_eventType_and_createdAt', (builder) => {
      const prefix = builder.eq('eventType', eventType)
      if (filter.from === undefined) {
        return filter.to === undefined ? prefix : prefix.lt('createdAt', filter.to)
      }
      const lowerBounded = prefix.gte('createdAt', filter.from)
      return filter.to === undefined ? lowerBounded : lowerBounded.lt('createdAt', filter.to)
    })
  }
  return ctx.db.query('auditEvents').withIndex('by_createdAt', (builder) => {
    if (filter.from === undefined) {
      return filter.to === undefined ? builder : builder.lt('createdAt', filter.to)
    }
    const lowerBounded = builder.gte('createdAt', filter.from)
    return filter.to === undefined ? lowerBounded : lowerBounded.lt('createdAt', filter.to)
  })
}

function remainingAuditFilters(
  builder: FilterBuilder<DataModel['auditEvents']>,
  filter: AdminAuditFilter,
  indexedBy: AuditIndex,
): Expression<boolean>[] {
  const expressions: Expression<boolean>[] = []
  if (indexedBy !== 'eventType' && filter.eventType !== undefined) {
    expressions.push(builder.eq(builder.field('eventType'), filter.eventType))
  }
  if (indexedBy !== 'actorRef' && filter.actorRef !== undefined) {
    expressions.push(builder.eq(builder.field('actorRef'), filter.actorRef))
  }
  if (indexedBy !== 'target' && filter.target !== undefined) {
    expressions.push(builder.eq(builder.field('targetType'), filter.target.type))
    expressions.push(builder.eq(builder.field('targetRef'), filter.target.ref))
  }
  if (indexedBy !== 'correlationId' && filter.correlationId !== undefined) {
    expressions.push(builder.eq(builder.field('correlationId'), filter.correlationId))
  }
  return expressions
}

function toAdminAuditRow(row: Doc<'auditEvents'>): AdminAuditRow {
  return {
    id: String(row._id),
    createdAt: row.createdAt,
    eventType: row.eventType,
    actorRef: row.actorRef,
    targetType: row.targetType,
    targetRef: row.targetRef,
    outcome: row.outcome ?? null,
    correlationId: row.correlationId,
    admin: adminDetails(row),
  }
}

function adminDetails(row: Doc<'auditEvents'>): AdminAuditRow['admin'] {
  const payload: unknown = JSON.parse(row.redactedPayloadJson)
  const permission = readString(payload, 'permission')
    ?? (row.eventType === 'admin.action_proposed' ? 'read_admin_readbacks' : undefined)
  if (permission === undefined) return null
  return {
    permission,
    reasonCode: readString(payload, 'reasonCode') ?? row.reasonCode ?? '',
    evidenceRefs: readStringArray(payload, 'evidenceRefs') ?? row.evidenceRefs,
    beforeState: row.beforeState ?? null,
    afterState: row.afterState ?? null,
  }
}

function readString(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined
  const field = value[key]
  return typeof field === 'string' ? field : undefined
}

function readStringArray(value: unknown, key: string): readonly string[] | undefined {
  if (!isRecord(value)) return undefined
  const field = value[key]
  return Array.isArray(field) && field.every((item) => typeof item === 'string')
    ? field
    : undefined
}
