import type { GenericDatabaseReader, UserIdentity } from 'convex/server'
import { v } from 'convex/values'

import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { brandNonEmpty } from '../src/modules/common/ids'
import { createPackage3AuditEvent, redactPayload } from '../src/modules/observability/public'
import {
  accountRef,
  generateMembershipRef,
  generateOwnershipRef,
} from '../src/modules/principal-account/account/public'
import { principalRef } from '../src/modules/principal-account/principal/public'
import {
  checkWorkspaceFences,
  type WorkspaceFenceReason,
} from './lib/workspaceDecommissionFences'
import type { DataModel, Doc } from './_generated/dataModel'
import { mutation, query } from './_generated/server'
import {
  InteractiveAuthorityError,
  requireAccessFactForAccount,
  resolveActiveAccountRefForPrincipal,
} from './interactiveAuthority'
import { persistAuditEvent } from './securityShared'
import { assertStepUpForSensitiveAction } from './workspaceSecurity'

const CLERK_USER_PROVIDER_NAMESPACE = 'clerk/user' as const

const workspaceFenceReasonValue = v.union(
  v.literal('unsettled_provider_obligations'),
  v.literal('unwithdrawn_earnings'),
  v.literal('open_calls'),
  v.literal('unreleased_call_holds'),
  v.literal('in_flight_funding'),
  v.literal('open_reconciliation'),
)

const decommissionEligibilityValue = v.object({
  accountRef: v.string(),
  displayName: v.string(),
  accountRevision: v.number(),
  ownershipRevision: v.number(),
  callerIsOwner: v.boolean(),
  canClose: v.boolean(),
  canTransfer: v.boolean(),
  fences: v.array(workspaceFenceReasonValue),
  transferCandidates: v.array(v.object({
    principalRef: v.string(),
    displayName: v.string(),
    membershipRef: v.string(),
  })),
})

const mfaReverificationRefusalValue = v.object({
  kind: v.literal('refused'),
  code: v.literal('mfa_reverification_required'),
})

const closeWorkspaceReceiptValue = v.union(
  mfaReverificationRefusalValue,
  v.object({
    kind: v.literal('closed'),
    accountRef: v.string(),
    accountRevision: v.number(),
  }),
  v.object({
    kind: v.literal('replayed'),
    accountRef: v.string(),
    accountRevision: v.number(),
  }),
)

const transferWorkspaceReceiptValue = v.union(
  mfaReverificationRefusalValue,
  v.object({
    kind: v.literal('transferred'),
    accountRef: v.string(),
    previousOwnershipRef: v.string(),
    currentOwnershipRef: v.string(),
    accountRevision: v.number(),
  }),
  v.object({
    kind: v.literal('replayed'),
    accountRef: v.string(),
    currentOwnershipRef: v.string(),
    accountRevision: v.number(),
  }),
)

type WorkspaceDb = GenericDatabaseReader<DataModel>

type AccountActionContext = Readonly<{
  actorPrincipalRef: string
  activeAccountRef: string
  correlationRef: string
  idempotencyRef: string
}>

async function requireInteractiveHumanPrincipal(
  db: WorkspaceDb,
  identity: UserIdentity,
): Promise<Doc<'principals'>> {
  const tokenIdentifier = identity.tokenIdentifier
  if (typeof tokenIdentifier !== 'string' || tokenIdentifier.trim().length === 0) {
    throw new InteractiveAuthorityError('identity_invalid')
  }
  const bindings = await db
    .query('externalIdentityBindings')
    .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
      .eq('providerNamespace', CLERK_USER_PROVIDER_NAMESPACE)
      .eq('providerIdentifier', tokenIdentifier))
    .take(2)
  if (bindings.length !== 1) {
    throw new InteractiveAuthorityError('identity_invalid')
  }
  const [binding] = bindings
  if (binding === undefined || binding.lifecycle !== 'active') {
    throw new InteractiveAuthorityError('identity_invalid')
  }
  const principals = await db
    .query('principals')
    .withIndex('by_principalRef', (query) => query.eq('principalRef', binding.principalRef))
    .take(2)
  if (principals.length !== 1) {
    throw new InteractiveAuthorityError('identity_invalid')
  }
  const [principal] = principals
  if (principal === undefined || principal.lifecycle !== 'active') {
    throw new InteractiveAuthorityError('identity_invalid')
  }
  if (principal.kind !== 'human') {
    throw new InteractiveAuthorityError('principal_kind_invalid')
  }
  return principal
}

