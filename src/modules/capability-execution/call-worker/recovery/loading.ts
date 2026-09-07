import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isBoundedJsonValue } from '@/modules/capability-contract/public'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  buildCommittedCallMaterial,
  createRecoveryControlAction,
  type CallMaterialInput,
} from '../../call-material'
import {
  createDurableActionExecutionTracer,
  type ReconciliationEvidence,
} from '@/modules/action-execution/runtime'
import {
  materializeRuntimePublishedTool,
  parsePublishedToolSnapshot,
  createPublicToolRef,
  type PublishedTool,
  type RuntimePublishedToolDescriptor,
} from '@/modules/capability-supply/public'
import type { CallReceipt } from '@/modules/capability-execution/call-contracts'
import type { ExactAmount } from '@/modules/money/public'
import type { ActionCtx } from '../../../../../convex/_generated/server'
import { internal } from '../../../../../convex/_generated/api'
import {
  canonicalPort,
} from '../../../../../convex/capabilityCallProjection'
import { buildBrokeredX402Receipt } from '../brokeredX402'
import { buildSellerOnboardingCanaryReceipt } from '../sellerCanaryReceipt'
import type { RecoveredCall, RecoveryIdentity } from './contracts'

type RecoveryPort = ReturnType<typeof canonicalPort>
export type RecoveryControlRow = NonNullable<Awaited<ReturnType<RecoveryPort['readControl']>>>

type RecoveryReceiptState = 'settled' | 'refunded' | 'reconciliation_required'
type RecoveryReceiptArgs = {
  state: RecoveryReceiptState
  evidenceHash: string
  issuedAt: string
  externalSettlementRef?: string
  settlementTransactionHash?: string
  paymentIdentifier?: string
  refundState?: CallReceipt['refundState']
  lossState?: CallReceipt['lossState']
}
type Mutable<T> = { -readonly [K in keyof T]: T[K] }

export async function loadRecoveredCall(
  ctx: ActionCtx,
  args: RecoveryIdentity,
): Promise<RecoveredCall | null> {
  const row = await ctx.runQuery(internal.capabilityCalls.readRecovery, {
    callRef: args.callRef,
    principalId: args.principalId,
    credentialId: args.credentialId,
  })
  return row
}

export async function loadRecoveryControl(
  ctx: ActionCtx,
  recovered: RecoveredCall,
): Promise<
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'persisted'; recovered: RecoveredCall }>
  | Readonly<{ kind: 'ready'; recovered: RecoveredCall; port: RecoveryPort; control: RecoveryControlRow }>
> {
  const port = canonicalPort(ctx)
  const control = await port.readControl(recovered.callRef)
  if (control === undefined) return { kind: 'persisted', recovered }
  if (
    control.control.owner.principalRef !== recovered.principalId
    || control.control.owner.callerRef !== recovered.credentialId
    || control.control.origin.kind !== 'standalone'
    || control.control.origin.principalRef !== recovered.principalId
    || control.control.origin.callerRef !== recovered.credentialId
    || control.control.executionRef !== recovered.callRef
    || control.sourceRef !== `operation-invocation-source:${recovered.callRef}`
  ) return { kind: 'not_found' }
  return { kind: 'ready', recovered, port, control }
}

function createRecoveryControlOnlyAction(input: Readonly<{
  operation: PublishedTool
  descriptor: RuntimePublishedToolDescriptor
  decisionAmount: ExactAmount
}>) {
  const refused = (value: CallMaterialInput) => ({
    kind: 'published_operation_refused' as const,
    sourceDisposition: 'refused' as const,
    operationId: input.operation.operationId,
    operationVersion: input.descriptor.version,
    requestDigest: value.inputDigest,
    failureCode: 'recovery_control_only',
  })
  return createRecoveryControlAction({
    operation: input.operation,
    descriptor: input.descriptor,
    decisionAmount: input.decisionAmount,
    now: () => Date.now(),
    run: async (value) => refused(value),
    preReleaseCheck: async (value) => refused(value),
  })
}

