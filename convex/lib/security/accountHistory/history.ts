import { paginationOptsValidator } from 'convex/server'
import type { Infer } from 'convex/values'
import { Package3AuditEventTypeValues } from '../../../../src/modules/observability/public'
import { resolveInteractiveAuthorityContext } from '../../../interactiveAuthority'
import type { QueryCtx } from '../../../_generated/server'

const package3EventTypes = new Set<string>(Package3AuditEventTypeValues)

// Package 3 unified history starts at this deployment boundary. Older audit
// rows remain available in their existing domain-specific views.
export const ACCOUNT_SECURITY_HISTORY_ACTIVATED_AT = Date.parse('2026-09-01T06:11:18.000Z')

export const listCurrentOwnerSecurityHistoryHandler = async (ctx: QueryCtx, args: { paginationOpts: Infer<typeof paginationOptsValidator> }) => {
    if (!Number.isSafeInteger(args.paginationOpts.numItems)
      || args.paginationOpts.numItems < 1
      || args.paginationOpts.numItems > 50) throw new Error('security_history_page_size_invalid')
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new Error('security_history_authentication_required')
    const authority = await resolveInteractiveAuthorityContext(ctx.db, identity)
    const page = await ctx.db.query('auditEvents')
      .withIndex('by_activeAccountRef_and_createdAt', (index) => index
        .eq('activeAccountRef', authority.accountRef)
        .gte('createdAt', ACCOUNT_SECURITY_HISTORY_ACTIVATED_AT))
      .filter((filter) => filter.neq(filter.field('sourceSystem'), undefined))
      .order('desc')
      .paginate(args.paginationOpts)
    return {
      ...page,
      page: page.page.flatMap((event) => {
        if (!package3EventTypes.has(event.eventType)
          || event.sourceSystem === undefined
          || event.afterState === undefined) return []
        return [{
          eventRef: event.eventId,
          eventType: event.eventType as typeof Package3AuditEventTypeValues[number],
          actorKind: event.actorKind,
          actorRef: event.actorRef,
          targetType: event.targetType,
          targetRef: event.targetRef,
          outcome: event.afterState,
          sourceSystem: event.sourceSystem,
          ...(event.observedAt === undefined ? {} : { observedAt: event.observedAt }),
          recordedAt: event.createdAt,
          correlationRef: event.correlationId,
        }]
      }),
    }
}

export const listCurrentOwnerAgentSecurityHistoryHandler = async (ctx: QueryCtx, args: { principalRef: string; paginationOpts: Infer<typeof paginationOptsValidator> }) => {
    if (!Number.isSafeInteger(args.paginationOpts.numItems)
      || args.paginationOpts.numItems < 1
      || args.paginationOpts.numItems > 50) throw new Error('security_history_page_size_invalid')
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new Error('security_history_authentication_required')
    const authority = await resolveInteractiveAuthorityContext(ctx.db, identity)
    if (authority.provenance.accessKind !== 'ownership') throw new Error('agent_history_not_found')
    const [principal, membership, admission] = await Promise.all([
      ctx.db.query('principals')
        .withIndex('by_principalRef', (index) => index.eq('principalRef', args.principalRef))
        .unique(),
      ctx.db.query('memberships')
        .withIndex('by_accountRef_and_memberPrincipalRef_and_lifecycle', (index) => index
          .eq('accountRef', authority.accountRef)
          .eq('memberPrincipalRef', args.principalRef)
          .eq('lifecycle', 'active'))
        .unique(),
      ctx.db.query('agentAccessPrincipals')
        .withIndex('by_principalId', (index) => index.eq('principalId', args.principalRef))
        .unique(),
    ])
    if (principal?.kind !== 'agent'
      || membership === null
      || admission === null
      || admission.ownerId !== authority.accountRef) throw new Error('agent_history_not_found')

    const page = await ctx.db.query('auditEvents')
      .withIndex('by_activeAccountRef_and_targetType_and_targetRef_and_createdAt', (index) => index
        .eq('activeAccountRef', authority.accountRef)
        .eq('targetType', 'agent')
        .eq('targetRef', args.principalRef)
        .gte('createdAt', ACCOUNT_SECURITY_HISTORY_ACTIVATED_AT))
      .order('desc')
      .paginate(args.paginationOpts)
    return {
      ...page,
      page: page.page.map((event) => {
        if (!package3EventTypes.has(event.eventType)
          || event.sourceSystem === undefined
          || event.afterState === undefined) throw new Error('agent_history_event_invalid')
        return {
          eventRef: event.eventId,
          eventType: event.eventType as typeof Package3AuditEventTypeValues[number],
          actorKind: event.actorKind,
          actorRef: event.actorRef,
          targetType: event.targetType,
          targetRef: event.targetRef,
          outcome: event.afterState,
          sourceSystem: event.sourceSystem,
          ...(event.observedAt === undefined ? {} : { observedAt: event.observedAt }),
          recordedAt: event.createdAt,
          correlationRef: event.correlationId,
        }
      }),
    }
}
