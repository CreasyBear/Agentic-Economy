import { v, type Infer } from 'convex/values'

import {
  PERSONAL_ACCOUNT_RETIRE_OPERATION,
  PERSONAL_ACCOUNT_RETIRE_SCOPE,
  type ClerkSecurityObservation,
} from '../src/modules/security/account-security'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { brandNonEmpty } from '../src/modules/common/ids'
import {
  verifyCustomerRequestServiceAssertion,
  type CustomerRequestServiceAssertion,
} from '../src/modules/agent-access/service-auth-envelope'
import {
  createPackage3AuditEvent,
} from '../src/modules/observability/public'
import { CLERK_USER_PROVIDER_NAMESPACE } from '../src/modules/principal-account/external-identity/public'

import type { Doc } from './_generated/dataModel'
import { env, mutation, query, type DatabaseReader, type MutationCtx } from './_generated/server'
import { InteractiveAuthorityError } from './interactiveAuthority'
import { persistAuditEvent } from './securityShared'
import { serviceAssertion } from './serviceAssertion'

export const RETIRED_PERSONAL_DISPLAY_NAME = 'Deleted User'

const digestPattern = /^sha256:[0-9a-f]{64}$/u
const providerIdentifierPattern = /^https?:\/\/[^\s|]{1,500}\|user_[A-Za-z0-9_-]{1,195}$/u
const MACHINE_AGENT_CASCADE_CAP = 64

const retireEventTypeValue = v.literal('user.deleted')
const retireSecurityActionValue = v.literal('retire_personal_account')

const observationArgs = {
  deliveryRefHash: v.string(),
  providerIdentifier: v.string(),
  eventType: retireEventTypeValue,
  targetRefHash: v.string(),
  observedAt: v.number(),
  securityAction: retireSecurityActionValue,
}

const observationResult = v.union(
  v.object({
    kind: v.literal('accepted'),
    status: v.union(v.literal('applied'), v.literal('replayed'), v.literal('ignored')),
    eventRef: v.optional(v.string()),
  }),
  v.object({
    kind: v.literal('refused'),
    code: v.union(
      v.literal('authentication_required'),
      v.literal('authority_conflict'),
      v.literal('event_conflict'),
    ),
  }),
)

type ObservationResult = Infer<typeof observationResult>
type RetireObservation = Readonly<{
  deliveryRefHash: string
  providerIdentifier: string
  eventType: 'user.deleted'
  targetRefHash: string
  observedAt: number
  securityAction: 'retire_personal_account'
}>

const deletionEligibilityResult = v.union(
  v.object({ kind: v.literal('eligible') }),
  v.object({
    kind: v.literal('blocked'),
    reason: v.union(
      v.literal('last_owner_of_populated_workspace'),
      v.literal('workspace_close_required'),
    ),
  }),
)

