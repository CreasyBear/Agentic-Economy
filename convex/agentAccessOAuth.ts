import { ConvexError, v } from 'convex/values'
import type { GenericDatabaseReader } from 'convex/server'
import { brandNonEmpty } from '../src/modules/common/ids'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import {
  ConsequenceAuthorityBoundary,
  type AuthorityConsequenceAdmission,
} from '../src/modules/authority/context/public'
import { accountRef, principalRef } from '../src/modules/principal-account/public'
import {
  AGENT_ACCESS_AUTHORITY_MODE_VALUES,
  agentAuthorityModeAllows,
  type AgentAccessAuthorityMode,
} from '../src/modules/agent-access/contract'
import {
  normalizeRequestedScopes,
  requestedScopesForMode,
} from '../src/modules/agent-access/oauth-state'
import {
  AGENT_ACCESS_GRANT_FORMAT,
  AGENT_ACCESS_POLICY_FORMAT,
  normalizeAgentAccessToolSelection,
  normalizeStoredAgentAccessGrant,
} from '../src/modules/agent-access/policy'
import {
  agentAccessConsentReservationValue,
  agentAccessPolicyValue,
  agentAuditOpaqueRef,
} from '../src/modules/agent-access/public'
import { createPackage3AuditEvent } from '../src/modules/observability/public'
import { internal } from './_generated/api'
import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import { resolveBusinessActor } from './authz'
import { resolveInteractiveAuthorityContext } from './interactiveAuthority'
import { persistAuditEvent } from './securityShared'
import {
  prepareCredentialReplacementCore,
  revokeCanonicalCredentialForService,
  revokeReplacementMaterial,
  invalidateOAuthRefreshFamilies,
  transitionCredentialReplacementCore,
} from './agentAccessPrincipals'
import { admitAuthorityCredentialChangeRate } from './lib/rateLimit'
import {
  consumeConsequenceProof,
  deriveStrictConsequenceProof,
  isValidClerkFactorEvidence,
  type StrictConsequenceProof,
} from './lib/consequenceProof'
import {
  parseWorkloadCronSnapshot,
  reconcileWorkloadCronSnapshot,
  workloadCronSnapshotValue,
} from './workloadCron'
import type { DataModel, Doc } from './_generated/dataModel'
import { requireSourceRead, requireSourceWrite, sourceWriteArgs, type SourceWriteArgs } from './sourceWriteAdmission'

const OAUTH_SOURCE_WRITE_SCOPE = 'agent_identity' as const
const flow = v.union(v.literal('device_code'), v.literal('authorization_code'))
const environment = v.union(v.literal('sandbox'), v.literal('production'))
const status = v.union(
  v.literal('pending'), v.literal('issuing'), v.literal('approved'), v.literal('denied'),
  v.literal('delivery_claimed'), v.literal('consumed'), v.literal('expired'),
)
const OAUTH_GRANT_STATUSES = ['pending', 'issuing', 'approved', 'denied', 'delivery_claimed', 'consumed', 'expired'] as const
const requestedAccessAmount = v.object({
  currency: v.string(),
  units: v.string(),
  exponent: v.number(),
})
const requestedAccess = v.object({
  environment: v.union(v.literal('sandbox'), v.literal('production')),
  toolAccess: v.union(v.literal('all_admitted'), v.literal('selected_tools')),
  toolRefs: v.array(v.string()),
  maximumSpendPerCall: v.optional(requestedAccessAmount),
  maximumDailySpend: v.optional(requestedAccessAmount),
  maximumMonthlySpend: v.optional(requestedAccessAmount),
  maximumConcurrentCalls: v.optional(v.number()),
  maximumCallsPerMinute: v.optional(v.number()),
  maximumCallsPerHour: v.optional(v.number()),
  expiresInSeconds: v.number(),
})
const ownerReconnectCandidate = v.object({
  principalRef: v.string(),
  principalRevision: v.number(),
})
const connectionTarget = v.union(
  v.object({ kind: v.literal('new_agent'), displayName: v.string() }),
  v.object({
    kind: v.literal('replace_credential'),
    principalRef: v.string(),
    replacementMode: v.union(v.literal('planned'), v.literal('compromise')),
  }),
)
const consentConnectionTarget = v.union(
  v.object({ kind: v.literal('new_agent') }),
  v.object({
    kind: v.literal('replace_credential'),
    principalRef: v.string(),
    replacementMode: v.union(v.literal('planned'), v.literal('compromise')),
  }),
)
const replacement = v.object({
  principalRef: v.string(), generation: v.number(), successorCredentialRef: v.string(),
  predecessorCredentialRef: v.string(), predecessorKeyId: v.string(), successorGrantRef: v.string(),
})
const authorityMode = v.union(
  v.literal('read_only'),
  v.literal('approval_required'),
  v.literal('spending_policy'),
  v.literal('unrestricted_test_only'),
)
const clerkProofEvidence = v.object({
  reverificationId: v.string(),
  firstFactorAgeMinutes: v.number(),
  secondFactorAgeMinutes: v.number(),
})
const grant = v.object({
  grantRef: v.string(), revision: v.number(), flow, clientId: v.string(), redirectUri: v.optional(v.string()),
  requestedScopes: v.array(v.string()), offlineAccess: v.optional(v.literal(true)), requestedAccess, approvedAccess: requestedAccess, codeChallenge: v.optional(v.string()), codeChallengeMethod: v.optional(v.literal('S256')),
  deviceCodeHash: v.optional(v.string()), userCodeHash: v.optional(v.string()), authorizationCodeHash: v.optional(v.string()),
  status, ownerId: v.optional(v.string()), keyId: v.optional(v.string()), createdAt: v.number(), expiresAt: v.number(),
  approvedAt: v.optional(v.number()), issuanceKey: v.optional(v.string()), issuanceStartedAt: v.optional(v.number()), consumedAt: v.optional(v.number()), nextPollAt: v.optional(v.number()),
  deliveryClaimToken: v.optional(v.string()), deliveryCredentialHash: v.optional(v.string()), deliveryReplayUntil: v.optional(v.number()), displayName: v.string(), denialReason: v.optional(v.literal('access_denied')),
  connectionTarget: v.optional(connectionTarget), replacement: v.optional(replacement),
  consequenceReservation: v.optional(agentAccessConsentReservationValue),
})
const grantPatch = v.object({
  status: v.optional(status), redirectUri: v.optional(v.string()), requestedScopes: v.optional(v.array(v.string())), offlineAccess: v.optional(v.literal(true)), approvedAccess: v.optional(requestedAccess),
  codeChallenge: v.optional(v.string()), codeChallengeMethod: v.optional(v.literal('S256')),
  deviceCodeHash: v.optional(v.string()), userCodeHash: v.optional(v.string()), authorizationCodeHash: v.optional(v.string()),
  ownerId: v.optional(v.string()), keyId: v.optional(v.string()), createdAt: v.optional(v.number()), expiresAt: v.optional(v.number()),
  approvedAt: v.optional(v.number()), issuanceKey: v.optional(v.string()), issuanceStartedAt: v.optional(v.number()), consumedAt: v.optional(v.number()), nextPollAt: v.optional(v.number()),
  deliveryClaimToken: v.optional(v.string()), deliveryCredentialHash: v.optional(v.string()), deliveryReplayUntil: v.optional(v.number()), displayName: v.optional(v.string()), denialReason: v.optional(v.literal('access_denied')),
  connectionTarget: v.optional(connectionTarget), replacement: v.optional(replacement),
})
const client = v.object({
  clientId: v.string(), clientName: v.string(), redirectUris: v.array(v.string()),
  grantTypes: v.array(v.union(v.literal('authorization_code'), v.literal('urn:ietf:params:oauth:grant-type:device_code'), v.literal('refresh_token'))),
  tokenEndpointAuthMethod: v.literal('none'), createdAt: v.number(), lastUsedAt: v.optional(v.number()),
})
const refreshFamilyLifecycle = v.union(v.literal('active'), v.literal('revoked'), v.literal('expired'))
const refreshFamily = v.object({
  familyRef: v.string(), revision: v.number(), clientId: v.string(), ownerId: v.string(),
  ownerPrincipalRef: v.string(), providerSubject: v.string(), principalRef: v.string(), displayName: v.string(), applicationRef: v.string(), environment,
  scopes: v.array(v.string()), authorityMode,
  toolAccess: v.union(v.literal('all_admitted'), v.literal('selected_tools')),
  toolRefs: v.array(v.string()), spendingPolicy: agentAccessPolicyValue,
  currentCredentialRef: v.string(), currentProviderCredentialId: v.string(), currentGrantRef: v.string(),
  currentGeneration: v.number(), currentAccessExpiresAt: v.number(), currentTokenHash: v.string(), lifecycle: refreshFamilyLifecycle,
  createdAt: v.number(), expiresAt: v.number(), updatedAt: v.number(),
  revokedAt: v.optional(v.number()), revocationReason: v.optional(v.string()),
})
const agentConnectionReadback = v.object({
  connectionRef: v.string(), revision: v.number(), principalRef: v.string(),
  agentDisplayName: v.string(), connectorDisplayName: v.string(), environment,
  state: refreshFamilyLifecycle, authorityMode,
  toolAccess: v.union(v.literal('all_admitted'), v.literal('selected_tools')),
  toolRefs: v.array(v.string()), spendingPolicy: agentAccessPolicyValue,
  commercialScopes: v.array(v.string()), connectedAt: v.number(), lastRotatedAt: v.number(),
  accessExpiresAt: v.number(), connectionExpiresAt: v.number(),
  revokedAt: v.optional(v.number()), revocationReason: v.optional(v.string()),
  credentialGeneration: v.number(),
})
const ownerConnectionLifecycleResult = v.union(
  v.object({
    kind: v.union(v.literal('completed'), v.literal('replayed')),
    connectionRef: v.string(), principalRef: v.string(), revision: v.number(),
    providerCleanupPending: v.boolean(), correlationRef: v.string(),
  }),
  v.object({ kind: v.literal('conflict'), code: v.string(), correlationRef: v.string() }),
  v.object({ kind: v.literal('refused'), code: v.literal('authentication_required'), correlationRef: v.string() }),
)
const refreshClaimResult = v.union(
  v.object({
    kind: v.union(v.literal('claimed'), v.literal('replayed')),
    family: refreshFamily,
    claimRef: v.string(),
  }),
  v.object({
    kind: v.literal('recovered'),
    family: refreshFamily,
    invalidatedProviderCredentialId: v.optional(v.string()),
  }),
  v.object({ kind: v.union(v.literal('invalid_grant'), v.literal('busy'), v.literal('revoked')) }),
)
const refreshCommitResult = v.union(
  v.object({
    kind: v.union(v.literal('completed'), v.literal('replayed')),
    family: refreshFamily,
    providerCleanupTarget: v.optional(v.object({ credentialRef: v.string(), providerCredentialId: v.string() })),
  }),
  v.object({ kind: v.literal('conflict'), code: v.string() }),
)
const refreshCreateResult = v.union(
  v.object({ kind: v.union(v.literal('recorded'), v.literal('replayed')), family: refreshFamily }),
  v.object({ kind: v.literal('conflict'), code: v.string() }),
)
const oauthGrantCleanupResult = v.object({
  deleted: v.number(),
  cutoff: v.number(),
  rescheduled: v.boolean(),
})
const agentAccessConsentReservationResult = v.union(
  v.object({
    kind: v.union(v.literal('reserved'), v.literal('replayed')),
    grantRef: v.string(),
    grantRevision: v.number(),
    commandDigest: v.string(),
    correlationRef: v.string(),
  }),
  v.object({
    kind: v.literal('refused'),
    code: v.union(
      v.literal('authentication_required'),
      v.literal('reauthentication_required'),
      v.literal('proof_stale'),
      v.literal('proof_replayed'),
      v.literal('command_changed'),
    ),
  }),
  v.object({
    kind: v.literal('conflict'),
    code: v.union(
      v.literal('stale_grant'),
      v.literal('stale_target'),
      v.literal('invalid_state'),
      v.literal('authority_mismatch'),
    ),
  }),
  v.object({
    kind: v.literal('rate_limited'),
    retryAfter: v.number(),
  }),
  v.object({
    kind: v.literal('unavailable'),
    code: v.literal('security_control_unavailable'),
    correlationRef: v.string(),
  }),
)

