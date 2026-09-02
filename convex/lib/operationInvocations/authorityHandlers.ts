import { makeFunctionReference } from 'convex/server'
import type { Infer } from 'convex/values'
import type { Doc } from '../../_generated/dataModel'
import { internal } from '../../_generated/api'
import type { ActionCtx, MutationCtx, QueryCtx } from '../../_generated/server'
import { resolveBusinessActor } from '../../authz'
import { MARKET_OPERATIONS_INVOKE_SCOPE } from '@/modules/agent-access/contract'
import {
  normalizeStoredAgentAccessGrant,
  normalizeStoredAgentAccessGrantForOperation,
} from '@/modules/agent-access/policy'
import { uniqueSorted } from '@/modules/common/unique-sorted'
import {
  operationResultValue,
  recoveryResultValue,
  statusResultValue,
} from '@/modules/capability-execution/convex'
import {
  resolveCanonicalAgentContext,
  validateCanonicalAgentDelegation,
} from '../canonicalAgentAuthority'
import {
  decideOperationApprovalHandler,
  listPendingOperationApprovalsHandler,
} from './admission'
import {
  cancelInvocationHandler,
  cancelOwnerInvocationHandler,
  invokeHandler,
  listAgentInvocationsHandler,
  readInvocationStatusHandler,
  readOwnerInvocationStatusHandler,
  reconcileInvocationHandler,
  reconcileOwnerInvocationHandler,
} from './invokeActions'
import {
  invocationSummaryPageValue,
  reconciledInvocationAuthorityResult,
  type CurrentAgentAuthority,
  type OperationPrincipal,
  type ReconciledInvocationAuthority,
} from './contracts'
import { readExactSellerOnboardingCanaryPlatformGrantHandler } from '../../capabilitySupplyCanaryFunding'
import { inspectLiveX402RequirementRef } from '../liveX402RequirementRef'

export const resolveInvocationAgentAuthorityRef = makeFunctionReference<
  'mutation',
  { principal: OperationPrincipal; operationRef?: string; invocationRef?: string; receiptList?: true },
  OperationPrincipal | null
>('capabilityOperationInvocations:resolveInvocationAgentAuthority')

type CurrentAuthorityPurpose =
  | Readonly<{ kind: 'new_operation'; operationRef: string }>
  | Readonly<{ kind: 'persisted_invocation'; operationRef: string }>
  | Readonly<{ kind: 'receipt_list' }>

type InvocationAuthorityTarget = Readonly<{
  purpose: CurrentAuthorityPurpose
  invocation: Doc<'capabilityOperationInvocations'> | null
}>

function invocationMatchesCurrentAuthority(
  row: Doc<'capabilityOperationInvocations'>,
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

async function resolveInvocationAuthorityTarget(
  ctx: MutationCtx,
  args: Readonly<{ operationRef?: string; invocationRef?: string; receiptList?: true }>,
): Promise<InvocationAuthorityTarget | null> {
  const targetCount = Number(args.operationRef !== undefined)
    + Number(args.invocationRef !== undefined)
    + Number(args.receiptList === true)
  if (targetCount !== 1) return null
  if (args.operationRef !== undefined) {
    return { purpose: { kind: 'new_operation', operationRef: args.operationRef }, invocation: null }
  }
  if (args.receiptList === true) return { purpose: { kind: 'receipt_list' }, invocation: null }
  if (args.invocationRef === undefined) return null
  const invocationRef = args.invocationRef
  const rows = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', invocationRef))
    .take(2)
  if (rows.length !== 1) return null
  const [invocation] = rows
  return invocation === undefined
    ? null
    : {
        purpose: { kind: 'persisted_invocation', operationRef: invocation.operationRef },
        invocation,
      }
}

export async function resolveInvocationAgentAuthorityHandler(
  ctx: MutationCtx,
  args: Readonly<{ principal: OperationPrincipal; operationRef?: string; invocationRef?: string; receiptList?: true }>,
): Promise<OperationPrincipal | null> {
  const target = await resolveInvocationAuthorityTarget(ctx, args)
  if (target === null) return null
  const current = await resolveCurrentAgentAuthority(
    ctx,
    args.principal,
    Date.now(),
    target.purpose,
  )
  if (current === null) return null
  if (target.invocation !== null && !invocationMatchesCurrentAuthority(target.invocation, current)) return null
  return current.principal
}

export async function reconcileInvocationWorkloadAuthorityHandler(
  ctx: MutationCtx,
  args: Readonly<{ invocationRef: string }>,
): Promise<Infer<typeof reconciledInvocationAuthorityResult>> {
  const now = Date.now()
  const sellerCanaryAuthority = await reconcilePersistedSellerCanaryAuthority(
    ctx,
    args.invocationRef,
    now,
  )
  const authority = sellerCanaryAuthority === undefined
    ? await reconcilePersistedInvocationAuthority(ctx, args.invocationRef, now)
    : sellerCanaryAuthority
  if (authority === null) {
    await refuseInvocationBeforeEffectForInvalidAuthority(ctx, args.invocationRef, now)
    return { kind: 'refused' }
  }
  return { kind: 'authorized', authority }
}

function sellerCanaryDispatchAuthorityMatches(
  row: Doc<'capabilityOperationInvocations'>,
  canary: NonNullable<Doc<'capabilityOperationInvocations'>['sellerOnboardingCanary']>,
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
  invocationRef: string,
  now: number,
): Promise<ReconciledInvocationAuthority | null | undefined> {
  const row = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', invocationRef))
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
      policyDigest: row.policyDigest,
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
        policyDigest: grant.policyDigest,
        expiresAt: grant.expiresAt,
      })
}

