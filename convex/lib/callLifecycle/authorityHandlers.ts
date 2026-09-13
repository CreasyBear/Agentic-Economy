import { makeFunctionReference } from 'convex/server'
import type { Infer } from 'convex/values'
import { degradeBackend } from '../../../src/lib/observability/degrade-backend'
import { resolveServiceMode, serviceModeAllowsEnvironment } from '@/lib/deployment/service-mode'
import type { Doc } from '../../_generated/dataModel'
import { internal } from '../../_generated/api'
import { env, type ActionCtx, type MutationCtx, type QueryCtx } from '../../_generated/server'
import { resolveBusinessActor } from '../../authz'
import { MARKET_TOOLS_CALL_SCOPE } from '@/modules/agent-access/contract'
import {
  normalizeStoredAgentAccessGrant,
} from '@/modules/agent-access/policy'
import { isPublicToolRef } from '@/modules/capability-supply/public'
import { uniqueSorted } from '@/modules/common/unique-sorted'
import {
  callResultValue,
  recoveryResultValue,
  statusResultValue,
} from '@/modules/capability-execution/convex'
import {
  resolveCanonicalAgentContext,
  validateCanonicalAgentDelegation,
} from '../canonicalAgentAuthority'
import {
  decideCallApprovalHandler,
  listPendingCallApprovalsHandler,
} from './admission'
import {
  cancelCallHandler,
  cancelOwnerCallHandler,
  callHandler,
  projectCallResult,
  listAgentCallsHandler,
  readCallStatusHandler,
  readOwnerCallStatusHandler,
  reconcileCallHandler,
  reconcileOwnerCallHandler,
} from './callActions'
import {
  callSummaryPageValue,
  reconciledCallAuthorityResult,
  type CurrentAgentAuthority,
  type CallPrincipal,
  type ReconciledCallAuthority,
} from './contracts'
import { readExactSellerOnboardingCanaryPlatformGrantHandler } from '../../capabilitySupplyCanaryFunding'
import { inspectLiveX402RequirementRef } from '../liveX402RequirementRef'
import { callResultSchema } from '@/modules/capability-execution/call-contracts'

export const resolveCallAgentAuthorityRef = makeFunctionReference<
  'mutation',
  { principal: CallPrincipal; toolRef?: string; callRef?: string; receiptList?: true },
  CallPrincipal | null
>('capabilityCalls:resolveCallAgentAuthority')

type CurrentAuthorityPurpose =
  | Readonly<{ kind: 'new_operation'; toolRef: string }>
  | Readonly<{ kind: 'persisted_invocation'; toolRef: string }>
  | Readonly<{ kind: 'receipt_list' }>

type CallAuthorityTarget = Readonly<{
  purpose: CurrentAuthorityPurpose
  invocation: Doc<'capabilityCalls'> | null
}>

function callMatchesCurrentAuthority(
  row: Doc<'capabilityCalls'>,
  current: CurrentAgentAuthority,
): boolean {
  return [
    row.principalId === current.principal.principalId,
    row.ownerId === current.principal.ownerId,
    row.credentialId === current.principal.credentialId,
    row.applicationRef === current.principal.applicationRef,
    row.environment === current.principal.environment,
    row.grantRef === current.grantRef,
    row.grantGeneration === current.grantGeneration,
    row.policyDigest === current.policyDigest,
    row.grantExpiresAt === current.expiresAt,
  ].every(Boolean)
}

async function resolveCallAuthorityTarget(
  ctx: MutationCtx,
  args: Readonly<{ toolRef?: string; callRef?: string; receiptList?: true }>,
): Promise<CallAuthorityTarget | null> {
  const targetCount = Number(args.toolRef !== undefined)
    + Number(args.callRef !== undefined)
    + Number(args.receiptList === true)
  if (targetCount !== 1) return null
  if (args.toolRef !== undefined) {
    return { purpose: { kind: 'new_operation', toolRef: args.toolRef }, invocation: null }
  }
  if (args.receiptList === true) return { purpose: { kind: 'receipt_list' }, invocation: null }
  if (args.callRef === undefined) return null
  const callRef = args.callRef
  const rows = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', callRef))
    .take(2)
  if (rows.length !== 1) return null
  const [invocation] = rows
  return invocation === undefined
    ? null
    : {
        purpose: { kind: 'persisted_invocation', toolRef: invocation.toolRef },
        invocation,
      }
}