export const cleanupExpiredOAuthGrants = internalMutation({
  args: {
    now: v.optional(v.number()),
    batchSize: v.optional(v.number()),
    workload: workloadCronSnapshotValue,
  },
  returns: oauthGrantCleanupResult,
  handler: async (ctx, args) => {
    await reconcileWorkloadCronSnapshot(
      ctx,
      'cleanup expired agent access oauth grants',
      parseWorkloadCronSnapshot(args.workload),
    )
    const effectiveNow = args.now !== undefined && Number.isFinite(args.now) ? args.now : Date.now()
    const cutoff = effectiveNow - 60 * 60 * 1_000
    const batchSize = args.batchSize === undefined || !Number.isFinite(args.batchSize)
      ? 100
      : Math.min(Math.max(Math.floor(args.batchSize), 1), 200)

    let deleted = 0
    for (const status of OAUTH_GRANT_STATUSES) {
      const remaining = batchSize - deleted
      if (remaining === 0) break
      const expired = await ctx.db
        .query('agentAccessOAuthGrants')
        .withIndex('by_status_and_expiresAt', (query) => query.eq('status', status).lt('expiresAt', cutoff))
        .take(remaining)
      for (const row of expired) {
        await ctx.db.delete(row._id)
        deleted += 1
      }
    }

    const rescheduled = deleted === batchSize
    if (rescheduled) {
      await ctx.scheduler.runAfter(0, internal.workloadCron.cleanupExpiredAgentAccessOAuthGrants, {
        now: effectiveNow,
        batchSize,
      })
    }

    return { deleted, cutoff, rescheduled }
  },
})

export const insertGrant = mutation({
  args: { grant, operationKey: v.string(), correlationId: v.string(), ...sourceWriteArgs },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireOAuthSourceWrite(ctx, args)
    if (args.grant.revision !== 1) {
      throw new Error('agent_access_oauth_invalid_initial_revision')
    }
    if (args.grant.consequenceReservation !== undefined) {
      throw new Error('agent_access_oauth_initial_reservation_forbidden')
    }
    const existing = await ctx.db
      .query('agentAccessOAuthGrants')
      .withIndex('by_grantRef', (query) => query.eq('grantRef', args.grant.grantRef))
      .unique()
    if (existing !== null && !sameGrantMaterial(existing, args.grant)) {
      throw new Error('agent_access_oauth_grant_conflict')
    }
    await assertGrantHashesAvailable(ctx.db, args.grant, existing?._id)
    if (existing === null) {
      await ctx.db.insert('agentAccessOAuthGrants', args.grant)
    }
    return null
  },
})

export const getGrantByHash = query({
  args: {
    kind: v.union(v.literal('device'), v.literal('user'), v.literal('authorization')),
    hash: v.string(),
    operationKey: v.string(),
    correlationId: v.string(),
    ...sourceWriteArgs,
  },
  returns: v.union(grant, v.null()),
  handler: async (ctx, args) => {
    await requireOAuthSourceRead(args)
    const row = args.kind === 'device'
      ? await ctx.db.query('agentAccessOAuthGrants')
        .withIndex('by_deviceCodeHash', (query) => query.eq('deviceCodeHash', args.hash))
        .unique()
      : args.kind === 'user'
        ? await ctx.db.query('agentAccessOAuthGrants')
          .withIndex('by_userCodeHash', (query) => query.eq('userCodeHash', args.hash))
          .unique()
        : await ctx.db.query('agentAccessOAuthGrants')
          .withIndex('by_authorizationCodeHash', (query) => query.eq('authorizationCodeHash', args.hash))
          .unique()
    return row === null ? null : grantFromDocument(row)
  },
})

export const getGrantByRef = query({
  args: { grantRef: v.string(), operationKey: v.string(), correlationId: v.string(), ...sourceWriteArgs },
  returns: v.union(grant, v.null()),
  handler: async (ctx, args) => {
    await requireOAuthSourceRead(args)
    const row = await ctx.db
      .query('agentAccessOAuthGrants')
      .withIndex('by_grantRef', (query) => query.eq('grantRef', args.grantRef))
      .unique()
    return row === null ? null : grantFromDocument(row)
  },
})

export const updateGrant = mutation({
  args: {
    grantRef: v.string(), expectedStatus: status, expectedRevision: v.number(), expectedIssuanceStartedAt: v.optional(v.number()),
    patch: grantPatch, operationKey: v.string(), correlationId: v.string(), ...sourceWriteArgs,
  },
  returns: v.union(grant, v.null()),
  handler: async (ctx, args) => {
    await requireOAuthSourceWrite(ctx, args)
    if (!Number.isSafeInteger(args.expectedRevision) || args.expectedRevision < 1) {
      throw new Error('agent_access_oauth_invalid_expected_revision')
    }
    if (args.expectedStatus === 'pending' && args.patch.status === 'issuing') {
      throw new Error('agent_access_oauth_consequence_reservation_required')
    }
    const existing = await ctx.db
      .query('agentAccessOAuthGrants')
      .withIndex('by_grantRef', (query) => query.eq('grantRef', args.grantRef))
      .unique()
    if (existing === null
      || existing.status !== args.expectedStatus
      || existing.revision !== args.expectedRevision
      || (args.expectedIssuanceStartedAt !== undefined
        && existing.issuanceStartedAt !== args.expectedIssuanceStartedAt)) return null

    await assertGrantHashesAvailable(ctx.db, args.patch, existing._id)
    const patch = grantPatchDocument(args.patch)
    const pollScheduleOnly = Object.keys(patch).length === 1 && patch.nextPollAt !== undefined
    const update = pollScheduleOnly ? patch : { ...patch, revision: existing.revision + 1 }
    await ctx.db.patch(existing._id, update)
    const updated = await ctx.db.get(existing._id)
    return updated === null ? null : grantFromDocument(updated)
  },
})

export const reserveAgentAccessConsent = mutation({
  args: {
    grantRef: v.string(),
    expectedGrantRevision: v.number(),
    expectedTargetRevision: v.number(),
    authorityMode,
    approvedToolAccess: v.union(v.literal('all_admitted'), v.literal('selected_tools')),
    approvedToolRefs: v.array(v.string()),
    connectionTarget: consentConnectionTarget,
    proof: v.optional(clerkProofEvidence),
    operationKey: v.string(),
    correlationId: v.string(),
    ...sourceWriteArgs,
  },
  returns: agentAccessConsentReservationResult,
  handler: async (ctx, args) => {
    if (!validGrantRef(args.grantRef)
      || !positiveSafeInteger(args.expectedGrantRevision)
      || !positiveSafeInteger(args.expectedTargetRevision)) {
      return { kind: 'conflict' as const, code: 'stale_grant' as const }
    }
    const expectedRef = consentReservationRef(args.grantRef, args.expectedGrantRevision)
    if (args.operationKey !== expectedRef || args.correlationId !== expectedRef) {
      throw new Error('agent_access_oauth_reservation_ref_mismatch')
    }
    await requireOAuthSourceWrite(ctx, args)

    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) {
      return { kind: 'refused' as const, code: 'authentication_required' as const }
    }
    let owner: Awaited<ReturnType<typeof resolveInteractiveAuthorityContext>>
    try {
      owner = await resolveInteractiveAuthorityContext(ctx, identity)
    } catch {
      return { kind: 'refused' as const, code: 'authentication_required' as const }
    }
    const ownership = await currentOwnerAuthority(ctx, owner)
    if (ownership === null) {
      return { kind: 'conflict' as const, code: 'authority_mismatch' as const }
    }

    const oauthGrant = await ctx.db.query('agentAccessOAuthGrants')
      .withIndex('by_grantRef', (query) => query.eq('grantRef', args.grantRef))
      .unique()
    const completedReplay = oauthGrant !== null
      && isCompletedConsentGrant(oauthGrant.status)
      && oauthGrant.consequenceReservation?.correlationRef === expectedRef
      && oauthGrant.consequenceReservation.idempotencyRef === expectedRef
    if (oauthGrant === null
      || (oauthGrant.revision !== args.expectedGrantRevision
        && !(oauthGrant.status === 'issuing'
          && oauthGrant.revision === args.expectedGrantRevision + 1)
        && !completedReplay)) {
      return { kind: 'conflict' as const, code: 'stale_grant' as const }
    }
    const now = Date.now()
    if ((!completedReplay && oauthGrant.expiresAt <= now)
      || (oauthGrant.ownerId !== undefined && oauthGrant.ownerId !== identity.subject)) {
      return { kind: 'conflict' as const, code: 'invalid_state' as const }
    }
    const consent = await deriveConsentCommand(ctx, oauthGrant, args, owner.accountRef)
    if (consent === null) {
      return { kind: 'conflict' as const, code: 'stale_target' as const }
    }

    const admission = await agentAccessConsequenceAdmission({
      owner,
      ownership,
      consent,
      correlationRef: expectedRef,
      now,
    })
    if (admission.descriptor === undefined
      || admission.proofPolicy?.kind !== 'clerk_reverification'
      || admission.proofPolicy.preset !== 'strict'
      || admission.proofPolicy.uniquePerCommand !== true) {
      return { kind: 'conflict' as const, code: 'authority_mismatch' as const }
    }

    const proofInput = args.proof
    if (proofInput === undefined) {
      return { kind: 'refused' as const, code: 'reauthentication_required' as const }
    }
    if (!isValidClerkFactorEvidence(proofInput)) {
      return { kind: 'refused' as const, code: 'reauthentication_required' as const }
    }
    const existingProof = await ctx.db.query('consequenceProofUses')
      .withIndex('by_reverificationId', (query) => query.eq('reverificationId', proofInput.reverificationId))
      .unique()
    if (existingProof !== null) {
      if (existingProof.actorPrincipalRef !== admission.actorPrincipalRef
        || existingProof.activeAccountRef !== admission.activeAccountRef) {
        return { kind: 'refused' as const, code: 'proof_replayed' as const }
      }
      if (existingProof.commandDigest !== admission.descriptor.commandDigest) {
        return { kind: 'refused' as const, code: 'command_changed' as const }
      }
      return reservationMatches(oauthGrant, admission, proofInput.reverificationId, consent, owner.revision.principal)
        ? reservationSuccess('replayed', oauthGrant, admission)
        : { kind: 'refused' as const, code: 'proof_replayed' as const }
    }
    if (oauthGrant.status !== 'pending') {
      return { kind: 'conflict' as const, code: 'invalid_state' as const }
    }

    const proof = deriveStrictConsequenceProof({ ...proofInput, now })
    if (proof.kind === 'refused') return proof
    const rate = await admitAuthorityCredentialChangeRate(ctx, admission.activeAccountRef)
    if (rate.kind === 'unavailable') {
      return {
        kind: 'unavailable' as const,
        code: 'security_control_unavailable' as const,
        correlationRef: expectedRef,
      }
    }
    if (rate.kind === 'rate_limited') {
      return { kind: 'rate_limited' as const, retryAfter: rate.retryAfter }
    }

    const consumed = await consumeConsequenceProof(ctx, {
      reverificationId: proofInput.reverificationId,
      actorPrincipalRef: admission.actorPrincipalRef,
      activeAccountRef: admission.activeAccountRef,
      commandDigest: admission.descriptor.commandDigest,
      proof: proof.proof,
      correlationRef: admission.correlationRef,
      idempotencyRef: admission.idempotencyRef,
    })
    if (consumed.kind === 'refused') return consumed
    if (consumed.kind === 'replayed') {
      return reservationMatches(oauthGrant, admission, proofInput.reverificationId, consent, owner.revision.principal)
        ? reservationSuccess('replayed', oauthGrant, admission)
        : { kind: 'refused' as const, code: 'proof_replayed' as const }
    }

    await persistProofConsumedAudit(ctx, {
      admission,
      action: consent.action,
      proof: consumed.proof,
      authorityGeneration: owner.provenance.credentialGeneration,
      grantRef: oauthGrant.grantRef,
      now,
    })
    const current = await ctx.db.get(oauthGrant._id)
    if (current === null
      || current.status !== 'pending'
      || current.revision !== args.expectedGrantRevision) {
      throw new Error('agent_access_oauth_reservation_cas_lost')
    }
    if (consent.resolvedConnectionTarget.kind === 'replace_credential'
      && consent.resolvedConnectionTarget.replacementMode === 'compromise') {
      if (consent.predecessor === undefined) throw new Error('agent_access_compromise_predecessor_missing')
      const revoked = await revokeCompromisedPredecessor(
        ctx,
        consent.predecessor,
        owner,
        now,
        admission.correlationRef,
      )
      if (!revoked) throw new Error('agent_access_compromise_predecessor_stale')
    }
    await ctx.db.patch(current._id, {
      status: 'issuing',
      revision: current.revision + 1,
      ownerId: identity.subject,
      requestedScopes: [...consent.selectedScopes],
      approvedAccess: consent.issuanceMaterial.approvedAccess,
      connectionTarget: consent.resolvedConnectionTarget,
      issuanceKey: `oauth-${current.grantRef.replaceAll(':', '-')}`,
      issuanceStartedAt: now,
      consequenceReservation: {
        action: consent.action,
        commandDigest: admission.descriptor.commandDigest,
        reverificationId: proofInput.reverificationId,
        targetRevision: consent.targetRevision,
        actorPrincipalRef: admission.actorPrincipalRef,
        ownerPrincipalRevision: owner.revision.principal,
        activeAccountRef: admission.activeAccountRef,
        accountRevision: admission.accountRevision,
        authoritySource: {
          kind: 'account_ownership',
          ownershipRef: ownership.ownershipRef,
          ownershipRevision: ownership.revision,
        },
        ...(consent.predecessor === undefined ? {} : { predecessor: consent.predecessor }),
        correlationRef: admission.correlationRef,
        idempotencyRef: admission.idempotencyRef,
        reservedAt: now,
      },
    })
    const reserved = await ctx.db.get(current._id)
    if (reserved === null) throw new Error('agent_access_oauth_reservation_missing')
    return reservationSuccess('reserved', reserved, admission)
  },
})