export async function canonicalAgentPrincipal(
  ctx: ActionCtx,
  principal: OperationPrincipal,
  target: Readonly<{ operationRef: string } | { invocationRef: string } | { receiptList: true }>,
): Promise<OperationPrincipal | null> {
  return await ctx.runMutation(resolveInvocationAgentAuthorityRef, { principal, ...target })
}

type CanonicalAgentContext = NonNullable<Awaited<ReturnType<typeof resolveCanonicalAgentContext>>>
type StoredAgent = Doc<'agentAccessPrincipals'>
type ActiveGrant = Doc<'agentAccessGrants'>

function validAuthorityRequest(candidate: OperationPrincipal, now: number, purpose: CurrentAuthorityPurpose): boolean {
  return [
    Number.isSafeInteger(now),
    now >= 0,
    purpose.kind === 'receipt_list' || purpose.operationRef.trim().length > 0,
    candidate.scopes.includes(MARKET_OPERATIONS_INVOKE_SCOPE),
  ].every(Boolean)
}

function candidateMatchesCanonical(candidate: OperationPrincipal, canonical: CanonicalAgentContext): boolean {
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
  candidate: OperationPrincipal,
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
    stored.scopes.includes(MARKET_OPERATIONS_INVOKE_SCOPE),
    scopeSubset(candidate.scopes, stored.scopes),
  ].every(Boolean)
}

async function loadCurrentStoredAgent(
  ctx: MutationCtx,
  candidate: OperationPrincipal,
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
  grant: ActiveGrant,
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
    grant.policyDigest === stored.policyDigest,
    grant.expiresAt > now,
    grant.expiresAt <= canonical.credentialExpiresAt,
  ].every(Boolean)
}

async function loadCurrentActiveGrant(
  ctx: MutationCtx,
  stored: StoredAgent,
  canonical: CanonicalAgentContext,
  now: number,
): Promise<ActiveGrant | null> {
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
  const [grant] = activeGrants
  if (grant === undefined) return null
  return activeGrantMatches(grant, stored, canonical, now) ? grant : null
}

function delegationResourceForPurpose(
  grant: ActiveGrant,
  purpose: CurrentAuthorityPurpose,
): string | undefined {
  if (purpose.kind === 'persisted_invocation') return purpose.operationRef
  if (purpose.kind === 'new_operation') {
    return normalizeStoredAgentAccessGrantForOperation(grant, purpose.operationRef) === undefined
      ? undefined
      : purpose.operationRef
  }
  try {
    const normalized = normalizeStoredAgentAccessGrant(grant)
    return normalized.operationAccess === 'all_admitted' ? '*' : normalized.operationRefs[0]
  } catch {
    return undefined
  }
}