async function resolveClosedWorkspaceActorAccountRef(
  db: WorkspaceDb,
  canonicalPrincipalRef: ReturnType<typeof principalRef>,
): Promise<ReturnType<typeof accountRef> | null> {
  const closedAccounts = await db
    .query('accounts')
    .filter((filter) => filter.and(
      filter.eq(filter.field('lifecycle'), 'closed'),
      filter.eq(filter.field('lastAction.actorPrincipalRef'), canonicalPrincipalRef),
    ))
    .collect()
  if (closedAccounts.length !== 1) return null
  const [row] = closedAccounts
  return row === undefined ? null : accountRef(row.accountRef)
}

async function requireAuthenticatedAccountContext(
  db: WorkspaceDb,
  identity: UserIdentity,
): Promise<{
  principal: Doc<'principals'>
  canonicalPrincipalRef: ReturnType<typeof principalRef>
  canonicalAccountRef: ReturnType<typeof accountRef>
  account: Doc<'accounts'>
}> {
  const principal = await requireInteractiveHumanPrincipal(db, identity)
  const canonicalPrincipalRef = principalRef(principal.principalRef)
  const { activeAccountRef } = await resolveActiveAccountRefForPrincipal(
    db,
    canonicalPrincipalRef,
    identity,
    'require',
  )
  const canonicalAccountRef = accountRef(activeAccountRef)
  await requireAccessFactForAccount(db, canonicalPrincipalRef, canonicalAccountRef)
  const account = await db
    .query('accounts')
    .withIndex('by_accountRef', (query) => query.eq('accountRef', canonicalAccountRef))
    .unique()
  if (account === null) throw new InteractiveAuthorityError('account_missing')
  if (account.lifecycle !== 'active') throw new InteractiveAuthorityError('account_inactive')
  return { principal, canonicalPrincipalRef, canonicalAccountRef, account }
}

async function requireCurrentOwnership(
  db: WorkspaceDb,
  account: Doc<'accounts'>,
): Promise<Doc<'accountOwnerships'>> {
  const ownership = await db
    .query('accountOwnerships')
    .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', account.currentOwnershipRef))
    .unique()
  if (ownership === null
    || ownership.accountRef !== account.accountRef
    || ownership.lifecycle !== 'active') {
    throw new InteractiveAuthorityError('ownership_mismatch')
  }
  return ownership
}

async function callerIsAccountOwner(
  db: WorkspaceDb,
  account: Doc<'accounts'>,
  canonicalPrincipalRef: ReturnType<typeof principalRef>,
): Promise<boolean> {
  const ownership = await db
    .query('accountOwnerships')
    .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', account.currentOwnershipRef))
    .unique()
  return ownership !== null
    && ownership.lifecycle === 'active'
    && ownership.ownerPrincipalRef === canonicalPrincipalRef
}

