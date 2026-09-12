import { mutationGeneric, queryGeneric } from 'convex/server'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import { v, type Infer } from 'convex/values'

import type { MutationCtx } from './_generated/server'
import { verifySupplyAgentPrincipal, agentAccessPrincipalValue } from './agentAccessPrincipals'
import { resolveBusinessActor } from './authz'
import { ownsPublishedBusinessForOwnerId } from './capabilitySupply'
import { requireSourceWrite, sourceWriteArgs } from './sourceWriteAdmission'
import { validPublicHttpsEndpoint } from '../src/modules/capability-supply/convex'
import { canonicalDigest, isCanonicalDigest } from '../src/modules/common/canonical-digest'
import { admitInteractiveOwnerConsequence } from './lib/ownerConsequence'
import {
  DelegationService,
} from '../src/modules/authority/delegation/public'
import {
  createConvexDelegationContextPort,
  createConvexDelegationStore,
} from './lib/delegationPersistence'
import {
  createProviderConnection,
  createConnectionLifecycleAuditEvent,
  projectProviderConnectionOwner,
  reauthorizeProviderConnection,
} from '../src/modules/capability-supply/provider-connection'
import {
  ensureOwnerProviderConnectionGrant,
  resolveProviderConnectionProvenance,
} from './lib/providerConnections/authority'
import { invalidateActiveLeases, toDomain, toRow } from './lib/providerConnections/lifecycle'
import { ownerProjection, projectOwnerProjection } from './lib/providerConnections/owner'
import { persistAuditEvent } from './securityShared'
import { providerRouteabilityIsFrozen } from './lib/providerOffboardingFreeze'
import { normalizeSupplySourceSelectionDraft } from '../src/modules/capability-supply/source-selection-draft'
import {
  normalizeSupplySourceDescriptor,
  supplyIntegrationDraftRefs,
} from '../src/modules/capability-supply/integration-draft'

const ATTEMPT_TTL_MS = 10 * 60_000
const SOURCE_DRAFT_TTL_MS = 24 * 60 * 60_000

const authenticationValue = v.union(
  v.object({
    kind: v.literal('api_key'),
    location: v.union(v.literal('header'), v.literal('query')),
    name: v.string(),
  }),
  v.object({ kind: v.literal('http_bearer') }),
  v.object({ kind: v.literal('mcp_oauth') }),
)

const reserveAttemptFields = {
  businessId: v.id('businesses'),
  sourceKind: v.union(v.literal('http_credential'), v.literal('mcp_oauth')),
  sourceUrl: v.string(),
  sourceDescriptorJson: v.optional(v.string()),
  authentication: authenticationValue,
  environment: v.union(v.literal('sandbox'), v.literal('production')),
  inputDigest: v.string(),
  commandId: v.string(),
  operationKey: v.string(),
  correlationId: v.string(),
  candidateDraftRef: v.optional(v.string()),
  candidateSourceDigest: v.optional(v.string()),
} as const

const reserveAgentArgsValue = v.object({
  ...reserveAttemptFields,
  agentPrincipal: agentAccessPrincipalValue,
  ...sourceWriteArgs,
})

const reserveOwnerArgsValue = v.object({
  ...reserveAttemptFields,
  ...sourceWriteArgs,
})

const reservationResultValue = v.union(
  v.object({
    kind: v.union(v.literal('reserved'), v.literal('replayed')),
    attemptRef: v.string(),
    expiresAt: v.number(),
    draftRef: v.optional(v.string()),
    candidateDraftRef: v.optional(v.string()),
  }),
  v.object({
    kind: v.literal('refused'),
    code: v.union(
      v.literal('invalid_identity'),
      v.literal('invalid_environment'),
      v.literal('invalid_source'),
      v.literal('command_identity_conflict'),
    ),
  }),
)

const ownerAttemptValue = v.object({
  attemptRef: v.string(),
  businessRef: v.string(),
  sourceKind: v.union(v.literal('http_credential'), v.literal('mcp_oauth')),
  sourceUrl: v.string(),
  sourceOrigin: v.string(),
  authentication: authenticationValue,
  environment: v.union(v.literal('sandbox'), v.literal('production')),
  state: v.union(
    v.literal('pending'),
    v.literal('consumed'),
    v.literal('expired'),
    v.literal('cancelled'),
  ),
  connectionRef: v.optional(v.string()),
  expiresAt: v.number(),
  draftRef: v.optional(v.string()),
  candidateDraftRef: v.optional(v.string()),
})

const readOwnerResultValue = v.union(
  v.object({ kind: v.literal('available'), attempt: ownerAttemptValue }),
  v.object({ kind: v.literal('not_found') }),
)

const readOwnerSourceDraftResultValue = v.union(
  v.object({ kind: v.literal('not_found') }),
  v.object({
    kind: v.literal('available'),
    draft: v.object({
      draftRef: v.string(),
      businessRef: v.string(),
      sourceKind: v.union(v.literal('mcp'), v.literal('agent_plugin')),
      sourceDescriptorJson: v.string(),
      expectedSourceDigest: v.string(),
      sourceRevision: v.string(),
      sourceUrl: v.string(),
      remoteRef: v.optional(v.string()),
      environment: v.union(v.literal('sandbox'), v.literal('production')),
      state: v.union(
        v.literal('pending'),
        v.literal('connected'),
        v.literal('consumed'),
        v.literal('expired'),
        v.literal('cancelled'),
      ),
      connectionRef: v.optional(v.string()),
      expiresAt: v.number(),
    }),
  }),
)

