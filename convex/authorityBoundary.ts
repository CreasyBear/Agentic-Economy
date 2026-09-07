import { v } from 'convex/values'

import { mutation, type MutationCtx } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import {
  requireSourceWrite,
  sourceWriteAdmissionArg,
  sourceWriteRequestArg,
} from './sourceWriteAdmission'
import { accountRef, principalRef } from '../src/modules/principal-account/public'
import { credentialRef } from '../src/modules/principal-account/external-identity/public'
import {
  DELEGATION_MAX_ANCESTRY_GRANTS,
  DelegationError,
  DelegationService,
  delegationGrantRef,
} from '../src/modules/authority/delegation/public'
import {
  AGENT_ACCESS_ENVIRONMENT_VALUES,
  type AgentAccessEnvironment,
} from '../src/modules/agent-access/agent-access'
import {
  AGENT_ACCESS_AUTHORITY_MODE_VALUES,
  type AgentAccessAuthorityMode,
} from '../src/modules/agent-access/contract'
import { normalizeStoredAgentAccessGrant } from '../src/modules/agent-access/policy'
import { createAgentAuditEnvelope } from '../src/modules/agent-access/public'
import { createPackage3AuditEvent } from '../src/modules/observability/public'
import {
  createConvexDelegationContextPort,
  createConvexDelegationStore,
} from './lib/delegationPersistence'
import { persistAuditEvent } from './securityShared'

