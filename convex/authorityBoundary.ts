import { v } from 'convex/values'

import { mutation, type MutationCtx } from './_generated/server'
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
import {
  createConvexDelegationContextPort,
  createConvexDelegationStore,
} from './lib/delegationPersistence'

const CLERK_API_KEY_PROVIDER = 'clerk/api-key'
const AUTHORITY_VALUE_PATTERN = /^[A-Za-z0-9*][A-Za-z0-9._:/*-]{0,199}$/u
const PRINCIPAL_REF_PATTERN = /^prn_[0-9a-f]{32}$/u
const ACCOUNT_REF_PATTERN = /^acc_[0-9a-f]{32}$/u
const CREDENTIAL_REF_PATTERN = /^crd_[0-9a-f]{32}$/u
const GRANT_REF_PATTERN = /^grt_[0-9a-f]{32}$/u
const MAX_REQUIRED_SCOPES = 64

const environmentValue = v.union(v.literal('sandbox'), v.literal('production'))
const authorityModeValue = v.union(
  v.literal('inspect_only'),
  v.literal('approve_each'),
  v.literal('bounded_mandate'),
  v.literal('full_yolo'),
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
    || binding.lifecycle !== 'active'
    || binding.providerState.kind !== 'known'
    || binding.providerState.value !== 'active'
    || !Number.isSafeInteger(binding.credentialGeneration)
    || binding.credentialGeneration < 0) return null

  const credential = await ctx.db.query('credentials')
    .withIndex('by_bindingRef_and_generation_and_lifecycle', (query) => query
      .eq('bindingRef', binding.bindingRef)
      .eq('generation', binding.credentialGeneration)
      .eq('lifecycle', 'active'))
    .unique()
  if (credential === null
    || credential.principalRef !== binding.principalRef
    || credential.generation !== binding.credentialGeneration
    || credential.type !== 'api_key') return null

  const principal = await ctx.db.query('principals')
    .withIndex('by_principalRef', (query) => query.eq('principalRef', binding.principalRef))
    .unique()
  if (principal === null || principal.lifecycle !== 'active') return null

  const candidates = await ctx.db.query('authorityDelegationGrants')
    .withIndex('by_subjectPrincipalRef_and_lifecycle', (query) => query
      .eq('subjectPrincipalRef', binding.principalRef)
      .eq('lifecycle', 'active'))
    .take(DELEGATION_MAX_ANCESTRY_GRANTS + 1)
  if (candidates.length > DELEGATION_MAX_ANCESTRY_GRANTS) return null
  const consequenceNow = Date.now()
  if (!currentServerTime(consequenceNow) || credential.expiresAt <= consequenceNow) return null
  const grants = candidates.filter((grant) => grant.expiresAt > consequenceNow
    && requiredScopes.every((scope) => grant.scopes.includes(scope))
    && (grant.resourceRefs.includes('*') || grant.resourceRefs.includes(input.operationKey)))
  if (grants.length !== 1) return null
  const grant = grants[0]
  if (grant === undefined
    || grant.subjectPrincipalRef !== principal.principalRef
    || !Number.isSafeInteger(grant.generation)
    || grant.generation < 0) return null

  if (!PRINCIPAL_REF_PATTERN.test(principal.principalRef)
    || !ACCOUNT_REF_PATTERN.test(grant.accountRef)
    || !CREDENTIAL_REF_PATTERN.test(credential.credentialRef)
    || !GRANT_REF_PATTERN.test(grant.grantRef)) return null

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
    if (error instanceof DelegationError) return null
    throw error
  }
  const finalNow = Date.now()
  if (!currentServerTime(finalNow)
    || credential.expiresAt <= finalNow
    || snapshot.expiresAt <= finalNow
    || snapshot.actorPrincipalRef !== canonicalPrincipalRef
    || snapshot.grantRef !== canonicalGrantRef
    || snapshot.generation !== grant.generation) return null

  const admittedScopes = scopes.filter((scope) => snapshot.scopes.includes(scope))
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