const strictProofValue = v.object({
  reverificationId: v.string(),
  firstFactorAgeMinutes: v.number(),
  secondFactorAgeMinutes: v.number(),
})

const prepareOwnerArgsValue = v.object({
  attemptRef: v.string(),
  commandId: v.string(),
  operationKey: v.string(),
  correlationId: v.string(),
  proof: strictProofValue,
  ...sourceWriteArgs,
})
const cancelOwnerResultValue = v.union(
  v.object({ kind: v.literal('cancelled'), state: v.literal('cancelled') }),
  v.object({ kind: v.literal('unchanged'), state: v.union(v.literal('cancelled'), v.literal('consumed'), v.literal('expired')) }),
  v.object({ kind: v.literal('refused'), code: v.literal('not_found') }),
)

const secretAuthorityValue = v.object({
  operation: v.union(v.literal('provision'), v.literal('rotate')),
  snapshotRef: v.string(),
  accountRef: v.string(),
  actorPrincipalRef: v.string(),
  grantRef: v.string(),
  grantGeneration: v.number(),
  correlationRef: v.string(),
  idempotencyRef: v.string(),
  occurredAt: v.number(),
})

const prepareOAuthOwnerResultValue = v.union(
  v.object({
    kind: v.literal('prepared'),
    attemptRef: v.string(),
    secretRef: v.string(),
    provisionAuthority: secretAuthorityValue,
    rotationAuthority: secretAuthorityValue,
  }),
  v.object({
    kind: v.literal('refused'),
    code: v.union(
      v.literal('not_found'),
      v.literal('attempt_expired'),
      v.literal('reauthentication_required'),
      v.literal('proof_stale'),
      v.literal('proof_replayed'),
      v.literal('command_changed'),
      v.literal('rate_limited'),
      v.literal('security_control_unavailable'),
      v.literal('authority_mismatch'),
      v.literal('connection_conflict'),
    ),
  }),
)

const bindOAuthOwnerResultValue = v.union(
  v.object({ kind: v.union(v.literal('bound'), v.literal('replayed')) }),
  v.object({
    kind: v.literal('refused'),
    code: v.union(
      v.literal('not_found'),
      v.literal('attempt_expired'),
      v.literal('secret_unavailable'),
      v.literal('connection_conflict'),
    ),
  }),
)

const oauthCallbackResultValue = v.union(
  v.object({
    kind: v.literal('available'),
    attempt: v.object({
      attemptRef: v.string(),
      sourceUrl: v.string(),
      environment: v.union(v.literal('sandbox'), v.literal('production')),
      secretRef: v.string(),
      activeGeneration: v.string(),
      pointerRevision: v.number(),
    }),
  }),
  v.object({ kind: v.literal('not_found') }),
)

const prepareOwnerResultValue = v.union(
  v.object({
    kind: v.literal('prepared'),
    attemptRef: v.string(),
    secretRef: v.string(),
    authority: secretAuthorityValue,
  }),
  v.object({
    kind: v.literal('refused'),
    code: v.union(
      v.literal('not_found'),
      v.literal('attempt_expired'),
      v.literal('reauthentication_required'),
      v.literal('proof_stale'),
      v.literal('proof_replayed'),
      v.literal('command_changed'),
      v.literal('rate_limited'),
      v.literal('security_control_unavailable'),
      v.literal('authority_mismatch'),
      v.literal('connection_conflict'),
    ),
  }),
)

const finalizeOwnerArgsValue = v.object({
  attemptRef: v.string(),
  secretRef: v.string(),
  provisionCommandId: v.string(),
  commandId: v.string(),
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
})

const finalizeOwnerResultValue = v.union(
  v.object({
    kind: v.union(v.literal('connected'), v.literal('replayed')),
    connection: ownerProjection,
  }),
  v.object({
    kind: v.literal('refused'),
    code: v.union(
      v.literal('not_found'),
      v.literal('attempt_expired'),
      v.literal('secret_unavailable'),
      v.literal('connection_conflict'),
    ),
  }),
)

function serializableOwnerProjection(
  connection: Parameters<typeof projectProviderConnectionOwner>[0],
  now: number,
) {
  return projectOwnerProjection(connection, now)
}

type ReserveAgentArgs = Infer<typeof reserveAgentArgsValue>
type ReserveOwnerArgs = Infer<typeof reserveOwnerArgsValue>
type ReserveAttemptArgs = Omit<ReserveAgentArgs, 'agentPrincipal'>

function attemptRef(commandId: string, owningAccountRef: string): string {
  return `pca_${canonicalDigest({
    format: 'provider-connection-attempt-ref:v1',
    owningAccountRef,
    commandId,
  }).slice('sha256:'.length, 'sha256:'.length + 40)}`
}

function sourceDraftRef(commandId: string, owningAccountRef: string): string {
  return `sds_${canonicalDigest({
    format: 'supply-source-draft-ref:v1',
    owningAccountRef,
    commandId,
  }).slice('sha256:'.length, 'sha256:'.length + 40)}`
}

function canonicalSource(value: string): URL | undefined {
  const parsed = validPublicHttpsEndpoint(value)
  if (parsed === undefined || parsed.hash !== '' || parsed.search !== '') return undefined
  return parsed
}

function validAuthentication(args: ReserveAttemptArgs): boolean {
  if (args.sourceKind === 'mcp_oauth') return args.authentication.kind === 'mcp_oauth'
  if (args.authentication.kind === 'mcp_oauth') return false
  if (args.authentication.kind === 'http_bearer') return true
  return args.authentication.name.trim().length > 0
    && args.authentication.name.length <= 200
    && !/[\r\n]/u.test(args.authentication.name)
}

