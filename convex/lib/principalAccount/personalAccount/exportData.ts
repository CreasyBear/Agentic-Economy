import { v } from 'convex/values'
import type { QueryCtx } from '../../../_generated/server'
import { InteractiveAuthorityError } from '../../../interactiveAuthority'
import { resolveExportPrincipal } from './identity'

export const exportUserDataArgs = {}
export const exportUserDataResult = v.object({
    contract: v.literal('ae.personal-account.export:v1'),
    exportedAt: v.number(),
    principal: v.object({
      principalRef: v.string(),
      kind: v.string(),
      lifecycle: v.string(),
      displayName: v.string(),
    }),
    memberships: v.array(v.object({
      membershipRef: v.string(),
      accountRef: v.string(),
      lifecycle: v.string(),
      revision: v.number(),
      createdAt: v.number(),
    })),
    ownerships: v.array(v.object({
      ownershipRef: v.string(),
      accountRef: v.string(),
      lifecycle: v.string(),
      revision: v.number(),
      createdAt: v.number(),
    })),
    linkedAccounts: v.array(v.object({
      accountRef: v.string(),
      displayName: v.string(),
      lifecycle: v.string(),
    })),
    notificationPreferences: v.array(v.object({
      accountRef: v.string(),
      lowCreditBalance: v.boolean(),
      lowCreditThresholdCents: v.number(),
      spendCapWarning: v.boolean(),
      callFailureSpike: v.boolean(),
      invoiceReady: v.boolean(),
      teamMembershipChanged: v.boolean(),
      agentApprovalRequested: v.boolean(),
      revision: v.number(),
      updatedAt: v.union(v.null(), v.number()),
    })),
    securityHistory: v.array(v.object({
      eventRef: v.string(),
      eventType: v.string(),
      actorKind: v.string(),
      actorRef: v.string(),
      targetType: v.string(),
      targetRef: v.string(),
      outcome: v.string(),
      sourceSystem: v.string(),
      recordedAt: v.number(),
      correlationRef: v.string(),
    })),
  })

export const exportUserDataHandler = async (ctx: QueryCtx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new InteractiveAuthorityError('identity_invalid')

    const principal = await resolveExportPrincipal(ctx.db, identity)

    const exportedAt = Date.now()
    const memberships = await ctx.db.query('memberships')
      .withIndex('by_memberPrincipalRef_and_lifecycle', (index) => index
        .eq('memberPrincipalRef', principal.principalRef)
        .eq('lifecycle', 'active'))
      .collect()

    const ownerships = await ctx.db.query('accountOwnerships')
      .withIndex('by_ownerPrincipalRef_and_lifecycle', (index) => index
        .eq('ownerPrincipalRef', principal.principalRef)
        .eq('lifecycle', 'active'))
      .collect()

    const accountRefs = new Set<string>()
    for (const row of memberships) accountRefs.add(row.accountRef)
    for (const row of ownerships) accountRefs.add(row.accountRef)

    const linkedAccounts = []
    for (const accountRef of accountRefs) {
      const account = await ctx.db.query('accounts')
        .withIndex('by_accountRef', (index) => index.eq('accountRef', accountRef))
        .unique()
      if (account === null) continue
      linkedAccounts.push({
        accountRef: account.accountRef,
        displayName: account.displayName,
        lifecycle: account.lifecycle,
      })
    }


    const notificationPreferences = await ctx.db.query('userNotificationPreferences')
      .filter((filter) => filter.eq(filter.field('principalRef'), principal.principalRef))
      .collect()
      .then((rows) => rows.map((row) => ({
        accountRef: row.accountRef,
        lowCreditBalance: row.lowCreditBalance,
        lowCreditThresholdCents: row.lowCreditThresholdCents,
        spendCapWarning: row.spendCapWarning,
        callFailureSpike: row.callFailureSpike,
        invoiceReady: row.invoiceReady,
        teamMembershipChanged: row.teamMembershipChanged,
        agentApprovalRequested: row.agentApprovalRequested ?? true,
        revision: row.revision,
        updatedAt: row.updatedAt,
      })))

    const securityHistory = []
    for (const accountRef of accountRefs) {
      const events = await ctx.db.query('auditEvents')
        .withIndex('by_activeAccountRef_and_createdAt', (index) => index.eq('activeAccountRef', accountRef))
        .order('desc')
        .take(50)
      for (const event of events) {
        if (event.sourceSystem === undefined || event.afterState === undefined) continue
        securityHistory.push({
          eventRef: event.eventId,
          eventType: event.eventType,
          actorKind: event.actorKind,
          actorRef: event.actorRef,
          targetType: event.targetType,
          targetRef: event.targetRef,
          outcome: event.afterState,
          sourceSystem: event.sourceSystem,
          recordedAt: event.createdAt,
          correlationRef: event.correlationId,
        })
      }
    }

    return {
      contract: 'ae.personal-account.export:v1' as const,
      exportedAt,
      principal: {
        principalRef: principal.principalRef,
        kind: principal.kind,
        lifecycle: principal.lifecycle,
        displayName: principal.displayName,
      },
      memberships: memberships.map((row) => ({
        membershipRef: row.membershipRef,
        accountRef: row.accountRef,
        lifecycle: row.lifecycle,
        revision: row.revision,
        createdAt: row.createdAt,
      })),
      ownerships: ownerships.map((row) => ({
        ownershipRef: row.ownershipRef,
        accountRef: row.accountRef,
        lifecycle: row.lifecycle,
        revision: row.revision,
        createdAt: row.createdAt,
      })),
      linkedAccounts,
      notificationPreferences,
      securityHistory,
    }
}
