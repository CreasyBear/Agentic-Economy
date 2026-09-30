import { degradeBackend } from '../../../../src/lib/observability/degrade-backend'
import { recordCallTerminal } from '@/lib/observability/journey'
import { internal } from '../../../_generated/api'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import { readCurrentPublishedTool } from '../../capabilitySupply/currentTool/reads'
import { enqueueCallDispatch } from './dispatchEnqueue'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { exactAmountSchema, pricingConfigDecisionAmount } from '@/modules/money/public'
import { isBoundedJsonValue } from '@/modules/capability-contract/public'
import { isRecord } from '@/modules/common/is-record'
import { createPublicToolRef, isPublicToolRef } from '@/modules/capability-supply/public'
import {
  materializeRuntimePublishedTool,
  parsePublishedToolSnapshot,
  type PublishedTool,
  type RuntimePublishedToolDescriptor,
} from '@/modules/capability-supply/public'
import {
  buildCallAuthority,
  type CallApprovedAuthority,
  type CallGrant,
} from '@/modules/capability-execution/call-authority'
import { currentToolQuotesMatch } from '@/modules/capability-execution/current-tool-quote'
import type { CallApprovalDecisionContext } from '@/modules/capability-execution/call-approval-contracts'
import {
  normalizeStoredAgentAccessGrant,
  type NormalizedStoredAgentAccessGrant,
} from '@/modules/agent-access/policy'
import type { ApprovalDecisionResult, PendingApprovalView } from './admissionApproval'
import type { CallRow, GrantRow } from './contracts'
import {
  financialStateHasReleaseUncertainty,
  isBuyerFormanceReservation,
  refundReconciliation,
} from './dispatchRefusal'
import { parseWorkloadCronSnapshot } from '../../platform/workloadCron/context'
import { reconcileWorkloadCronSnapshot } from '../../platform/workloadCron/admission'

export const AUTHORITY_REQUEST_TTL_MS = 60 * 60 * 1000

function parseJsonObject(value: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(value)
    return isRecord(parsed) && isBoundedJsonValue(parsed) ? parsed : undefined
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'parseJsonObject', reason: 'invalid_response' })
  }
}

function publicOperationRef(operation: PublishedTool): string {
  return createPublicToolRef({
    operationId: operation.operationId,
    publicationRef: operation.identity.publicationRef,
    publicationRevision: operation.identity.publicationRevision,
    contractRef: operation.contract.ref,
  })
}

export async function listPendingCallApprovalsHandler(
  ctx: QueryCtx,
): Promise<PendingApprovalView[]> {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null || identity.tokenIdentifier.trim().length === 0) return []
  const now = Date.now()
  const rows = await ctx.db.query('capabilityCalls')
    .withIndex('by_ownerId_and_state_and_createdAt', (query) => (
      query.eq('ownerId', identity.tokenIdentifier).eq('state', 'pending')
    ))
    .order('desc')
    .take(50)
  const approvals = await Promise.all(rows.map(async (row): Promise<PendingApprovalView[]> => {
    if (row.grantExpiresAt <= now) return []
    if (!pendingApprovalRow(row)) return []
    if (row.result.callRef !== row.callRef || row.result.toolRef !== row.toolRef) return []
    return [{
      callRef: row.callRef,
      toolRef: row.toolRef,
      authorityRequest: structuredClone(row.result.authorityRequest),
      createdAt: row.createdAt,
      decisionContext: await approvalDecisionContext(ctx, row),
    }]
  }))
  return approvals.flat()
}

async function approvalDecisionContext(ctx: QueryCtx, row: PendingApprovalRow): Promise<CallApprovalDecisionContext> {
  const [currentDisplayName, acceptedQuote] = await Promise.all([
    approvalAgentName(ctx, row),
    acceptedApprovalQuote(ctx, row),
  ])
  return {
    agent: { principalRef: row.principalId, applicationRef: row.applicationRef, currentDisplayName },
    purpose: null,
    acceptedQuote,
  }
}