export async function resolveCallAgentAuthorityHandler(
  ctx: MutationCtx,
  args: Readonly<{ principal: CallPrincipal; toolRef?: string; callRef?: string; receiptList?: true }>,
): Promise<CallPrincipal | null> {
  const target = await resolveCallAuthorityTarget(ctx, args)
  if (target === null) return null
  const current = await resolveCurrentAgentAuthority(
    ctx,
    args.principal,
    Date.now(),
    target.purpose,
  )
  if (current === null) return null
  // Recovery is owned by the durable Agent and Account. Exact historical grant
  // and credential matching remains mandatory for dispatch, not for readback or
  // remedy through a currently authorised replacement credential.
  if (target.invocation !== null && ![
    target.invocation.principalId === current.principal.principalId,
    target.invocation.ownerId === current.principal.ownerId,
    target.invocation.applicationRef === current.principal.applicationRef,
    target.invocation.environment === current.principal.environment,
  ].every(Boolean)) return null
  return current.principal
}

export async function reconcileCallWorkloadAuthorityHandler(
  ctx: MutationCtx,
  args: Readonly<{ callRef: string }>,
): Promise<Infer<typeof reconciledCallAuthorityResult>> {
  const now = Date.now()
  const sellerCanaryAuthority = await reconcilePersistedSellerCanaryAuthority(
    ctx,
    args.callRef,
    now,
  )
  const authority = sellerCanaryAuthority === undefined
    ? await reconcilePersistedCallAuthority(ctx, args.callRef, now)
    : sellerCanaryAuthority
  if (authority === null) {
    await refuseCallBeforeEffectForInvalidAuthority(ctx, args.callRef, now)
    return { kind: 'refused' }
  }
  return { kind: 'authorized', authority }
}

function sellerCanaryDispatchAuthorityMatches(
  row: Doc<'capabilityCalls'>,
  canary: NonNullable<Doc<'capabilityCalls'>['sellerOnboardingCanary']>,
): boolean {
  return [
    row.environment === 'sandbox',
    canary.funding.grantRef === row.grantRef,
    canary.funding.principalId === row.principalId,
    canary.funding.ownerId === row.ownerId,
    canary.funding.credentialId === row.credentialId,
    canary.funding.applicationRef === row.applicationRef,
    canary.funding.grantGeneration === row.grantGeneration,
    canary.funding.policyDigest === row.policyDigest,
  ].every(Boolean)
}

/**
 * Seller canaries are platform-owned synthetic workloads, not external agent
 * credentials. They therefore reconcile against the exact sealed platform
 * grant/principal pair instead of the ordinary external identity/delegation
 * chain. `undefined` means the invocation is not a seller canary and must use
 * the generic authority path; `null` means a canary was present but stale.
 */
async function reconcilePersistedSellerCanaryAuthority(
  ctx: MutationCtx,
  callRef: string,
  now: number,
): Promise<ReconciledCallAuthority | null | undefined> {
  const row = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', callRef))
    .unique()
  if (row === null || row.sellerOnboardingCanary === undefined) return undefined
  const canary = row.sellerOnboardingCanary
  if (!sellerCanaryDispatchAuthorityMatches(row, canary)) return null

  const grant = await readExactSellerOnboardingCanaryPlatformGrantHandler(ctx, {
    sellerOwnerId: canary.ownerId,
    expected: {
      kind: 'persisted_dispatch',
      grantRef: row.grantRef,
      principalId: row.principalId,
      ownerId: row.ownerId,
      credentialId: row.credentialId,
      applicationRef: row.applicationRef,
      environment: 'sandbox',
      generation: row.grantGeneration,
      spendingPolicyDigest: row.policyDigest,
      expiresAt: row.grantExpiresAt,
    },
    now,
  })
  return grant === null
    ? null
    : Object.freeze({
        principalId: grant.principalId,
        accountRef: grant.ownerId,
        credentialId: grant.credentialId,
        grantRef: grant.grantRef,
        grantGeneration: grant.generation,
        policyDigest: grant.spendingPolicyDigest,
        expiresAt: grant.expiresAt,
      })
}