export async function resolveCurrentAgentAuthority(
  ctx: MutationCtx,
  candidate: OperationPrincipal,
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
  const delegation = await validateCanonicalAgentDelegation(ctx, {
    evidenceKind: purpose.kind === 'receipt_list' ? 'operation-receipt-list' : 'operation-public-admission',
    evidenceRef: resourceRef,
    principalRef: canonical.principalRef,
    accountRef: canonical.accountRef,
    grantRef: grant.grantRef,
    grantGeneration: grant.generation,
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
    policyDigest: grant.policyDigest,
    expiresAt: grant.expiresAt,
  })
}

export async function validatePersistedInvocationDelegation(
  ctx: MutationCtx,
  input: Readonly<{
    invocationRef: string
    operationRef: string
    principalId: string
    accountRef: string
    grantRef: string
    grantGeneration: number
  }>,
): Promise<boolean> {
  return await validateCanonicalAgentDelegation(ctx, {
    evidenceKind: 'operation-workload-reconciliation',
    evidenceRef: input.invocationRef,
    principalRef: input.principalId,
    accountRef: input.accountRef,
    grantRef: input.grantRef,
    grantGeneration: input.grantGeneration,
    requiredScopes: [MARKET_OPERATIONS_INVOKE_SCOPE],
    resourceRefs: [input.operationRef],
    now: Date.now(),
  }) !== null
}

