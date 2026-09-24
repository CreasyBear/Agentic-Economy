import { v, type Infer } from 'convex/values'
import type { ClerkFactorEvidence } from '../../authority/consequence/proof'
import { accountRef } from '../../../../src/modules/principal-account/account/public'
import { principalRef } from '../../../../src/modules/principal-account/principal/public'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import { requireAccessFactForAccount } from '../../../interactiveAuthority'
import { WorkspaceSecurityError } from './contracts'
import { requireActiveAccount, requireInteractiveHumanPrincipal } from './identity'

const CORRELATION_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u
const MFA_EVIDENCE_MAX_AGE_MINUTES = 10

export const readPolicyResult = v.object({
  accountRef: v.string(),
  requireMfaForMembers: v.boolean(),
  revision: v.number(),
  updatedAt: v.union(v.number(), v.null()),
})

export const updatePolicyResult = v.object({
  kind: v.union(v.literal('updated'), v.literal('replayed')),
  revision: v.number(),
  requireMfaForMembers: v.boolean(),
})

const factorEvidenceValue = v.object({
  firstFactorAgeMinutes: v.number(),
  secondFactorAgeMinutes: v.number(),
})


function validateCorrelationRef(value: string): void {
  if (value.length < 3 || value.length > 128 || !CORRELATION_REF_PATTERN.test(value)) {
    throw new WorkspaceSecurityError('correlation_ref_invalid')
  }
}

function validateFactorEvidenceForPolicyUpdate(evidence: ClerkFactorEvidence): void {
  if (
    !Number.isSafeInteger(evidence.firstFactorAgeMinutes)
    || !Number.isSafeInteger(evidence.secondFactorAgeMinutes)
    || evidence.firstFactorAgeMinutes < 0
  ) {
    throw new WorkspaceSecurityError('step_up_required')
  }
  if (evidence.secondFactorAgeMinutes < 0) {
    throw new WorkspaceSecurityError('mfa_required')
  }
  if (evidence.secondFactorAgeMinutes > MFA_EVIDENCE_MAX_AGE_MINUTES) {
    throw new WorkspaceSecurityError('step_up_required')
  }
}

export const readPolicyArgs = {}
export const updatePolicyArgs = v.object({
  requireMfaForMembers: v.boolean(),
  expectedRevision: v.number(),
  correlationRef: v.string(),
  idempotencyRef: v.string(),
  factorEvidence: factorEvidenceValue,
})

export const readPolicyHandler = async (ctx: QueryCtx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new WorkspaceSecurityError('identity_invalid')
    const principal = await requireInteractiveHumanPrincipal(ctx.db, identity)
    const canonicalPrincipalRef = principalRef(principal.principalRef)
    const activeAccountRef = await requireActiveAccount(ctx.db, identity, canonicalPrincipalRef)
    const canonicalAccountRef = accountRef(activeAccountRef)

    await requireAccessFactForAccount(ctx.db, canonicalPrincipalRef, canonicalAccountRef)

    const account = await ctx.db
      .query('accounts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', canonicalAccountRef))
      .unique()
    if (account === null) throw new WorkspaceSecurityError('account_missing')
    if (account.lifecycle !== 'active') throw new WorkspaceSecurityError('account_inactive')

    const row = await ctx.db
      .query('accountSecurityPolicies')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', canonicalAccountRef))
      .unique()
    if (row !== null) {
      return {
        requireMfaForMembers: row.requireMfaForMembers,
        revision: row.revision,
        updatedAt: row.updatedAt,
        accountRef: canonicalAccountRef,
      }
    }
    return {
      requireMfaForMembers: false,
      revision: 0,
      updatedAt: null,
      accountRef: canonicalAccountRef,
    }
}

export const updatePolicyHandler = async (ctx: MutationCtx, args: Infer<typeof updatePolicyArgs>) => {
    validateCorrelationRef(args.correlationRef)

    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new WorkspaceSecurityError('identity_invalid')
    const principal = await requireInteractiveHumanPrincipal(ctx.db, identity)
    const canonicalPrincipalRef = principalRef(principal.principalRef)
    const activeAccountRef = await requireActiveAccount(ctx.db, identity, canonicalPrincipalRef)
    const canonicalAccountRef = accountRef(activeAccountRef)

    const access = await requireAccessFactForAccount(ctx.db, canonicalPrincipalRef, canonicalAccountRef)
    if (access.kind !== 'ownership') {
      throw new WorkspaceSecurityError('ownership_mismatch')
    }

    const account = await ctx.db
      .query('accounts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', canonicalAccountRef))
      .unique()
    if (account === null) throw new WorkspaceSecurityError('account_missing')
    if (account.lifecycle !== 'active') throw new WorkspaceSecurityError('account_inactive')

    validateFactorEvidenceForPolicyUpdate(args.factorEvidence)

    const existing = await ctx.db
      .query('accountSecurityPolicies')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', canonicalAccountRef))
      .unique()

    const currentRevision = existing?.revision ?? 0

    if (
      existing !== null
      && existing.requireMfaForMembers === args.requireMfaForMembers
      && existing.lastCorrelationRef === args.correlationRef
    ) {
      return {
        kind: 'replayed' as const,
        requireMfaForMembers: existing.requireMfaForMembers,
        revision: existing.revision,
      }
    }

    if (args.expectedRevision !== currentRevision) {
      throw new WorkspaceSecurityError('policy_revision_conflict')
    }

    const now = Date.now()
    const nextRevision = currentRevision + 1
    if (existing !== null) {
      await ctx.db.patch(existing._id, {
        requireMfaForMembers: args.requireMfaForMembers,
        revision: nextRevision,
        updatedAt: now,
        lastCorrelationRef: args.correlationRef,
      })
    } else {
      await ctx.db.insert('accountSecurityPolicies', {
        accountRef: canonicalAccountRef,
        requireMfaForMembers: args.requireMfaForMembers,
        revision: nextRevision,
        updatedAt: now,
        lastCorrelationRef: args.correlationRef,
      })
    }
    return {
      kind: 'updated' as const,
      requireMfaForMembers: args.requireMfaForMembers,
      revision: nextRevision,
    }
}