export async function canonicalAgentPrincipal(
  ctx: ActionCtx,
  principal: CallPrincipal,
  target: Readonly<{ toolRef: string } | { callRef: string } | { receiptList: true }>,
): Promise<CallPrincipal | null> {
  return await ctx.runMutation(resolveCallAgentAuthorityRef, { principal, ...target })
}

type CanonicalAgentContext = NonNullable<Awaited<ReturnType<typeof resolveCanonicalAgentContext>>>
type StoredAgent = Doc<'agentAccessPrincipals'>
type NormalizedActiveGrant = ReturnType<typeof normalizeStoredAgentAccessGrant>

function validAuthorityRequest(candidate: CallPrincipal, now: number, purpose: CurrentAuthorityPurpose): boolean {
  return [
    Number.isSafeInteger(now),
    now >= 0,
    purpose.kind === 'receipt_list' || purpose.toolRef.trim().length > 0,
    candidate.scopes.includes(MARKET_TOOLS_CALL_SCOPE),
  ].every(Boolean)
}

function candidateMatchesCanonical(candidate: CallPrincipal, canonical: CanonicalAgentContext): boolean {
  return [
    candidate.principalId === canonical.principalRef,
    candidate.ownerId === canonical.accountRef,
  ].every(Boolean)
}

function scopeSubset(candidateScopes: readonly string[], storedScopes: readonly string[]): boolean {
  return candidateScopes.every((scope) => storedScopes.includes(scope))
}

function storedAgentMatches(
  stored: StoredAgent,
  candidate: CallPrincipal,
  canonical: CanonicalAgentContext,
  now: number,
): boolean {
  const unexpired = stored.expiresAt === undefined || stored.expiresAt > now
  return [
    stored.principalId === canonical.principalRef,
    stored.ownerId === canonical.accountRef,
    stored.credentialId === candidate.credentialId,
    stored.applicationRef === candidate.applicationRef,
    stored.environment === candidate.environment,
    stored.authorityMode === candidate.authorityMode,
    stored.lifecycle === 'active',
    unexpired,
    stored.scopes.includes(MARKET_TOOLS_CALL_SCOPE),
    scopeSubset(candidate.scopes, stored.scopes),
  ].every(Boolean)
}

async function loadCurrentStoredAgent(
  ctx: MutationCtx,
  candidate: CallPrincipal,
  canonical: CanonicalAgentContext,
  now: number,
): Promise<StoredAgent | null> {
  const rows = await ctx.db.query('agentAccessPrincipals')
    .withIndex('by_credentialId', (query) => query.eq('credentialId', canonical.credentialLocator))
    .take(2)
  if (rows.length !== 1) return null
  const [stored] = rows
  if (stored === undefined) return null
  return storedAgentMatches(stored, candidate, canonical, now) ? stored : null
}

function activeGrantMatches(
  grant: NormalizedActiveGrant,
  stored: StoredAgent,
  canonical: CanonicalAgentContext,
  now: number,
): boolean {
  return [
    grant.principalId === canonical.principalRef,
    grant.ownerId === stored.ownerId,
    grant.applicationRef === stored.applicationRef,
    grant.environment === stored.environment,
    grant.authorityMode === stored.authorityMode,
    grant.generation === stored.grantGeneration,
    grant.spendingPolicyDigest === stored.spendingPolicyDigest,
    grant.expiresAt > now,
    grant.expiresAt <= canonical.credentialExpiresAt,
  ].every(Boolean)
}