async function approvalAgentName(ctx: QueryCtx, row: CallRow): Promise<string | null> {
  const [principal, admission, membership] = await Promise.all([
    ctx.db.query('principals').withIndex('by_principalRef', (q) => q.eq('principalRef', row.principalId)).unique(),
    ctx.db.query('agentAccessPrincipals').withIndex('by_principalId', (q) => q.eq('principalId', row.principalId)).unique(),
    ctx.db.query('memberships').withIndex('by_accountRef_and_memberPrincipalRef_and_lifecycle', (q) => q
      .eq('accountRef', row.ownerId).eq('memberPrincipalRef', row.principalId).eq('lifecycle', 'active')).first(),
  ])
  return principal?.kind === 'agent' && principal.lifecycle === 'active'
    && membership !== null && admission !== null
    && admission.ownerId === row.ownerId && admission.applicationRef === row.applicationRef
    && admission.environment === row.environment
    ? principal.displayName : null
}

async function acceptedApprovalQuote(
  ctx: QueryCtx,
  row: PendingApprovalRow,
): Promise<CallApprovalDecisionContext['acceptedQuote']> {
  const quoteRef = row.quoteRef
  if (quoteRef === undefined) return { kind: 'unavailable', reason: 'quote_missing' }
  const quote = await ctx.db.query('capabilityQuotes')
    .withIndex('by_quoteRef', (q) => q.eq('quoteRef', quoteRef)).unique()
  if (quote === null) return { kind: 'unavailable', reason: 'quote_missing' }
  // A consumed Quote stays the accepted record after expiry. It must link to
  // this exact Call, Account, Agent, authority generation and input material.
  if (![quote.state === 'consumed', quote.consumedCallRef === row.callRef,
    quote.accountRef === row.ownerId, quote.principalId === row.principalId,
    quote.applicationRef === row.applicationRef, quote.credentialId === row.credentialId,
    quote.environment === row.environment, quote.grantRef === row.grantRef,
    quote.grantGeneration === row.grantGeneration, quote.grantPolicyDigest === row.policyDigest,
    quote.grantExpiresAt === row.grantExpiresAt, quote.toolRef === row.toolRef,
    quote.inputDigest === row.inputDigest, quote.normalizedInputJson === row.inputJson,
    quote.toolJson === row.toolJson,
  ].every(Boolean)) return { kind: 'unavailable', reason: 'quote_mismatch' }
  const material = loadApprovalMaterial(row)
  const maximumSpend = { currency: 'AUD', units: quote.decisionAudUnits, exponent: 6 } as const
  if (material === null || !exactAmountSchema.safeParse(maximumSpend).success
    || quote.toolMaterialDigest !== material.operation.materialDigest
    || quote.toolVersion !== material.operation.identity.publicationRevision
    || !approvalRequestMatches(row, material.operation, materializeRuntimePublishedTool(material.operation))) {
    return { kind: 'unavailable', reason: 'material_invalid' }
  }
  const contract = material.operation.contract
  return {
    kind: 'available', quoteRef: quote.quoteRef,
    tool: { name: contract.name, description: contract.description },
    provider: { ref: material.operation.identity.businessId, name: null },
    maximumSpend,
    dataUse: structuredClone(contract.dataUse), effects: structuredClone(contract.effects),
  }
}

type NeedsAuthorityResult = Extract<NonNullable<CallRow['result']>, { kind: 'needs_authority' }>
type PendingApprovalRow = CallRow & { result: NeedsAuthorityResult }

type ApprovalMaterial = Readonly<{
  input: Record<string, unknown>
  operation: PublishedTool
}>

type ApprovalRuntime = Readonly<{
  operation: PublishedTool
  descriptor: RuntimePublishedToolDescriptor
}>

async function authenticatedOwnerRef(ctx: MutationCtx): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) return null
  const ownerRef = identity.tokenIdentifier.trim()
  return ownerRef.length === 0 ? null : identity.tokenIdentifier
}

