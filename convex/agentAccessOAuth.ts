import { ConvexError, v } from 'convex/values'
import type { GenericDatabaseReader } from 'convex/server'
import { brandNonEmpty } from '../src/modules/common/ids'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import {
  ConsequenceAuthorityBoundary,
  type AuthorityConsequenceAdmission,
} from '../src/modules/authority/context/public'
import { principalRef } from '../src/modules/principal-account/public'
import {
  AGENT_ACCESS_AUTHORITY_MODE_VALUES,
  agentAuthorityModeAllows,
  type AgentAccessAuthorityMode,
} from '../src/modules/agent-access/contract'
import {
  normalizeRequestedScopes,
  requestedScopesForMode,
} from '../src/modules/agent-access/oauth-state'
import { agentAccessConsentReservationValue } from '../src/modules/agent-access/public'
import { createPackage3AuditEvent } from '../src/modules/observability/public'
import { internal } from './_generated/api'
import { internalMutation, mutation, query, type MutationCtx } from './_generated/server'
import { resolveInteractiveAuthorityContext } from './interactiveAuthority'
import { persistAuditEvent } from './securityShared'
import { assertAuthorityCredentialChangeAdmission } from './lib/rateLimit'
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
  operationAccess: v.union(v.literal('all_admitted'), v.literal('selected_operations')),
  operationRefs: v.array(v.string()),
  maximumSpendPerInvocation: v.optional(requestedAccessAmount),
  maximumDailySpend: v.optional(requestedAccessAmount),
  maximumMonthlySpend: v.optional(requestedAccessAmount),
  maximumConcurrentInvocations: v.optional(v.number()),
  maximumCallsPerMinute: v.optional(v.number()),
  maximumCallsPerHour: v.optional(v.number()),
  expiresInSeconds: v.number(),
})
const connectionTarget = v.union(
  v.object({ kind: v.literal('new_agent'), displayName: v.string() }),
  v.object({ kind: v.literal('replace_credential'), principalRef: v.string() }),
)
const consentConnectionTarget = v.union(
  v.object({ kind: v.literal('new_agent') }),
  v.object({ kind: v.literal('replace_credential'), principalRef: v.string() }),
)
const replacement = v.object({
  principalRef: v.string(), generation: v.number(), successorCredentialRef: v.string(),
  predecessorCredentialRef: v.string(), predecessorKeyId: v.string(), successorGrantRef: v.string(),
})
const authorityMode = v.union(
  v.literal('inspect_only'),
  v.literal('approve_each'),
  v.literal('bounded_mandate'),
  v.literal('full_yolo'),
)
const clerkProofEvidence = v.object({
  reverificationId: v.string(),
  firstFactorAgeMinutes: v.number(),
  secondFactorAgeMinutes: v.number(),
})
const grant = v.object({
  grantRef: v.string(), revision: v.number(), flow, clientId: v.string(), redirectUri: v.optional(v.string()),
  requestedScopes: v.array(v.string()), requestedAccess, codeChallenge: v.optional(v.string()), codeChallengeMethod: v.optional(v.literal('S256')),
  deviceCodeHash: v.optional(v.string()), userCodeHash: v.optional(v.string()), authorizationCodeHash: v.optional(v.string()),
  status, ownerId: v.optional(v.string()), keyId: v.optional(v.string()), createdAt: v.number(), expiresAt: v.number(),
  approvedAt: v.optional(v.number()), issuanceKey: v.optional(v.string()), issuanceStartedAt: v.optional(v.number()), consumedAt: v.optional(v.number()), nextPollAt: v.optional(v.number()),
  deliveryClaimToken: v.optional(v.string()), deliveryCredentialHash: v.optional(v.string()), deliveryReplayUntil: v.optional(v.number()), displayName: v.string(), denialReason: v.optional(v.literal('access_denied')),
  connectionTarget: v.optional(connectionTarget), replacement: v.optional(replacement),
  consequenceReservation: v.optional(agentAccessConsentReservationValue),
})
const grantPatch = v.object({
  status: v.optional(status), redirectUri: v.optional(v.string()), requestedScopes: v.optional(v.array(v.string())),
  codeChallenge: v.optional(v.string()), codeChallengeMethod: v.optional(v.literal('S256')),
  deviceCodeHash: v.optional(v.string()), userCodeHash: v.optional(v.string()), authorizationCodeHash: v.optional(v.string()),
  ownerId: v.optional(v.string()), keyId: v.optional(v.string()), createdAt: v.optional(v.number()), expiresAt: v.optional(v.number()),
  approvedAt: v.optional(v.number()), issuanceKey: v.optional(v.string()), issuanceStartedAt: v.optional(v.number()), consumedAt: v.optional(v.number()), nextPollAt: v.optional(v.number()),
  deliveryClaimToken: v.optional(v.string()), deliveryCredentialHash: v.optional(v.string()), deliveryReplayUntil: v.optional(v.number()), displayName: v.optional(v.string()), denialReason: v.optional(v.literal('access_denied')),
  connectionTarget: v.optional(connectionTarget), replacement: v.optional(replacement),
})
const client = v.object({
  clientId: v.string(), clientName: v.string(), redirectUris: v.array(v.string()),
  grantTypes: v.array(v.union(v.literal('authorization_code'), v.literal('urn:ietf:params:oauth:grant-type:device_code'))),
  tokenEndpointAuthMethod: v.literal('none'), createdAt: v.number(), lastUsedAt: v.optional(v.number()),
})
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
    const rate = await assertAuthorityCredentialChangeAdmission(ctx, admission.activeAccountRef)
    if (!rate.ok) return { kind: 'rate_limited' as const, retryAfter: rate.retryAfter }

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
    await ctx.db.patch(current._id, {
      status: 'issuing',
      revision: current.revision + 1,
      ownerId: identity.subject,
      requestedScopes: [...consent.selectedScopes],
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

type OAuthGrantMaterial = Omit<Doc<'agentAccessOAuthGrants'>, '_id' | '_creationTime'>
type OAuthClientMaterial = Omit<Doc<'agentAccessOAuthClients'>, '_id' | '_creationTime'>
type OAuthDatabaseReader = GenericDatabaseReader<DataModel>

type ConsentReservationArgs = Readonly<{
  expectedGrantRevision: number
  expectedTargetRevision: number
  authorityMode: AgentAccessAuthorityMode
  connectionTarget:
    | Readonly<{ kind: 'new_agent' }>
    | Readonly<{ kind: 'replace_credential'; principalRef: string }>
}>

type ConsentCommand = Readonly<{
  action: 'agent_access.create' | 'agent_access.replace_credential'
  grantRef: string
  expectedGrantRevision: number
  authorityMode: AgentAccessAuthorityMode
  connectionTarget: ConsentReservationArgs['connectionTarget']
  resolvedConnectionTarget:
    | Readonly<{ kind: 'new_agent'; displayName: string }>
    | Readonly<{ kind: 'replace_credential'; principalRef: string }>
  selectedScopes: readonly string[]
  issuanceMaterial: Readonly<{
    clientId: string
    flow: Doc<'agentAccessOAuthGrants'>['flow']
    displayName: string
    requestedAccess: Doc<'agentAccessOAuthGrants'>['requestedAccess']
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
  policyDigest: string
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
    || (requested.profile === 'supplier' && args.authorityMode !== 'bounded_mandate')) return null
  const selectedScopes = requested.profile === 'supplier'
    ? requested.scopes
    : requestedScopesForMode(args.authorityMode)
  const issuanceMaterial = {
    clientId: oauthGrant.clientId,
    flow: oauthGrant.flow,
    displayName: oauthGrant.displayName,
    requestedAccess: oauthGrant.requestedAccess,
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
  if (isCompletedConsentGrant(oauthGrant.status)) {
    const reservation = oauthGrant.consequenceReservation
    if (reservation?.action !== 'agent_access.replace_credential'
      || reservation.predecessor === undefined
      || reservation.targetRevision !== args.expectedTargetRevision
      || oauthGrant.connectionTarget?.kind !== 'replace_credential'
      || oauthGrant.connectionTarget.principalRef !== canonicalPrincipalRef) return null
    return {
      action: 'agent_access.replace_credential',
      grantRef: oauthGrant.grantRef,
      expectedGrantRevision: args.expectedGrantRevision,
      authorityMode: args.authorityMode,
      connectionTarget: { kind: 'replace_credential', principalRef: canonicalPrincipalRef },
      resolvedConnectionTarget: { kind: 'replace_credential', principalRef: canonicalPrincipalRef },
      selectedScopes,
      issuanceMaterial,
      predecessor: reservation.predecessor,
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
    connectionTarget: { kind: 'replace_credential', principalRef: canonicalPrincipalRef },
    resolvedConnectionTarget: { kind: 'replace_credential', principalRef: canonicalPrincipalRef },
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
  const currentGrants = grants.filter((candidate) => candidate.principalId === canonicalPrincipalRef
    && candidate.ownerId === activeAccountRef
    && candidate.applicationRef === current.applicationRef
    && candidate.lifecycle === 'active'
    && candidate.policyDigest === current.policyDigest)
  if (currentGrants.length !== 1) return null
  const currentGrant = currentGrants[0]
  if (currentGrant === undefined) return null
  return {
    credentialId: current.credentialId,
    applicationRef: current.applicationRef,
    environment: current.environment,
    grantRef: currentGrant.grantRef,
    grantGeneration: currentGrant.generation,
    policyDigest: currentGrant.policyDigest,
    bindingRef: binding.bindingRef,
    bindingRevision: binding.revision,
    bindingCredentialGeneration: binding.credentialGeneration,
    credentialRef: credential.credentialRef,
    credentialRevision: credential.revision,
    credentialGeneration: credential.generation,
  }
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
    && left.policyDigest === right.policyDigest
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
    && sameRequestedAccess(left.requestedAccess, right.requestedAccess)
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
    leftAmount: OAuthRequestedAccessMaterial['maximumSpendPerInvocation'],
    rightAmount: OAuthRequestedAccessMaterial['maximumSpendPerInvocation'],
  ): boolean => leftAmount === undefined || rightAmount === undefined
    ? leftAmount === rightAmount
    : leftAmount.currency === rightAmount.currency
      && leftAmount.units === rightAmount.units
      && leftAmount.exponent === rightAmount.exponent
  return left.environment === right.environment
    && left.operationAccess === right.operationAccess
    && sameStringArray(left.operationRefs, right.operationRefs)
    && sameAmount(left.maximumSpendPerInvocation, right.maximumSpendPerInvocation)
    && sameAmount(left.maximumDailySpend, right.maximumDailySpend)
    && sameAmount(left.maximumMonthlySpend, right.maximumMonthlySpend)
    && left.maximumConcurrentInvocations === right.maximumConcurrentInvocations
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