async function loadCurrentActiveGrant(
  ctx: MutationCtx,
  stored: StoredAgent,
  canonical: CanonicalAgentContext,
  now: number,
): Promise<NormalizedActiveGrant | null> {
  const [sandboxGrants, productionGrants] = await Promise.all([
    ctx.db.query('agentAccessGrants')
      .withIndex('by_credentialId_and_environment_and_lifecycle', (query) => query
        .eq('credentialId', canonical.credentialLocator)
        .eq('environment', 'sandbox')
        .eq('lifecycle', 'active'))
      .take(2),
    ctx.db.query('agentAccessGrants')
      .withIndex('by_credentialId_and_environment_and_lifecycle', (query) => query
        .eq('credentialId', canonical.credentialLocator)
        .eq('environment', 'production')
        .eq('lifecycle', 'active'))
      .take(2),
  ])
  const activeGrants = [...sandboxGrants, ...productionGrants]
  if (activeGrants.length !== 1) return null
  const [storedGrant] = activeGrants
  if (storedGrant === undefined) return null
  let grant: NormalizedActiveGrant
  try {
    grant = normalizeStoredAgentAccessGrant(storedGrant)
  } catch (cause) {
    return degradeBackend(cause, null, { site: 'loadCurrentActiveGrant', reason: 'invalid_response' })
  }
  return activeGrantMatches(grant, stored, canonical, now) ? grant : null
}

function delegationResourceForPurpose(
  grant: NormalizedActiveGrant,
  purpose: CurrentAuthorityPurpose,
): string | undefined {
  if (purpose.kind === 'persisted_invocation') return purpose.toolRef
  if (purpose.kind === 'new_operation') {
    if (!isPublicToolRef(purpose.toolRef)) return undefined
    return grant.toolAccess === 'all_admitted' || grant.toolRefs.includes(purpose.toolRef)
      ? purpose.toolRef
      : undefined
  }
  return grant.toolAccess === 'all_admitted' ? '*' : grant.toolRefs[0]
}

export async function resolveCurrentAgentAuthority(
  ctx: MutationCtx,
  candidate: CallPrincipal,
  now: number,
  purpose: CurrentAuthorityPurpose,
): Promise<CurrentAgentAuthority | null> {
  if (!validAuthorityRequest(candidate, now, purpose)) return null

  const canonical = await resolveCanonicalAgentContext(ctx, candidate.credentialId, now)
  if (canonical === null || !candidateMatchesCanonical(candidate, canonical)) return null
  const storedAgent = await loadCurrentStoredAgent(ctx, candidate, canonical, now)
  if (storedAgent === null) return null
  const grant = await loadCurrentActiveGrant(
    ctx,
    storedAgent,
    canonical,
    now,
  )
  if (grant === null) return null
  const resourceRef = delegationResourceForPurpose(grant, purpose)
  if (resourceRef === undefined) return null

  const scopes = uniqueSorted(candidate.scopes)
  if (scopes.length !== candidate.scopes.length) return null
  // Credential replacement issues a new delegation, whose own generation can
  // differ from the Agent access generation used in Call authority evidence.
  const canonicalGrant = await ctx.db.query('authorityDelegationGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', grant.grantRef))
    .unique()
  if (canonicalGrant === null) return null
  const delegation = await validateCanonicalAgentDelegation(ctx, {
    evidenceKind: purpose.kind === 'receipt_list' ? 'operation-receipt-list' : 'operation-public-admission',
    evidenceRef: resourceRef,
    principalRef: canonical.principalRef,
    accountRef: canonical.accountRef,
    grantRef: grant.grantRef,
    grantGeneration: canonicalGrant.generation,
    requiredScopes: scopes,
    resourceRefs: [resourceRef],
    now,
  })
  if (delegation === null) return null

  return Object.freeze({
    principal: Object.freeze({
      principalId: canonical.principalRef,
      ownerId: canonical.accountRef,
      credentialId: storedAgent.credentialId,
      applicationRef: storedAgent.applicationRef,
      environment: storedAgent.environment,
      scopes,
      authorityMode: storedAgent.authorityMode,
    }),
    grantRef: grant.grantRef,
    grantGeneration: grant.generation,
    policyDigest: grant.spendingPolicyDigest,
    expiresAt: grant.expiresAt,
  })
}