async function reserveAgentHandler(ctx: MutationCtx, args: ReserveAgentArgs) {
  const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
  if (sourceWrite.kind === 'rejected') return { kind: 'refused' as const, code: 'invalid_identity' as const }
  const admission = await verifySupplyAgentPrincipal(ctx, args.agentPrincipal, true)
  if (admission.kind !== 'allowed'
    || !(await ownsPublishedBusinessForOwnerId(ctx, args.businessId, admission.ownerId))) {
    return { kind: 'refused' as const, code: 'invalid_identity' as const }
  }
  if (args.environment !== args.agentPrincipal.environment) {
    return { kind: 'refused' as const, code: 'invalid_environment' as const }
  }
  return await reserveAttempt(ctx, args, {
    owningAccountRef: admission.ownerId,
    installedByPrincipalRef: admission.principalId,
  })
}

async function reserveOwnerHandler(ctx: MutationCtx, args: ReserveOwnerArgs) {
  const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
  if (sourceWrite.kind === 'rejected') return { kind: 'refused' as const, code: 'invalid_identity' as const }
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner'
    || !(await ownsPublishedBusinessForOwnerId(ctx, args.businessId, actor.canonicalAccountRef))) {
    return { kind: 'refused' as const, code: 'invalid_identity' as const }
  }
  return await reserveAttempt(ctx, args, {
    owningAccountRef: actor.canonicalAccountRef,
    installedByPrincipalRef: actor.canonicalPrincipalRef,
  })
}

async function reserveAttempt(
  ctx: MutationCtx,
  args: ReserveAttemptArgs,
  actor: Readonly<{ owningAccountRef: string; installedByPrincipalRef: string }>,
) {
  if (await providerRouteabilityIsFrozen(ctx, args.businessId)) {
    return { kind: 'refused' as const, code: 'invalid_identity' as const }
  }
  const source = canonicalSource(args.sourceUrl)
  if (source === undefined || !validAuthentication(args) || !isCanonicalDigest(args.inputDigest)) {
    return { kind: 'refused' as const, code: 'invalid_source' as const }
  }

  // A retry must remain resumable even after the saved draft progresses to a
  // connected lifecycle. Check its original command identity before validating
  // the currently mutable draft record.
  const existing = await ctx.db.query('capabilityProviderConnectionAttempts')
    .withIndex('by_commandId', (query) => query.eq('commandId', args.commandId))
    .unique()
  if (existing !== null) {
    const matches = existing.inputDigest === args.inputDigest
      && existing.owningAccountRef === actor.owningAccountRef
      && existing.installedByPrincipalRef === actor.installedByPrincipalRef
      && existing.businessId === args.businessId
      && existing.sourceKind === args.sourceKind
      && existing.sourceUrl === source.href
      && canonicalDigest(existing.authentication) === canonicalDigest(args.authentication)
      && existing.environment === args.environment
      && existing.candidateDraftRef === args.candidateDraftRef
      && (args.candidateDraftRef === undefined || existing.expectedSourceDigest === args.candidateSourceDigest)
    return matches
      ? {
          kind: 'replayed' as const,
          attemptRef: existing.attemptRef,
          expiresAt: existing.expiresAt,
          ...(existing.draftRef === undefined ? {} : { draftRef: existing.draftRef }),
          ...(existing.candidateDraftRef === undefined ? {} : { candidateDraftRef: existing.candidateDraftRef }),
        }
      : { kind: 'refused' as const, code: 'command_identity_conflict' as const }
  }

  const selectedSource = args.sourceDescriptorJson === undefined || args.candidateDraftRef !== undefined
    ? undefined
    : normalizeSupplySourceSelectionDraft({
        sourceDescriptorJson: args.sourceDescriptorJson,
        sourceUrl: source.href,
      })
  if (selectedSource?.kind === 'refused'
    || (selectedSource !== undefined && args.sourceKind !== 'mcp_oauth')) {
    return { kind: 'refused' as const, code: 'invalid_source' as const }
  }

  if (args.candidateDraftRef !== undefined) {
    const refs = supplyIntegrationDraftRefs(String(args.businessId), args.candidateDraftRef)
    const path = await ctx.db.query('offeringAccessPaths')
      .withIndex('by_accessPathRef', (query) => query.eq('accessPathRef', refs.accessPathRef))
      .unique()
    const draft = path?.integrationDraft
    let draftSource: ReturnType<typeof normalizeSupplySourceDescriptor>
    try {
      draftSource = draft === undefined
        ? undefined
        : normalizeSupplySourceDescriptor(JSON.parse(draft.sourceDescriptorJson) as unknown)
    } catch (cause) {
      draftSource = degradeBackend(cause, undefined, { site: 'reserveAttempt', reason: 'invalid_response' })
    }
    if (args.sourceKind !== 'http_credential'
      || args.candidateSourceDigest === undefined
      || !isCanonicalDigest(args.candidateSourceDigest)
      || args.sourceDescriptorJson === undefined
      || path === null || path.businessId !== args.businessId || draft === undefined
      || draft.candidateRef !== args.candidateDraftRef
      || draft.sourceDigest !== args.candidateSourceDigest
      || draft.sourceDescriptorJson !== args.sourceDescriptorJson
      || draft.sourceKind !== 'openapi'
      || draft.connectionRef !== undefined
      || draftSource?.kind !== 'openapi'
      || canonicalSource(draftSource.definitionUrl)?.href !== source.href
      || draftSource.environment !== args.environment) {
      return { kind: 'refused' as const, code: 'invalid_source' as const }
    }
  }

  const now = Date.now()
  const expiresAt = now + ATTEMPT_TTL_MS
  const ref = attemptRef(args.commandId, actor.owningAccountRef)
  const draftRef = selectedSource?.kind === 'valid'
    ? sourceDraftRef(args.commandId, actor.owningAccountRef)
    : undefined
  if (selectedSource?.kind === 'valid' && draftRef !== undefined) {
    await ctx.db.insert('capabilitySupplySourceDrafts', {
      draftRef,
      owningAccountRef: actor.owningAccountRef,
      createdByPrincipalRef: actor.installedByPrincipalRef,
      businessId: args.businessId,
      commandId: args.commandId,
      ...selectedSource.draft,
      lifecycle: 'pending',
      createdAt: now,
      updatedAt: now,
      expiresAt: now + SOURCE_DRAFT_TTL_MS,
    })
  }
  await ctx.db.insert('capabilityProviderConnectionAttempts', {
    attemptRef: ref,
    commandId: args.commandId,
    inputDigest: args.inputDigest,
    owningAccountRef: actor.owningAccountRef,
    installedByPrincipalRef: actor.installedByPrincipalRef,
    businessId: args.businessId,
    sourceKind: args.sourceKind,
    sourceUrl: source.href,
    sourceOrigin: source.origin,
    authentication: args.authentication,
    environment: args.environment,
    lifecycle: 'pending',
    ...(draftRef === undefined || selectedSource?.kind !== 'valid' ? {} : {
      draftRef,
      expectedSourceDigest: selectedSource.draft.expectedSourceDigest,
    }),
    ...(args.candidateDraftRef === undefined ? {} : { candidateDraftRef: args.candidateDraftRef }),
    ...(args.candidateDraftRef === undefined || args.candidateSourceDigest === undefined
      ? {}
      : { expectedSourceDigest: args.candidateSourceDigest }),
    createdAt: now,
    updatedAt: now,
    expiresAt,
  })
  return {
    kind: 'reserved' as const,
    attemptRef: ref,
    expiresAt,
    ...(draftRef === undefined ? {} : { draftRef }),
    ...(args.candidateDraftRef === undefined ? {} : { candidateDraftRef: args.candidateDraftRef }),
  }
}