export const insertClient = mutation({
  args: { client, operationKey: v.string(), correlationId: v.string(), ...sourceWriteArgs },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireOAuthSourceWrite(ctx, args)
    const existing = await ctx.db
      .query('agentAccessOAuthClients')
      .withIndex('by_clientId', (query) => query.eq('clientId', args.client.clientId))
      .unique()
    if (existing !== null && !sameClientMaterial(existing, args.client)) {
      throw new Error('agent_access_oauth_client_conflict')
    }
    if (existing === null) {
      await ctx.db.insert('agentAccessOAuthClients', args.client)
    }
    return null
  },
})

export const getClient = query({
  args: { clientId: v.string() },
  returns: v.union(client, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query('agentAccessOAuthClients')
      .withIndex('by_clientId', (query) => query.eq('clientId', args.clientId))
      .unique()
    return row === null ? null : clientFromDocument(row)
  },
})

export const listOwnerConnectionReadbacks = query({
  args: { principalRefs: v.array(v.string()), now: v.number() },
  returns: v.array(agentConnectionReadback),
  handler: async (ctx, args) => {
    if (args.principalRefs.length > 25) throw new ConvexError('principal_ref_limit_exceeded')
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return []
    const uniquePrincipalRefs = [...new Set(args.principalRefs)]
    const pages = await Promise.all(uniquePrincipalRefs.map(async (principalRefValue) => await ctx.db
      .query('agentAccessOAuthRefreshFamilies')
      .withIndex('by_principalRef_and_lifecycle', (index) => index.eq('principalRef', principalRefValue))
      .order('desc')
      .take(100)))
    return (await Promise.all(pages.flat().map(async (family) => await projectOwnerConnection(
      ctx,
      family,
      actor.canonicalAccountRef,
      args.now,
    )))).filter((connection): connection is NonNullable<typeof connection> => connection !== undefined)
  },
})

export const listOwnerReconnectCandidates = query({
  args: { clientId: v.string(), principalRefs: v.array(v.string()), now: v.number() },
  returns: v.array(ownerReconnectCandidate),
  handler: async (ctx, args) => {
    if (args.principalRefs.length > 25) throw new ConvexError('principal_ref_limit_exceeded')
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return []
    const candidates = await Promise.all([...new Set(args.principalRefs)].map(async (principalRefValue) => {
      const [principal, admission, families] = await Promise.all([
        ctx.db.query('principals')
          .withIndex('by_principalRef', (index) => index.eq('principalRef', principalRefValue))
          .unique(),
        ctx.db.query('agentAccessPrincipals')
          .withIndex('by_principalId', (index) => index.eq('principalId', principalRefValue))
          .unique(),
        ctx.db.query('agentAccessOAuthRefreshFamilies')
          .withIndex('by_principalRef_and_lifecycle', (index) => index.eq('principalRef', principalRefValue))
          .take(100),
      ])
      if (principal === null || principal.kind !== 'agent' || principal.lifecycle !== 'active'
        || admission === null || admission.ownerId !== actor.canonicalAccountRef || admission.lifecycle !== 'active') return []
      const reconnectable = families.filter((family) => (
        family.ownerId === actor.canonicalAccountRef
        && family.clientId === args.clientId
        && (family.lifecycle !== 'active' || family.expiresAt <= args.now)
      ))
      return reconnectable.map(() => ({ principalRef: principal.principalRef, principalRevision: principal.revision }))
    }))
    return candidates.flat()
  },
})

export const listOwnerConnectionHistory = query({
  args: { principalRef: v.string(), now: v.number(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(agentConnectionReadback),
  handler: async (ctx, args) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return { page: [], isDone: true, continueCursor: '' }
    const result = await ctx.db.query('agentAccessOAuthRefreshFamilies')
      .withIndex('by_principalRef_and_lifecycle', (index) => index.eq('principalRef', args.principalRef))
      .paginate(args.paginationOpts)
    const page = (await Promise.all(result.page.map(async (family) => await projectOwnerConnection(
      ctx,
      family,
      actor.canonicalAccountRef,
      args.now,
    )))).filter((connection): connection is NonNullable<typeof connection> => connection !== undefined)
    return { ...result, page }
  },
})

export const revokeOwnerConnection = mutation({
  args: { connectionRef: v.string(), expectedRevision: v.number(), correlationRef: v.string() },
  returns: ownerConnectionLifecycleResult,
  handler: async (ctx, args) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') {
      return { kind: 'refused' as const, code: 'authentication_required' as const, correlationRef: args.correlationRef }
    }
    const family = await ctx.db.query('agentAccessOAuthRefreshFamilies')
      .withIndex('by_familyRef', (index) => index.eq('familyRef', args.connectionRef)).unique()
    if (family === null || family.ownerId !== actor.canonicalAccountRef) {
      return { kind: 'conflict' as const, code: 'connection_not_found' as const, correlationRef: args.correlationRef }
    }
    if (family.lifecycle !== 'active') {
      return {
        kind: 'replayed' as const,
        connectionRef: family.familyRef,
        principalRef: family.principalRef,
        revision: family.revision,
        providerCleanupPending: false,
        correlationRef: args.correlationRef,
      }
    }
    if (family.revision !== args.expectedRevision) {
      return { kind: 'conflict' as const, code: 'connection_revision_conflict' as const, correlationRef: args.correlationRef }
    }
    const revoked = await revokeRefreshFamilyCore(ctx, family, 'owner_revoked', Date.now(), args.correlationRef)
    return {
      kind: 'completed' as const,
      connectionRef: family.familyRef,
      principalRef: family.principalRef,
      revision: family.revision + 1,
      providerCleanupPending: revoked.providerCleanupPending,
      correlationRef: args.correlationRef,
    }
  },
})

