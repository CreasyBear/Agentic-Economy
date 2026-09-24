import type { Infer } from 'convex/values'
import { materializePurchaseResolutionRecord } from './purchaseResolutionMaterialize'
import { upsertCallProjection } from './dispatch'
import type { PaginationOptions } from 'convex/server'
import { degradeBackend } from '../../../../src/lib/observability/degrade-backend'
import type { ActionCtx, MutationCtx, QueryCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import { internal } from '../../../_generated/api'
import { recordMarketEvidenceFact } from '../../../marketEvidence'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import { isBoundedJsonValue, type JsonValue } from '@/modules/capability-contract/public'
import { isRecord } from '@/modules/common/is-record'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { OwnerCallContext } from '@/modules/capability-execution/call-recovery-contracts'
import type { ownerCallStatusResultValue } from './contracts'
import {
  callResultValue,
  reconciliationEvidenceValue,
  recoveryResultValue,
  statusResultValue,
  usageValue,
  x402PaymentReconciliationEvidenceValue,
} from '@/modules/capability-execution/convex'
import {
  sourceWriteAdmissionArg,
  sourceWriteRequestArg,
} from '../../../sourceWriteAdmission'
import {
  createPublicToolRef,
  parsePublishedToolSnapshot,
  type SellerOnboardingCanaryExecutionEnvelope,
} from '@/modules/capability-supply/public'
import { type CallPrincipal } from './admission'
import {
  assertCallResultJson,
  callIdentity,
  callIdentityMatches,
} from './callIdentity'

type CallRow = Doc<'capabilityCalls'>
type CallResultValue = Infer<typeof callResultValue>
type Usage = Infer<typeof usageValue>
type CallListState = CallRow['state']
type DispatchState = 'enqueued' | 'running' | 'completed' | 'failed' | 'reconciliation_required'

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
  quoteRef?: string
  callRef: string
  principalId: string
  ownerId: string
  credentialId: string
  applicationRef: string
  environment: 'sandbox' | 'production'
  state: 'pending' | 'completed' | 'refused' | 'reconciliation_required' | 'cancelled'
  toolRef: string
  sellerOnboardingCanary?: SellerOnboardingCanaryExecutionEnvelope
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
    ...(row.quoteRef === undefined ? {} : { quoteRef: row.quoteRef }),
    callRef: row.callRef,
    principalId: row.principalId,
    ownerId: row.ownerId,
    credentialId: row.credentialId,
    applicationRef: row.applicationRef,
    environment: row.environment,
    state: row.state,
    toolRef: row.toolRef,
    ...(row.sellerOnboardingCanary === undefined
      ? {}
      : { sellerOnboardingCanary: structuredClone(row.sellerOnboardingCanary) }),
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

type RecoveryAdmission =
  | Readonly<{ kind: 'authorized'; row: RecoveryRow }>
  | Readonly<{ kind: 'not_found' }>

function recoveryNotFound(callRef: string): Infer<typeof recoveryResultValue> {
  return { kind: 'refused', callRef, code: 'invocation_not_found', retryable: false }
}

function projectStatusRecoveryResult(
  result: Infer<typeof recoveryResultValue>,
): Infer<typeof statusResultValue> {
  if (result.kind !== 'reconciliation_required') return result
  return {
    kind: 'found',
    callRef: result.callRef,
    version: Date.now(),
    toolRef: result.toolRef,
    state: 'reconciliation_required',
    attemptRef: result.evidence.attemptRef,
    effectGeneration: result.evidence.effectGeneration,
  }
}

function projectRecordedOwnerTerminalStatus(
  row: RecoveryRow,
): Infer<typeof statusResultValue> | undefined {
  const recordedResult = row.result
  if (recordedResult === undefined) return undefined
  const terminalState = row.state === 'completed' && recordedResult.kind === 'completed'
    ? 'terminal' as const
    : row.state === 'refused' && recordedResult.kind === 'refused' && !recordedResult.retryable
      ? 'terminal' as const
      : row.state === 'cancelled' && recordedResult.kind === 'refused'
        ? 'cancelled' as const
        : undefined
  if (terminalState === undefined) return undefined
  // This internal transport refusal predates the public Call refusal vocabulary.
  // Preserve its terminal and receipt facts while projecting the truthful public
  // pre-release category instead of leaking an unparseable private code.
  const result = recordedResult.kind === 'refused'
    && recordedResult.code === 'payment_requirement_outside_authority'
    ? { ...recordedResult, code: 'pre_release_failed' }
    : recordedResult
  const receipt = 'receipt' in result ? result.receipt : undefined
  return {
    kind: 'found',
    callRef: row.callRef,
    version: row.updatedAt,
    toolRef: row.toolRef,
    state: terminalState,
    result,
    ...(row.usage === undefined ? {} : { usage: row.usage }),
    ...(row.evidenceHash === undefined ? {} : { evidenceHash: row.evidenceHash }),
    ...(row.attemptRef === undefined ? {} : { attemptRef: row.attemptRef }),
    ...(receipt === undefined ? {} : { receipt }),
  }
}

async function attachPurchaseResolutionToStatus(
  ctx: ActionCtx,
  result: Infer<typeof statusResultValue>,
): Promise<Infer<typeof statusResultValue>> {
  if (result.kind !== 'found') return result
  try {
    const purchaseResolution = await ctx.runQuery(internal.capabilityCalls.readPurchaseResolution, {
      callRef: result.callRef,
    })
    return purchaseResolution === null
      ? result
      : { ...result, purchaseResolution }
  } catch (cause) {
    void cause;
    return result
  }
}

async function authorizeRecovery(
  ctx: ActionCtx,
  callRef: string,
  principal: AgentAccessPrincipal,
): Promise<RecoveryAdmission> {
  // The outer authority boundary authenticates the current credential. A Call
  // retains its original credential as effect evidence after replacement.
  const row = await ctx.runQuery(internal.capabilityCalls.readOwnerRecovery, { callRef })
  if (!callIdentityMatches(row, callIdentity(principal))) return { kind: 'not_found' }
  return { kind: 'authorized', row }
}

async function authorizeOwnerRecovery(
  ctx: ActionCtx,
  callRef: string,
  idempotencyKey?: string,
): Promise<RecoveryRow | null> {
  const identity = await ctx.auth.getUserIdentity()
  if (
    identity === null
    || identity.tokenIdentifier.trim().length === 0
    || (idempotencyKey !== undefined && idempotencyKey.trim().length === 0)
  ) return null
  const row = await ctx.runQuery(internal.capabilityCalls.readOwnerRecovery, { callRef })
  return row === null || row.ownerId !== identity.tokenIdentifier ? null : row
}

type RecoveryActionArgs = {
  operationKey: string
  correlationId: string
  sourceWrite?: Infer<typeof sourceWriteAdmissionArg>
  sourceWriteRequest?: Infer<typeof sourceWriteRequestArg>
  principal: CallPrincipal
  callRef: string
  afterVersion?: number
  idempotencyKey?: string
}

export async function listAgentCallsHandler(
  ctx: ActionCtx,
  args: Omit<RecoveryActionArgs, 'callRef'> & Readonly<{ state?: CallListState; paginationOpts: PaginationOptions }>,
) {
  await ctx.runMutation(internal.capabilityCalls.admit, {
    operationKey: args.operationKey,
    correlationId: args.correlationId,
    ...(args.sourceWrite === undefined ? {} : { sourceWrite: args.sourceWrite }),
    ...(args.sourceWriteRequest === undefined ? {} : { sourceWriteRequest: args.sourceWriteRequest }),
    principal: args.principal,
    toolRef: '',
    input: {},
    idempotencyKey: `list:${args.state ?? 'all'}:${args.paginationOpts.cursor ?? 'start'}:${args.paginationOpts.numItems}`,
  })
  return await ctx.runQuery(internal.capabilityCalls.listAgentCallSummaries, {
    principalId: args.principal.principalId,
    ownerId: args.principal.ownerId,
    credentialId: args.principal.credentialId,
    applicationRef: args.principal.applicationRef,
    environment: args.principal.environment,
    ...(args.state === undefined ? {} : { state: args.state }),
    paginationOpts: args.paginationOpts,
  })
}

type RecoveryEvidence =
  | Infer<typeof reconciliationEvidenceValue>
  | Infer<typeof x402PaymentReconciliationEvidenceValue>


export async function cancelCallHandler(
  ctx: ActionCtx,
  args: RecoveryActionArgs & { idempotencyKey: string },
): Promise<Infer<typeof recoveryResultValue>> {
  await ctx.runMutation(internal.capabilityCalls.admit, {
    operationKey: args.operationKey,
    correlationId: args.correlationId,
    ...(args.sourceWrite === undefined ? {} : { sourceWrite: args.sourceWrite }),
    ...(args.sourceWriteRequest === undefined ? {} : { sourceWriteRequest: args.sourceWriteRequest }),
    principal: args.principal,
    toolRef: '',
    input: {},
    idempotencyKey: `cancel:${args.idempotencyKey}`,
  })
  const admission = await authorizeRecovery(ctx, args.callRef, args.principal)
  if (admission.kind !== 'authorized') return recoveryNotFound(args.callRef)
  return await ctx.runAction(internal.capabilityCallWorker.recover, {
    callRef: args.callRef,
    principalId: admission.row.principalId,
    credentialId: admission.row.credentialId,
    recoveryPrincipal: args.principal,
    mode: 'cancel',
    idempotencyKey: args.idempotencyKey,
  })
}

export async function reconcileCallHandler(
  ctx: ActionCtx,
  args: RecoveryActionArgs & { idempotencyKey: string; evidence: RecoveryEvidence },
): Promise<Infer<typeof recoveryResultValue>> {
  await ctx.runMutation(internal.capabilityCalls.admit, {
    operationKey: args.operationKey,
    correlationId: args.correlationId,
    ...(args.sourceWrite === undefined ? {} : { sourceWrite: args.sourceWrite }),
    ...(args.sourceWriteRequest === undefined ? {} : { sourceWriteRequest: args.sourceWriteRequest }),
    principal: args.principal,
    toolRef: '',
    input: {},
    idempotencyKey: `reconcile:${args.idempotencyKey}`,
  })
  const admission = await authorizeRecovery(ctx, args.callRef, args.principal)
  if (admission.kind !== 'authorized') return recoveryNotFound(args.callRef)
  return await ctx.runAction(internal.capabilityCallWorker.recover, {
    callRef: args.callRef,
    principalId: admission.row.principalId,
    credentialId: admission.row.credentialId,
    recoveryPrincipal: args.principal,
    mode: 'reconcile',
    evidence: args.evidence,
  })
}

export async function readOwnerCallStatusHandler(
  ctx: ActionCtx,
  args: { callRef: string },
): Promise<Infer<typeof ownerCallStatusResultValue>> {
  const row = await authorizeOwnerRecovery(ctx, args.callRef)
  if (row === null) return recoveryNotFound(args.callRef) as Infer<typeof statusResultValue>
  const recordedTerminal = projectRecordedOwnerTerminalStatus(row)
  const projected = recordedTerminal ?? projectStatusRecoveryResult(
    await ctx.runAction(internal.capabilityCallWorker.recover, {
      callRef: args.callRef,
      principalId: row.principalId,
      credentialId: row.credentialId,
      recoverAsOwner: true,
      mode: 'status',
    }),
  )
  if (projected.kind !== 'found') return projected
  const withPurchaseResolution = await attachPurchaseResolutionToStatus(ctx, projected)
  if (withPurchaseResolution.kind !== 'found') return withPurchaseResolution
  const previousInput = parseOwnerPreviousInput(row.inputJson)
  let ownerContext: OwnerCallContext | null
  try {
    ownerContext = await ctx.runQuery(internal.capabilityCalls.readOwnerReceiptContext, {
      callRef: row.callRef, ownerId: row.ownerId, toolRef: projected.toolRef,
    })
  } catch (cause) {
    // Optional identity/capability metadata must not erase a readable receipt.
    ownerContext = degradeBackend(cause, null, { site: 'readOwnerCallStatusHandler', reason: 'source_unavailable' })
  }
  return {
    ...withPurchaseResolution,
    ...(previousInput === undefined ? {} : { previousInput }),
    ownerContext,
  }
}

export async function readOwnerReceiptContextHandler(
  ctx: QueryCtx,
  args: { callRef: string; ownerId: string; toolRef: string },
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
  return {
    purpose: null,
    agent: { principalRef: row.principalId, applicationRef: row.applicationRef, currentDisplayName },
    recordedTool: recordedReceiptTool(row),
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

function parseOwnerPreviousInput(inputJson: string): Record<string, JsonValue> | undefined {
  try {
    const value: unknown = JSON.parse(inputJson)
    return isRecord(value) && isBoundedJsonValue(value)
      ? value as Record<string, JsonValue>
      : undefined
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'parseOwnerPreviousInput', reason: 'invalid_response' })
  }
}

export async function cancelOwnerCallHandler(
  ctx: ActionCtx,
  args: { callRef: string; idempotencyKey: string },
): Promise<Infer<typeof recoveryResultValue>> {
  const row = await authorizeOwnerRecovery(ctx, args.callRef, args.idempotencyKey)
  if (row === null) return recoveryNotFound(args.callRef)
  return await ctx.runAction(internal.capabilityCallWorker.recover, {
    callRef: args.callRef,
    principalId: row.principalId,
    credentialId: row.credentialId,
    recoverAsOwner: true,
    mode: 'cancel',
    idempotencyKey: args.idempotencyKey,
  })
}

export async function reconcileOwnerCallHandler(
  ctx: ActionCtx,
  args: { callRef: string; idempotencyKey: string; evidence: RecoveryEvidence },
): Promise<Infer<typeof recoveryResultValue>> {
  const row = await authorizeOwnerRecovery(ctx, args.callRef, args.idempotencyKey)
  if (row === null) return recoveryNotFound(args.callRef)
  return await ctx.runAction(internal.capabilityCallWorker.recover, {
    callRef: args.callRef,
    principalId: row.principalId,
    credentialId: row.credentialId,
    recoverAsOwner: true,
    mode: 'reconcile',
    evidence: args.evidence,
  })
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

export async function recordHandler(
  ctx: MutationCtx,
  args: {
    callRef: string
    principalId: string
    state: 'pending' | 'completed' | 'refused' | 'reconciliation_required' | 'cancelled'
    result?: CallResultValue
    usage?: Usage
    evidenceHash?: string
    attemptRef?: string
    dispatchState?: DispatchState
    now: number
  },
): Promise<{ kind: 'recorded' }> {
  if (args.result !== undefined) assertCallResultJson(args.result)
  const row = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef)).unique()
  if (row === null || row.principalId !== args.principalId) throw new Error('operation_invoke_identity_refused')
  if (
    row.state !== 'pending'
    && args.state !== row.state
  ) return { kind: 'recorded' as const }
  await ctx.db.patch(row._id, recordPatch(args))
  return { kind: 'recorded' as const }
}

