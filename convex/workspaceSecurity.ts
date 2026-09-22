import type { GenericDatabaseReader, UserIdentity } from 'convex/server'
import { v } from 'convex/values'

import { accountRef } from '../src/modules/principal-account/account/public'
import { principalRef } from '../src/modules/principal-account/principal/public'
import type { ClerkFactorEvidence } from './lib/consequenceProof'
import type { DataModel, Doc } from './_generated/dataModel'
import { mutation, query } from './_generated/server'
import {
  InteractiveAuthorityError,
  requireAccessFactForAccount,
  resolveActiveAccountRefForPrincipal,
} from './interactiveAuthority'
import {
  hasFreshMfaFactorVerification,
  MFA_REVERIFICATION_REQUIRED,
} from './lib/workspaceSecurity/factorVerification'

const CLERK_USER_PROVIDER_NAMESPACE = 'clerk/user' as const
const CORRELATION_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u
const MFA_EVIDENCE_MAX_AGE_MINUTES = 10

export const WORKSPACE_SECURITY_ERROR_CODES = [
  'identity_invalid',
  'principal_kind_invalid',
  'account_access_missing',
  'active_account_selection_required',
  'account_missing',
  'account_inactive',
  'ownership_mismatch',
  'policy_revision_conflict',
  'correlation_ref_invalid',
  'mfa_required',
  'step_up_required',
] as const

export type WorkspaceSecurityErrorCode = (typeof WORKSPACE_SECURITY_ERROR_CODES)[number]

export class WorkspaceSecurityError extends InteractiveAuthorityError {
  constructor(code: WorkspaceSecurityErrorCode) {
    super(code)
  }
}

const policyViewValue = v.object({
  accountRef: v.string(),
  requireMfaForMembers: v.boolean(),
  revision: v.number(),
  updatedAt: v.union(v.number(), v.null()),
})

const policyUpdateReceiptValue = v.object({
  kind: v.union(v.literal('updated'), v.literal('replayed')),
  revision: v.number(),
  requireMfaForMembers: v.boolean(),
})

const factorEvidenceValue = v.object({
  firstFactorAgeMinutes: v.number(),
  secondFactorAgeMinutes: v.number(),
})

type SecurityDb = GenericDatabaseReader<DataModel>

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


async function requireInteractiveHumanPrincipal(
  db: SecurityDb,
  identity: UserIdentity,
): Promise<Doc<'principals'>> {
  const tokenIdentifier = identity.tokenIdentifier
  if (typeof tokenIdentifier !== 'string' || tokenIdentifier.trim().length === 0) {
    throw new WorkspaceSecurityError('identity_invalid')
  }
  const bindings = await db
    .query('externalIdentityBindings')
    .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
      .eq('providerNamespace', CLERK_USER_PROVIDER_NAMESPACE)
      .eq('providerIdentifier', tokenIdentifier))
    .take(2)
  if (bindings.length !== 1) {
    throw new WorkspaceSecurityError('identity_invalid')
  }
  const [binding] = bindings
  if (binding === undefined || binding.lifecycle !== 'active') {
    throw new WorkspaceSecurityError('identity_invalid')
  }
  const principals = await db
    .query('principals')
    .withIndex('by_principalRef', (query) => query.eq('principalRef', binding.principalRef))
    .take(2)
  if (principals.length !== 1) {
    throw new WorkspaceSecurityError('identity_invalid')
  }
  const [principal] = principals
  if (principal === undefined || principal.lifecycle !== 'active') {
    throw new WorkspaceSecurityError('identity_invalid')
  }
  if (principal.kind !== 'human') {
    throw new WorkspaceSecurityError('principal_kind_invalid')
  }
  return principal
}

async function requireActiveAccount(
  db: SecurityDb,
  identity: UserIdentity,
  canonicalPrincipalRef: ReturnType<typeof principalRef>,
): Promise<string> {
  const { activeAccountRef } = await resolveActiveAccountRefForPrincipal(
    db,
    canonicalPrincipalRef,
    identity,
    'require',
  )
  return activeAccountRef
}

export const readPolicy = query({
  args: {},
  returns: policyViewValue,
  handler: async (ctx) => {
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
  },
})

export const updatePolicy = mutation({
  args: {
    requireMfaForMembers: v.boolean(),
    expectedRevision: v.number(),
    correlationRef: v.string(),
    idempotencyRef: v.string(),
    factorEvidence: factorEvidenceValue,
  },
  returns: policyUpdateReceiptValue,
  handler: async (ctx, args) => {
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
  },
})

export async function assertStepUpForSensitiveAction(
  db: SecurityDb,
  identity: UserIdentity,
  input: Readonly<{ accountRef: string }>,
): Promise<
  | Readonly<{
    kind: 'allowed'
    requireMfaForMembers: boolean
    policyRevision?: number
  }>
  | typeof MFA_REVERIFICATION_REQUIRED
> {
  if (!hasFreshMfaFactorVerification(identity.fva)) {
    return MFA_REVERIFICATION_REQUIRED
  }

  const canonicalAccountRef = accountRef(input.accountRef)
  const row = await db
    .query('accountSecurityPolicies')
    .withIndex('by_accountRef', (query) => query.eq('accountRef', canonicalAccountRef))
    .unique()

  if (row === null || !row.requireMfaForMembers) {
    return { kind: 'allowed', requireMfaForMembers: false }
  }

  return {
    kind: 'allowed',
    requireMfaForMembers: true,
    policyRevision: row.revision,
  }
}