export const createRefreshFamily = mutation({
  args: {
    grantRef: v.string(), keyId: v.string(), clientId: v.string(), tokenHash: v.string(), accessTokenHash: v.string(),
    createdAt: v.number(), expiresAt: v.number(), operationKey: v.string(), correlationId: v.string(),
    ...sourceWriteArgs,
  },
  returns: refreshCreateResult,
  handler: async (ctx, args) => {
    await requireOAuthSourceWrite(ctx, args)
    if (args.tokenHash.trim().length === 0 || args.accessTokenHash.trim().length === 0 || args.createdAt >= args.expiresAt) {
      return { kind: 'conflict' as const, code: 'invalid_material' as const }
    }
    const oauthGrant = await ctx.db.query('agentAccessOAuthGrants')
      .withIndex('by_grantRef', (query) => query.eq('grantRef', args.grantRef)).unique()
    if (oauthGrant === null || oauthGrant.clientId !== args.clientId || oauthGrant.keyId !== args.keyId
      || oauthGrant.ownerId === undefined
      || oauthGrant.offlineAccess !== true || (oauthGrant.status !== 'delivery_claimed' && oauthGrant.status !== 'consumed')) {
      return { kind: 'conflict' as const, code: 'grant_not_eligible' as const }
    }
    const current = await resolveRefreshCanonicalMaterial(ctx, args.keyId)
    if (current === null) return { kind: 'conflict' as const, code: 'canonical_binding_invalid' as const }
    const familyRef = canonicalDigest({
      format: 'agent-access-oauth-refresh-family:v1',
      grantRef: args.grantRef,
      clientId: args.clientId,
    } as never)
    const [existingFamily, existingToken] = await Promise.all([
      ctx.db.query('agentAccessOAuthRefreshFamilies')
        .withIndex('by_familyRef', (query) => query.eq('familyRef', familyRef)).unique(),
      ctx.db.query('agentAccessOAuthRefreshTokens')
        .withIndex('by_tokenHash', (query) => query.eq('tokenHash', args.tokenHash)).unique(),
    ])
    if (existingFamily !== null) {
      const replay = existingFamily.clientId === args.clientId
        && existingFamily.lifecycle === 'active'
        && existingFamily.currentProviderCredentialId === args.keyId
        && existingFamily.currentTokenHash === args.tokenHash
        && existingFamily.expiresAt === args.expiresAt
      return replay
        ? { kind: 'replayed' as const, family: refreshFamilyFromDocument(existingFamily) }
        : { kind: 'conflict' as const, code: 'family_conflict' as const }
    }
    if (existingToken !== null) return { kind: 'conflict' as const, code: 'token_hash_conflict' as const }
    const family = {
      familyRef, revision: 1, clientId: args.clientId, ownerId: current.ownerId,
      ownerPrincipalRef: current.ownerPrincipalRef, providerSubject: oauthGrant.ownerId, principalRef: current.principalRef,
      displayName: oauthGrant.displayName,
      applicationRef: current.applicationRef, environment: current.environment,
      scopes: current.scopes, authorityMode: current.authorityMode,
      toolAccess: current.toolAccess, toolRefs: current.toolRefs,
      spendingPolicy: current.spendingPolicy, currentCredentialRef: current.credentialRef,
      currentProviderCredentialId: args.keyId, currentGrantRef: current.grantRef,
      currentGeneration: current.generation, currentAccessExpiresAt: current.expiresAt,
      currentTokenHash: args.tokenHash,
      lifecycle: 'active' as const, createdAt: args.createdAt, expiresAt: args.expiresAt,
      updatedAt: args.createdAt,
    }
    await ctx.db.insert('agentAccessOAuthRefreshFamilies', family)
    await ctx.db.insert('agentAccessOAuthRefreshTokens', {
      tokenHash: args.tokenHash, accessTokenHash: args.accessTokenHash,
      familyRef, generation: 1, lifecycle: 'active', createdAt: args.createdAt,
    })
    await persistRefreshAudit(ctx, family, 'connection.connected', 'refresh_family_issued', args.correlationId, args.createdAt)
    return { kind: 'recorded' as const, family }
  },
})

export const claimRefreshFamily = mutation({
  args: {
    tokenHash: v.string(), clientId: v.string(), claimRef: v.string(), successorTokenHash: v.string(),
    now: v.number(), claimExpiresAt: v.number(), operationKey: v.string(), correlationId: v.string(),
    ...sourceWriteArgs,
  },
  returns: refreshClaimResult,
  handler: async (ctx, args) => {
    await requireOAuthSourceWrite(ctx, args)
    if (args.tokenHash === args.successorTokenHash || args.claimRef.trim().length === 0
      || args.now >= args.claimExpiresAt) return { kind: 'invalid_grant' as const }
    const token = await ctx.db.query('agentAccessOAuthRefreshTokens')
      .withIndex('by_tokenHash', (query) => query.eq('tokenHash', args.tokenHash)).unique()
    if (token === null) return { kind: 'invalid_grant' as const }
    const family = await ctx.db.query('agentAccessOAuthRefreshFamilies')
      .withIndex('by_familyRef', (query) => query.eq('familyRef', token.familyRef)).unique()
    if (family === null || family.clientId !== args.clientId || family.lifecycle !== 'active') {
      return { kind: 'invalid_grant' as const }
    }
    if (family.expiresAt <= args.now) {
      await revokeRefreshFamilyCore(ctx, family, 'expired', args.now, args.correlationId)
      return { kind: 'revoked' as const }
    }
    if (token.lifecycle === 'consumed' && token.replayUntil !== undefined && token.replayUntil >= args.now) {
      if (token.recoveredAt !== undefined) {
        return token.replacedByTokenHash === args.successorTokenHash
          ? { kind: 'recovered' as const, family: refreshFamilyFromDocument(family) }
          : await revokeRefreshReuse(ctx, family, args.now, args.correlationId)
      }
      const conflict = await ctx.db.query('agentAccessOAuthRefreshTokens')
        .withIndex('by_tokenHash', (query) => query.eq('tokenHash', args.successorTokenHash)).unique()
      if (conflict !== null) return { kind: 'invalid_grant' as const }
      const currentToken = await ctx.db.query('agentAccessOAuthRefreshTokens')
        .withIndex('by_tokenHash', (query) => query.eq('tokenHash', family.currentTokenHash)).unique()
      if (currentToken === null || currentToken.lifecycle !== 'active') {
        return await revokeRefreshReuse(ctx, family, args.now, args.correlationId)
      }
      await ctx.db.patch(currentToken._id, { lifecycle: 'invalidated', invalidatedAt: args.now })
      await ctx.db.insert('agentAccessOAuthRefreshTokens', {
        tokenHash: args.successorTokenHash, accessTokenHash: currentToken.accessTokenHash,
        familyRef: family.familyRef,
        generation: currentToken.generation + 1, lifecycle: 'active', createdAt: args.now,
      })
      await ctx.db.patch(token._id, {
        recoveredAt: args.now,
        replacedByTokenHash: args.successorTokenHash,
      })
      await ctx.db.patch(family._id, {
        currentTokenHash: args.successorTokenHash,
        revision: family.revision + 1,
        updatedAt: args.now,
      })
      const recovered = await ctx.db.get(family._id)
      if (recovered === null) throw new Error('refresh_family_recovery_missing')
      await persistRefreshAudit(
        ctx,
        refreshFamilyFromDocument(recovered),
        'connection.reauthorized',
        'refresh_delivery_recovered',
        args.correlationId,
        args.now,
      )
      return { kind: 'recovered' as const, family: refreshFamilyFromDocument(recovered) }
    }
    if (token.lifecycle === 'consumed' || token.lifecycle === 'invalidated') {
      return await revokeRefreshReuse(ctx, family, args.now, args.correlationId)
    }
    if (token.tokenHash !== family.currentTokenHash) return { kind: 'invalid_grant' as const }
    if (token.lifecycle === 'claimed') {
      if (token.claimRef === args.claimRef && token.replacedByTokenHash === args.successorTokenHash) {
        return { kind: 'replayed' as const, family: refreshFamilyFromDocument(family), claimRef: args.claimRef }
      }
      if (token.claimExpiresAt !== undefined && token.claimExpiresAt > args.now) return { kind: 'busy' as const }
    }
    const successor = await ctx.db.query('agentAccessOAuthRefreshTokens')
      .withIndex('by_tokenHash', (query) => query.eq('tokenHash', args.successorTokenHash)).unique()
    if (successor !== null) return { kind: 'invalid_grant' as const }
    await ctx.db.patch(token._id, {
      lifecycle: 'claimed', claimRef: args.claimRef, claimedAt: args.now,
      claimExpiresAt: args.claimExpiresAt, replacedByTokenHash: args.successorTokenHash,
    })
    return { kind: 'claimed' as const, family: refreshFamilyFromDocument(family), claimRef: args.claimRef }
  },
})

export const commitRefreshFamilyRotation = mutation({
  args: {
    familyRef: v.string(), expectedRevision: v.number(), tokenHash: v.string(), claimRef: v.string(),
    successorTokenHash: v.string(), issuanceKey: v.string(), successorGrantRef: v.string(),
    successorCredentialId: v.string(), successorAccessTokenHash: v.string(), createdAt: v.number(), accessExpiresAt: v.number(),
    replayUntil: v.number(), operationKey: v.string(), correlationId: v.string(), ...sourceWriteArgs,
  },
  returns: refreshCommitResult,
  handler: async (ctx, args) => {
    await requireOAuthSourceWrite(ctx, args)
    const family = await ctx.db.query('agentAccessOAuthRefreshFamilies')
      .withIndex('by_familyRef', (query) => query.eq('familyRef', args.familyRef)).unique()
    if (family === null) return { kind: 'conflict' as const, code: 'family_not_found' as const }
    if (family.currentTokenHash === args.successorTokenHash
      && family.currentProviderCredentialId === args.successorCredentialId) {
      return {
        kind: 'replayed' as const,
        family: refreshFamilyFromDocument(family),
      }
    }
    if (family.lifecycle !== 'active' || family.revision !== args.expectedRevision
      || family.currentTokenHash !== args.tokenHash || family.expiresAt <= args.createdAt
      || args.accessExpiresAt <= args.createdAt || args.accessExpiresAt > family.expiresAt
      || args.replayUntil < args.createdAt) {
      return { kind: 'conflict' as const, code: 'stale_family' as const }
    }
    const token = await ctx.db.query('agentAccessOAuthRefreshTokens')
      .withIndex('by_tokenHash', (query) => query.eq('tokenHash', args.tokenHash)).unique()
    if (token === null || token.familyRef !== family.familyRef || token.lifecycle !== 'claimed'
      || token.claimRef !== args.claimRef || token.replacedByTokenHash !== args.successorTokenHash) {
      return { kind: 'conflict' as const, code: 'stale_claim' as const }
    }
    const owner = { principalRef: principalRef(family.ownerPrincipalRef), accountRef: accountRef(family.ownerId) }
    const prepared = await prepareCredentialReplacementCore(ctx, {
      principalRef: family.principalRef, replacementMode: 'planned', issuanceKey: args.issuanceKey,
      grantRef: args.successorGrantRef, credentialId: args.successorCredentialId,
      applicationRef: family.applicationRef, environment: family.environment, scopes: family.scopes,
      authorityMode: family.authorityMode, toolAccess: family.toolAccess,
      toolRefs: family.toolRefs, spendingPolicy: family.spendingPolicy,
      createdAt: args.createdAt, expiresAt: args.accessExpiresAt,
    }, owner, args.createdAt)
    if (prepared.kind !== 'recorded' && prepared.kind !== 'replayed') {
      return { kind: 'conflict' as const, code: 'replacement_prepare_failed' as const }
    }
    const promoted = await transitionCredentialReplacementCore(ctx, {
      principalRef: family.principalRef,
      successorCredentialRef: prepared.successorCredentialRef,
      successorGrantRef: prepared.successorGrantRef,
    }, owner, 'promote', args.createdAt)
    if (promoted.kind !== 'completed' && promoted.kind !== 'replayed') {
      throw new Error('refresh_replacement_promote_failed')
    }
    await ctx.db.patch(token._id, {
      lifecycle: 'consumed', consumedAt: args.createdAt, replayUntil: args.replayUntil,
      claimExpiresAt: undefined,
    })
    await ctx.db.insert('agentAccessOAuthRefreshTokens', {
      tokenHash: args.successorTokenHash, accessTokenHash: args.successorAccessTokenHash,
      familyRef: family.familyRef,
      generation: token.generation + 1, lifecycle: 'active', createdAt: args.createdAt,
    })
    await ctx.db.patch(family._id, {
      revision: family.revision + 1,
      currentCredentialRef: prepared.successorCredentialRef,
      currentProviderCredentialId: args.successorCredentialId,
      currentGrantRef: prepared.successorGrantRef,
      currentGeneration: prepared.generation,
      currentAccessExpiresAt: args.accessExpiresAt,
      currentTokenHash: args.successorTokenHash,
      spendingPolicy: {
        ...family.spendingPolicy,
        budget: { ...family.spendingPolicy.budget, generation: prepared.generation },
        rate: { ...family.spendingPolicy.rate, generation: prepared.generation },
      },
      updatedAt: args.createdAt,
    })
    const committed = await ctx.db.get(family._id)
    if (committed === null) throw new Error('refresh_family_commit_missing')
    await persistRefreshAudit(
      ctx,
      refreshFamilyFromDocument(committed),
      'connection.reauthorized',
      'refresh_rotated',
      args.correlationId,
      args.createdAt,
    )
    return {
      kind: 'completed' as const,
      family: refreshFamilyFromDocument(committed),
      providerCleanupTarget: {
        credentialRef: prepared.predecessorCredentialRef,
        providerCredentialId: promoted.providerCredentialId,
      },
    }
  },
})