function replayedApprovalDecision(
  row: CallRow,
  decision: 'approve' | 'deny',
): ApprovalDecisionResult | null {
  const result = row.result
  if (decision === 'deny') {
    const replayed = [
      row.state === 'refused',
      result?.kind === 'refused',
      result?.kind === 'refused' && result.code === 'authority_denied',
    ].every(Boolean)
    return replayed ? { kind: 'replayed', callRef: row.callRef } : null
  }
  const replayed = [
    row.state === 'pending',
    result?.kind === 'pending',
    row.workId !== undefined,
    row.authority !== undefined,
  ].every(Boolean)
  return replayed ? { kind: 'replayed', callRef: row.callRef } : null
}

function pendingApprovalRow(row: CallRow): row is PendingApprovalRow {
  return row.state === 'pending' && row.result?.kind === 'needs_authority'
}

function pendingApprovalIsClean(row: PendingApprovalRow): boolean {
  return row.workId === undefined && row.authority === undefined
}

async function refusePendingApproval(
  ctx: MutationCtx,
  row: PendingApprovalRow,
  nextAction: string,
): Promise<ApprovalDecisionResult> {
  if (financialStateHasReleaseUncertainty(row)) return { kind: 'refused', code: 'invocation_invalid' }
  const now = Date.now()
  const releaseRequired = isBuyerFormanceReservation(row)
  recordCallTerminal(row.state, 'refused')
  await ctx.db.patch(row._id, {
    state: 'refused',
    dispatchState: 'failed',
    result: {
      kind: 'refused',
      toolRef: row.toolRef,
      code: 'authority_denied',
      retryable: false,
      nextAction,
    },
    ...(releaseRequired ? { reconciliation: refundReconciliation(now) } : {}),
    updatedAt: now,
  })
  if (releaseRequired) {
    await ctx.scheduler.runAfter(0, internal.capabilityCallWorker.reconcilePreClaimRefund, {
      callRef: row.callRef,
    })
  }
  return { kind: 'denied', callRef: row.callRef }
}

async function denyPendingApproval(ctx: MutationCtx, row: PendingApprovalRow): Promise<ApprovalDecisionResult> {
  return await refusePendingApproval(ctx, row, 'The owner declined this operation.')
}

export async function expireStalePendingApprovalsHandler(
  ctx: MutationCtx,
  args: Readonly<{ workload: unknown }>,
): Promise<{ scanned: number; expired: number }> {
  const workload = parseWorkloadCronSnapshot(args.workload)
  await reconcileWorkloadCronSnapshot(ctx, 'expire stale pending approvals', workload)
  const cutoff = Date.now() - AUTHORITY_REQUEST_TTL_MS
  const rows = await ctx.db.query('capabilityCalls')
    .withIndex('by_state_and_result_kind_and_createdAt', (query) => query
      .eq('state', 'pending')
      .eq('result.kind', 'needs_authority')
      .lte('createdAt', cutoff))
    .take(200)
  let expired = 0
  for (const row of rows) {
    if (!pendingApprovalRow(row) || !pendingApprovalIsClean(row)) continue
    const result = await refusePendingApproval(ctx, row, 'The approval request expired before the owner decided.')
    if (result.kind === 'denied') expired += 1
  }
  return { scanned: rows.length, expired }
}

function loadApprovalMaterial(row: PendingApprovalRow): ApprovalMaterial | null {
  if (!isPublicToolRef(row.toolRef)) return null
  if (row.inputJson === undefined || row.toolJson === undefined) return null
  const input = parseJsonObject(row.inputJson)
  const operation = parsePublishedToolSnapshot(row.toolJson)
  if (input === undefined || operation === undefined) return null
  if (publicOperationRef(operation) !== row.toolRef) return null
  try {
    const digestsMatch = [
      canonicalDigest(input) === row.inputDigest,
      canonicalDigest({ toolRef: row.toolRef, input }) === row.requestDigest,
    ].every(Boolean)
    return digestsMatch ? { input, operation } : null
  } catch (cause) {
    return degradeBackend(cause, null, { site: 'loadApprovalMaterial', reason: 'invalid_response' })
  }
}