export const reserveAgent = mutationGeneric({
  args: reserveAgentArgsValue.fields,
  returns: reservationResultValue,
  handler: reserveAgentHandler,
})

export const reserveOwner = mutationGeneric({
  args: reserveOwnerArgsValue.fields,
  returns: reservationResultValue,
  handler: reserveOwnerHandler,
})

export const readOwner = queryGeneric({
  args: { attemptRef: v.string() },
  returns: readOwnerResultValue,
  handler: async (ctx, args) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return { kind: 'not_found' as const }
    const row = await ctx.db.query('capabilityProviderConnectionAttempts')
      .withIndex('by_attemptRef', (query) => query.eq('attemptRef', args.attemptRef))
      .unique()
    if (row === null || row.owningAccountRef !== actor.canonicalAccountRef) {
      return { kind: 'not_found' as const }
    }
    const state = row.lifecycle === 'pending' && row.expiresAt <= Date.now()
      ? 'expired' as const
      : row.lifecycle
    return {
      kind: 'available' as const,
      attempt: {
        attemptRef: row.attemptRef,
        businessRef: String(row.businessId),
        sourceKind: row.sourceKind,
        sourceUrl: row.sourceUrl,
        sourceOrigin: row.sourceOrigin,
        authentication: row.authentication,
        environment: row.environment,
        state,
        ...(row.connectionRef === undefined ? {} : { connectionRef: row.connectionRef }),
        expiresAt: row.expiresAt,
        ...(row.draftRef === undefined ? {} : { draftRef: row.draftRef }),
        ...(row.candidateDraftRef === undefined ? {} : { candidateDraftRef: row.candidateDraftRef }),
      },
    }
  },
})

export const cancelOwner = mutationGeneric({
  args: prepareOwnerArgsValue.fields,
  returns: cancelOwnerResultValue,
  handler: async (ctx, args) => {
    const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
    const actor = await resolveBusinessActor(ctx)
    if (sourceWrite.kind === 'rejected' || actor.kind !== 'authenticated_owner') return { kind: 'refused' as const, code: 'not_found' as const }
    const attempt = await ctx.db.query('capabilityProviderConnectionAttempts').withIndex('by_attemptRef', (query) => query.eq('attemptRef', args.attemptRef)).unique()
    if (attempt === null || attempt.owningAccountRef !== actor.canonicalAccountRef) return { kind: 'refused' as const, code: 'not_found' as const }
    const now = Date.now()
    if (attempt.lifecycle === 'pending' && attempt.expiresAt > now) {
      await ctx.db.patch(attempt._id, { lifecycle: 'cancelled', updatedAt: now })
      return { kind: 'cancelled' as const, state: 'cancelled' as const }
    }
    const state = attempt.lifecycle === 'pending' ? 'expired' as const : attempt.lifecycle
    if (attempt.lifecycle === 'pending') await ctx.db.patch(attempt._id, { lifecycle: 'expired', updatedAt: now })
    return state === 'cancelled' || state === 'consumed' || state === 'expired'
      ? { kind: 'unchanged' as const, state }
      : { kind: 'refused' as const, code: 'not_found' as const }
  },
})