export const revokeRefreshFamily = mutation({
  args: {
    tokenHash: v.string(), clientId: v.string(), now: v.number(), reason: v.string(),
    operationKey: v.string(), correlationId: v.string(), ...sourceWriteArgs,
  },
  returns: v.object({ kind: v.union(v.literal('completed'), v.literal('replayed'), v.literal('unknown')) }),
  handler: async (ctx, args) => {
    await requireOAuthSourceWrite(ctx, args)
    const token = await ctx.db.query('agentAccessOAuthRefreshTokens')
      .withIndex('by_tokenHash', (query) => query.eq('tokenHash', args.tokenHash)).unique()
    if (token === null) return { kind: 'unknown' as const }
    const family = await ctx.db.query('agentAccessOAuthRefreshFamilies')
      .withIndex('by_familyRef', (query) => query.eq('familyRef', token.familyRef)).unique()
    if (family === null || family.clientId !== args.clientId) return { kind: 'unknown' as const }
    if (family.lifecycle !== 'active') return { kind: 'replayed' as const }
    await revokeRefreshFamilyCore(ctx, family, args.reason, args.now, args.correlationId)
    return { kind: 'completed' as const }
  },
})

export const revokeRefreshFamilyByAccessToken = mutation({
  args: {
    tokenHash: v.string(), clientId: v.string(), now: v.number(), reason: v.string(),
    operationKey: v.string(), correlationId: v.string(), ...sourceWriteArgs,
  },
  returns: v.object({ kind: v.union(v.literal('completed'), v.literal('replayed'), v.literal('unknown')) }),
  handler: async (ctx, args) => {
    await requireOAuthSourceWrite(ctx, args)
    const matchingTokens = await ctx.db.query('agentAccessOAuthRefreshTokens')
      .withIndex('by_accessTokenHash', (query) => query.eq('accessTokenHash', args.tokenHash)).take(3)
    if (matchingTokens.length === 0) return { kind: 'unknown' as const }
    const familyRefs = [...new Set(matchingTokens.map((token) => token.familyRef))]
    if (familyRefs.length !== 1) throw new Error('refresh_family_access_token_ambiguous')
    const familyRef = familyRefs[0]
    if (familyRef === undefined) return { kind: 'unknown' as const }
    const family = await ctx.db.query('agentAccessOAuthRefreshFamilies')
      .withIndex('by_familyRef', (query) => query.eq('familyRef', familyRef)).unique()
    if (family === null) return { kind: 'unknown' as const }
    if (family.clientId !== args.clientId) return { kind: 'unknown' as const }
    if (family.lifecycle !== 'active') return { kind: 'replayed' as const }
    await revokeRefreshFamilyCore(ctx, family, args.reason, args.now, args.correlationId)
    return { kind: 'completed' as const }
  },
})

type OAuthGrantMaterial = Omit<Doc<'agentAccessOAuthGrants'>, '_id' | '_creationTime'>
type OAuthClientMaterial = Omit<Doc<'agentAccessOAuthClients'>, '_id' | '_creationTime'>
type OAuthDatabaseReader = GenericDatabaseReader<DataModel>

function refreshFamilyFromDocument(row: Doc<'agentAccessOAuthRefreshFamilies'>) {
  const { _id: _ignoredId, _creationTime: _ignoredCreationTime, ...value } = row
  return value
}

async function resolveRefreshCanonicalMaterial(ctx: MutationCtx, keyId: string) {
  const binding = await ctx.db.query('externalIdentityBindings')
    .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
      .eq('providerNamespace', 'clerk/api-key').eq('providerIdentifier', keyId)).unique()
  if (binding === null || binding.lifecycle !== 'active' || binding.providerState.kind !== 'known'
    || binding.providerState.value !== 'active') return null
  const [credential, accessPrincipal] = await Promise.all([
    ctx.db.query('credentials')
      .withIndex('by_bindingRef_and_generation_and_lifecycle', (query) => query
        .eq('bindingRef', binding.bindingRef).eq('generation', binding.credentialGeneration).eq('lifecycle', 'active'))
      .unique(),
    ctx.db.query('agentAccessPrincipals')
      .withIndex('by_principalId', (query) => query.eq('principalId', binding.principalRef)).unique(),
  ])
  if (credential === null || accessPrincipal === null || accessPrincipal.lifecycle !== 'active'
    || accessPrincipal.credentialId !== keyId || credential.principalRef !== accessPrincipal.principalId) return null
  const grants = await ctx.db.query('agentAccessGrants')
    .withIndex('by_credentialId_and_environment_and_lifecycle', (query) => query
      .eq('credentialId', keyId).eq('environment', accessPrincipal.environment).eq('lifecycle', 'active'))
    .take(2)
  const grant = grants.find((candidate) => candidate.principalId === accessPrincipal.principalId)
  if (grant === undefined || grant.format !== AGENT_ACCESS_GRANT_FORMAT) return null
  let normalizedGrant: ReturnType<typeof normalizeStoredAgentAccessGrant>
  try {
    normalizedGrant = normalizeStoredAgentAccessGrant(grant)
  } catch {
    return null
  }
  if (normalizedGrant.format !== AGENT_ACCESS_GRANT_FORMAT
    || normalizedGrant.spendingPolicy.format !== AGENT_ACCESS_POLICY_FORMAT
    || normalizedGrant.generation !== credential.generation
    || normalizedGrant.spendingPolicyDigest !== accessPrincipal.spendingPolicyDigest) return null
  const [membership, ownerships] = await Promise.all([
    ctx.db.query('memberships')
      .withIndex('by_accountRef_and_memberPrincipalRef_and_lifecycle', (query) => query
        .eq('accountRef', accessPrincipal.ownerId).eq('memberPrincipalRef', accessPrincipal.principalId).eq('lifecycle', 'active'))
      .unique(),
    ctx.db.query('accountOwnerships')
      .withIndex('by_accountRef_and_lifecycle', (query) => query.eq('accountRef', accessPrincipal.ownerId).eq('lifecycle', 'active'))
      .take(2),
  ])
  const ownership = ownerships[0]
  if (membership === null || ownerships.length !== 1 || ownership === undefined) return null
  return {
    ownerId: accessPrincipal.ownerId,
    ownerPrincipalRef: ownership.ownerPrincipalRef,
    principalRef: accessPrincipal.principalId,
    applicationRef: accessPrincipal.applicationRef,
    environment: accessPrincipal.environment,
    scopes: [...accessPrincipal.scopes],
    authorityMode: normalizedGrant.authorityMode,
    toolAccess: normalizedGrant.toolAccess,
    toolRefs: [...normalizedGrant.toolRefs],
    spendingPolicy: {
      format: AGENT_ACCESS_POLICY_FORMAT,
      toolAccess: normalizedGrant.spendingPolicy.toolAccess,
      toolRefs: [...normalizedGrant.spendingPolicy.toolRefs],
      environment: normalizedGrant.spendingPolicy.environment,
      budget: { ...normalizedGrant.spendingPolicy.budget },
      rate: { ...normalizedGrant.spendingPolicy.rate },
    },
    credentialRef: credential.credentialRef,
    grantRef: normalizedGrant.grantRef,
    generation: normalizedGrant.generation,
    expiresAt: normalizedGrant.expiresAt,
  }
}

async function revokeRefreshReuse(
  ctx: MutationCtx,
  family: Doc<'agentAccessOAuthRefreshFamilies'>,
  now: number,
  correlationRef: string,
) {
  await revokeRefreshFamilyCore(ctx, family, 'refresh_token_reuse', now, correlationRef)
  return { kind: 'revoked' as const }
}

async function revokeRefreshFamilyCore(
  ctx: MutationCtx,
  family: Doc<'agentAccessOAuthRefreshFamilies'>,
  reason: string,
  now: number,
  correlationRef: string,
): Promise<{ providerCleanupPending: boolean }> {
  if (family.lifecycle !== 'active') return { providerCleanupPending: false }
  const owner = { principalRef: principalRef(family.ownerPrincipalRef), accountRef: accountRef(family.ownerId) }
  const revoked = await revokeCanonicalCredentialForService(ctx, family.currentCredentialRef, owner, correlationRef, now)
  if (revoked.kind !== 'completed' && revoked.kind !== 'replayed') {
    throw new Error(`refresh_family_canonical_revocation_failed:${revoked.code}`)
  }
  await ctx.db.patch(family._id, {
    lifecycle: reason === 'expired' ? 'expired' : 'revoked',
    revision: family.revision + 1,
    revokedAt: now,
    revocationReason: reason,
    updatedAt: now,
  })
  await persistRefreshAudit(
    ctx,
    { ...refreshFamilyFromDocument(family), lifecycle: reason === 'expired' ? 'expired' : 'revoked' },
    'connection.revoked',
    reason,
    correlationRef,
    now,
  )
  return { providerCleanupPending: revoked.providerTargets.length > 0 }
}

async function projectOwnerConnection(
  ctx: QueryCtx,
  family: Doc<'agentAccessOAuthRefreshFamilies'>,
  ownerAccountRef: string,
  now: number,
) {
  if (family.ownerId !== ownerAccountRef) return undefined
  const [principal, client] = await Promise.all([
    ctx.db.query('principals')
      .withIndex('by_principalRef', (index) => index.eq('principalRef', family.principalRef))
      .unique(),
    ctx.db.query('agentAccessOAuthClients')
      .withIndex('by_clientId', (index) => index.eq('clientId', family.clientId))
      .unique(),
  ])
  if (principal === null || principal.kind !== 'agent' || client === null) return undefined
  const state = family.lifecycle === 'active' && family.expiresAt <= now ? 'expired' as const : family.lifecycle
  return {
    connectionRef: family.familyRef,
    revision: family.revision,
    principalRef: family.principalRef,
    agentDisplayName: principal.displayName,
    connectorDisplayName: client.clientName,
    environment: family.environment,
    state,
    authorityMode: family.authorityMode,
    toolAccess: family.toolAccess,
    toolRefs: family.toolRefs,
    spendingPolicy: family.spendingPolicy,
    commercialScopes: family.scopes.filter((scope) => scope !== 'offline_access'),
    connectedAt: family.createdAt,
    lastRotatedAt: family.updatedAt,
    accessExpiresAt: family.currentAccessExpiresAt,
    connectionExpiresAt: family.expiresAt,
    ...(family.revokedAt === undefined ? {} : { revokedAt: family.revokedAt }),
    ...(family.revocationReason === undefined ? {} : { revocationReason: family.revocationReason }),
    credentialGeneration: family.currentGeneration,
  }
}