export async function validatePersistedCallDelegation(
  ctx: MutationCtx,
  input: Readonly<{
    callRef: string
    toolRef: string
    principalId: string
    accountRef: string
    grantRef: string
    grantGeneration: number
  }>,
): Promise<boolean> {
  const accessGrant = await ctx.db.query('agentAccessGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', input.grantRef))
    .unique()
  if (accessGrant === null
    || accessGrant.lifecycle !== 'active'
    || accessGrant.generation !== input.grantGeneration
    || accessGrant.principalId !== input.principalId
    || accessGrant.ownerId !== input.accountRef) return false
  const canonicalGrant = await ctx.db.query('authorityDelegationGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', input.grantRef))
    .unique()
  if (canonicalGrant === null) return false
  return await validateCanonicalAgentDelegation(ctx, {
    evidenceKind: 'operation-workload-reconciliation',
    evidenceRef: input.callRef,
    principalRef: input.principalId,
    accountRef: input.accountRef,
    grantRef: input.grantRef,
    grantGeneration: canonicalGrant.generation,
    requiredScopes: [MARKET_TOOLS_CALL_SCOPE],
    resourceRefs: [input.toolRef],
    now: Date.now(),
  }) !== null
}

export async function reconcilePersistedCallAuthority(
  ctx: MutationCtx,
  callRef: string,
  now: number,
): Promise<ReconciledCallAuthority | null> {
  const row = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', callRef))
    .unique()
  if (row === null) return null
  const storedAgent = await ctx.db.query('agentAccessPrincipals')
    .withIndex('by_credentialId', (query) => query.eq('credentialId', row.credentialId))
    .unique()
  if (storedAgent === null) return null
  const current = await resolveCurrentAgentAuthority(ctx, {
    principalId: storedAgent.principalId,
    ownerId: storedAgent.ownerId,
    credentialId: storedAgent.credentialId,
    applicationRef: storedAgent.applicationRef,
    environment: storedAgent.environment,
    scopes: storedAgent.scopes,
    authorityMode: storedAgent.authorityMode,
  }, now, { kind: 'persisted_invocation', toolRef: row.toolRef })
  if (current === null) return null
  if (!callMatchesCurrentAuthority(row, current)) return null
  const delegationIsCurrent = await validatePersistedCallDelegation(ctx, {
    callRef: row.callRef,
    toolRef: row.toolRef,
    principalId: current.principal.principalId,
    accountRef: current.principal.ownerId,
    grantRef: current.grantRef,
    grantGeneration: current.grantGeneration,
  })
  if (!delegationIsCurrent) return null
  return Object.freeze({
    principalId: current.principal.principalId,
    accountRef: current.principal.ownerId,
    credentialId: current.principal.credentialId,
    grantRef: current.grantRef,
    grantGeneration: current.grantGeneration,
    policyDigest: current.policyDigest,
    expiresAt: current.expiresAt,
  })
}

export async function refuseCallBeforeEffectForInvalidAuthority(
  ctx: MutationCtx,
  callRef: string,
  now: number,
): Promise<void> {
  const [row, control] = await Promise.all([
    ctx.db.query('capabilityCalls')
      .withIndex('by_callRef', (query) => query.eq('callRef', callRef))
      .unique(),
    ctx.db.query('actionExecutionControls')
      .withIndex('by_executionRef', (query) => query.eq('executionRef', callRef))
      .unique(),
  ])
  if (row === null || row.state !== 'pending' || control !== null) return
  await ctx.db.patch(row._id, {
    state: 'refused',
    dispatchState: 'failed',
    result: {
      kind: 'refused',
      toolRef: row.toolRef,
      code: 'grant_not_found',
      retryable: false,
      nextAction: 'Refresh the agent grant and retry.',
    },
    updatedAt: now,
  })
}