export const readOwnerSourceDraft = queryGeneric({
  args: { draftRef: v.string() },
  returns: readOwnerSourceDraftResultValue,
  handler: async (ctx, args) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return { kind: 'not_found' as const }
    const row = await ctx.db.query('capabilitySupplySourceDrafts')
      .withIndex('by_draftRef', (query) => query.eq('draftRef', args.draftRef))
      .unique()
    if (row === null || row.owningAccountRef !== actor.canonicalAccountRef) {
      return { kind: 'not_found' as const }
    }
    const state = (row.lifecycle === 'pending' || row.lifecycle === 'connected')
      && row.expiresAt <= Date.now()
      ? 'expired' as const
      : row.lifecycle
    return {
      kind: 'available' as const,
      draft: {
        draftRef: row.draftRef,
        businessRef: String(row.businessId),
        sourceKind: row.sourceKind,
        sourceDescriptorJson: row.sourceDescriptorJson,
        expectedSourceDigest: row.expectedSourceDigest,
        sourceRevision: row.sourceRevision,
        sourceUrl: row.sourceUrl,
        ...(row.remoteRef === undefined ? {} : { remoteRef: row.remoteRef }),
        environment: row.environment,
        state,
        ...(row.connectionRef === undefined ? {} : { connectionRef: row.connectionRef }),
        expiresAt: row.expiresAt,
      },
    }
  },
})

export const prepareOwner = mutationGeneric({
  args: prepareOwnerArgsValue.fields,
  returns: prepareOwnerResultValue,
  handler: async (ctx, args) => {
    const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
    if (sourceWrite.kind === 'rejected') {
      return { kind: 'refused' as const, code: 'not_found' as const }
    }
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') {
      return { kind: 'refused' as const, code: 'not_found' as const }
    }
    const attempt = await ctx.db.query('capabilityProviderConnectionAttempts')
      .withIndex('by_attemptRef', (query) => query.eq('attemptRef', args.attemptRef))
      .unique()
    if (attempt === null
      || attempt.owningAccountRef !== actor.canonicalAccountRef
      || attempt.lifecycle !== 'pending') {
      return { kind: 'refused' as const, code: 'not_found' as const }
    }
    const now = Date.now()
    if (attempt.expiresAt <= now) {
      await ctx.db.patch(attempt._id, { lifecycle: 'expired', updatedAt: now })
      return { kind: 'refused' as const, code: 'attempt_expired' as const }
    }
    if (await providerRouteabilityIsFrozen(ctx, attempt.businessId)) {
      return { kind: 'refused' as const, code: 'connection_conflict' as const }
    }
    const secretRef = `sec_${canonicalDigest({
      format: 'provider-connection-secret-ref:v1',
      owningAccountRef: attempt.owningAccountRef,
      attemptRef: attempt.attemptRef,
    }).slice('sha256:'.length, 'sha256:'.length + 32)}`
    const admitted = await admitInteractiveOwnerConsequence(ctx, {
      actor,
      action: 'connection.connect',
      target: {
        targetType: 'provider_connection_attempt',
        targetRef: attempt.attemptRef,
        targetRevision: 1,
      },
      requiredScopes: ['secret:provision'],
      resourceRefs: [`secret:${secretRef}`],
      budgetAmount: 0,
      consequenceSummary: `Store one credential for ${attempt.sourceOrigin} and connect that exact Provider source.`,
      statusReadbackRef: `provider-connection-attempts/${attempt.attemptRef}`,
      command: {
        version: 'ae.provider-connection-secret-provision:v1',
        attemptRef: attempt.attemptRef,
        secretRef,
        sourceOrigin: attempt.sourceOrigin,
        authentication: attempt.authentication,
      },
      correlationRef: args.commandId,
      idempotencyRef: args.commandId,
      proof: args.proof,
      now,
    })
    if (admitted.kind === 'refused') return admitted

    const delegation = new DelegationService(
      createConvexDelegationStore(ctx),
      createConvexDelegationContextPort(ctx, actor.canonicalPrincipalRef),
      { now: () => now },
    )
    const grant = await delegation.issueRoot({
      context: {
        actorPrincipalRef: actor.canonicalPrincipalRef,
        activeAccountRef: actor.canonicalAccountRef,
        correlationRef: `secret-grant:${attempt.attemptRef}`,
        idempotencyRef: `secret-grant:${attempt.attemptRef}`,
      },
      subjectPrincipalRef: actor.canonicalPrincipalRef,
      scopes: ['secret:provision'],
      resourceRefs: [`secret:${secretRef}`],
      budgetLimit: 1,
      expiresAt: attempt.expiresAt,
    })
    const snapshot = await delegation.admitConsequence({
      grantRef: grant.grantRef,
      expectedGeneration: grant.generation,
      context: {
        actorPrincipalRef: actor.canonicalPrincipalRef,
        activeAccountRef: actor.canonicalAccountRef,
        correlationRef: args.commandId,
        idempotencyRef: args.commandId,
      },
      requiredScopes: ['secret:provision'],
      resourceRefs: [`secret:${secretRef}`],
      budgetAmount: 0,
    })
    return {
      kind: 'prepared' as const,
      attemptRef: attempt.attemptRef,
      secretRef,
      authority: {
        operation: 'provision' as const,
        snapshotRef: snapshot.snapshotRef,
        accountRef: snapshot.accountRef,
        actorPrincipalRef: snapshot.actorPrincipalRef,
        grantRef: snapshot.grantRef,
        grantGeneration: snapshot.generation,
        correlationRef: snapshot.correlationRef,
        idempotencyRef: snapshot.idempotencyRef,
        occurredAt: snapshot.admittedAt,
      },
    }
  },
})