async function persistRefreshAudit(
  ctx: Pick<MutationCtx, 'db'>,
  family: Omit<Doc<'agentAccessOAuthRefreshFamilies'>, '_id' | '_creationTime'>,
  eventType: 'connection.connected' | 'connection.reauthorized' | 'connection.revoked',
  outcome: string,
  correlationRef: string,
  occurredAt: number,
): Promise<void> {
  const commandDigest = canonicalDigest({
    format: 'agent-access-oauth-refresh-audit:v1',
    familyRef: family.familyRef,
    revision: family.revision,
    eventType,
    outcome,
  } as never)
  const audit = createPackage3AuditEvent({
    eventId: brandNonEmpty(`audit:${eventType}:${commandDigest.slice('sha256:'.length)}`, 'AuditEventId'),
    eventType,
    actorKind: 'agent',
    actorRef: brandNonEmpty(family.principalRef, 'PrincipalRef'),
    activeAccountRef: family.ownerId,
    sourceSystem: 'ae_recorded',
    observedAt: occurredAt,
    authorityGeneration: family.currentGeneration,
    targetType: 'agent',
    targetRef: family.principalRef,
    idempotencyKey: brandNonEmpty(`oauth-refresh:${family.familyRef}:${family.revision}:${outcome}`, 'OperationKey'),
    correlationId: brandNonEmpty(agentAuditOpaqueRef(correlationRef, 'correlationRef'), 'CorrelationId'),
    beforeState: eventType === 'connection.connected' ? 'authorized' : 'connected',
    outcome,
    evidenceRefs: [],
    redactedPayload: { familyRef: family.familyRef },
    commandDigest: brandNonEmpty(commandDigest, 'SourceHash'),
    createdAt: occurredAt,
  })
  if (!audit.valid) throw new Error(`refresh_audit_invalid:${audit.reason}`)
  await persistAuditEvent(ctx.db, audit.event)
}

type ConsentReservationArgs = Readonly<{
  expectedGrantRevision: number
  expectedTargetRevision: number
  authorityMode: AgentAccessAuthorityMode
  approvedToolAccess: 'all_admitted' | 'selected_tools'
  approvedToolRefs: readonly string[]
  connectionTarget:
    | Readonly<{ kind: 'new_agent' }>
    | Readonly<{
        kind: 'replace_credential'
        principalRef: string
        replacementMode: 'planned' | 'compromise'
      }>
}>

type ConsentCommand = Readonly<{
  action: 'agent_access.create' | 'agent_access.replace_credential'
  grantRef: string
  expectedGrantRevision: number
  authorityMode: AgentAccessAuthorityMode
  connectionTarget: ConsentReservationArgs['connectionTarget']
  resolvedConnectionTarget:
    | Readonly<{ kind: 'new_agent'; displayName: string }>
    | Readonly<{
        kind: 'replace_credential'
        principalRef: string
        replacementMode: 'planned' | 'compromise'
      }>
  selectedScopes: readonly string[]
  issuanceMaterial: Readonly<{
    clientId: string
    flow: Doc<'agentAccessOAuthGrants'>['flow']
    displayName: string
    requestedAccess: Doc<'agentAccessOAuthGrants'>['requestedAccess']
    approvedAccess: Doc<'agentAccessOAuthGrants'>['approvedAccess']
  }>
  predecessor?: AgentAccessPredecessorSnapshot
  target: Readonly<{ targetType: string; targetRef: string; targetRevision: number }>
  targetRevision: number
  consequenceSummary: string
}>

type AgentAccessPredecessorSnapshot = Readonly<{
  credentialId: string
  applicationRef: string
  environment: Doc<'agentAccessPrincipals'>['environment']
  grantRef: string
  grantGeneration: number
  spendingPolicyDigest: string
  bindingRef: string
  bindingRevision: number
  bindingCredentialGeneration: number
  credentialRef: string
  credentialRevision: number
  credentialGeneration: number
}>

async function deriveConsentCommand(
  ctx: Pick<MutationCtx, 'db'>,
  oauthGrant: Doc<'agentAccessOAuthGrants'>,
  args: ConsentReservationArgs,
  activeAccountRef: string,
): Promise<ConsentCommand | null> {
  const requested = normalizeRequestedScopes(oauthGrant.requestedScopes.join(' '))
  if (requested === undefined
    || !AGENT_ACCESS_AUTHORITY_MODE_VALUES.includes(args.authorityMode)
    || !agentAuthorityModeAllows(requested.mode, args.authorityMode)
    || (requested.profile === 'provider' && args.authorityMode !== 'spending_policy')) return null
  const selectedScopes = requested.profile === 'provider'
    ? requested.scopes
    : requestedScopesForMode(args.authorityMode)
  const approvedSelection = normalizeAgentAccessToolSelection({
    toolAccess: args.approvedToolAccess,
    toolRefs: args.approvedToolRefs,
  })
  if (approvedSelection === undefined
    || (requested.profile === 'provider' && approvedSelection.toolAccess !== 'all_admitted')) return null
  let approvedAccess: Doc<'agentAccessOAuthGrants'>['approvedAccess']
  if (oauthGrant.status === 'pending') {
    if (!toolSelectionNarrows(oauthGrant.requestedAccess, approvedSelection)) return null
    if (!await allSelectedToolsAreCurrent(ctx, approvedSelection.toolRefs)) return null
    approvedAccess = {
      ...oauthGrant.requestedAccess,
      toolAccess: approvedSelection.toolAccess,
      toolRefs: approvedSelection.toolRefs,
    }
  } else {
    if (!sameToolSelection(oauthGrant.approvedAccess, approvedSelection)) return null
    approvedAccess = oauthGrant.approvedAccess
  }
  const issuanceMaterial = {
    clientId: oauthGrant.clientId,
    flow: oauthGrant.flow,
    displayName: oauthGrant.displayName,
    requestedAccess: oauthGrant.requestedAccess,
    approvedAccess,
  } as const

  if (args.connectionTarget.kind === 'new_agent') {
    if (oauthGrant.displayName.trim().length === 0
      || oauthGrant.displayName.length > 80
      || args.expectedTargetRevision !== args.expectedGrantRevision) return null
    if (isCompletedConsentGrant(oauthGrant.status)
      && (oauthGrant.consequenceReservation?.action !== 'agent_access.create'
        || oauthGrant.consequenceReservation.targetRevision !== args.expectedTargetRevision
        || oauthGrant.connectionTarget?.kind !== 'new_agent')) return null
    return {
      action: 'agent_access.create',
      grantRef: oauthGrant.grantRef,
      expectedGrantRevision: args.expectedGrantRevision,
      authorityMode: args.authorityMode,
      connectionTarget: args.connectionTarget,
      resolvedConnectionTarget: { kind: 'new_agent', displayName: oauthGrant.displayName },
      selectedScopes,
      issuanceMaterial,
      target: {
        targetType: 'agent_access_oauth_grant',
        targetRef: oauthGrant.grantRef,
        targetRevision: args.expectedTargetRevision,
      },
      targetRevision: args.expectedTargetRevision,
      consequenceSummary: 'Create an Agent credential with the selected market authority.',
    }
  }

  let canonicalPrincipalRef: string
  try {
    canonicalPrincipalRef = principalRef(args.connectionTarget.principalRef)
  } catch {
    return null
  }
  if (oauthGrant.status !== 'pending') {
    const reservation = oauthGrant.consequenceReservation
    if (reservation?.action !== 'agent_access.replace_credential'
      || reservation.predecessor === undefined
      || reservation.targetRevision !== args.expectedTargetRevision
      || oauthGrant.connectionTarget?.kind !== 'replace_credential'
      || oauthGrant.connectionTarget.principalRef !== canonicalPrincipalRef
      || oauthGrant.connectionTarget.replacementMode !== args.connectionTarget.replacementMode) return null
    let predecessor = reservation.predecessor
    if (oauthGrant.status === 'issuing' && args.connectionTarget.replacementMode === 'planned') {
      const currentPredecessor = await resolveReplacementPredecessor(
        ctx,
        canonicalPrincipalRef,
        activeAccountRef,
      )
      if (currentPredecessor === null
        || !samePredecessorSnapshot(reservation.predecessor, currentPredecessor)) return null
      predecessor = currentPredecessor
    }
    return {
      action: 'agent_access.replace_credential',
      grantRef: oauthGrant.grantRef,
      expectedGrantRevision: args.expectedGrantRevision,
      authorityMode: args.authorityMode,
      connectionTarget: {
        kind: 'replace_credential',
        principalRef: canonicalPrincipalRef,
        replacementMode: args.connectionTarget.replacementMode,
      },
      resolvedConnectionTarget: {
        kind: 'replace_credential',
        principalRef: canonicalPrincipalRef,
        replacementMode: args.connectionTarget.replacementMode,
      },
      selectedScopes,
      issuanceMaterial,
      predecessor,
      target: {
        targetType: 'agent',
        targetRef: canonicalPrincipalRef,
        targetRevision: reservation.targetRevision,
      },
      targetRevision: reservation.targetRevision,
      consequenceSummary: 'Replace the selected Agent credential while preserving its canonical identity.',
    }
  }
  const [targetPrincipal, memberships] = await Promise.all([
    ctx.db.query('principals')
      .withIndex('by_principalRef', (query) => query.eq('principalRef', canonicalPrincipalRef))
      .unique(),
    ctx.db.query('memberships')
      .withIndex('by_memberPrincipalRef_and_lifecycle', (query) => query
        .eq('memberPrincipalRef', canonicalPrincipalRef).eq('lifecycle', 'active'))
      .take(2),
  ])
  if (targetPrincipal === null
    || targetPrincipal.kind !== 'agent'
    || targetPrincipal.lifecycle !== 'active'
    || targetPrincipal.revision !== args.expectedTargetRevision
    || memberships.length !== 1
    || memberships[0]?.accountRef !== activeAccountRef) return null
  const predecessor = await resolveReplacementPredecessor(ctx, canonicalPrincipalRef, activeAccountRef)
  if (predecessor === null) return null
  return {
    action: 'agent_access.replace_credential',
    grantRef: oauthGrant.grantRef,
    expectedGrantRevision: args.expectedGrantRevision,
    authorityMode: args.authorityMode,
    connectionTarget: {
      kind: 'replace_credential',
      principalRef: canonicalPrincipalRef,
      replacementMode: args.connectionTarget.replacementMode,
    },
    resolvedConnectionTarget: {
      kind: 'replace_credential',
      principalRef: canonicalPrincipalRef,
      replacementMode: args.connectionTarget.replacementMode,
    },
    selectedScopes,
    issuanceMaterial,
    predecessor,
    target: {
      targetType: 'agent',
      targetRef: canonicalPrincipalRef,
      targetRevision: targetPrincipal.revision,
    },
    targetRevision: targetPrincipal.revision,
    consequenceSummary: 'Replace the selected Agent credential while preserving its canonical identity.',
  }
}