export function agentRecoveryNotFound(callRef: string): Infer<typeof recoveryResultValue> {
  return { kind: 'refused', callRef, code: 'invocation_not_found', retryable: false }
}

export function agentStatusNotFound(callRef: string): Infer<typeof statusResultValue> {
  return { kind: 'refused', callRef, code: 'invocation_not_found', retryable: false }
}

export async function canonicalAgentCallHandler(
  ctx: ActionCtx,
  args: Readonly<{
    operationKey: string
    correlationId: string
    sourceWrite?: unknown
    sourceWriteRequest?: unknown
    principal: CallPrincipal
    quoteRef: string
    idempotencyKey: string
  }>,
): Promise<Infer<typeof callResultValue>> {
  const sourceAdmitted = await ctx.runMutation(
    internal.capabilityQuotes.admitCall,
    args as never,
  )
  if (!sourceAdmitted) {
    return { kind: 'refused', code: 'invocation_runtime_unavailable', retryable: true }
  }
  const material = await ctx.runQuery(internal.capabilityQuotes.readForCall, {
    principal: args.principal,
    quoteRef: args.quoteRef,
    idempotencyKey: args.idempotencyKey,
    now: Date.now(),
  })
  if (material === null) {
    return { kind: 'refused', code: 'operation_not_current', retryable: false }
  }
  const principal = await canonicalAgentPrincipal(ctx, args.principal,
    material.consumedCallRef === undefined
      ? { toolRef: material.toolRef }
      : { callRef: material.consumedCallRef })
  if (principal === null) {
    return { kind: 'refused', toolRef: material.toolRef, code: 'grant_not_found', retryable: false }
  }
  if (material.consumedCallRef !== undefined) {
    // Identify the consumed Call by the stable Principal tuple; the credential
    // it was reserved under may since have been replaced.
    const replay = await ctx.runQuery(internal.capabilityCalls.readReplay, {
      callRef: material.consumedCallRef,
      principalId: principal.principalId,
      ownerId: principal.ownerId,
      applicationRef: principal.applicationRef,
      environment: principal.environment,
    })
    if (replay === null) return { kind: 'refused', code: 'operation_not_current', retryable: false }
    if (replay.result !== undefined) return projectCallResult(callResultSchema.parse(replay.result))
    return { kind: 'pending', callRef: material.consumedCallRef, toolRef: material.toolRef, retryAfterMs: 1_000 }
  }
  if (!serviceModeAllowsEnvironment(resolveServiceMode(env), principal.environment)) {
    return { kind: 'refused', toolRef: material.toolRef, code: 'environment_mismatch', retryable: false }
  }
  if (material.x402RequirementDigest !== undefined) {
    const live = await ctx.runAction(inspectLiveX402RequirementRef, {
      principal,
      toolRef: material.toolRef,
      input: material.input,
    })
    if (live.kind !== 'observed'
      || live.requirement.requirementDigest !== material.x402RequirementDigest) {
      return {
        kind: 'refused',
        toolRef: material.toolRef,
        code: 'operation_not_current',
        retryable: false,
        nextAction: 'operation.inspect',
      }
    }
  }
  return await callHandler(ctx, {
    quoteRef: material.quoteRef,
    operationKey: args.operationKey,
    correlationId: args.correlationId,
    principal,
    toolRef: material.toolRef,
    input: material.input,
    decisionPrice: material.decisionPrice,
    idempotencyKey: args.idempotencyKey,
  }, true)
}

export async function canonicalAgentListHandler(
  ctx: ActionCtx,
  args: Parameters<typeof listAgentCallsHandler>[1],
): Promise<Infer<typeof callSummaryPageValue>> {
  const principal = await canonicalAgentPrincipal(ctx, args.principal, { receiptList: true })
  if (principal === null) throw new Error('agent_invocation_list_unauthorized')
  return await listAgentCallsHandler(ctx, { ...args, principal })
}

