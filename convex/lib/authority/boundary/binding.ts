import { degradeBackend } from '@/lib/observability/degrade-backend'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import { env, type MutationCtx } from '../../../_generated/server'
import { requireSourceWrite } from '../../security/sourceWrite/admission'
import { accountRef, principalRef } from '@/modules/principal-account/public'
import { credentialRef } from '@/modules/principal-account/external-identity/public'
import { DELEGATION_MAX_ANCESTRY_GRANTS, DelegationError, DelegationService, delegationGrantRef } from '@/modules/authority/delegation/public'
import type { AgentAccessEnvironment } from '@/modules/agent-access/agent-access'
import { MARKET_TOOLS_CALL_SCOPE, type AgentAccessAuthorityMode } from '@/modules/agent-access/contract'
import { normalizeStoredAgentAccessGrant } from '@/modules/agent-access/policy'
import { createConvexDelegationContextPort, createConvexDelegationStore } from '../delegation/persistence'
import { isBuyerAuthenticationSurface } from './resources'
import { LAST_AUTHENTICATED_WRITE_INTERVAL_MS, persistKnownCredentialDenial, persistSuccessfulAuthentication } from './audit'
import { PRINCIPAL_REF_PATTERN, ACCOUNT_REF_PATTERN, CREDENTIAL_REF_PATTERN, GRANT_REF_PATTERN, canonicalResolveInput, currentServerTime, type ResolveAgentBindingArgs } from './contracts'

const CLERK_API_KEY_PROVIDER = 'clerk/api-key'

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

export async function resolveCanonicalAgentBinding(
  ctx: MutationCtx,
  input: ResolveAgentBindingArgs,
): Promise<CanonicalAgentBinding | null> {
  if (deploymentPaymentEnvironment(env) !== input.environment) return null
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
  } catch (cause) {
    return await degradeBackend(cause, denyKnownCredential('authentication_required'), { site: 'resolveCanonicalAgentBinding', reason: 'invalid_response' })
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
    || (admission.expiresAt !== undefined && admission.expiresAt <= consequenceNow)
    || normalizedAccessGrant.expiresAt <= consequenceNow) {
    return await denyKnownCredential('authentication_required', consequenceNow)
  }
  const bindingResources = normalizedAccessGrant.toolAccess === 'selected_tools'
    && requiredScopes.includes(MARKET_TOOLS_CALL_SCOPE)
    && isBuyerAuthenticationSurface(input.operationKey)
    ? normalizedAccessGrant.toolRefs
    : [input.operationKey]
  const grants = candidates.filter((grant) => grant.grantRef === accessGrant.grantRef
    && grant.expiresAt > consequenceNow
    && requiredScopes.every((scope) => grant.scopes.includes(scope))
    && (grant.resourceRefs.includes('*') || bindingResources.every(resource => grant.resourceRefs.includes(resource))))
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
      resourceRefs: bindingResources,
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
    || normalizedAccessGrant.expiresAt <= finalNow
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

export async function resolveAgentBindingHandler(ctx: MutationCtx, args: ResolveAgentBindingArgs): Promise<CanonicalAgentBinding | null> {
    if (deploymentPaymentEnvironment(env) !== args.environment) return null
    if (canonicalResolveInput(args) === undefined) return null
    const admitted = await requireSourceWrite(ctx, args, 'agent_identity')
    if (admitted.kind === 'rejected') {
      throw new Error(`canonical_agent_binding_source_write_rejected:${admitted.reason}`)
    }
    return await resolveCanonicalAgentBinding(ctx, args)
}