function approvalRequestMatches(
  row: PendingApprovalRow,
  operation: PublishedTool,
  descriptor: RuntimePublishedToolDescriptor,
): boolean {
  const maximumSpend = pricingConfigDecisionAmount(operation.pricingConfig)
  if (maximumSpend === undefined) return false
  const expected = {
    kind: 'approval_required' as const,
    toolRef: row.toolRef,
    consequence: descriptor.consequenceClass,
    retryClass: descriptor.retryClass,
    maximumSpend,
    dataFields: [...descriptor.materialInputPointers],
  }
  try {
    return canonicalDigest(row.result.authorityRequest as never) === canonicalDigest(expected as never)
  } catch (cause) {
    return degradeBackend(cause, false, { site: 'approvalRequestMatches', reason: 'invalid_response' })
  }
}

async function loadApprovalRuntime(
  ctx: MutationCtx,
  row: PendingApprovalRow,
  material: ApprovalMaterial,
  now: number,
): Promise<ApprovalRuntime | null> {
  let operation: PublishedTool | undefined
  try {
    operation = await readCurrentPublishedTool(ctx, row.toolRef, now)
  } catch (cause) {
    return degradeBackend(cause, null, { site: 'loadApprovalRuntime', reason: 'invalid_response' })
  }
  if (operation === undefined) return null
  const commitmentsMatch = [
    publicOperationRef(operation) === row.toolRef,
    currentToolQuotesMatch({
      toolRef: row.toolRef,
      pinned: material.operation,
      current: operation,
    }),
  ].every(Boolean)
  if (!commitmentsMatch) return null
  try {
    const descriptor = materializeRuntimePublishedTool(operation)
    return approvalRequestMatches(row, operation, descriptor) ? { operation, descriptor } : null
  } catch (cause) {
    return degradeBackend(cause, null, { site: 'loadApprovalRuntime', reason: 'invalid_response' })
  }
}

function currentApprovalGrant(
  grant: GrantRow | null,
  row: CallRow,
  now: number,
): NormalizedStoredAgentAccessGrant | null {
  if (grant === null) return null
  let normalized: NormalizedStoredAgentAccessGrant
  try {
    normalized = normalizeStoredAgentAccessGrant(grant)
  } catch (cause) {
    return degradeBackend(cause, null, { site: 'currentApprovalGrant', reason: 'invalid_response' })
  }
  const current = [
    normalized.lifecycle === 'active',
    normalized.authorityMode === 'approval_required',
    normalized.expiresAt > now,
    normalized.principalId === row.principalId,
    normalized.ownerId === row.ownerId,
    normalized.credentialId === row.credentialId,
    normalized.applicationRef === row.applicationRef,
    normalized.environment === row.environment,
    normalized.generation === row.grantGeneration,
    normalized.spendingPolicyDigest === row.policyDigest,
    normalized.expiresAt === row.grantExpiresAt,
  ].every(Boolean)
  return current ? normalized : null
}

function operationGrantFromRow(grant: NormalizedStoredAgentAccessGrant): CallGrant {
  return {
    grantRef: grant.grantRef,
    principalId: grant.principalId,
    ownerId: grant.ownerId,
    applicationRef: grant.applicationRef,
    credentialId: grant.credentialId,
    environment: grant.environment,
    generation: grant.generation,
    policyDigest: grant.spendingPolicyDigest,
    expiresAt: grant.expiresAt,
    lifecycle: 'active',
    toolAccess: grant.toolAccess,
    toolRefs: grant.toolRefs,
  }
}

function approvedAuthority(grant: Readonly<{ expiresAt: number }>, row: CallRow): CallApprovedAuthority {
  return {
    kind: 'approved',
    basis: {
      kind: 'approval_required',
      authorityRef: `owner-approval:${canonicalDigest({
        callRef: row.callRef,
        ownerId: row.ownerId,
      }).slice(7)}`,
    },
    expiresAt: new Date(grant.expiresAt).toISOString(),
  }
}