export const prepareOAuthOwner = mutationGeneric({
  args: prepareOwnerArgsValue.fields,
  returns: prepareOAuthOwnerResultValue,
  handler: async (ctx, args) => {
    const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
    if (sourceWrite.kind === 'rejected') {
      return { kind: 'refused' as const, code: 'not_found' as const }
    }
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') {
      return { kind: 'refused' as const, code: 'not_found' as const }
    }
    const attempt = await ctx.db.query('capabilityProviderConnectionAttempts')
      .withIndex('by_attemptRef', (query) => query.eq('attemptRef', args.attemptRef))
      .unique()
    if (attempt === null
      || attempt.owningAccountRef !== actor.canonicalAccountRef
      || attempt.sourceKind !== 'mcp_oauth'
      || attempt.authentication.kind !== 'mcp_oauth'
      || attempt.lifecycle !== 'pending') {
      return { kind: 'refused' as const, code: 'not_found' as const }
    }
    const now = Date.now()
    if (attempt.expiresAt <= now) {
      await ctx.db.patch(attempt._id, { lifecycle: 'expired', updatedAt: now })
      return { kind: 'refused' as const, code: 'attempt_expired' as const }
    }
    const secretRef = providerConnectionSecretRef(attempt.owningAccountRef, attempt.attemptRef)
    const provisionIdempotencyRef = `${args.commandId}:oauth-state`
    const rotationIdempotencyRef = `${args.commandId}:oauth-tokens`
    const admitted = await admitInteractiveOwnerConsequence(ctx, {
      actor,
      action: 'connection.connect',
      target: {
        targetType: 'provider_connection_attempt',
        targetRef: attempt.attemptRef,
        targetRevision: 1,
      },
      requiredScopes: ['secret:provision', 'secret:rotate'],
      resourceRefs: [`secret:${secretRef}`],
      budgetAmount: 0,
      consequenceSummary: `Sign in to ${attempt.sourceOrigin} and connect that exact MCP source.`,
      statusReadbackRef: `provider-connection-attempts/${attempt.attemptRef}`,
      command: {
        version: 'ae.provider-connection-mcp-oauth:v1',
        attemptRef: attempt.attemptRef,
        secretRef,
        sourceOrigin: attempt.sourceOrigin,
      },
      correlationRef: args.commandId,
      idempotencyRef: args.commandId,
      proof: args.proof,
      now,
    })
    if (admitted.kind === 'refused') return admitted

    const delegation = new DelegationService(
      createConvexDelegationStore(ctx),
      createConvexDelegationContextPort(ctx, actor.canonicalPrincipalRef),
      { now: () => now },
    )
    const grant = await delegation.issueRoot({
      context: {
        actorPrincipalRef: actor.canonicalPrincipalRef,
        activeAccountRef: actor.canonicalAccountRef,
        correlationRef: `secret-grant:${attempt.attemptRef}:oauth`,
        idempotencyRef: `secret-grant:${attempt.attemptRef}:oauth`,
      },
      subjectPrincipalRef: actor.canonicalPrincipalRef,
      scopes: ['secret:provision', 'secret:rotate'],
      resourceRefs: [`secret:${secretRef}`],
      budgetLimit: 2,
      expiresAt: attempt.expiresAt,
    })
    const authority = async (
      operation: 'provision' | 'rotate',
      idempotencyRef: string,
    ) => {
      const snapshot = await delegation.admitConsequence({
        grantRef: grant.grantRef,
        expectedGeneration: grant.generation,
        context: {
          actorPrincipalRef: actor.canonicalPrincipalRef,
          activeAccountRef: actor.canonicalAccountRef,
          correlationRef: idempotencyRef,
          idempotencyRef,
        },
        requiredScopes: [`secret:${operation}`],
        resourceRefs: [`secret:${secretRef}`],
        budgetAmount: 0,
      })
      return {
        operation,
        snapshotRef: snapshot.snapshotRef,
        accountRef: snapshot.accountRef,
        actorPrincipalRef: snapshot.actorPrincipalRef,
        grantRef: snapshot.grantRef,
        grantGeneration: snapshot.generation,
        correlationRef: snapshot.correlationRef,
        idempotencyRef: snapshot.idempotencyRef,
        occurredAt: snapshot.admittedAt,
      }
    }
    return {
      kind: 'prepared' as const,
      attemptRef: attempt.attemptRef,
      secretRef,
      provisionAuthority: await authority('provision', provisionIdempotencyRef),
      rotationAuthority: await authority('rotate', rotationIdempotencyRef),
    }
  },
})