export async function loadRecoveryWorkContext(
  ctx: ActionCtx,
  recovered: RecoveredCall,
  port: RecoveryPort,
  control: RecoveryControlRow,
) {
  const material = parseRecoveryMaterial(recovered)
  if (material === undefined) return undefined
  const { operation, descriptor, parsedInput } = material
  const managedReservation = await loadManagedReservation(ctx, recovered, operation)
  const priceAmount = recoveryPriceAmount(recovered, descriptor, managedReservation)
  if (priceAmount === undefined) return undefined
  const dynamicInput = buildCommittedCallMaterial({
    operation,
    descriptor,
    value: parsedInput,
    decisionAmount: priceAmount,
  })
  if (!recoveryMaterialMatches(recovered, control, { operation, descriptor, dynamicInput })) return undefined

  const [attemptRows, historyRows] = await Promise.all([
    port.readAttempts(recovered.callRef, 100),
    port.readHistory(recovered.callRef, 0, 100),
  ])
  if (!recoveryHistoryMatches(recovered, historyRows)) return undefined
  const attempts = attemptRows.map(({ executionRef: _executionRef, recordedAt: _recordedAt, ...attempt }) => attempt)
  const prepared = {
    materialInputDigest: dynamicInput.inputDigest,
    target: dynamicInput.target,
    consequence: descriptor.consequenceClass,
    dataUse: {
      fields: descriptor.materialInputPointers,
      limits: { amount: priceAmount },
    },
    preparedAt: control.authorityDecisionAt ?? control.updatedAt,
    freshUntil: control.control.authority?.expiresAt ?? control.updatedAt,
  }
  const action = createRecoveryControlOnlyAction({ operation, descriptor, decisionAmount: priceAmount })
  const x402Attempt = await loadX402Attempt(ctx, recovered, control, operation)
  const brokeredReceipt = recoveryReceiptBuilder({
    recovered,
    control,
    operation,
    priceAmount,
    x402Attempt,
    managedReservation,
  })
  const trustedReconciliationEvidenceDigest: { value?: string } = {}
  const tracer = createDurableActionExecutionTracer({
    action,
    port,
    now: () => new Date().toISOString(),
    nextExecutionRef: () => recovered.callRef,
    nextAuthorityRef: () => `operation-authority:${recovered.callRef}`,
    nextAttemptRef: () => `${recovered.callRef}:recovery`,
    resolveSourceState: (sourceRef) => {
      if (sourceRef !== control.sourceRef) throw new Error('operation_recovery_source_ref_mismatch')
      return {
        input: dynamicInput,
        context: {},
        prepared,
        observedResolution: { state: 'pending' as const },
      }
    },
    verifyReconciliationEvidence: (evidence: ReconciliationEvidence): boolean => {
      if (
        (evidence.operationRef !== undefined && evidence.operationRef !== recovered.toolRef)
        || evidence.inputDigest !== recovered.inputDigest
        || evidence.providerIdentity !== (
          operation.binding.authority.kind === 'provider_connection'
            ? operation.binding.authority.providerRef
            : undefined
        )
      ) return false
      return canonicalDigest(evidence as StableHashValue)
        === trustedReconciliationEvidenceDigest.value
        || historyRows.some((history) =>
          history.sourceEvidenceRef === evidence.evidenceRef
          && history.observation?.release === evidence.resolution
          && history.observation?.evidenceDigest === evidence.digest)
    },
  }, {
    format: 'action-execution-control:development:v1' as const,
    records: [{
      sourceRef: control.sourceRef,
      control: { ...control.control, attempts },
      ...(control.authorityBinding === undefined ? {} : { authorityBinding: control.authorityBinding }),
    }],
  })
  return {
    recovered,
    port,
    control,
    operation,
    descriptor,
    dynamicInput,
    attemptRows,
    tracer,
    x402Attempt,
    managedReservation,
    brokeredReceipt,
    trustedReconciliationEvidenceDigest,
  }
}

function recoveryPriceAmount(
  recovered: RecoveredCall,
  descriptor: RuntimePublishedToolDescriptor,
  managedReservation: Awaited<ReturnType<typeof loadManagedReservation>>,
): ExactAmount | undefined {
  if (descriptor.price.kind === 'fixed') return descriptor.price.amount
  if (recovered.sellerOnboardingCanary !== undefined) {
    return recovered.sellerOnboardingCanary.funding.requestedSpend
  }
  if (managedReservation === null) return undefined
  return { currency: 'AUD', units: managedReservation.decisionAudUnits, exponent: 6 }
}

function recoveryReceiptBuilder(input: Readonly<{
  recovered: RecoveredCall
  control: RecoveryControlRow
  operation: PublishedTool
  priceAmount: ExactAmount
  x402Attempt: Awaited<ReturnType<typeof loadX402Attempt>>
  managedReservation: Awaited<ReturnType<typeof loadManagedReservation>>
}>) {
  return (
    state: RecoveryReceiptState,
    evidenceHash: string,
    issuedAt: string,
    externalSettlementRef?: string,
    settlementTransactionHash?: string,
    paymentIdentifier?: string,
    refundState?: CallReceipt['refundState'],
    lossState?: CallReceipt['lossState'],
  ) => {
    const args: RecoveryReceiptArgs = { state, evidenceHash, issuedAt }
    if (externalSettlementRef !== undefined) args.externalSettlementRef = externalSettlementRef
    if (settlementTransactionHash !== undefined) args.settlementTransactionHash = settlementTransactionHash
    if (paymentIdentifier !== undefined) args.paymentIdentifier = paymentIdentifier
    if (refundState !== undefined) args.refundState = refundState
    if (lossState !== undefined) args.lossState = lossState
    return input.recovered.sellerOnboardingCanary === undefined
      ? buildBrokeredRecoveryReceipt(input, args)
      : buildCanaryRecoveryReceipt(input, args)
  }
}

