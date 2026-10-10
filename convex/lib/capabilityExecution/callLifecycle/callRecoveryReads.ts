import {pricingConfigDigest} from '@/modules/money/public'
import { v, type Infer } from 'convex/values'
import { paginationOptsValidator, type PaginationOptions } from 'convex/server'
import { degradeBackend } from '../../../../src/lib/observability/degrade-backend'
import type { QueryCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import { isBoundedJsonValue, type JsonValue } from '@/modules/capability-contract/public'
import { isRecord } from '@/modules/common/is-record'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { OwnerCallContext } from '@/modules/capability-execution/call-recovery-contracts'
import { callResultValue, usageValue } from '@/modules/capability-execution/convex'
import { createPublicToolRef, parsePublishedToolSnapshot } from '@/modules/capability-supply/public'
import { assertCallResultJson } from './callIdentity'
import { callState, environment, ownerCallContextValue, recoveryValue } from './contracts'
import { readMeasurementEvidence } from '../serviceUsage/lineage'
import { readCallAttemptEvidence } from './attemptEvidence'
import { readProviderUnitEvidence } from '../serviceUsage/providerObservations'

export const readRecoveryArgs = { callRef: v.string(), principalId: v.string() } as const
export const readOwnerRecoveryArgs = { callRef: v.string() } as const
export const readOwnerReceiptContextArgs = { callRef: v.string(), ownerId: v.string(), toolRef: v.string(), observedAt: v.optional(v.number()) } as const
export const listAgentCallSummariesArgs = {
  principalId: v.string(),
  ownerId: v.string(),
  credentialId: v.string(),
  applicationRef: v.string(),
  environment,
  state: v.optional(callState),
  paginationOpts: paginationOptsValidator,
} as const
export const readRecoveryResult = v.union(recoveryValue, v.null())
export const watchOwnerCallStateArgs = { callRef: v.string() } as const
export const watchOwnerCallStateResult = v.union(v.null(), v.object({ state: callState, updatedAt: v.number() }))
export const readOwnerReceiptContextResult = v.union(ownerCallContextValue, v.null())

type CallRow = Doc<'capabilityCalls'>
type CallResultValue = Infer<typeof callResultValue>
type Usage = Infer<typeof usageValue>
type CallListState = CallRow['state']

function receiptRefFromResult(result: CallResultValue | undefined): string | undefined {
  return result !== undefined && 'receipt' in result ? result.receipt?.receiptRef : undefined
}

export async function listAgentCallSummariesHandler(
  ctx: QueryCtx,
  args: Readonly<{
    principalId: string
    ownerId: string
    credentialId: string
    applicationRef: string
    environment: 'sandbox' | 'production'
    state?: CallListState
    paginationOpts: PaginationOptions
  }>,
) {
  const state = args.state
  const source = state === undefined
    ? ctx.db.query('capabilityCalls')
        .withIndex('by_principalId_and_createdAt', (query) => query.eq('principalId', args.principalId))
        .order('desc')
    : ctx.db.query('capabilityCalls')
        .withIndex('by_principalId_and_state', (query) => query.eq('principalId', args.principalId).eq('state', state))
        .order('desc')
  const page = await source.paginate(args.paginationOpts)
  return {
    ...page,
    page: page.page
      .filter((row) => row.principalId === args.principalId
        && row.ownerId === args.ownerId
        && row.applicationRef === args.applicationRef
        && row.environment === args.environment)
      .map((row) => {
        const receiptRef = receiptRefFromResult(row.result)
        return {
          callRef: row.callRef,
          toolRef: row.toolRef,
          state: row.state,
          ...(row.result === undefined ? {} : { resultKind: row.result.kind }),
          ...(row.usage === undefined ? {} : { usage: row.usage }),
          ...(receiptRef === undefined ? {} : { receiptRef }),
          ...(row.evidenceHash === undefined ? {} : { evidenceHash: row.evidenceHash }),
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }
      }),
  }
}

export type RecoveryRow = Readonly<{
  requiresManualSettlementReview?: true
  quoteRef?: string
  callRef: string
  principalId: string
  ownerId: string
  credentialId: string
  applicationRef: string
  environment: 'sandbox' | 'production'
  state: 'pending' | 'completed' | 'refused' | 'reconciliation_required' | 'cancelled'
  toolRef: string
  inputDigest: string
  requestDigest: string
  grantGeneration: number
  grantRef: string
  toolJson: string
  inputJson: string
  result?: CallResultValue
  usage?: Usage
  evidenceHash?: string
  attemptRef?: string
  updatedAt: number
}>

export type ReplayRow = Readonly<{
  toolRef: string
  state: 'pending' | 'completed' | 'refused' | 'reconciliation_required' | 'cancelled'
  result?: CallResultValue
  usage?: Usage
  evidenceHash?: string
  attemptRef?: string
}>

function projectRecoveryRow(row: CallRow): RecoveryRow | null {
  if (row.toolJson === undefined || row.inputJson === undefined) return null
  if (row.result !== undefined) assertCallResultJson(row.result)
  return {
    ...(row.state === 'reconciliation_required'
      && row.reconciliation?.disposition === 'manual_review'
      && row.reconciliation.reason === 'unknown_settlement'
      ? { requiresManualSettlementReview: true as const } : {}),
    ...(row.quoteRef === undefined ? {} : { quoteRef: row.quoteRef }),
    callRef: row.callRef,
    principalId: row.principalId,
    ownerId: row.ownerId,
    credentialId: row.credentialId,
    applicationRef: row.applicationRef,
    environment: row.environment,
    state: row.state,
    toolRef: row.toolRef,
    inputDigest: row.inputDigest,
    requestDigest: row.requestDigest,
    grantGeneration: row.grantGeneration,
    grantRef: row.grantRef,
    toolJson: row.toolJson,
    inputJson: row.inputJson,
    ...(row.result === undefined ? {} : { result: row.result }),
    ...(row.usage === undefined ? {} : { usage: row.usage }),
    ...(row.evidenceHash === undefined ? {} : { evidenceHash: row.evidenceHash }),
    ...(row.attemptRef === undefined ? {} : { attemptRef: row.attemptRef }),
    updatedAt: row.updatedAt,
  }
}

export async function readOwnerReceiptContextHandler(
  ctx: QueryCtx,
  args: { callRef: string; ownerId: string; toolRef: string; observedAt?: number },
): Promise<OwnerCallContext | null> {
  // Internal owner read only, called after the same authorization used by
  // reconcileOwnerCall. Re-check linkage before reading any identity metadata.
  const row = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (q) => q.eq('callRef', args.callRef)).unique()
  if (row === null || row.ownerId !== args.ownerId || row.toolRef !== args.toolRef) return null
  const [principal, admission, membership] = await Promise.all([
    ctx.db.query('principals').withIndex('by_principalRef', (q) => q.eq('principalRef', row.principalId)).unique(),
    ctx.db.query('agentAccessPrincipals').withIndex('by_principalId', (q) => q.eq('principalId', row.principalId)).unique(),
    ctx.db.query('memberships').withIndex('by_accountRef_and_memberPrincipalRef_and_lifecycle', (q) => q
      .eq('accountRef', row.ownerId).eq('memberPrincipalRef', row.principalId).eq('lifecycle', 'active')).first(),
  ])
  const currentDisplayName = principal?.kind === 'agent' && principal.lifecycle === 'active'
    && membership !== null && admission !== null
    && admission.ownerId === row.ownerId && admission.applicationRef === row.applicationRef
    && admission.environment === row.environment ? principal.displayName : null
  const usage = args.observedAt === undefined ? null : await ctx.db.query('capabilityServiceUsageRecords').withIndex('by_callRef', q => q.eq('callRef', row.callRef)).unique()
  const serviceUsageEvidence = args.observedAt === undefined ? undefined : usage === null ? { kind: 'not_recorded' as const }
    : await readMeasurementEvidence(ctx, usage, args.observedAt, args.observedAt, row)
  return {
    purpose: null,
    ...(serviceUsageEvidence === undefined ? {} : { serviceUsageEvidence }),
    ...(args.observedAt === undefined ? {} : { providerUnitEvidence: await readProviderUnitEvidence(ctx, row, args.observedAt, args.observedAt) }),
    attemptEvidence: await readCallAttemptEvidence(ctx, row),
    agent: { principalRef: row.principalId, applicationRef: row.applicationRef, currentDisplayName },
    recordedTool: recordedReceiptTool(row),
    ...recordedTariff(row),
    reconciliation: { canSubmitEvidence: true, permissionBasis: 'account_owner', requiresVerifiedEvidence: true },
  }
}