async function loadTransferCandidates(
  db: WorkspaceDb,
  canonicalAccountRef: ReturnType<typeof accountRef>,
  incumbentPrincipalRef: ReturnType<typeof principalRef>,
): Promise<Array<{ principalRef: string; displayName: string; membershipRef: string }>> {
  const memberships = await db
    .query('memberships')
    .withIndex('by_accountRef_and_lifecycle', (query) => query
      .eq('accountRef', canonicalAccountRef)
      .eq('lifecycle', 'active'))
    .collect()
  const candidates: Array<{ principalRef: string; displayName: string; membershipRef: string }> = []
  for (const membership of memberships) {
    if (membership.memberPrincipalRef === incumbentPrincipalRef) continue
    const memberPrincipal = await db
      .query('principals')
      .withIndex('by_principalRef', (query) => query.eq('principalRef', membership.memberPrincipalRef))
      .unique()
    if (memberPrincipal === null || memberPrincipal.lifecycle !== 'active') continue
    candidates.push({
      principalRef: membership.memberPrincipalRef,
      displayName: memberPrincipal.displayName,
      membershipRef: membership.membershipRef,
    })
  }
  return candidates
}

async function recordWorkspaceAuditEvent(
  db: Parameters<typeof persistAuditEvent>[0],
  input: Readonly<{
    eventType: 'account.workspace.closed' | 'account.workspace.ownership_transferred'
    actorPrincipalRef: string
    activeAccountRef: string
    correlationRef: string
    idempotencyRef: string
    beforeState: string
    outcome: string
    createdAt: number
    redactedPayload?: unknown
  }>,
): Promise<void> {
  const redactedPayload = redactPayload(input.redactedPayload ?? {})
  const commandDigest = canonicalDigest({
    eventType: input.eventType,
    correlationRef: input.correlationRef,
    idempotencyRef: input.idempotencyRef,
    activeAccountRef: input.activeAccountRef,
    outcome: input.outcome,
    redactedPayload,
  })
  const eventId = `audit:workspace:${input.eventType}:${input.idempotencyRef}`
  const audit = createPackage3AuditEvent({
    eventId: brandNonEmpty(eventId, 'AuditEventId'),
    eventType: input.eventType,
    actorKind: 'owner',
    actorRef: input.actorPrincipalRef,
    activeAccountRef: input.activeAccountRef,
    sourceSystem: 'ae_recorded',
    targetType: 'account',
    targetRef: input.activeAccountRef,
    idempotencyKey: brandNonEmpty(input.idempotencyRef, 'OperationKey'),
    correlationId: brandNonEmpty(input.correlationRef, 'CorrelationId'),
    beforeState: input.beforeState,
    outcome: input.outcome,
    evidenceRefs: [],
    redactedPayload,
    commandDigest: brandNonEmpty(commandDigest, 'SourceHash'),
    createdAt: input.createdAt,
  })
  if (!audit.valid) throw new Error(`workspace_audit_invalid:${audit.reason}`)
  await persistAuditEvent(db, audit.event)
}

export const readWorkspaceDecommissionEligibility = query({
  args: {},
  returns: decommissionEligibilityValue,
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new InteractiveAuthorityError('identity_invalid')
    const { canonicalPrincipalRef, canonicalAccountRef, account } =
      await requireAuthenticatedAccountContext(ctx.db, identity)

    const currentOwnership = await requireCurrentOwnership(ctx.db, account)
    const callerIsOwner = await callerIsAccountOwner(ctx.db, account, canonicalPrincipalRef)
    const fences = await checkWorkspaceFences(ctx, canonicalAccountRef)
    const transferCandidates = callerIsOwner
      ? await loadTransferCandidates(ctx.db, canonicalAccountRef, canonicalPrincipalRef)
      : []

    return {
      accountRef: canonicalAccountRef,
      displayName: account.displayName,
      accountRevision: account.revision,
      ownershipRevision: currentOwnership.revision,
      callerIsOwner,
      canClose: callerIsOwner && fences.length === 0,
      canTransfer: callerIsOwner && transferCandidates.length > 0,
      fences,
      transferCandidates,
    }
  },
})