export const bindOAuthOwner = mutationGeneric({
  args: {
    attemptRef: v.string(),
    stateHash: v.string(),
    secretRef: v.string(),
    provisionCommandId: v.string(),
    commandId: v.string(),
    operationKey: v.string(),
    correlationId: v.string(),
    ...sourceWriteArgs,
  },
  returns: bindOAuthOwnerResultValue,
  handler: async (ctx, args) => {
    const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
    if (sourceWrite.kind === 'rejected') return { kind: 'refused' as const, code: 'not_found' as const }
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return { kind: 'refused' as const, code: 'not_found' as const }
    const attempt = await ctx.db.query('capabilityProviderConnectionAttempts')
      .withIndex('by_attemptRef', (query) => query.eq('attemptRef', args.attemptRef))
      .unique()
    if (attempt === null
      || attempt.owningAccountRef !== actor.canonicalAccountRef
      || attempt.sourceKind !== 'mcp_oauth'
      || attempt.lifecycle !== 'pending') {
      return { kind: 'refused' as const, code: 'not_found' as const }
    }
    const now = Date.now()
    if (attempt.expiresAt <= now) {
      await ctx.db.patch(attempt._id, { lifecycle: 'expired', updatedAt: now })
      return { kind: 'refused' as const, code: 'attempt_expired' as const }
    }
    if (!isCanonicalDigest(args.stateHash)
      || args.secretRef !== providerConnectionSecretRef(attempt.owningAccountRef, attempt.attemptRef)) {
      return { kind: 'refused' as const, code: 'connection_conflict' as const }
    }
    if (attempt.stateHash !== undefined || attempt.pkceSecretRef !== undefined) {
      return attempt.stateHash === args.stateHash && attempt.pkceSecretRef === args.secretRef
        ? { kind: 'replayed' as const }
        : { kind: 'refused' as const, code: 'connection_conflict' as const }
    }
    const pointer = await ctx.db.query('secretPointers')
      .withIndex('by_secretRef', (query) => query.eq('secretRef', args.secretRef))
      .unique()
    if (pointer === null
      || pointer.owningAccountRef !== actor.canonicalAccountRef
      || pointer.lastAction.operation !== 'provision'
      || pointer.lastAction.actorPrincipalRef !== actor.canonicalPrincipalRef
      || pointer.lastAction.idempotencyRef !== args.provisionCommandId) {
      return { kind: 'refused' as const, code: 'secret_unavailable' as const }
    }
    await ctx.db.patch(attempt._id, {
      stateHash: args.stateHash,
      pkceSecretRef: args.secretRef,
      credentialSecretRef: args.secretRef,
      updatedAt: now,
    })
    return { kind: 'bound' as const }
  },
})

export const readOAuthCallbackOwner = queryGeneric({
  args: {
    attemptRef: v.string(),
    stateHash: v.string(),
    observedAt: v.number(),
  },
  returns: oauthCallbackResultValue,
  handler: async (ctx, args) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner'
      || !Number.isSafeInteger(args.observedAt)
      || args.observedAt < 0
      || !isCanonicalDigest(args.stateHash)) return { kind: 'not_found' as const }
    const attempt = await ctx.db.query('capabilityProviderConnectionAttempts')
      .withIndex('by_attemptRef', (query) => query.eq('attemptRef', args.attemptRef))
      .unique()
    const pkceSecretRef = attempt?.pkceSecretRef
    if (attempt === null
      || attempt.owningAccountRef !== actor.canonicalAccountRef
      || attempt.sourceKind !== 'mcp_oauth'
      || attempt.lifecycle !== 'pending'
      || attempt.expiresAt <= args.observedAt
      || attempt.stateHash !== args.stateHash
      || pkceSecretRef === undefined) return { kind: 'not_found' as const }
    const pointer = await ctx.db.query('secretPointers')
      .withIndex('by_secretRef', (query) => query.eq('secretRef', pkceSecretRef))
      .unique()
    if (pointer === null || pointer.owningAccountRef !== actor.canonicalAccountRef) {
      return { kind: 'not_found' as const }
    }
    return {
      kind: 'available' as const,
      attempt: {
        attemptRef: attempt.attemptRef,
        sourceUrl: attempt.sourceUrl,
        environment: attempt.environment,
        secretRef: pointer.secretRef,
        activeGeneration: pointer.activeGeneration,
        pointerRevision: pointer.revision,
      },
    }
  },
})