function toolSelectionNarrows(
  requested: Pick<Doc<'agentAccessOAuthGrants'>['requestedAccess'], 'toolAccess' | 'toolRefs'>,
  approved: Readonly<{ toolAccess: 'all_admitted' | 'selected_tools'; toolRefs: readonly string[] }>,
): boolean {
  if (requested.toolAccess === 'all_admitted') return true
  const requestedRefs = new Set(requested.toolRefs)
  return approved.toolAccess === 'selected_tools'
    && approved.toolRefs.every((toolRef) => requestedRefs.has(toolRef))
}

async function allSelectedToolsAreCurrent(
  ctx: Pick<MutationCtx, 'db'>,
  toolRefs: readonly string[],
): Promise<boolean> {
  const rows = await Promise.all(toolRefs.map(async (toolRef) => await ctx.db
    .query('capabilityPublications')
    .withIndex('by_toolRef_and_disposition', (query) => (
      query.eq('toolRef', toolRef).eq('disposition', 'current')
    ))
    .unique()))
  return rows.every((row) => row !== null)
}

function sameToolSelection(
  left: Pick<Doc<'agentAccessOAuthGrants'>['approvedAccess'], 'toolAccess' | 'toolRefs'>,
  right: Readonly<{ toolAccess: 'all_admitted' | 'selected_tools'; toolRefs: readonly string[] }>,
): boolean {
  return left.toolAccess === right.toolAccess
    && left.toolRefs.length === right.toolRefs.length
    && left.toolRefs.every((toolRef, index) => toolRef === right.toolRefs[index])
}

async function resolveReplacementPredecessor(
  ctx: Pick<MutationCtx, 'db'>,
  canonicalPrincipalRef: string,
  activeAccountRef: string,
): Promise<AgentAccessPredecessorSnapshot | null> {
  const current = await ctx.db.query('agentAccessPrincipals')
    .withIndex('by_principalId', (query) => query.eq('principalId', canonicalPrincipalRef))
    .unique()
  if (current === null
    || current.ownerId !== activeAccountRef
    || current.lifecycle !== 'active') return null
  const binding = await ctx.db.query('externalIdentityBindings')
    .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
      .eq('providerNamespace', 'clerk/api-key').eq('providerIdentifier', current.credentialId))
    .unique()
  if (binding === null
    || binding.principalRef !== canonicalPrincipalRef
    || binding.lifecycle !== 'active'
    || binding.providerState.kind !== 'known'
    || binding.providerState.value !== 'active') return null
  const credential = await ctx.db.query('credentials')
    .withIndex('by_bindingRef_and_generation_and_lifecycle', (query) => query
      .eq('bindingRef', binding.bindingRef)
      .eq('generation', binding.credentialGeneration)
      .eq('lifecycle', 'active'))
    .unique()
  if (credential === null
    || credential.principalRef !== canonicalPrincipalRef
    || credential.type !== 'api_key'
    || credential.generation !== binding.credentialGeneration) return null
  const grants = await ctx.db.query('agentAccessGrants')
    .withIndex('by_credentialId_and_environment_and_generation', (query) => query
      .eq('credentialId', current.credentialId)
      .eq('environment', current.environment)
      .eq('generation', current.grantGeneration))
    .take(2)
  const currentGrants = grants.flatMap((candidate) => {
    let normalizedCandidate: ReturnType<typeof normalizeStoredAgentAccessGrant>
    try {
      normalizedCandidate = normalizeStoredAgentAccessGrant(candidate)
    } catch {
      return []
    }
    return candidate.principalId === canonicalPrincipalRef
      && candidate.ownerId === activeAccountRef
      && candidate.applicationRef === current.applicationRef
      && candidate.environment === current.environment
      && normalizedCandidate.lifecycle === 'active'
      && normalizedCandidate.generation === current.grantGeneration
      && normalizedCandidate.spendingPolicyDigest === current.spendingPolicyDigest
      ? [{ candidate, normalized: normalizedCandidate }]
      : []
  })
  if (currentGrants.length !== 1) return null
  const currentGrant = currentGrants[0]
  if (currentGrant === undefined) return null
  return {
    credentialId: current.credentialId,
    applicationRef: current.applicationRef,
    environment: current.environment,
    grantRef: currentGrant.candidate.grantRef,
    grantGeneration: currentGrant.normalized.generation,
    spendingPolicyDigest: currentGrant.normalized.spendingPolicyDigest,
    bindingRef: binding.bindingRef,
    bindingRevision: binding.revision,
    bindingCredentialGeneration: binding.credentialGeneration,
    credentialRef: credential.credentialRef,
    credentialRevision: credential.revision,
    credentialGeneration: credential.generation,
  }
}

async function revokeCompromisedPredecessor(
  ctx: MutationCtx,
  snapshot: AgentAccessPredecessorSnapshot,
  owner: Awaited<ReturnType<typeof resolveInteractiveAuthorityContext>>,
  now: number,
  correlationRef: string,
): Promise<boolean> {
  const [credential, binding, grant] = await Promise.all([
    ctx.db.query('credentials')
      .withIndex('by_credentialRef', (query) => query.eq('credentialRef', snapshot.credentialRef))
      .unique(),
    ctx.db.query('externalIdentityBindings')
      .withIndex('by_bindingRef', (query) => query.eq('bindingRef', snapshot.bindingRef))
      .unique(),
    ctx.db.query('agentAccessGrants')
      .withIndex('by_grantRef', (query) => query.eq('grantRef', snapshot.grantRef))
      .unique(),
  ])
  let normalizedGrant: ReturnType<typeof normalizeStoredAgentAccessGrant> | undefined
  if (grant !== null) {
    try {
      normalizedGrant = normalizeStoredAgentAccessGrant(grant)
    } catch {
      normalizedGrant = undefined
    }
  }
  if (credential === null || binding === null || grant === null
    || normalizedGrant === undefined
    || credential.lifecycle !== 'active'
    || credential.revision !== snapshot.credentialRevision
    || credential.generation !== snapshot.credentialGeneration
    || binding.lifecycle !== 'active'
    || binding.revision !== snapshot.bindingRevision
    || binding.credentialGeneration !== snapshot.bindingCredentialGeneration
    || binding.providerIdentifier !== snapshot.credentialId
    || normalizedGrant.lifecycle !== 'active'
    || normalizedGrant.generation !== snapshot.grantGeneration
    || normalizedGrant.spendingPolicyDigest !== snapshot.spendingPolicyDigest
    || credential.principalRef !== grant.principalId
    || binding.principalRef !== grant.principalId) return false
  await revokeReplacementMaterial(
    ctx,
    credential,
    binding,
    grant,
    owner,
    now,
    'suspected_compromise',
    correlationRef,
  )
  await invalidateOAuthRefreshFamilies(
    ctx,
    { credentialRef: credential.credentialRef },
    'suspected_compromise',
    now,
  )
  return true
}

async function currentOwnerAuthority(
  ctx: Pick<MutationCtx, 'db'>,
  owner: Awaited<ReturnType<typeof resolveInteractiveAuthorityContext>>,
) {
  if (owner.provenance.accessKind !== 'ownership'
    || owner.provenance.accessRef !== owner.provenance.currentOwnershipRef) return null
  const row = await ctx.db.query('accountOwnerships')
    .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', owner.provenance.currentOwnershipRef))
    .unique()
  return row !== null
    && row.lifecycle === 'active'
    && row.accountRef === owner.accountRef
    && row.ownerPrincipalRef === owner.principalRef
    && row.revision === owner.revision.currentOwnership
    ? row
    : null
}

async function agentAccessConsequenceAdmission(input: Readonly<{
  owner: Awaited<ReturnType<typeof resolveInteractiveAuthorityContext>>
  ownership: Doc<'accountOwnerships'>
  consent: ConsentCommand
  correlationRef: string
  now: number
}>): Promise<AuthorityConsequenceAdmission> {
  const boundary = new ConsequenceAuthorityBoundary({
    admitConsequence: async () => {
      throw new Error('agent_access_owner_delegation_unreachable')
    },
  })
  return await boundary.forSurface('convex', {
    resolveCanonicalBinding: async () => ({
      principalClass: 'interactive',
      actorPrincipalRef: input.owner.principalRef,
      activeAccountRef: input.owner.accountRef,
      authoritySource: {
        kind: 'account_ownership',
        ownershipRef: input.owner.provenance.currentOwnershipRef,
        ownershipRevision: input.ownership.revision,
        accountRevision: input.owner.revision.account,
        admittedAt: input.now,
        expiresAt: input.now + 1,
      },
    }),
  }).withCurrentAuthority({
    requiredScopes: input.consent.selectedScopes,
    resourceRefs: ['*'],
    budgetAmount: 1,
    correlationRef: input.correlationRef,
    idempotencyRef: input.correlationRef,
    consequence: {
      action: input.consent.action,
      target: input.consent.target,
      consequenceSummary: input.consent.consequenceSummary,
      statusReadbackRef: `agent-access/oauth/${input.consent.grantRef}`,
      command: {
        version: 'ae.agent-access-consent:v1',
        grantRef: input.consent.grantRef,
        expectedGrantRevision: input.consent.expectedGrantRevision,
        authorityMode: input.consent.authorityMode,
        target: input.consent.target,
        connectionTarget: input.consent.connectionTarget,
        selectedScopes: input.consent.selectedScopes,
        issuanceMaterial: input.consent.issuanceMaterial,
        ...(input.consent.predecessor === undefined ? {} : {
          predecessor: input.consent.predecessor,
        }),
      },
    },
  }, async (admission) => admission)
}

function reservationMatches(
  oauthGrant: Doc<'agentAccessOAuthGrants'>,
  admission: AuthorityConsequenceAdmission,
  reverificationId: string,
  consent: ConsentCommand,
  ownerPrincipalRevision: number,
): boolean {
  const reservation = oauthGrant.consequenceReservation
  return (oauthGrant.status === 'issuing' || isCompletedConsentGrant(oauthGrant.status))
    && reservation !== undefined
    && admission.descriptor !== undefined
    && admission.consequenceAction === reservation.action
    && reservation.commandDigest === admission.descriptor.commandDigest
    && reservation.reverificationId === reverificationId
    && reservation.targetRevision === consent.targetRevision
    && reservation.actorPrincipalRef === admission.actorPrincipalRef
    && reservation.ownerPrincipalRevision === ownerPrincipalRevision
    && reservation.activeAccountRef === admission.activeAccountRef
    && reservation.accountRevision === admission.accountRevision
    && admission.authoritySource.kind === 'account_ownership'
    && reservation.authoritySource.ownershipRef === admission.authoritySource.ownershipRef
    && reservation.authoritySource.ownershipRevision === admission.authoritySource.ownershipRevision
    && samePredecessorSnapshot(reservation.predecessor, consent.predecessor)
    && reservation.correlationRef === admission.correlationRef
    && reservation.idempotencyRef === admission.idempotencyRef
}