type RecordArgs = Parameters<typeof recordHandler>[1]

function recordPatch(args: RecordArgs): Partial<CallRow> {
  return {
    state: args.state,
    ...(args.result === undefined ? {} : { result: args.result }),
    ...(args.usage === undefined ? {} : { usage: args.usage }),
    ...(args.evidenceHash === undefined ? {} : { evidenceHash: args.evidenceHash }),
    ...(args.attemptRef === undefined ? {} : { attemptRef: args.attemptRef }),
    ...(args.dispatchState === undefined ? {} : { dispatchState: args.dispatchState }),
    updatedAt: args.now,
  }
}

type ProjectRecoveryArgs = Parameters<typeof projectRecoveryHandler>[1]

function recoveryProjectionIdentityMatches(row: CallRow | null, args: ProjectRecoveryArgs): row is CallRow {
  // The stored credential is effect evidence, never the projection gate: a
  // replaced credential must still project onto the original Call.
  return row !== null && row.principalId === args.principalId
}

function isCompletedProjection(row: CallRow): boolean {
  return row.state === 'completed' && row.result?.kind === 'completed'
}

function resetsPendingRecovery(row: CallRow, args: ProjectRecoveryArgs): boolean {
  return [
    row.state === 'reconciliation_required',
    args.state === 'pending',
    args.clearResult,
    args.clearWorkId,
    args.clearAttemptRef,
    args.clearEvidenceHash,
    args.clearDispatchState,
  ].every(Boolean)
}