export const closeWorkspace = mutation({
  args: {
    confirmationName: v.string(),
    expectedAccountRevision: v.number(),
    expectedOwnershipRevision: v.number(),
    correlationRef: v.string(),
    idempotencyRef: v.string(),
  },
  returns: closeWorkspaceReceiptValue,
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new InteractiveAuthorityError('identity_invalid')
    const principal = await requireInteractiveHumanPrincipal(ctx.db, identity)
    const canonicalPrincipalRef = principalRef(principal.principalRef)

    let canonicalAccountRef: ReturnType<typeof accountRef>
    try {
      const { activeAccountRef } = await resolveActiveAccountRefForPrincipal(
        ctx.db,
        canonicalPrincipalRef,
        identity,
        'require',
      )
      canonicalAccountRef = accountRef(activeAccountRef)
    } catch (error) {
      if (!(error instanceof InteractiveAuthorityError) || error.code !== 'account_access_missing') {
        throw error
      }
      const closedAccountRef = await resolveClosedWorkspaceActorAccountRef(ctx.db, canonicalPrincipalRef)
      if (closedAccountRef === null) throw error
      canonicalAccountRef = closedAccountRef
    }

    const account = await ctx.db
      .query('accounts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', canonicalAccountRef))
      .unique()
    if (account === null) throw new InteractiveAuthorityError('account_missing')

    if (account.lifecycle === 'closed') {
      if (account.lastAction?.idempotencyRef === args.idempotencyRef) {
        if (args.confirmationName === account.displayName) {
          return {
            kind: 'replayed' as const,
            accountRef: canonicalAccountRef,
            accountRevision: account.revision,
          }
        }
        throw new InteractiveAuthorityError('idempotency_conflict')
      }
      throw new InteractiveAuthorityError('workspace_already_closed')
    }

    if (account.lifecycle !== 'active') throw new InteractiveAuthorityError('account_inactive')

    const access = await requireAccessFactForAccount(ctx.db, canonicalPrincipalRef, canonicalAccountRef)
    if (access.kind !== 'ownership') {
      throw new InteractiveAuthorityError('ownership_mismatch')
    }

    const currentOwnership = await requireCurrentOwnership(ctx.db, account)

    if (args.confirmationName !== account.displayName) {
      throw new InteractiveAuthorityError('workspace_confirmation_mismatch')
    }

    const stepUp = await assertStepUpForSensitiveAction(ctx.db, identity, {
      accountRef: canonicalAccountRef,
    })
    if (stepUp.kind === 'refused') return stepUp

    const fences = await checkWorkspaceFences(ctx, canonicalAccountRef)
    if (fences.length > 0) {
      throw new InteractiveAuthorityError('workspace_has_unsettled_obligations', { fences })
    }

    if (args.expectedAccountRevision !== account.revision) {
      throw new InteractiveAuthorityError('account_revision_conflict')
    }
    if (args.expectedOwnershipRevision !== currentOwnership.revision) {
      throw new InteractiveAuthorityError('ownership_revision_conflict')
    }

    const now = Date.now()
    const actionContext: AccountActionContext = {
      actorPrincipalRef: canonicalPrincipalRef,
      activeAccountRef: canonicalAccountRef,
      correlationRef: args.correlationRef,
      idempotencyRef: args.idempotencyRef,
    }
    const nextAccountRevision = account.revision + 1

    await ctx.db.patch(account._id, {
      lifecycle: 'closed',
      revision: nextAccountRevision,
      updatedAt: now,
      lastAction: actionContext,
    })

    await ctx.db.patch(currentOwnership._id, {
      lifecycle: 'ended',
      revision: currentOwnership.revision + 1,
      endedAt: now,
      endedBy: actionContext,
    })

    const activeMemberships = await ctx.db
      .query('memberships')
      .withIndex('by_accountRef_and_lifecycle', (query) => query
        .eq('accountRef', canonicalAccountRef)
        .eq('lifecycle', 'active'))
      .collect()
    for (const membership of activeMemberships) {
      await ctx.db.patch(membership._id, { lifecycle: 'ended', endedAt: now })
    }

    const sessionSelections = await ctx.db
      .query('interactiveSessionSelections')
      .filter((filter) => filter.eq(filter.field('activeAccountRef'), canonicalAccountRef))
      .collect()
    for (const row of sessionSelections) {
      await ctx.db.delete(row._id)
    }

    const agentGrants = await ctx.db
      .query('agentAccessGrants')
      .withIndex('by_ownerId_and_updatedAt', (query) => query.eq('ownerId', canonicalAccountRef))
      .collect()
    for (const grant of agentGrants) {
      if (grant.lifecycle !== 'active') continue
      await ctx.db.patch(grant._id, { lifecycle: 'revoked', updatedAt: now })
    }

    const delegationGrants = await ctx.db
      .query('authorityDelegationGrants')
      .withIndex('by_accountRef_and_actorPrincipalRef_and_createdBy_idempotencyRef', (query) => query
        .eq('accountRef', canonicalAccountRef))
      .collect()
    for (const delegation of delegationGrants) {
      if (delegation.lifecycle !== 'active') continue
      await ctx.db.patch(delegation._id, { lifecycle: 'revoked' })
    }

    const orgBindings = await ctx.db
      .query('accountExternalOrganizationBindings')
      .withIndex('by_accountRef_and_lifecycle', (query) => query
        .eq('accountRef', canonicalAccountRef)
        .eq('lifecycle', 'active'))
      .collect()
    for (const binding of orgBindings) {
      await ctx.db.patch(binding._id, { lifecycle: 'revoked', updatedAt: now })
    }

    await recordWorkspaceAuditEvent(ctx.db, {
      eventType: 'account.workspace.closed',
      actorPrincipalRef: canonicalPrincipalRef,
      activeAccountRef: canonicalAccountRef,
      correlationRef: args.correlationRef,
      idempotencyRef: args.idempotencyRef,
      beforeState: 'active',
      outcome: 'closed',
      createdAt: now,
    })

    return {
      kind: 'closed' as const,
      accountRef: canonicalAccountRef,
      accountRevision: nextAccountRevision,
    }
  },
})