export const retirePersonalAccountForServer = mutation({
  args: { ...observationArgs, serviceAuth: serviceAssertion },
  returns: observationResult,
  handler: async (ctx, args): Promise<ObservationResult> => {
    const { serviceAuth, ...observation } = args
    if (!validRetireObservation(observation) || !await validRetireServiceAssertion(observation, serviceAuth)) {
      return { kind: 'refused', code: 'authentication_required' }
    }

    const bindingRows = await ctx.db.query('externalIdentityBindings')
      .withIndex('by_providerNamespace_and_providerIdentifier', (index) => index
        .eq('providerNamespace', CLERK_USER_PROVIDER_NAMESPACE)
        .eq('providerIdentifier', observation.providerIdentifier))
      .take(2)
    if (bindingRows.length === 0) return { kind: 'accepted', status: 'ignored' }
    const binding = bindingRows[0]
    if (bindingRows.length !== 1 || binding === undefined) {
      return { kind: 'refused', code: 'authority_conflict' }
    }

    const principal = await ctx.db.query('principals')
      .withIndex('by_principalRef', (index) => index.eq('principalRef', binding.principalRef))
      .unique()
    if (principal === null || principal.kind !== 'human') {
      throw new InteractiveAuthorityError('authority_conflict')
    }

    const accountRef = await resolveAccountRefForPrincipal(ctx, principal.principalRef)
    if (accountRef === undefined) {
      return { kind: 'refused', code: 'authority_conflict' }
    }

    const digestValue = observation.deliveryRefHash.slice('sha256:'.length)
    const eventRef = `audit:clerk:${digestValue}`
    const existing = await ctx.db.query('auditEvents')
      .withIndex('by_eventId', (index) => index.eq('eventId', eventRef))
      .unique()
    const commandDigest = canonicalDigest(observation)
    if (existing !== null) {
      return existing.activeAccountRef === accountRef
        && existing.eventType === 'account.personal_account.retired'
        && existing.targetRef === principal.principalRef
        && existing.payloadHash === commandDigest
        ? { kind: 'accepted', status: 'replayed', eventRef }
        : { kind: 'refused', code: 'event_conflict' }
    }

    const now = Date.now()
    const toolRef = `clerk:${digestValue}`

    await ctx.db.patch(principal._id, {
      lifecycle: 'retired',
      displayName: RETIRED_PERSONAL_DISPLAY_NAME,
      revision: principal.revision + 1,
      updatedAt: now,
    })

    await ctx.db.patch(binding._id, {
      lifecycle: 'revoked',
      providerState: { kind: 'known', value: 'revoked' },
      revokedAt: observation.observedAt,
      revision: binding.revision + 1,
      updatedAt: now,
    })

    for (const lifecycle of ['active', 'stale'] as const) {
      const credentials = await ctx.db.query('credentials')
        .withIndex('by_principalRef_and_lifecycle', (index) => index
          .eq('principalRef', principal.principalRef)
          .eq('lifecycle', lifecycle))
        .collect()
      for (const credential of credentials) {
        if (credential.type !== 'provider_token') continue
        await ctx.db.patch(credential._id, {
          lifecycle: 'revoked',
          revokedAt: observation.observedAt,
          revision: credential.revision + 1,
          updatedAt: now,
        })
      }
    }

    const memberships = await ctx.db.query('memberships')
      .withIndex('by_memberPrincipalRef_and_lifecycle', (index) => index
        .eq('memberPrincipalRef', principal.principalRef)
        .eq('lifecycle', 'active'))
      .collect()
    for (const membership of memberships) {
      await ctx.db.patch(membership._id, {
        lifecycle: 'ended',
        endedAt: now,
        revision: membership.revision + 1,
      })
    }

    const sessionSelections = await ctx.db.query('interactiveSessionSelections')
      .filter((filter) => filter.eq(filter.field('principalRef'), principal.principalRef))
      .collect()
    for (const row of sessionSelections) {
      await ctx.db.delete(row._id)
    }

    const notificationEmails = await ctx.db.query('principalNotificationEmails')
      .filter((filter) => filter.eq(filter.field('principalRef'), principal.principalRef))
      .collect()
    for (const row of notificationEmails) {
      await ctx.db.delete(row._id)
    }

    const notificationPreferences = await ctx.db.query('userNotificationPreferences')
      .filter((filter) => filter.eq(filter.field('principalRef'), principal.principalRef))
      .collect()
    for (const row of notificationPreferences) {
      await ctx.db.patch(row._id, { deliveryEmail: undefined })
    }

    await revokeMachineAgentsForCreator(ctx, observation, principal.principalRef, now)

    const audit = createPackage3AuditEvent({
      eventId: brandNonEmpty(eventRef, 'AuditEventId'),
      eventType: 'account.personal_account.retired',
      actorKind: 'owner',
      actorRef: principal.principalRef,
      activeAccountRef: accountRef,
      sourceSystem: 'clerk_observed',
      observedAt: observation.observedAt,
      targetType: 'security_profile',
      targetRef: principal.principalRef,
      idempotencyKey: brandNonEmpty(toolRef, 'OperationKey'),
      correlationId: brandNonEmpty(toolRef, 'CorrelationId'),
      beforeState: 'active',
      outcome: 'retired',
      evidenceRefs: [`clerk-delivery:${digestValue}`],
      redactedPayload: { eventType: observation.eventType },
      commandDigest: brandNonEmpty(commandDigest, 'SourceHash'),
      createdAt: now,
    })
    if (!audit.valid) throw new Error(`personal_account_retire_audit_invalid:${audit.reason}`)
    await persistAuditEvent(ctx.db, audit.event)

    return { kind: 'accepted', status: 'applied', eventRef }
  },
})