export async function reconcilePersistedInvocationAuthority(
  ctx: MutationCtx,
  invocationRef: string,
  now: number,
): Promise<ReconciledInvocationAuthority | null> {
  const row = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', invocationRef))
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
  }, now, { kind: 'persisted_invocation', operationRef: row.operationRef })
  if (current === null) return null
  if (!invocationMatchesCurrentAuthority(row, current)) return null
  const delegationIsCurrent = await validatePersistedInvocationDelegation(ctx, {
    invocationRef: row.invocationRef,
    operationRef: row.operationRef,
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

export async function refuseInvocationBeforeEffectForInvalidAuthority(
  ctx: MutationCtx,
  invocationRef: string,
  now: number,
): Promise<void> {
  const [row, control] = await Promise.all([
    ctx.db.query('capabilityOperationInvocations')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', invocationRef))
      .unique(),
    ctx.db.query('actionInvocationControls')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', invocationRef))
      .unique(),
  ])
  if (row === null || row.state !== 'pending' || control !== null) return
  await ctx.db.patch(row._id, {
    state: 'refused',
    dispatchState: 'failed',
    result: {
      kind: 'refused',
      operationRef: row.operationRef,
      code: 'grant_not_found',
      retryable: false,
      nextAction: 'Refresh the agent grant and retry.',
    },
    updatedAt: now,
  })
}

export function agentRecoveryNotFound(invocationRef: string): Infer<typeof recoveryResultValue> {
  return { kind: 'refused', invocationRef, code: 'invocation_not_found', retryable: false }
}

export function agentStatusNotFound(invocationRef: string): Infer<typeof statusResultValue> {
  return { kind: 'refused', invocationRef, code: 'invocation_not_found', retryable: false }
}

export async function canonicalAgentInvokeHandler(
  ctx: ActionCtx,
  args: Readonly<{
    operationKey: string
    correlationId: string
    sourceWrite?: unknown
    sourceWriteRequest?: unknown
    principal: OperationPrincipal
    commitmentRef: string
    idempotencyKey: string
  }>,
): Promise<Infer<typeof operationResultValue>> {
  const sourceAdmitted = await ctx.runMutation(
    internal.capabilityOperationCommitments.admitInvocation,
    args as never,
  )
  if (!sourceAdmitted) {
    return { kind: 'refused', code: 'invocation_runtime_unavailable', retryable: true }
  }
  const material = await ctx.runQuery(internal.capabilityOperationCommitments.readForInvocation, {
    principal: args.principal,
    commitmentRef: args.commitmentRef,
    idempotencyKey: args.idempotencyKey,
    now: Date.now(),
  })
  if (material === null) {
    return { kind: 'refused', code: 'operation_not_current', retryable: false }
  }
  if (material.x402RequirementDigest !== undefined) {
    const live = await ctx.runAction(inspectLiveX402RequirementRef, {
      operationRef: material.operationRef,
      input: material.input,
    })
    if (live.kind !== 'observed'
      || live.requirement.requirementDigest !== material.x402RequirementDigest) {
      return {
        kind: 'refused',
        operationRef: material.operationRef,
        code: 'operation_not_current',
        retryable: false,
        nextAction: 'operation.inspect',
      }
    }
  }
  const principal = await canonicalAgentPrincipal(ctx, args.principal, { operationRef: material.operationRef })
  if (principal === null) {
    return { kind: 'refused', operationRef: material.operationRef, code: 'grant_not_found', retryable: false }
  }
  return await invokeHandler(ctx, {
    commitmentRef: material.commitmentRef,
    operationKey: args.operationKey,
    correlationId: args.correlationId,
    principal,
    operationRef: material.operationRef,
    input: material.input,
    decisionPrice: material.decisionPrice,
    idempotencyKey: args.idempotencyKey,
  }, true)
}

export async function canonicalAgentListHandler(
  ctx: ActionCtx,
  args: Parameters<typeof listAgentInvocationsHandler>[1],
): Promise<Infer<typeof invocationSummaryPageValue>> {
  const principal = await canonicalAgentPrincipal(ctx, args.principal, { receiptList: true })
  if (principal === null) throw new Error('agent_invocation_list_unauthorized')
  return await listAgentInvocationsHandler(ctx, { ...args, principal })
}

export async function canonicalAgentStatusHandler(
  ctx: ActionCtx,
  args: Parameters<typeof readInvocationStatusHandler>[1],
): Promise<Infer<typeof statusResultValue>> {
  const principal = await canonicalAgentPrincipal(ctx, args.principal, { invocationRef: args.invocationRef })
  if (principal === null) return agentStatusNotFound(args.invocationRef)
  return await readInvocationStatusHandler(ctx, { ...args, principal })
}

export async function canonicalAgentCancelHandler(
  ctx: ActionCtx,
  args: Parameters<typeof cancelInvocationHandler>[1],
): Promise<Infer<typeof recoveryResultValue>> {
  const principal = await canonicalAgentPrincipal(ctx, args.principal, { invocationRef: args.invocationRef })
  if (principal === null) return agentRecoveryNotFound(args.invocationRef)
  return await cancelInvocationHandler(ctx, { ...args, principal })
}

export async function canonicalAgentReconcileHandler(
  ctx: ActionCtx,
  args: Parameters<typeof reconcileInvocationHandler>[1],
): Promise<Infer<typeof recoveryResultValue>> {
  const principal = await canonicalAgentPrincipal(ctx, args.principal, { invocationRef: args.invocationRef })
  if (principal === null) return agentRecoveryNotFound(args.invocationRef)
  return await reconcileInvocationHandler(ctx, { ...args, principal })
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
  return canonical === null ? [] : await listPendingOperationApprovalsHandler(canonical.ctx)
}

export async function canonicalOwnerApprovalDecisionHandler(
  ctx: MutationCtx,
  args: Parameters<typeof decideOperationApprovalHandler>[1],
) {
  const canonical = await canonicalOwnerActor(ctx)
  return canonical === null
    ? { kind: 'refused' as const, code: 'authentication_required' as const }
    : await decideOperationApprovalHandler(canonical.ctx, args)
}

export async function canonicalOwnerStatusHandler(
  ctx: ActionCtx,
  args: Parameters<typeof readOwnerInvocationStatusHandler>[1],
) {
  const canonical = await canonicalOwnerActor(ctx)
  return canonical === null
    ? agentStatusNotFound(args.invocationRef)
    : await readOwnerInvocationStatusHandler(canonical.ctx, args)
}

export async function canonicalOwnerCancelHandler(
  ctx: ActionCtx,
  args: Parameters<typeof cancelOwnerInvocationHandler>[1],
) {
  const canonical = await canonicalOwnerActor(ctx)
  return canonical === null
    ? agentRecoveryNotFound(args.invocationRef)
    : await cancelOwnerInvocationHandler(canonical.ctx, args)
}

export async function canonicalOwnerReconcileHandler(
  ctx: ActionCtx,
  args: Parameters<typeof reconcileOwnerInvocationHandler>[1],
) {
  const canonical = await canonicalOwnerActor(ctx)
  return canonical === null
    ? agentRecoveryNotFound(args.invocationRef)
    : await reconcileOwnerInvocationHandler(canonical.ctx, args)
}