const CLERK_API_KEY_PROVIDER = 'clerk/api-key'
const AUTHORITY_VALUE_PATTERN = /^[A-Za-z0-9*][A-Za-z0-9._:/*-]{0,199}$/u
const PRINCIPAL_REF_PATTERN = /^prn_[0-9a-f]{32}$/u
const ACCOUNT_REF_PATTERN = /^acc_[0-9a-f]{32}$/u
const CREDENTIAL_REF_PATTERN = /^crd_[0-9a-f]{32}$/u
const GRANT_REF_PATTERN = /^grt_[0-9a-f]{32}$/u
const MAX_REQUIRED_SCOPES = 64
const LAST_AUTHENTICATED_WRITE_INTERVAL_MS = 15 * 60 * 1_000
const KNOWN_CREDENTIAL_DENIAL_BUCKET_MS = 5 * 60 * 1_000

const environmentValue = v.union(v.literal('sandbox'), v.literal('production'))
const authorityModeValue = v.union(
  v.literal('read_only'),
  v.literal('approval_required'),
  v.literal('spending_policy'),
  v.literal('unrestricted_test_only'),
)

const canonicalAgentBindingValue = v.object({
  principalId: v.string(),
  ownerId: v.string(),
  credentialId: v.string(),
  canonicalCredentialRef: v.string(),
  grantRef: v.string(),
  grantGeneration: v.number(),
  snapshotRef: v.string(),
  applicationRef: v.string(),
  environment: environmentValue,
  scopes: v.array(v.string()),
  authorityMode: authorityModeValue,
})

export type CanonicalAgentBinding = Readonly<{
  principalId: string
  ownerId: string
  credentialId: string
  canonicalCredentialRef: string
  grantRef: string
  grantGeneration: number
  snapshotRef: string
  applicationRef: string
  environment: AgentAccessEnvironment
  scopes: string[]
  authorityMode: AgentAccessAuthorityMode
}>

type ResolveAgentBindingArgs = Readonly<{
  credentialId: string
  applicationRef: string
  environment: AgentAccessEnvironment
  scopes: readonly string[]
  requiredScopes: readonly string[]
  authorityMode: AgentAccessAuthorityMode
  operationKey: string
  correlationId: string
  sourceWrite?: unknown
  sourceWriteRequest?: unknown
}>

export async function resolveCanonicalAgentBinding(
  ctx: MutationCtx,
  input: ResolveAgentBindingArgs,
): Promise<CanonicalAgentBinding | null> {
  const admissionNow = Date.now()
  const canonicalInput = canonicalResolveInput(input)
  if (!currentServerTime(admissionNow)
    || canonicalInput === undefined) return null
  const { requiredScopes, scopes } = canonicalInput

  const binding = await ctx.db.query('externalIdentityBindings')
    .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
      .eq('providerNamespace', CLERK_API_KEY_PROVIDER)
      .eq('providerIdentifier', input.credentialId))
    .unique()
  if (binding === null
    || !Number.isSafeInteger(binding.credentialGeneration)
    || binding.credentialGeneration < 0) return null

  const [credential, admission] = await Promise.all([
    ctx.db.query('credentials')
      .withIndex('by_bindingRef_and_generation_and_lifecycle', (query) => query
        .eq('bindingRef', binding.bindingRef)
        .eq('generation', binding.credentialGeneration))
      .unique(),
    ctx.db.query('agentAccessPrincipals')
      .withIndex('by_principalId', (query) => query.eq('principalId', binding.principalRef))
      .unique(),
  ])
  if (credential === null
    || credential.principalRef !== binding.principalRef
    || credential.generation !== binding.credentialGeneration
    || credential.type !== 'api_key'
    || admission === null
    || admission.principalId !== binding.principalRef
    || admission.ownerId.length === 0
    || admission.credentialId !== input.credentialId
    || !PRINCIPAL_REF_PATTERN.test(credential.principalRef)
    || !ACCOUNT_REF_PATTERN.test(admission.ownerId)
    || !CREDENTIAL_REF_PATTERN.test(credential.credentialRef)) return null

  const denyKnownCredential = async (
    reasonCode: 'authentication_required' | 'scope_required',
    deniedAt = admissionNow,
  ): Promise<null> => {
    await persistKnownCredentialDenial(ctx, credential, admission, deniedAt, reasonCode)
    return null
  }
  if (binding.lifecycle !== 'active'
    || binding.providerState.kind !== 'known'
    || binding.providerState.value !== 'active'
    || credential.lifecycle !== 'active'
    || admission.lifecycle !== 'active') return await denyKnownCredential('authentication_required')

  const memberships = await ctx.db.query('memberships')
    .withIndex('by_accountRef_and_memberPrincipalRef_and_lifecycle', (query) => query
      .eq('accountRef', admission.ownerId)
      .eq('memberPrincipalRef', binding.principalRef)
      .eq('lifecycle', 'active'))
    .take(2)
  if (memberships.length !== 1) return await denyKnownCredential('authentication_required')

  const principal = await ctx.db.query('principals')
    .withIndex('by_principalRef', (query) => query.eq('principalRef', binding.principalRef))
    .unique()
  if (principal === null || principal.kind !== 'agent' || principal.lifecycle !== 'active') {
    return await denyKnownCredential('authentication_required')
  }

  const [sandboxGrants, productionGrants, candidates] = await Promise.all([
    ctx.db.query('agentAccessGrants')
      .withIndex('by_credentialId_and_environment_and_lifecycle', (query) => query
        .eq('credentialId', input.credentialId)
        .eq('environment', 'sandbox')
        .eq('lifecycle', 'active'))
      .take(2),
    ctx.db.query('agentAccessGrants')
      .withIndex('by_credentialId_and_environment_and_lifecycle', (query) => query
        .eq('credentialId', input.credentialId)
        .eq('environment', 'production')
        .eq('lifecycle', 'active'))
      .take(2),
    ctx.db.query('authorityDelegationGrants')
      .withIndex('by_subjectPrincipalRef_and_lifecycle', (query) => query
        .eq('subjectPrincipalRef', binding.principalRef)
        .eq('lifecycle', 'active'))
      .take(DELEGATION_MAX_ANCESTRY_GRANTS + 1),
  ])
  const accessGrants = [...sandboxGrants, ...productionGrants]
  if (accessGrants.length !== 1 || candidates.length > DELEGATION_MAX_ANCESTRY_GRANTS) {
    return await denyKnownCredential('authentication_required')
  }
  const accessGrant = accessGrants[0]
  if (accessGrant === undefined) {
    return await denyKnownCredential('authentication_required')
  }
  let normalizedAccessGrant: ReturnType<typeof normalizeStoredAgentAccessGrant>
  try {
    normalizedAccessGrant = normalizeStoredAgentAccessGrant(accessGrant)
  } catch {
    return await denyKnownCredential('authentication_required')
  }
  if (accessGrant.principalId !== binding.principalRef
    || accessGrant.ownerId !== admission.ownerId
    || accessGrant.applicationRef !== input.applicationRef
    || accessGrant.environment !== input.environment
    || normalizedAccessGrant.authorityMode !== input.authorityMode
    || accessGrant.generation !== admission.grantGeneration
    || normalizedAccessGrant.spendingPolicyDigest !== admission.spendingPolicyDigest) {
    return await denyKnownCredential('authentication_required')
  }
  const consequenceNow = Date.now()
  if (!currentServerTime(consequenceNow)) return null
  if (credential.expiresAt <= consequenceNow
    || (admission.expiresAt !== undefined && admission.expiresAt <= consequenceNow)) {
    return await denyKnownCredential('authentication_required', consequenceNow)
  }
  const grants = candidates.filter((grant) => grant.grantRef === accessGrant.grantRef
    && grant.expiresAt > consequenceNow
    && requiredScopes.every((scope) => grant.scopes.includes(scope))
    && (grant.resourceRefs.includes('*') || grant.resourceRefs.includes(input.operationKey)))
  if (grants.length !== 1) {
    const hasCurrentAccountGrant = candidates.some((grant) => (
      grant.accountRef === admission.ownerId && grant.expiresAt > consequenceNow
    ))
    return await denyKnownCredential(
      hasCurrentAccountGrant ? 'scope_required' : 'authentication_required',
      consequenceNow,
    )
  }
  const grant = grants[0]
  if (grant === undefined
    || grant.accountRef !== admission.ownerId
    || grant.subjectPrincipalRef !== principal.principalRef
    || !Number.isSafeInteger(grant.generation)
    || grant.generation < 0) return await denyKnownCredential('authentication_required', consequenceNow)

  if (!PRINCIPAL_REF_PATTERN.test(principal.principalRef)
    || !ACCOUNT_REF_PATTERN.test(grant.accountRef)
    || !GRANT_REF_PATTERN.test(grant.grantRef)) {
    return await denyKnownCredential('authentication_required', consequenceNow)
  }

  const canonicalPrincipalRef = principalRef(principal.principalRef)
  const canonicalCredentialRef = credentialRef(credential.credentialRef)
  const canonicalGrantRef = delegationGrantRef(grant.grantRef)
  let snapshot
  try {
    snapshot = await new DelegationService(
      createConvexDelegationStore(ctx),
      createConvexDelegationContextPort(ctx, canonicalPrincipalRef),
    ).admitConsequence({
      grantRef: canonicalGrantRef,
      expectedGeneration: grant.generation,
      context: {
        actorPrincipalRef: canonicalPrincipalRef,
        activeAccountRef: accountRef(grant.accountRef),
        correlationRef: input.correlationId,
        idempotencyRef: input.correlationId,
      },
      requiredScopes,
      resourceRefs: [input.operationKey],
      budgetAmount: 0,
    })
  } catch (error) {
    if (error instanceof DelegationError) {
      return await denyKnownCredential('authentication_required', consequenceNow)
    }
    throw error
  }
  const finalNow = Date.now()
  if (!currentServerTime(finalNow)) return null
  if (credential.expiresAt <= finalNow
    || (admission.expiresAt !== undefined && admission.expiresAt <= finalNow)
    || snapshot.expiresAt <= finalNow
    || snapshot.actorPrincipalRef !== canonicalPrincipalRef
    || snapshot.grantRef !== canonicalGrantRef
    || snapshot.generation !== grant.generation) {
    return await denyKnownCredential('authentication_required', finalNow)
  }

  const admittedScopes = scopes.filter((scope) => snapshot.scopes.includes(scope))
  if (credential.lastAuthenticatedAt === undefined
    || finalNow - credential.lastAuthenticatedAt >= LAST_AUTHENTICATED_WRITE_INTERVAL_MS) {
    await persistSuccessfulAuthentication(ctx, credential, admission, finalNow)
    await ctx.db.patch(credential._id, { lastAuthenticatedAt: finalNow })
  }
  return Object.freeze({
    principalId: canonicalPrincipalRef,
    ownerId: snapshot.accountRef,
    credentialId: input.credentialId,
    canonicalCredentialRef,
    grantRef: snapshot.grantRef,
    grantGeneration: snapshot.generation,
    snapshotRef: snapshot.snapshotRef,
    applicationRef: input.applicationRef,
    environment: input.environment,
    scopes: admittedScopes,
    authorityMode: input.authorityMode,
  })
}

async function persistSuccessfulAuthentication(
  ctx: MutationCtx,
  credential: Doc<'credentials'>,
  admission: Doc<'agentAccessPrincipals'>,
  authenticatedAt: number,
): Promise<void> {
  const bucketStart = Math.floor(authenticatedAt / LAST_AUTHENTICATED_WRITE_INTERVAL_MS)
    * LAST_AUTHENTICATED_WRITE_INTERVAL_MS
  const bucketRef = `agent-credential-authenticated:${credential.credentialRef}:${bucketStart}`
  const audit = createPackage3AuditEvent(createAgentAuditEnvelope({
    eventType: 'agent.credential.authenticated',
    actorPrincipalRef: credential.principalRef,
    activeAccountRef: admission.ownerId,
    agentRef: credential.principalRef,
    credentialRef: credential.credentialRef,
    correlationRef: bucketRef,
    idempotencyRef: bucketRef,
    authorityGeneration: admission.grantGeneration,
    occurredAt: authenticatedAt,
    beforeState: 'presented',
    outcome: 'authenticated',
  }))
  if (!audit.valid) throw new Error(`agent_credential_authentication_audit_invalid:${audit.reason}`)
  await persistAuditEvent(ctx.db, audit.event)
}

async function persistKnownCredentialDenial(
  ctx: MutationCtx,
  credential: Doc<'credentials'>,
  admission: Doc<'agentAccessPrincipals'>,
  deniedAt: number,
  reasonCode: 'authentication_required' | 'scope_required',
): Promise<void> {
  const bucketStart = Math.floor(deniedAt / KNOWN_CREDENTIAL_DENIAL_BUCKET_MS)
    * KNOWN_CREDENTIAL_DENIAL_BUCKET_MS
  const bucketRef = `agent-credential-denial:${credential.credentialRef}:${bucketStart}`
  const audit = createPackage3AuditEvent(createAgentAuditEnvelope({
    eventType: 'agent.credential.denied',
    actorPrincipalRef: credential.principalRef,
    activeAccountRef: admission.ownerId,
    agentRef: credential.principalRef,
    credentialRef: credential.credentialRef,
    correlationRef: bucketRef,
    idempotencyRef: bucketRef,
    authorityGeneration: admission.grantGeneration,
    occurredAt: deniedAt,
    beforeState: 'presented',
    outcome: 'denied',
    reasonCode,
  }))
  if (!audit.valid) throw new Error(`agent_credential_denial_audit_invalid:${audit.reason}`)
  await persistAuditEvent(ctx.db, audit.event)
}

export const resolveAgentBinding = mutation({
  args: {
    credentialId: v.string(),
    applicationRef: v.string(),
    environment: environmentValue,
    scopes: v.array(v.string()),
    requiredScopes: v.array(v.string()),
    authorityMode: authorityModeValue,
    operationKey: v.string(),
    correlationId: v.string(),
    sourceWrite: v.optional(sourceWriteAdmissionArg),
    sourceWriteRequest: v.optional(sourceWriteRequestArg),
  },
  returns: v.union(canonicalAgentBindingValue, v.null()),
  handler: async (ctx, args) => {
    if (canonicalResolveInput(args) === undefined) return null
    const admitted = await requireSourceWrite(ctx, args, 'agent_identity')
    if (admitted.kind === 'rejected') {
      throw new Error(`canonical_agent_binding_source_write_rejected:${admitted.reason}`)
    }
    return await resolveCanonicalAgentBinding(ctx, args)
  },
})

function canonicalAuthorityValues(values: readonly string[], allowEmpty: boolean): readonly string[] | undefined {
  if (!Array.isArray(values)
    || (!allowEmpty && values.length === 0)
    || values.length > MAX_REQUIRED_SCOPES
    || values.some((value) => typeof value !== 'string' || !AUTHORITY_VALUE_PATTERN.test(value))
    || new Set(values).size !== values.length) return undefined
  return Object.freeze([...values].sort())
}

function canonicalAuthorityValue(value: unknown): value is string {
  return typeof value === 'string' && AUTHORITY_VALUE_PATTERN.test(value)
}

function canonicalResolveInput(input: ResolveAgentBindingArgs): Readonly<{
  scopes: readonly string[]
  requiredScopes: readonly string[]
}> | undefined {
  const scopes = canonicalAuthorityValues(input.scopes, true)
  const requiredScopes = canonicalAuthorityValues(input.requiredScopes, false)
  if (!canonicalAuthorityValue(input.credentialId)
    || !canonicalAuthorityValue(input.applicationRef)
    || !canonicalAuthorityValue(input.operationKey)
    || !canonicalAuthorityValue(input.correlationId)
    || scopes === undefined
    || requiredScopes === undefined
    || requiredScopes.some((scope) => !scopes.includes(scope))
    || !AGENT_ACCESS_ENVIRONMENT_VALUES.includes(input.environment)
    || !AGENT_ACCESS_AUTHORITY_MODE_VALUES.includes(input.authorityMode)) return undefined
  return { scopes, requiredScopes }
}

function currentServerTime(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}