function recordedReceiptTool(row: CallRow): OwnerCallContext['recordedTool'] {
  const unavailable = { kind: 'unavailable' } as const
  if (row.toolJson === undefined || row.inputJson === undefined) return unavailable
  const tool = parsePublishedToolSnapshot(row.toolJson)
  const input = parseOwnerPreviousInput(row.inputJson)
  if (tool === undefined || input === undefined) return unavailable
  const toolRef = createPublicToolRef({
    operationId: tool.operationId, publicationRef: tool.identity.publicationRef,
    publicationRevision: tool.identity.publicationRevision, contractRef: tool.contract.ref,
  })
  if (toolRef !== row.toolRef || tool.runtimeEnvironment !== row.environment
    || canonicalDigest(input) !== row.inputDigest
    || canonicalDigest({ operationRef: row.toolRef, input }) !== row.requestDigest) return unavailable
  return {
    kind: 'available', basis: 'call_snapshot', name: tool.contract.name,
    providerRef: tool.identity.businessId, providerName: null,
  }
}

export function parseOwnerPreviousInput(inputJson: string): Record<string, JsonValue> | undefined {
  try {
    const value: unknown = JSON.parse(inputJson)
    return isRecord(value) && isBoundedJsonValue(value)
      ? value as Record<string, JsonValue>
      : undefined
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'parseOwnerPreviousInput', reason: 'invalid_response' })
  }
}