function buildCanaryRecoveryReceipt(
  input: Parameters<typeof recoveryReceiptBuilder>[0],
  args: RecoveryReceiptArgs,
): CallReceipt | undefined {
  const { recovered, control, operation, priceAmount, x402Attempt } = input
  const canary = recovered.sellerOnboardingCanary
  if (canary === undefined) {
    throw new Error('seller_onboarding_canary_receipt_requires_canary')
  }
  const persistedReceipt = persistedOperationReceipt(recovered)
  const receiptInput: Mutable<Parameters<typeof buildSellerOnboardingCanaryReceipt>[0]> = {
    canary,
    operation,
    callRef: recovered.callRef,
    toolRef: recovered.toolRef,
    attemptRef: canaryRecoveryAttemptRef(recovered, control, x402Attempt),
    state: args.state,
    providerQuotedAmount: priceAmount,
    evidenceHash: args.evidenceHash,
    issuedAt: args.issuedAt,
    refundState: retainedReceiptState(args.refundState, persistedReceipt, 'refundState'),
    lossState: retainedReceiptState(args.lossState, persistedReceipt, 'lossState'),
  }
  const paymentIdentifier = retainedReceiptString(args.paymentIdentifier, persistedReceipt, 'paymentIdentifier')
  const transactionHash = retainedReceiptString(args.settlementTransactionHash, persistedReceipt, 'settlementTransactionHash')
  const externalRef = retainedReceiptString(args.externalSettlementRef, persistedReceipt, 'externalSettlementRef')
  if (paymentIdentifier !== undefined) receiptInput.paymentIdentifier = paymentIdentifier
  if (transactionHash !== undefined) receiptInput.settlementTransactionHash = transactionHash
  if (externalRef !== undefined) receiptInput.externalSettlementRef = externalRef
  return buildSellerOnboardingCanaryReceipt(receiptInput)
}

function persistedOperationReceipt(recovered: RecoveredCall): CallReceipt | undefined {
  return recovered.result !== undefined && 'receipt' in recovered.result
    ? recovered.result.receipt
    : undefined
}

function canaryRecoveryAttemptRef(
  recovered: RecoveredCall,
  control: RecoveryControlRow,
  attempt: Awaited<ReturnType<typeof loadX402Attempt>>,
): string {
  if (attempt !== null) return attempt.attemptRef
  if (control.currentAttemptRef !== undefined) return control.currentAttemptRef
  if (recovered.attemptRef !== undefined) return recovered.attemptRef
  return `operation-attempt:${recovered.callRef}:1`
}

function retainedReceiptString(
  supplied: string | undefined,
  receipt: CallReceipt | undefined,
  field: 'paymentIdentifier' | 'settlementTransactionHash' | 'externalSettlementRef',
): string | undefined {
  if (supplied !== undefined) return supplied
  if (receipt === undefined) return undefined
  if (field === 'externalSettlementRef') return receipt.externalSettlementRef
  if (receipt.commercialModel !== 'seller_canary_x402') return undefined
  return receipt[field]
}

function retainedReceiptState<K extends 'refundState' | 'lossState'>(
  supplied: CallReceipt[K] | undefined,
  receipt: CallReceipt | undefined,
  field: K,
): NonNullable<CallReceipt[K]> {
  if (supplied !== undefined) return supplied
  if (receipt !== undefined && receipt[field] !== undefined) {
    return receipt[field] as NonNullable<CallReceipt[K]>
  }
  return 'unknown'
}