function recoveryProjectionTransitionAllowed(row: CallRow, args: ProjectRecoveryArgs): boolean {
  return row.state === 'pending'
    || args.state === row.state
    || resetsPendingRecovery(row, args)
}

function retainedOutputMatches(outputJson: string | undefined, output: JsonValue): boolean {
  if (outputJson === undefined) return false
  try {
    const retained: unknown = JSON.parse(outputJson)
    return isBoundedJsonValue(retained) && canonicalDigest(retained) === canonicalDigest(output)
  } catch (cause) {
    return degradeBackend(cause, false, { site: 'retainedOutputMatches', reason: 'invalid_response' })
  }
}

function recoveredPaidUsage(row: CallRow, receipt: NonNullable<Extract<CallResultValue, { kind: 'completed' }>['receipt']>): Usage | undefined {
  if (receipt.commercialModel !== 'account_aud' || receipt.state !== 'settled'
    || row.formanceFinancialState !== 'settled' || row.attemptRef === undefined) return undefined
  return { usageRef: `operation-usage:${row.callRef}:${row.attemptRef}`,
    observedAt: Date.parse(receipt.issuedAt), chargeState: 'paid',
    amount: receipt.totalBuyerCharge, priceDigest: receipt.priceDigest,
    ...(receipt.transactionRef === undefined ? {} : { transactionRef: receipt.transactionRef }) }
}