export async function readRecoveryHandler(
  ctx: QueryCtx,
  args: { callRef: string; principalId: string },
): Promise<RecoveryRow | null> {
  const row = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef)).unique()
  if (row === null || row.principalId !== args.principalId) return null
  return projectRecoveryRow(row)
}

export async function readOwnerRecoveryHandler(
  ctx: QueryCtx,
  args: { callRef: string },
): Promise<RecoveryRow | null> {
  const row = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef)).unique()
  return row === null ? null : projectRecoveryRow(row)
}

function recordedTariff(row:CallRow):Pick<OwnerCallContext,'recordedTariff'>{
  if(recordedReceiptTool(row).kind!=='available'||row.toolJson===undefined)return {}
  const tool=parsePublishedToolSnapshot(row.toolJson)
  if(tool===undefined||pricingConfigDigest(tool.pricingConfig)!==tool.priceDigest)return {}
  return {recordedTariff:{basis:'call_snapshot',pricingConfig:tool.pricingConfig,priceDigest:tool.priceDigest}}
}

export async function watchOwnerCallStateHandler(
  ctx: QueryCtx,
  args: { callRef: string },
): Promise<Infer<typeof watchOwnerCallStateResult>> {
  // Reactive owner observation: same owner rule as authorizeOwnerRecovery; a
  // missing identity, missing row or another owner all read as null.
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null || identity.tokenIdentifier.trim().length === 0) return null
  const row = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (q) => q.eq('callRef', args.callRef)).unique()
  return row === null || row.ownerId !== identity.tokenIdentifier ? null : { state: row.state, updatedAt: row.updatedAt }
}