export const transferWorkspaceOwnership = mutation({
  args: {
    successorPrincipalRef: v.string(),
    expectedAccountRevision: v.number(),
    expectedOwnershipRevision: v.number(),
    correlationRef: v.string(),
    idempotencyRef: v.string(),
  },
  returns: transferWorkspaceReceiptValue,
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new InteractiveAuthorityError('identity_invalid')
    const principal = await requireInteractiveHumanPrincipal(ctx.db, identity)
    const canonicalPrincipalRef = principalRef(principal.principalRef)
    const { activeAccountRef } = await resolveActiveAccountRefForPrincipal(
      ctx.db,
      canonicalPrincipalRef,
      identity,
      'require',
    )
    const canonicalAccountRef = accountRef(activeAccountRef)

    const account = await ctx.db
      .query('accounts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', canonicalAccountRef))
      .unique()
    if (account === null) throw new InteractiveAuthorityError('account_missing')

    const currentOwnership = await requireCurrentOwnership(ctx.db, account)

    if (account.lastAction?.idempotencyRef === args.idempotencyRef) {
      if (currentOwnership.ownerPrincipalRef === args.successorPrincipalRef) {
        return {
          kind: 'replayed' as const,
          accountRef: canonicalAccountRef,
          currentOwnershipRef: currentOwnership.ownershipRef,
          accountRevision: account.revision,
        }
      }
      throw new InteractiveAuthorityError('idempotency_conflict')
    }

    const access = await requireAccessFactForAccount(ctx.db, canonicalPrincipalRef, canonicalAccountRef)
    if (access.kind !== 'ownership') {
      throw new InteractiveAuthorityError('ownership_mismatch')
    }

    if (account.lifecycle !== 'active') throw new InteractiveAuthorityError('account_inactive')

    if (args.successorPrincipalRef === canonicalPrincipalRef) {
      throw new InteractiveAuthorityError('successor_same_as_incumbent')
    }

    const successorMembership = await ctx.db
      .query('memberships')
      .withIndex('by_accountRef_and_memberPrincipalRef_and_lifecycle', (query) => query
        .eq('accountRef', canonicalAccountRef)
        .eq('memberPrincipalRef', args.successorPrincipalRef)
        .eq('lifecycle', 'active'))
      .unique()
    if (successorMembership === null) {
      throw new InteractiveAuthorityError('successor_not_active_member')
    }

    const successorPrincipal = await ctx.db
      .query('principals')
      .withIndex('by_principalRef', (query) => query.eq('principalRef', args.successorPrincipalRef))
      .unique()
    if (successorPrincipal === null || successorPrincipal.lifecycle !== 'active') {
      throw new InteractiveAuthorityError('successor_principal_inactive')
    }

    const stepUp = await assertStepUpForSensitiveAction(ctx.db, identity, {
      accountRef: canonicalAccountRef,
    })
    if (stepUp.kind === 'refused') return stepUp

    if (args.expectedAccountRevision !== account.revision) {
      throw new InteractiveAuthorityError('account_revision_conflict')
    }
    if (args.expectedOwnershipRevision !== currentOwnership.revision) {
      throw new InteractiveAuthorityError('ownership_revision_conflict')
    }

    const now = Date.now()
    const actionContext: AccountActionContext = {
      actorPrincipalRef: canonicalPrincipalRef,
      activeAccountRef: canonicalAccountRef,
      correlationRef: args.correlationRef,
      idempotencyRef: args.idempotencyRef,
    }
    const newOwnershipRef = generateOwnershipRef()
    const nextAccountRevision = account.revision + 1

    await ctx.db.patch(currentOwnership._id, {
      lifecycle: 'ended',
      revision: currentOwnership.revision + 1,
      endedAt: now,
      endedBy: actionContext,
    })

    await ctx.db.insert('accountOwnerships', {
      ownershipRef: newOwnershipRef,
      accountRef: canonicalAccountRef,
      ownerPrincipalRef: args.successorPrincipalRef,
      lifecycle: 'active',
      changeKind: 'transfer',
      revision: 1,
      createdAt: now,
      createdBy: actionContext,
    })

    const incumbentMembership = await ctx.db
      .query('memberships')
      .withIndex('by_accountRef_and_memberPrincipalRef_and_lifecycle', (query) => query
        .eq('accountRef', canonicalAccountRef)
        .eq('memberPrincipalRef', canonicalPrincipalRef)
        .eq('lifecycle', 'active'))
      .unique()
    if (incumbentMembership === null) {
      await ctx.db.insert('memberships', {
        membershipRef: generateMembershipRef(),
        accountRef: canonicalAccountRef,
        memberPrincipalRef: canonicalPrincipalRef,
        lifecycle: 'active',
        revision: 1,
        createdAt: now,
        createdBy: actionContext,
      })
    }

    await ctx.db.patch(account._id, {
      currentOwnershipRef: newOwnershipRef,
      revision: nextAccountRevision,
      updatedAt: now,
      lastAction: actionContext,
    })

    await recordWorkspaceAuditEvent(ctx.db, {
      eventType: 'account.workspace.ownership_transferred',
      actorPrincipalRef: canonicalPrincipalRef,
      activeAccountRef: canonicalAccountRef,
      correlationRef: args.correlationRef,
      idempotencyRef: args.idempotencyRef,
      beforeState: currentOwnership.ownershipRef,
      outcome: newOwnershipRef,
      createdAt: now,
      redactedPayload: { successorPrincipalRef: args.successorPrincipalRef },
    })

    return {
      kind: 'transferred' as const,
      accountRef: canonicalAccountRef,
      previousOwnershipRef: currentOwnership.ownershipRef,
      currentOwnershipRef: newOwnershipRef,
      accountRevision: nextAccountRevision,
    }
  },
})

export type { WorkspaceFenceReason }