type CallPatch = {
  [Property in keyof CallRow]?: undefined extends CallRow[Property]
    ? CallRow[Property] | undefined
    : CallRow[Property]
}

function recoveryProjectionPatch(row: CallRow, args: ProjectRecoveryArgs): CallPatch {
  return {
    state: args.state,
    ...(args.clearResult ? { result: undefined } : args.result === undefined ? {} : { result: args.result }),
    ...(args.clearWorkId ? { workId: undefined } : {}),
    ...(args.clearAttemptRef ? { attemptRef: undefined } : args.attemptRef === undefined ? {} : { attemptRef: args.attemptRef }),
    ...(args.clearEvidenceHash ? { evidenceHash: undefined } : {}),
    ...(args.clearDispatchState ? { dispatchState: undefined } : args.dispatchState === undefined ? {} : { dispatchState: args.dispatchState }),
    ...(resetsPendingRecovery(row, args) ? { reconciliation: undefined } : {}),
    updatedAt: args.now,
  }
}

export async function projectRecoveryHandler(
  ctx: MutationCtx,
  args: {
    callRef: string
    principalId: string
    state: 'pending' | 'completed' | 'refused' | 'reconciliation_required' | 'cancelled'
    result?: CallResultValue
    attemptRef?: string
    dispatchState?: DispatchState
    clearResult: boolean
    clearWorkId: boolean
    clearAttemptRef: boolean
    clearEvidenceHash: boolean
    clearDispatchState: boolean
    now: number
  },
): Promise<{ kind: 'recorded' }> {
  if (args.result !== undefined) assertCallResultJson(args.result)
  const row = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef)).unique()
  if (!recoveryProjectionIdentityMatches(row, args)) {
    throw new Error('operation_invoke_identity_refused')
  }
  if (isCompletedProjection(row)) {
    // Repair an interrupted result projection without changing its output or
    // applying any financial effect. Completed HTTP results require usage.
    if (row.result?.kind === 'completed') {
      let result = row.result
      const recordedReceipt = result.receipt
      const settlementRef = row.formanceSettlementRefs?.[0]
      if (recordedReceipt?.commercialModel === 'account_aud' && recordedReceipt.state === 'settled'
        && row.formanceFinancialState === 'settled' && settlementRef !== undefined) {
        const receipt = { ...recordedReceipt, transactionRef: settlementRef,
          accountingTransactionRefs: [...(row.formanceSettlementRefs ?? [])] }
        const usage = recoveredPaidUsage(row, receipt)
        if (usage) {
          result = { ...result, receipt, usage }
          await ctx.db.patch(row._id, { usage, result })
        }
      } else if (result.usage === undefined && recordedReceipt) {
        const usage = recoveredPaidUsage(row, recordedReceipt)
        if (usage) { result = { ...result, usage }; await ctx.db.patch(row._id, { usage, result }) }
      }
      await upsertCallProjection(ctx, row, {
        state: 'completed', dispatchState: 'completed', result,
      }, row.updatedAt)
      await recordRecoveredCompletion(ctx, row, row.updatedAt)
    }
    return { kind: 'recorded' as const }
  }
  const attemptRef = args.attemptRef
  if (row.state === 'reconciliation_required' && args.state === 'completed'
    && args.result?.kind === 'completed' && row.formanceFinancialState === 'settled'
    && row.formanceSettlementRefs?.length && attemptRef !== undefined
    && attemptRef === row.attemptRef) {
    const attempt = await ctx.db.query('moneyX402PaymentAttempts')
      .withIndex('by_attemptRef_and_effectGeneration', q => q
        .eq('attemptRef', attemptRef)
        .eq('effectGeneration', row.result?.kind === 'reconciliation_required'
          ? row.result.evidence.effectGeneration : -1)).unique()
    if (attempt?.dispatchRef !== row.callRef || attempt.toolRef !== row.toolRef
      || attempt.inputDigest !== row.inputDigest || attempt.settlementStatus !== 'settled'
      || attempt.reconciliationEvidenceDigest === undefined
      || !retainedOutputMatches(attempt.quarantinedOutputJson, args.result.output)
      || attempt.quarantinedResponseDigest !== args.result.evidenceHash
      || args.result.receipt?.state !== 'settled') return { kind: 'recorded' as const }
    const settlementRef = row.formanceSettlementRefs[0]
    if (settlementRef === undefined || args.result.callRef !== row.callRef
      || args.result.toolRef !== row.toolRef) return { kind: 'recorded' as const }
    const result = { ...args.result, receipt: { ...args.result.receipt,
      accountingTransactionRefs: [...row.formanceSettlementRefs],
      transactionRef: settlementRef,
    } }
    const usage = recoveredPaidUsage(row, result.receipt)
    if (usage === undefined) return { kind: 'recorded' as const }
    const completed = { ...result, usage }
    await ctx.db.patch(row._id, { ...recoveryProjectionPatch(row, args), result: completed, usage,
      evidenceHash: result.evidenceHash, reconciliation: undefined })
    await materializePurchaseResolutionRecord(ctx, row, {
      state: 'completed', dispatchState: 'completed', result: completed, usage,
    }, args.now)
    await upsertCallProjection(ctx, row, {
      state: 'completed', dispatchState: 'completed', result: completed, usage,
    }, args.now)
    await recordRecoveredCompletion(ctx, row, args.now)
    return { kind: 'recorded' as const }
  }
  if (!recoveryProjectionTransitionAllowed(row, args)) return { kind: 'recorded' as const }
  await ctx.db.patch(row._id, recoveryProjectionPatch(row, args))
  return { kind: 'recorded' as const }
}

/** Same Call identity and original completion time make repair/replay non-inflating. */
async function recordRecoveredCompletion(ctx: MutationCtx, row: CallRow, completedAt: number): Promise<void> {
  await recordMarketEvidenceFact(ctx, 'ae_invocation_completed', row.callRef, completedAt, {
    toolRef: row.toolRef,
    durationMs: Math.max(0, completedAt - row.createdAt),
  })
}