export const finalizeOwner = mutationGeneric({
  args: finalizeOwnerArgsValue.fields,
  returns: finalizeOwnerResultValue,
  handler: async (ctx, args) => {
    const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
    if (sourceWrite.kind === 'rejected') {
      return { kind: 'refused' as const, code: 'not_found' as const }
    }
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') {
      return { kind: 'refused' as const, code: 'not_found' as const }
    }
    const attempt = await ctx.db.query('capabilityProviderConnectionAttempts')
      .withIndex('by_attemptRef', (query) => query.eq('attemptRef', args.attemptRef))
      .unique()
    if (attempt === null || attempt.owningAccountRef !== actor.canonicalAccountRef) {
      return { kind: 'refused' as const, code: 'not_found' as const }
    }
    const consumedConnectionRef = attempt.connectionRef
    if (attempt.lifecycle === 'consumed' && consumedConnectionRef !== undefined) {
      const replay = await ctx.db.query('capabilityProviderConnections')
        .withIndex('by_connectionRef', (query) => query.eq('connectionRef', consumedConnectionRef))
        .unique()
      return replay === null
        ? { kind: 'refused' as const, code: 'connection_conflict' as const }
        : {
            kind: 'replayed' as const,
            connection: serializableOwnerProjection(toDomain(replay), Date.now()),
          }
    }
    const now = Date.now()
    if (attempt.lifecycle !== 'pending') {
      return { kind: 'refused' as const, code: 'not_found' as const }
    }
    if (attempt.expiresAt <= now) {
      await ctx.db.patch(attempt._id, { lifecycle: 'expired', updatedAt: now })
      return { kind: 'refused' as const, code: 'attempt_expired' as const }
    }
    if (await providerRouteabilityIsFrozen(ctx, attempt.businessId)) {
      return { kind: 'refused' as const, code: 'connection_conflict' as const }
    }
    const expectedSecretRef = providerConnectionSecretRef(attempt.owningAccountRef, attempt.attemptRef)
    if (args.secretRef !== expectedSecretRef) {
      return { kind: 'refused' as const, code: 'secret_unavailable' as const }
    }
    const pointer = await ctx.db.query('secretPointers')
      .withIndex('by_secretRef', (query) => query.eq('secretRef', args.secretRef))
      .unique()
    if (pointer === null
      || pointer.owningAccountRef !== actor.canonicalAccountRef
      || (attempt.sourceKind === 'mcp_oauth'
        ? pointer.lastAction.operation !== 'rotate'
        : pointer.lastAction.operation !== 'provision')
      || pointer.lastAction.actorPrincipalRef !== actor.canonicalPrincipalRef
      || pointer.lastAction.idempotencyRef !== args.provisionCommandId) {
      return { kind: 'refused' as const, code: 'secret_unavailable' as const }
    }

    const adapterId = attempt.sourceKind === 'mcp_oauth' ? 'mcp-jsonrpc:v1' : 'http-json:v1'
    const connectionRef = `connection:${canonicalDigest({
      format: 'provider-source-connection:v1',
      businessRef: String(attempt.businessId),
      sourceKind: attempt.sourceKind,
      sourceOrigin: attempt.sourceOrigin,
      authentication: attempt.authentication,
    })}`
    const providerRef = `provider:${attempt.sourceKind}:${new URL(attempt.sourceOrigin).host}`
    const providerAccountRef = `${attempt.sourceKind}:${attempt.sourceOrigin}`
    const existing = await ctx.db.query('capabilityProviderConnections')
      .withIndex('by_connectionRef', (query) => query.eq('connectionRef', connectionRef))
      .unique()
    if (existing !== null && existing.businessId !== attempt.businessId) {
      return { kind: 'refused' as const, code: 'connection_conflict' as const }
    }
    const providerResourceRefs = [
      `connection-provider:capability-provider/${adapterId}`,
      `connection-provider:capability-provider/${adapterId}:${providerAccountRef}`,
      `secret:${args.secretRef}`,
    ]
    const grant = await ensureOwnerProviderConnectionGrant(ctx, {
      principalRef: actor.canonicalPrincipalRef,
      accountRef: actor.canonicalAccountRef,
    }, { connectionRef, providerResourceRefs })
    const provenance = await resolveProviderConnectionProvenance(
      ctx,
      { principalRef: actor.canonicalPrincipalRef, accountRef: actor.canonicalAccountRef },
      existing === null ? 'install' : 'refresh',
      providerResourceRefs,
      args.secretRef,
      grant.grantRef,
    )
    if (provenance === null) {
      return { kind: 'refused' as const, code: 'connection_conflict' as const }
    }
    const authority = {
      commandId: args.commandId,
      connectionRef,
      ...provenance,
      businessId: String(attempt.businessId),
      providerRef,
      providerAccountRef,
      adapterId,
      credentialRef: args.secretRef,
      sourceOrigin: attempt.sourceOrigin,
      sourceEnvironment: attempt.environment,
      sourceAuthentication: attempt.authentication,
      requestedScopes: [] as string[],
      grantedScopes: [] as string[],
      requestedResources: [attempt.sourceUrl],
      grantedResources: [attempt.sourceUrl],
      evidenceRefs: [`provider-connection-attempt:${attempt.attemptRef}`],
    }
    const result = existing === null
      ? createProviderConnection(authority, now)
      : reauthorizeProviderConnection(toDomain(existing), {
          ...authority,
          expectedAuthorityGeneration: existing.authorityGeneration,
          expectedAuthorityDigest: existing.authorityDigest,
        }, now)
    if (result.kind === 'refused') {
      return { kind: 'refused' as const, code: 'connection_conflict' as const }
    }
    if (result.kind === 'applied') {
      if (existing === null) {
        await ctx.db.insert('capabilityProviderConnections', toRow(result.connection, args.commandId, result.commandDigest))
      } else {
        await ctx.db.replace(existing._id, toRow(result.connection, args.commandId, result.commandDigest))
        await invalidateActiveLeases(ctx, connectionRef, 'generation_changed', now, args.commandId)
      }
      await persistAuditEvent(ctx.db, createConnectionLifecycleAuditEvent({
        eventType: existing === null ? 'connection.connected' : 'connection.reauthorized',
        actorPrincipalRef: actor.canonicalPrincipalRef,
        activeAccountRef: actor.canonicalAccountRef,
        connectionRef,
        authorityGeneration: result.connection.authorityGeneration,
        commandId: args.commandId,
        correlationRef: args.correlationId,
        commandDigest: result.commandDigest,
        adapterId,
        beforeState: existing === null ? 'missing' : toDomain(existing).lifecycle,
        outcome: existing === null ? 'connected' : 'reauthorized',
        resourceUrl: attempt.sourceUrl,
        occurredAt: now,
      }))
    }
    await ctx.db.patch(attempt._id, {
      lifecycle: 'consumed',
      credentialSecretRef: args.secretRef,
      connectionRef,
      consumedAt: now,
      updatedAt: now,
    })
    const draftRef = attempt.draftRef
    if (draftRef !== undefined) {
      const draft = await ctx.db.query('capabilitySupplySourceDrafts')
        .withIndex('by_draftRef', (query) => query.eq('draftRef', draftRef))
        .unique()
      if (draft !== null && draft.owningAccountRef === actor.canonicalAccountRef) {
        await ctx.db.patch(draft._id, {
          lifecycle: 'connected',
          connectionRef,
          updatedAt: now,
        })
      }
    }
    return {
      kind: result.kind === 'duplicate' ? 'replayed' as const : 'connected' as const,
      connection: serializableOwnerProjection(result.connection, now),
    }
  },
})

function providerConnectionSecretRef(owningAccountRef: string, attemptRef: string): string {
  return `sec_${canonicalDigest({
    format: 'provider-connection-secret-ref:v1',
    owningAccountRef,
    attemptRef,
  }).slice('sha256:'.length, 'sha256:'.length + 32)}`
}