function buildBrokeredRecoveryReceipt(
  input: Parameters<typeof recoveryReceiptBuilder>[0],
  args: RecoveryReceiptArgs,
): CallReceipt | undefined {
  const { recovered, operation, managedReservation } = input
  if (managedReservation === null) return undefined
  const receiptInput: Mutable<Parameters<typeof buildBrokeredX402Receipt>[0]> = {
    operation,
    callRef: recovered.callRef,
    toolRef: recovered.toolRef,
    state: args.state,
    buyerCharge: { currency: 'AUD', units: managedReservation.decisionAudUnits, exponent: 6 },
    evidenceHash: args.evidenceHash,
    issuedAt: args.issuedAt,
  }
  receiptInput.transactionRef = managedReservation.journalTransactionRef
  receiptInput.accountingTransactionRefs = [managedReservation.journalTransactionRef]
  if (args.externalSettlementRef !== undefined) receiptInput.externalSettlementRef = args.externalSettlementRef
  if (args.settlementTransactionHash !== undefined) receiptInput.settlementTransactionHash = args.settlementTransactionHash
  if (args.paymentIdentifier !== undefined) receiptInput.paymentIdentifier = args.paymentIdentifier
  if (args.refundState !== undefined) receiptInput.refundState = args.refundState
  if (args.lossState !== undefined) receiptInput.lossState = args.lossState
  return buildBrokeredX402Receipt(receiptInput)
}

type RecoveryMaterial = Readonly<{
  operation: PublishedTool
  descriptor: RuntimePublishedToolDescriptor
  parsedInput: StableHashValue
}>

function parseRecoveryMaterial(recovered: RecoveredCall): RecoveryMaterial | undefined {
  try {
    const operation = parsePublishedToolSnapshot(recovered.toolJson)
    if (operation === undefined) return undefined
    const descriptor = materializeRuntimePublishedTool(operation)
    const parsedInput: unknown = JSON.parse(recovered.inputJson)
    if (!isBoundedJsonValue(parsedInput)) return undefined
    return { operation, descriptor, parsedInput }
  } catch {
    return undefined
  }
}

function recoveryMaterialMatches(
  recovered: RecoveredCall,
  control: RecoveryControlRow,
  material: Readonly<{
    operation: PublishedTool
    descriptor: RuntimePublishedToolDescriptor
    dynamicInput: CallMaterialInput
  }>,
): boolean {
  return toolReference(material.operation) === recovered.toolRef
    && material.dynamicInput.inputDigest === recovered.inputDigest
    && preparedMaterialMatches(control, material.dynamicInput.inputDigest)
    && control.control.action.id === material.operation.operationId
    && control.control.action.contractVersion === material.descriptor.version
}

function toolReference(operation: PublishedTool): string {
  return createPublicToolRef({
    operationId: operation.operationId,
    publicationRef: operation.identity.publicationRef,
    publicationRevision: operation.identity.publicationRevision,
    contractRef: operation.contract.ref,
  })
}

function preparedMaterialMatches(control: RecoveryControlRow, inputDigest: string): boolean {
  return control.preparedMaterialDigest === undefined || control.preparedMaterialDigest === inputDigest
}

function recoveryHistoryMatches(
  recovered: RecoveredCall,
  historyRows: readonly Readonly<{ executionRef: string }>[],
): boolean {
  return historyRows.every(({ executionRef }) => executionRef === recovered.callRef)
}

async function loadX402Attempt(
  ctx: ActionCtx,
  recovered: RecoveredCall,
  control: RecoveryControlRow,
  operation: PublishedTool,
) {
  if (operation.identity.adapterId !== 'x402-fetch:v2') return null
  if (control.currentAttemptRef === undefined || control.currentEffectGeneration === undefined) return null
  return await ctx.runQuery(internal.moneyX402PaymentAttempts.readX402PaymentAttempt, {
    dispatchRef: recovered.callRef,
    attemptRef: control.currentAttemptRef,
    effectGeneration: control.currentEffectGeneration,
  })
}

async function loadManagedReservation(
  ctx: ActionCtx,
  recovered: RecoveredCall,
  operation: PublishedTool,
) {
  if (
    operation.identity.adapterId !== 'x402-fetch:v2'
    || recovered.sellerOnboardingCanary !== undefined
    || recovered.quoteRef === undefined
  ) return null
  return await ctx.runQuery(internal.moneyManagedCallLifecycle.readReservation, {
    callRef: recovered.callRef,
  })
}

export type RecoveryWorkContext = NonNullable<Awaited<ReturnType<typeof loadRecoveryWorkContext>>>

export async function loadReadyRecoveryWork(
  ctx: ActionCtx,
  args: RecoveryIdentity,
): Promise<
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'persisted'; recovered: RecoveredCall }>
  | Readonly<{ kind: 'ready'; work: RecoveryWorkContext }>
> {
  const recovered = await loadRecoveredCall(ctx, args)
  if (recovered === null) return { kind: 'not_found' }
  const loaded = await loadRecoveryControl(ctx, recovered)
  if (loaded.kind !== 'ready') return loaded
  const work = await loadRecoveryWorkContext(
    ctx,
    loaded.recovered,
    loaded.port,
    loaded.control,
  )
  if (work === undefined) return { kind: 'not_found' }
  return { kind: 'ready', work }
}