export async function canonicalAgentStatusHandler(
  ctx: ActionCtx,
  args: Parameters<typeof readCallStatusHandler>[1],
): Promise<Infer<typeof statusResultValue>> {
  const principal = await canonicalAgentPrincipal(ctx, args.principal, { callRef: args.callRef })
  if (principal === null) return agentStatusNotFound(args.callRef)
  return await readCallStatusHandler(ctx, { ...args, principal })
}

export async function canonicalAgentCancelHandler(
  ctx: ActionCtx,
  args: Parameters<typeof cancelCallHandler>[1],
): Promise<Infer<typeof recoveryResultValue>> {
  const principal = await canonicalAgentPrincipal(ctx, args.principal, { callRef: args.callRef })
  if (principal === null) return agentRecoveryNotFound(args.callRef)
  return await cancelCallHandler(ctx, { ...args, principal })
}

export async function canonicalAgentReconcileHandler(
  ctx: ActionCtx,
  args: Parameters<typeof reconcileCallHandler>[1],
): Promise<Infer<typeof recoveryResultValue>> {
  const principal = await canonicalAgentPrincipal(ctx, args.principal, { callRef: args.callRef })
  if (principal === null) return agentRecoveryNotFound(args.callRef)
  return await reconcileCallHandler(ctx, { ...args, principal })
}

export type CanonicalOwner = Extract<Awaited<ReturnType<typeof resolveBusinessActor>>, { kind: 'authenticated_owner' }>

export async function canonicalOwnerContext<T extends QueryCtx | MutationCtx | ActionCtx>(
  ctx: T,
  actor: CanonicalOwner,
): Promise<T> {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) throw new Error('canonical_owner_identity_missing')
  const auth = new Proxy(ctx.auth, {
    get(target, property, receiver) {
      return property === 'getUserIdentity'
        ? async () => ({
            ...identity,
            subject: actor.canonicalPrincipalRef,
            tokenIdentifier: actor.canonicalAccountRef,
          })
        : Reflect.get(target, property, receiver)
    },
  })
  return new Proxy(ctx, {
    get(target, property, receiver) {
      return property === 'auth' ? auth : Reflect.get(target, property, receiver)
    },
  })
}

export async function canonicalOwnerActor<T extends QueryCtx | MutationCtx | ActionCtx>(
  ctx: T,
): Promise<{ actor: CanonicalOwner; ctx: T } | null> {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return null
  return { actor, ctx: await canonicalOwnerContext(ctx, actor) }
}

export async function canonicalOwnerApprovalListHandler(ctx: QueryCtx) {
  const canonical = await canonicalOwnerActor(ctx)
  return canonical === null ? [] : await listPendingCallApprovalsHandler(canonical.ctx)
}

export async function canonicalOwnerApprovalDecisionHandler(
  ctx: MutationCtx,
  args: Parameters<typeof decideCallApprovalHandler>[1],
) {
  const canonical = await canonicalOwnerActor(ctx)
  return canonical === null
    ? { kind: 'refused' as const, code: 'authentication_required' as const }
    : await decideCallApprovalHandler(canonical.ctx, args)
}

export async function canonicalOwnerStatusHandler(
  ctx: ActionCtx,
  args: Parameters<typeof readOwnerCallStatusHandler>[1],
) {
  const canonical = await canonicalOwnerActor(ctx)
  return canonical === null
    ? agentStatusNotFound(args.callRef)
    : await readOwnerCallStatusHandler(canonical.ctx, args)
}

export async function canonicalOwnerCancelHandler(
  ctx: ActionCtx,
  args: Parameters<typeof cancelOwnerCallHandler>[1],
) {
  const canonical = await canonicalOwnerActor(ctx)
  return canonical === null
    ? agentRecoveryNotFound(args.callRef)
    : await cancelOwnerCallHandler(canonical.ctx, args)
}

export async function canonicalOwnerReconcileHandler(
  ctx: ActionCtx,
  args: Parameters<typeof reconcileOwnerCallHandler>[1],
) {
  const canonical = await canonicalOwnerActor(ctx)
  return canonical === null
    ? agentRecoveryNotFound(args.callRef)
    : await reconcileOwnerCallHandler(canonical.ctx, args)
}
