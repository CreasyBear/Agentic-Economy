import type { MutationCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { AdminCommandSpec } from '../commands/commandEnvelope'
import type { AdminCommandWireArgs } from '../commands/contracts'

type Membership = Doc<'adminMemberships'>

async function targetMembership(
  ctx: MutationCtx,
  targetClerkUserId: string,
  targetTokenIdentifier?: string,
): Promise<Membership | null> {
  const states = ['active', 'revoked', 'suspended'] as const
  for (const state of states) {
    if (targetTokenIdentifier !== undefined) {
      const byToken = await ctx.db.query('adminMemberships')
        .withIndex('by_tokenIdentifier_and_state', (query) =>
          query.eq('tokenIdentifier', targetTokenIdentifier).eq('state', state))
        .first()
      if (byToken !== null && byToken.clerkUserId === targetClerkUserId) return byToken
    }
    const bySubject = await ctx.db.query('adminMemberships')
      .withIndex('by_clerkUserId_and_state', (query) =>
        query.eq('clerkUserId', targetClerkUserId).eq('state', state))
      .first()
    if (bySubject !== null) return bySubject
  }
  return null
}

function digest(row: Membership | null): string | null {
  return row === null ? null : canonicalDigest({
    tokenIdentifier: row.tokenIdentifier,
    role: row.role,
    state: row.state,
    grantedAt: row.grantedAt,
    revokedAt: row.revokedAt ?? null,
  })
}

export function grantAdminMembershipSpec(
  ctx: MutationCtx,
  input: AdminCommandWireArgs<'grant_admin_membership'>['input'],
): AdminCommandSpec<'grant_admin_membership'> {
  return {
    targetType: 'admin_membership',
    targetRef: input.targetClerkUserId,
    auditEventType: 'admin.membership_granted',
    currentStateDigest: async () => digest(await targetMembership(ctx, input.targetClerkUserId, input.targetTokenIdentifier)),
    apply: async (actor) => {
      const binding = await ctx.db.query('externalIdentityBindings')
        .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
          .eq('providerNamespace', 'clerk/user')
          .eq('providerIdentifier', input.targetTokenIdentifier))
        .unique()
      if (binding === null || binding.lifecycle !== 'active'
        || !input.targetTokenIdentifier.endsWith(`|${input.targetClerkUserId}`)) {
        return { kind: 'refused', code: 'principal_not_found' }
      }
      const principal = await ctx.db.query('principals')
        .withIndex('by_principalRef', (query) => query.eq('principalRef', binding.principalRef))
        .unique()
      if (principal === null || principal.lifecycle !== 'active') {
        return { kind: 'refused', code: 'principal_not_found' }
      }
      for (const state of ['active', 'revoked', 'suspended'] satisfies Membership['state'][]) {
        const rows = await ctx.db.query('adminMemberships')
          .withIndex('by_tokenIdentifier_and_state', (query) =>
            query.eq('tokenIdentifier', input.targetTokenIdentifier).eq('state', state))
          .take(2)
        if (rows.some((row) => row.clerkUserId !== input.targetClerkUserId) || rows.length > 1) {
          return { kind: 'refused', code: 'membership_already_active' }
        }
      }
      const existing = await targetMembership(ctx, input.targetClerkUserId, input.targetTokenIdentifier)
      if (existing !== null && existing.state === 'active'
        && (existing.role === input.role || existing.tokenIdentifier !== input.targetTokenIdentifier)) {
        return { kind: 'refused', code: 'membership_already_active' }
      }
      if (existing?.state === 'active' && existing.role === 'owner_admin' && input.role !== 'owner_admin') {
        const owners = await ctx.db.query('adminMemberships')
          .withIndex('by_state_and_role', (query) => query.eq('state', 'active').eq('role', 'owner_admin'))
          .take(2)
        if (owners.length < 2) return { kind: 'refused', code: 'membership_already_active' }
      }
      const now = Date.now()
      const beforeState = existing === null ? 'none' : `${existing.state}:${existing.role}`
      const membership = {
        clerkUserId: input.targetClerkUserId,
        tokenIdentifier: input.targetTokenIdentifier,
        role: input.role,
        state: 'active' satisfies Membership['state'],
        grantedBy: actor.membership.clerkUserId,
        grantedAt: now,
        ...(existing?.evidenceRef === undefined ? {} : { evidenceRef: existing.evidenceRef }),
      }
      if (existing === null) await ctx.db.insert('adminMemberships', membership)
      else await ctx.db.replace(existing._id, membership)
      return {
        kind: 'applied',
        code: 'membership_granted',
        effectRefs: [input.targetClerkUserId],
        beforeState,
        afterState: `active:${input.role}`,
      }
    },
  }
}

export function revokeAdminMembershipSpec(
  ctx: MutationCtx,
  input: AdminCommandWireArgs<'revoke_admin_membership'>['input'],
): AdminCommandSpec<'revoke_admin_membership'> {
  return {
    targetType: 'admin_membership',
    targetRef: input.targetClerkUserId,
    auditEventType: 'admin.membership_revoked',
    currentStateDigest: async () => digest(await targetMembership(ctx, input.targetClerkUserId, input.targetTokenIdentifier)),
    apply: async (actor) => {
      const membership = await targetMembership(ctx, input.targetClerkUserId, input.targetTokenIdentifier)
      if (membership === null || membership.state !== 'active'
        || (input.targetTokenIdentifier !== undefined && membership.tokenIdentifier !== input.targetTokenIdentifier)) {
        return { kind: 'refused', code: 'membership_not_found' }
      }
      if (membership.role === 'owner_admin') {
        const owners = await ctx.db.query('adminMemberships')
          .withIndex('by_state_and_role', (query) => query.eq('state', 'active').eq('role', 'owner_admin'))
          .take(2)
        if (owners.length < 2) return { kind: 'refused', code: 'last_owner_admin' }
      }
      await ctx.db.patch(membership._id, {
        state: 'revoked',
        revokedBy: actor.membership.clerkUserId,
        revokedAt: Date.now(),
      })
      return {
        kind: 'applied',
        code: 'membership_revoked',
        effectRefs: [input.targetClerkUserId],
        beforeState: `active:${membership.role}`,
        afterState: `revoked:${membership.role}`,
      }
    },
  }
}