export const readDeletionEligibility = query({
  args: {},
  returns: deletionEligibilityResult,
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new InteractiveAuthorityError('identity_invalid')

    const principal = await requireActiveHumanPrincipal(ctx.db, identity)
    const ownershipRows = await ctx.db.query('accountOwnerships')
      .withIndex('by_ownerPrincipalRef_and_lifecycle', (index) => index
        .eq('ownerPrincipalRef', principal.principalRef)
        .eq('lifecycle', 'active'))
      .collect()

    let requiresWorkspaceClose = false
    for (const ownership of ownershipRows) {
      const account = await ctx.db.query('accounts')
        .withIndex('by_accountRef', (index) => index.eq('accountRef', ownership.accountRef))
        .unique()
      if (account === null || account.lifecycle !== 'active') continue

      const memberRows = await ctx.db.query('memberships')
        .withIndex('by_accountRef_and_lifecycle', (index) => index
          .eq('accountRef', ownership.accountRef)
          .eq('lifecycle', 'active'))
        .collect()
      const otherMembers = memberRows.filter((row) => row.memberPrincipalRef !== principal.principalRef)
      if (otherMembers.length > 0) {
        return { kind: 'blocked' as const, reason: 'last_owner_of_populated_workspace' as const }
      }
      requiresWorkspaceClose = true
    }

    if (requiresWorkspaceClose) {
      return { kind: 'blocked' as const, reason: 'workspace_close_required' as const }
    }

    return { kind: 'eligible' as const }
  },
})