function isCompletedConsentGrant(status: Doc<'agentAccessOAuthGrants'>['status']): boolean {
  return status === 'approved' || status === 'delivery_claimed' || status === 'consumed'
}

function samePredecessorSnapshot(
  left: AgentAccessPredecessorSnapshot | undefined,
  right: AgentAccessPredecessorSnapshot | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right
  return left.credentialId === right.credentialId
    && left.applicationRef === right.applicationRef
    && left.environment === right.environment
    && left.grantRef === right.grantRef
    && left.grantGeneration === right.grantGeneration
    && left.spendingPolicyDigest === right.spendingPolicyDigest
    && left.bindingRef === right.bindingRef
    && left.bindingRevision === right.bindingRevision
    && left.bindingCredentialGeneration === right.bindingCredentialGeneration
    && left.credentialRef === right.credentialRef
    && left.credentialRevision === right.credentialRevision
    && left.credentialGeneration === right.credentialGeneration
}

function reservationSuccess(
  kind: 'reserved' | 'replayed',
  oauthGrant: Doc<'agentAccessOAuthGrants'>,
  admission: AuthorityConsequenceAdmission,
) {
  if (admission.descriptor === undefined) throw new Error('agent_access_consequence_descriptor_missing')
  return {
    kind,
    grantRef: oauthGrant.grantRef,
    grantRevision: oauthGrant.revision,
    commandDigest: admission.descriptor.commandDigest,
    correlationRef: admission.correlationRef,
  }
}

async function persistProofConsumedAudit(
  ctx: Pick<MutationCtx, 'db'>,
  input: Readonly<{
    admission: AuthorityConsequenceAdmission
    action: ConsentCommand['action']
    proof: StrictConsequenceProof
    authorityGeneration: number
    grantRef: string
    now: number
  }>,
): Promise<void> {
  const descriptor = input.admission.descriptor
  if (descriptor === undefined) throw new Error('agent_access_consequence_descriptor_missing')
  const proofEvidenceRef = canonicalDigest({
    version: 'ae.consequence-proof-evidence:v1',
    reverificationId: input.proof.reverificationId,
  })
  const eventId = `audit:consequence.proof_consumed:${proofEvidenceRef.slice('sha256:'.length)}`
  const audit = createPackage3AuditEvent({
    eventId: brandNonEmpty(eventId, 'AuditEventId'),
    eventType: 'consequence.proof_consumed',
    actorKind: 'owner',
    actorRef: input.admission.actorPrincipalRef,
    activeAccountRef: input.admission.activeAccountRef,
    sourceSystem: 'ae_recorded',
    observedAt: input.now,
    authorityGeneration: input.authorityGeneration,
    targetType: 'consequence_command',
    targetRef: input.grantRef,
    idempotencyKey: brandNonEmpty(input.admission.idempotencyRef, 'OperationKey'),
    correlationId: brandNonEmpty(input.admission.correlationRef, 'CorrelationId'),
    beforeState: 'available',
    outcome: 'consumed',
    evidenceRefs: [`proof-use:${proofEvidenceRef}`],
    redactedPayload: {
      action: input.action,
      targetType: descriptor.target.targetType,
      targetRef: descriptor.target.targetRef,
      targetRevision: descriptor.target.targetRevision,
      proofPreset: 'strict',
      firstFactorAgeMinutes: input.proof.factorEvidence.firstFactorAgeMinutes,
      secondFactorAgeMinutes: input.proof.factorEvidence.secondFactorAgeMinutes,
    },
    commandDigest: brandNonEmpty(descriptor.commandDigest, 'SourceHash'),
    createdAt: input.now,
  })
  if (!audit.valid) throw new Error(`agent_access_consequence_audit_invalid:${audit.reason}`)
  await persistAuditEvent(ctx.db, audit.event)
}

function consentReservationRef(grantRef: string, expectedRevision: number): string {
  return `oauth:grant:${grantRef}:reserve:${expectedRevision}`
}

function validGrantRef(value: string): boolean {
  return /^(?:device|authorization):[A-Za-z0-9_-]{1,128}$/u.test(value)
}

function positiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1
}

async function assertGrantHashesAvailable(
  db: OAuthDatabaseReader,
  candidate: Pick<OAuthGrantMaterial, 'deviceCodeHash' | 'userCodeHash' | 'authorizationCodeHash'>,
  allowedId: Doc<'agentAccessOAuthGrants'>['_id'] | undefined,
): Promise<void> {
  if (candidate.deviceCodeHash !== undefined) {
    await assertGrantHashAvailable(db, 'device', candidate.deviceCodeHash, allowedId)
  }
  if (candidate.userCodeHash !== undefined) {
    await assertGrantHashAvailable(db, 'user', candidate.userCodeHash, allowedId)
  }
  if (candidate.authorizationCodeHash !== undefined) {
    await assertGrantHashAvailable(db, 'authorization', candidate.authorizationCodeHash, allowedId)
  }
}

async function assertGrantHashAvailable(
  db: OAuthDatabaseReader,
  kind: 'device' | 'user' | 'authorization',
  hash: string,
  allowedId: Doc<'agentAccessOAuthGrants'>['_id'] | undefined,
): Promise<void> {
  const existing = kind === 'device'
    ? await db.query('agentAccessOAuthGrants')
      .withIndex('by_deviceCodeHash', (query) => query.eq('deviceCodeHash', hash))
      .unique()
    : kind === 'user'
      ? await db.query('agentAccessOAuthGrants')
        .withIndex('by_userCodeHash', (query) => query.eq('userCodeHash', hash))
        .unique()
      : await db.query('agentAccessOAuthGrants')
        .withIndex('by_authorizationCodeHash', (query) => query.eq('authorizationCodeHash', hash))
        .unique()
  if (existing !== null && existing._id !== allowedId) {
    throw new Error('agent_access_oauth_grant_conflict')
  }
}

function sameGrantMaterial(left: OAuthGrantMaterial, right: OAuthGrantMaterial): boolean {
  return left.grantRef === right.grantRef
    && left.revision === right.revision
    && left.flow === right.flow
    && left.clientId === right.clientId
    && left.redirectUri === right.redirectUri
    && sameStringArray(left.requestedScopes, right.requestedScopes)
    && left.offlineAccess === right.offlineAccess
    && sameRequestedAccess(left.requestedAccess, right.requestedAccess)
    && sameRequestedAccess(left.approvedAccess, right.approvedAccess)
    && left.codeChallenge === right.codeChallenge
    && left.codeChallengeMethod === right.codeChallengeMethod
    && left.deviceCodeHash === right.deviceCodeHash
    && left.userCodeHash === right.userCodeHash
    && left.authorizationCodeHash === right.authorizationCodeHash
    && left.status === right.status
    && left.ownerId === right.ownerId
    && left.keyId === right.keyId
    && left.createdAt === right.createdAt
    && left.expiresAt === right.expiresAt
    && left.approvedAt === right.approvedAt
    && left.issuanceKey === right.issuanceKey
    && left.consumedAt === right.consumedAt
    && left.nextPollAt === right.nextPollAt
    && left.deliveryClaimToken === right.deliveryClaimToken
    && left.deliveryCredentialHash === right.deliveryCredentialHash
    && left.deliveryReplayUntil === right.deliveryReplayUntil
    && left.displayName === right.displayName
    && left.denialReason === right.denialReason
    && JSON.stringify(left.connectionTarget) === JSON.stringify(right.connectionTarget)
    && JSON.stringify(left.replacement) === JSON.stringify(right.replacement)
    && left.consequenceReservation === undefined
    && right.consequenceReservation === undefined
    && left.issuanceStartedAt === right.issuanceStartedAt
}

function sameClientMaterial(left: OAuthClientMaterial, right: OAuthClientMaterial): boolean {
  return left.clientId === right.clientId
    && left.clientName === right.clientName
    && sameStringArray(left.redirectUris, right.redirectUris)
    && sameStringArray(left.grantTypes, right.grantTypes)
    && left.tokenEndpointAuthMethod === right.tokenEndpointAuthMethod
    && left.createdAt === right.createdAt
    && left.lastUsedAt === right.lastUsedAt
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

type OAuthRequestedAccessMaterial = OAuthGrantMaterial['requestedAccess']

function sameRequestedAccess(
  left: OAuthRequestedAccessMaterial,
  right: OAuthRequestedAccessMaterial,
): boolean {
  const sameAmount = (
    leftAmount: OAuthRequestedAccessMaterial['maximumSpendPerCall'],
    rightAmount: OAuthRequestedAccessMaterial['maximumSpendPerCall'],
  ): boolean => leftAmount === undefined || rightAmount === undefined
    ? leftAmount === rightAmount
    : leftAmount.currency === rightAmount.currency
      && leftAmount.units === rightAmount.units
      && leftAmount.exponent === rightAmount.exponent
  return left.environment === right.environment
    && left.toolAccess === right.toolAccess
    && sameStringArray(left.toolRefs, right.toolRefs)
    && sameAmount(left.maximumSpendPerCall, right.maximumSpendPerCall)
    && sameAmount(left.maximumDailySpend, right.maximumDailySpend)
    && sameAmount(left.maximumMonthlySpend, right.maximumMonthlySpend)
    && left.maximumConcurrentCalls === right.maximumConcurrentCalls
    && left.maximumCallsPerMinute === right.maximumCallsPerMinute
    && left.maximumCallsPerHour === right.maximumCallsPerHour
    && left.expiresInSeconds === right.expiresInSeconds
}

type OAuthGrantPatchMaterial = Partial<Omit<OAuthGrantMaterial, 'revision'>>

function grantPatchDocument(patch: OAuthGrantPatchMaterial): OAuthGrantPatchMaterial {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as OAuthGrantPatchMaterial
}

function grantFromDocument(row: Doc<'agentAccessOAuthGrants'>) {
  const { _id: _ignoredId, _creationTime: _ignoredCreationTime, ...value } = row
  return value
}

function clientFromDocument(row: Doc<'agentAccessOAuthClients'>) {
  const { _id: _ignoredId, _creationTime: _ignoredCreationTime, ...value } = row
  return value
}

async function requireOAuthSourceWrite(
  ctx: { db: unknown },
  args: SourceWriteArgs & { operationKey: string; correlationId: string },
): Promise<void> {
  const admitted = await requireSourceWrite(ctx, args, OAUTH_SOURCE_WRITE_SCOPE)
  if (admitted.kind === 'rejected') {
    throw new Error(`agent_access_oauth_source_write_rejected:${admitted.reason}`)
  }
}

async function requireOAuthSourceRead(
  args: SourceWriteArgs & { operationKey: string; correlationId: string },
): Promise<void> {
  const verification = await requireSourceRead(args, OAUTH_SOURCE_WRITE_SCOPE)
  if (verification.kind === 'rejected') {
    throw new ConvexError({ code: 'oauth_source_read_rejected', reason: verification.reason })
  }
}