async function approvePendingInvocation(
  ctx: MutationCtx,
  row: PendingApprovalRow,
  runtime: ApprovalRuntime,
  now: number,
): Promise<ApprovalDecisionResult> {
  const grant = await ctx.db.query('agentAccessGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', row.grantRef))
    .unique()
  const currentGrant = currentApprovalGrant(grant, row, now)
  if (currentGrant === null) return { kind: 'refused', code: 'grant_not_current' }
  const authority = buildCallAuthority({
    authority: approvedAuthority(currentGrant, row),
    grant: operationGrantFromRow(currentGrant),
    operation: runtime.operation,
    descriptor: runtime.descriptor,
    toolRef: row.toolRef,
    callRef: row.callRef,
    inputDigest: row.inputDigest,
    now,
  })
  if (authority === undefined) return { kind: 'refused', code: 'invocation_invalid' }
  const dispatched = await enqueueCallDispatch(ctx, row, authority, now)
  if (dispatched.kind === 'replayed') return { kind: 'replayed', callRef: row.callRef }
  return dispatched.kind === 'refused'
    ? { kind: 'refused', code: 'invocation_invalid' }
    : { kind: 'approved', callRef: row.callRef }
}

export async function decideCallApprovalHandler(
  ctx: MutationCtx,
  args: { callRef: string; decision: 'approve' | 'deny' },
): Promise<ApprovalDecisionResult> {
  const ownerRef = await authenticatedOwnerRef(ctx)
  if (ownerRef === null) return { kind: 'refused', code: 'authentication_required' }
  const row = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef))
    .unique()
  if (row === null || row.ownerId !== ownerRef) return { kind: 'refused', code: 'invocation_not_found' }
  const replay = replayedApprovalDecision(row, args.decision)
  if (replay !== null) return replay
  if (!pendingApprovalRow(row)) return { kind: 'refused', code: 'authority_not_pending' }
  if (!pendingApprovalIsClean(row)) return { kind: 'refused', code: 'invocation_invalid' }
  if (args.decision === 'deny') return await denyPendingApproval(ctx, row)
  if (Date.now() - row.createdAt > AUTHORITY_REQUEST_TTL_MS) {
    await refusePendingApproval(ctx, row, 'The approval request expired before the owner decided.')
    return { kind: 'refused', code: 'authority_not_pending' }
  }
  if (row.applicationRef === 'ae-owner-chat') {
    const quoteRef = row.quoteRef
    const quote = quoteRef === undefined ? null : await ctx.db.query('capabilityQuotes')
      .withIndex('by_quoteRef', q => q.eq('quoteRef', quoteRef)).unique()
    const budget = await ctx.db.query('moneyMonthlySpendBudgets')
      .withIndex('by_accountRef', q => q.eq('accountRef', row.ownerId)).unique()
    const capUnits = [quote?.maximumSpendPerCallUnits,
      quote?.dailyPeriodAvailableUnits, quote?.monthlyPeriodAvailableUnits]
    if (quote === null || quote.consumedCallRef !== row.callRef || quote.expiresAt <= Date.now()
      || budget?.enabled || !/^\d+$/u.test(quote.decisionAudUnits)
      || capUnits.some(units => units === undefined || !/^\d+$/u.test(units)
        || BigInt(units) < BigInt(quote.decisionAudUnits))) {
      return { kind: 'refused', code: 'invocation_invalid' }
    }
  }
  const material = loadApprovalMaterial(row)
  if (material === null) return { kind: 'refused', code: 'invocation_invalid' }
  const now = Date.now()
  const runtime = await loadApprovalRuntime(ctx, row, material, now)
  if (runtime === null) return { kind: 'refused', code: 'invocation_invalid' }
  return await approvePendingInvocation(ctx, row, runtime, now)
}