export const exportUserData = query({
  args: {},
  returns: v.object({
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
    sessionSelection: v.union(v.null(), v.object({
      activeAccountRef: v.string(),
      selectedAt: v.number(),
      revision: v.number(),
    })),
    notificationPreferences: v.array(v.object({
      accountRef: v.string(),
      lowCreditBalance: v.boolean(),
      lowCreditThresholdCents: v.number(),
      spendCapWarning: v.boolean(),
      callFailureSpike: v.boolean(),
      invoiceReady: v.boolean(),
      teamMembershipChanged: v.boolean(),
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
  }),
  handler: async (ctx) => {
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

    const sessionRows = await ctx.db.query('interactiveSessionSelections')
      .filter((filter) => filter.eq(filter.field('principalRef'), principal.principalRef))
      .collect()
    const sessionSelection = sessionRows[0] === undefined
      ? null
      : {
        activeAccountRef: sessionRows[0].activeAccountRef,
        selectedAt: sessionRows[0].selectedAt,
        revision: sessionRows[0].revision,
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
      sessionSelection,
      notificationPreferences,
      securityHistory,
    }
  },
})

async function validRetireServiceAssertion(
  command: RetireObservation,
  assertion: CustomerRequestServiceAssertion,
): Promise<boolean> {
  const key = env.AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim()
  return key !== undefined
    && key.length >= 32
    && assertion.principalId === 'ae:server-function'
    && assertion.ownerId === 'ae:server-function'
    && assertion.credentialId === 'ae:server-function'
    && assertion.scopes.includes(PERSONAL_ACCOUNT_RETIRE_SCOPE)
    && await verifyCustomerRequestServiceAssertion({
      key,
      operation: PERSONAL_ACCOUNT_RETIRE_OPERATION,
      command,
      assertion,
    })
}

function validRetireObservation(value: RetireObservation): boolean {
  return digestPattern.test(value.deliveryRefHash)
    && digestPattern.test(value.targetRefHash)
    && providerIdentifierPattern.test(value.providerIdentifier)
    && Number.isSafeInteger(value.observedAt)
    && value.observedAt >= 0
    && value.eventType === 'user.deleted'
    && value.securityAction === 'retire_personal_account'
}

async function resolveAccountRefForPrincipal(
  ctx: Pick<MutationCtx, 'db'>,
  principalRef: string,
): Promise<string | undefined> {
  const ownershipRows = await ctx.db.query('accountOwnerships')
    .withIndex('by_ownerPrincipalRef_and_lifecycle', (index) => index
      .eq('ownerPrincipalRef', principalRef)
      .eq('lifecycle', 'active'))
    .take(2)
  if (ownershipRows[0]?.accountRef !== undefined) return ownershipRows[0].accountRef

  const membershipRows = await ctx.db.query('memberships')
    .withIndex('by_memberPrincipalRef_and_lifecycle', (index) => index
      .eq('memberPrincipalRef', principalRef)
      .eq('lifecycle', 'active'))
    .take(2)
  return membershipRows[0]?.accountRef
}

async function requireActiveHumanPrincipal(
  db: DatabaseReader,
  identity: { tokenIdentifier?: string | null },
): Promise<Doc<'principals'>> {
  const principal = await requireHumanPrincipal(db, identity)
  if (principal.lifecycle !== 'active') throw new InteractiveAuthorityError('identity_invalid')
  return principal
}

async function resolveExportPrincipal(
  db: DatabaseReader,
  identity: { tokenIdentifier?: string | null },
): Promise<Doc<'principals'>> {
  const tokenIdentifier = identity.tokenIdentifier
  if (typeof tokenIdentifier !== 'string' || tokenIdentifier.trim().length === 0) {
    throw new InteractiveAuthorityError('identity_invalid')
  }
  const bindings = await db.query('externalIdentityBindings')
    .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
      .eq('providerNamespace', CLERK_USER_PROVIDER_NAMESPACE)
      .eq('providerIdentifier', tokenIdentifier))
    .take(2)
  if (bindings.length !== 1) throw new InteractiveAuthorityError('identity_invalid')
  const [binding] = bindings
  if (binding === undefined) throw new InteractiveAuthorityError('identity_invalid')
  const principal = await db.query('principals')
    .withIndex('by_principalRef', (query) => query.eq('principalRef', binding.principalRef))
    .unique()
  if (principal === null || principal.kind !== 'human') {
    throw new InteractiveAuthorityError('identity_invalid')
  }
  if (principal.lifecycle !== 'active') {
    throw new InteractiveAuthorityError('personal_account_retired')
  }
  if (binding.lifecycle !== 'active') {
    throw new InteractiveAuthorityError('identity_invalid')
  }
  return principal
}

async function requireHumanPrincipal(
  db: DatabaseReader,
  identity: { tokenIdentifier?: string | null },
): Promise<Doc<'principals'>> {
  const tokenIdentifier = identity.tokenIdentifier
  if (typeof tokenIdentifier !== 'string' || tokenIdentifier.trim().length === 0) {
    throw new InteractiveAuthorityError('identity_invalid')
  }
  const bindings = await db.query('externalIdentityBindings')
    .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
      .eq('providerNamespace', CLERK_USER_PROVIDER_NAMESPACE)
      .eq('providerIdentifier', tokenIdentifier))
    .take(2)
  if (bindings.length !== 1) throw new InteractiveAuthorityError('identity_invalid')
  const [binding] = bindings
  if (binding === undefined || binding.lifecycle !== 'active') {
    throw new InteractiveAuthorityError('identity_invalid')
  }
  const principal = await db.query('principals')
    .withIndex('by_principalRef', (query) => query.eq('principalRef', binding.principalRef))
    .unique()
  if (principal === null || principal.kind !== 'human') {
    throw new InteractiveAuthorityError('identity_invalid')
  }
  return principal
}

async function revokeMachineAgentsForCreator(
  ctx: Pick<MutationCtx, 'db'>,
  observation: ClerkSecurityObservation,
  humanPrincipalRef: string,
  createdAt: number,
): Promise<void> {
  const accountRefs = new Set<string>()
  const ownershipRows = await ctx.db.query('accountOwnerships')
    .withIndex('by_ownerPrincipalRef_and_lifecycle', (index) => index
      .eq('ownerPrincipalRef', humanPrincipalRef)
      .eq('lifecycle', 'active'))
    .collect()
  for (const ownership of ownershipRows) accountRefs.add(ownership.accountRef)

  const membershipRows = await ctx.db.query('memberships')
    .withIndex('by_memberPrincipalRef_and_lifecycle', (index) => index
      .eq('memberPrincipalRef', humanPrincipalRef)
      .eq('lifecycle', 'active'))
    .collect()
  for (const membership of membershipRows) accountRefs.add(membership.accountRef)

  const matchedAgents: Doc<'agentAccessPrincipals'>[] = []
  for (const accountRef of accountRefs) {
    if (matchedAgents.length >= MACHINE_AGENT_CASCADE_CAP) break
    const agents = await ctx.db.query('agentAccessPrincipals')
      .withIndex('by_ownerId_and_lifecycle', (index) => index
        .eq('ownerId', accountRef)
        .eq('lifecycle', 'active'))
      .collect()
    for (const agent of agents) {
      if (matchedAgents.length >= MACHINE_AGENT_CASCADE_CAP) break
      if (agent.ownerTokenIdentifier !== observation.providerIdentifier) continue
      matchedAgents.push(agent)
    }
  }

  for (const agent of matchedAgents) {
    await revokeMachineAgentAdmissionAndDependents(ctx, agent, observation, createdAt)
  }
}

async function revokeMachineAgentAdmissionAndDependents(
  ctx: Pick<MutationCtx, 'db'>,
  agent: Doc<'agentAccessPrincipals'>,
  observation: ClerkSecurityObservation,
  createdAt: number,
): Promise<void> {
  if (agent.lifecycle !== 'revoked') {
    await ctx.db.patch(agent._id, { lifecycle: 'revoked', lastSeenAt: createdAt })
  }

  const grants = await ctx.db.query('agentAccessGrants')
    .withIndex('by_principalId', (index) => index.eq('principalId', agent.principalId))
    .collect()
  for (const grant of grants) {
    if (grant.lifecycle !== 'active') continue
    await ctx.db.patch(grant._id, { lifecycle: 'revoked', updatedAt: createdAt })
  }

  const families = await ctx.db.query('agentAccessOAuthRefreshFamilies')
    .withIndex('by_principalRef_and_lifecycle', (index) => index
      .eq('principalRef', agent.principalId)
      .eq('lifecycle', 'active'))
    .collect()
  for (const family of families) {
    await ctx.db.patch(family._id, {
      lifecycle: 'revoked',
      revocationReason: 'clerk_password_reset',
      updatedAt: createdAt,
    })
  }

  for (const lifecycle of ['active', 'stale'] as const) {
    const credentials = await ctx.db.query('credentials')
      .withIndex('by_principalRef_and_lifecycle', (index) => index
        .eq('principalRef', agent.principalId)
        .eq('lifecycle', lifecycle))
      .collect()
    for (const credential of credentials) {
      await ctx.db.patch(credential._id, {
        lifecycle: 'revoked',
        revokedAt: observation.observedAt,
        revision: credential.revision + 1,
        updatedAt: createdAt,
      })
    }
  }

  const delegations = await ctx.db.query('authorityDelegationGrants')
    .withIndex('by_subjectPrincipalRef_and_lifecycle', (index) => index
      .eq('subjectPrincipalRef', agent.principalId)
      .eq('lifecycle', 'active'))
    .collect()
  for (const delegation of delegations) {
    await ctx.db.patch(delegation._id, { lifecycle: 'revoked' })
  }
}
