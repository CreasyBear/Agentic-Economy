import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isBoundedJsonValue } from '@/modules/capability-contract/public'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  buildDynamicPublishedInput,
  createDynamicPublishedAction,
  type DynamicPublishedInvocationInput,
} from '../../legacy-dynamic/dynamic-published-contract'
import {
  createDurableActionInvocationTracer,
  type ReconciliationEvidence,
} from '@/modules/action-invocation/runtime'
import {
  materializeRuntimePublishedOperation,
  parsePublishedOperationSnapshot,
  createPublicOperationRef,
  type PublishedOperation,
  type RuntimePublishedOperationDescriptor,
} from '@/modules/capability-supply/public'
import type { OperationInvokeReceipt } from '@/modules/capability-execution/operation-invoke-contracts'
import type { ActionCtx } from '../../../../../convex/_generated/server'
import { internal } from '../../../../../convex/_generated/api'
import {
  canonicalPort,
} from '../../../../../convex/capabilityOperationInvocationProjection'
import { brokeredChargeReservationForRecovery } from '../charge'
import { buildBrokeredX402Receipt } from '../brokeredX402'
import type { RecoveredInvocation, RecoveryIdentity } from './contracts'

type RecoveryPort = ReturnType<typeof canonicalPort>
export type RecoveryControlRow = NonNullable<Awaited<ReturnType<RecoveryPort['readControl']>>>

export async function loadRecoveredInvocation(
  ctx: ActionCtx,
  args: RecoveryIdentity,
): Promise<RecoveredInvocation | null> {
  const row = await ctx.runQuery(internal.capabilityOperationInvocations.readRecovery, {
    invocationRef: args.invocationRef,
    principalId: args.principalId,
    credentialId: args.credentialId,
  })
  return row
}

export async function loadRecoveryControl(
  ctx: ActionCtx,
  recovered: RecoveredInvocation,
): Promise<
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'persisted'; recovered: RecoveredInvocation }>
  | Readonly<{ kind: 'ready'; recovered: RecoveredInvocation; port: RecoveryPort; control: RecoveryControlRow }>
> {
  const port = canonicalPort(ctx)
  const control = await port.readControl(recovered.invocationRef)
  if (control === undefined) return { kind: 'persisted', recovered }
  if (
    control.control.owner.principalRef !== recovered.principalId
    || control.control.owner.callerRef !== recovered.credentialId
    || control.control.origin.kind !== 'standalone'
    || control.control.origin.principalRef !== recovered.principalId
    || control.control.origin.callerRef !== recovered.credentialId
    || control.control.invocationRef !== recovered.invocationRef
    || control.sourceRef !== `operation-invocation-source:${recovered.invocationRef}`
  ) return { kind: 'not_found' }
  return { kind: 'ready', recovered, port, control }
}

function createRecoveryControlOnlyAction(input: Readonly<{
  operation: PublishedOperation
  descriptor: RuntimePublishedOperationDescriptor
}>) {
  const refused = (value: DynamicPublishedInvocationInput) => ({
    kind: 'published_operation_refused' as const,
    sourceDisposition: 'refused' as const,
    operationId: input.operation.operationId,
    operationVersion: input.descriptor.version,
    requestDigest: value.inputDigest,
    failureCode: 'recovery_control_only',
  })
  return createDynamicPublishedAction({
    operation: input.operation,
    descriptor: input.descriptor,
    now: () => Date.now(),
    run: async (value) => refused(value),
    preReleaseCheck: async (value) => refused(value),
  })
}

export async function loadRecoveryWorkContext(
  ctx: ActionCtx,
  recovered: RecoveredInvocation,
  port: RecoveryPort,
  control: RecoveryControlRow,
  includeBrokeredReservation: boolean,
) {
  const material = parseRecoveryMaterial(recovered)
  if (material === undefined) return undefined
  const { operation, descriptor, dynamicInput } = material
  if (!recoveryMaterialMatches(recovered, control, material)) return undefined
  const priceAmount = descriptor.price.kind === 'fixed' ? descriptor.price.amount : undefined
  if (priceAmount === undefined) return undefined

  const [attemptRows, historyRows] = await Promise.all([
    port.readAttempts(recovered.invocationRef, 100),
    port.readHistory(recovered.invocationRef, 0, 100),
  ])
  if (!recoveryHistoryMatches(recovered, historyRows)) return undefined
  const attempts = attemptRows.map(({ invocationRef: _invocationRef, recordedAt: _recordedAt, ...attempt }) => attempt)
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
  const action = createRecoveryControlOnlyAction({ operation, descriptor })
  const x402Attempt = await loadX402Attempt(ctx, recovered, control, operation)
  const brokeredReservation = await loadBrokeredReservation(
    ctx,
    recovered,
    control,
    operation,
    includeBrokeredReservation,
  )
  const brokeredReceipt = (
    state: 'settled' | 'refunded' | 'reconciliation_required',
    evidenceHash: string,
    issuedAt: string,
    externalSettlementRef?: string,
    settlementTransactionHash?: string,
    paymentIdentifier?: string,
    refundState?: OperationInvokeReceipt['refundState'],
    lossState?: OperationInvokeReceipt['lossState'],
  ) => brokeredReservation === undefined
    ? undefined
    : buildBrokeredX402Receipt({
        operation,
        invocationRef: recovered.invocationRef,
        operationRef: recovered.operationRef,
        state,
        evidenceHash,
        issuedAt,
        ...(brokeredReservation.charge.transactionRef === undefined ? {} : { transactionRef: brokeredReservation.charge.transactionRef }),
        ...(externalSettlementRef === undefined ? {} : { externalSettlementRef }),
        ...(settlementTransactionHash === undefined ? {} : { settlementTransactionHash }),
        ...(paymentIdentifier === undefined ? {} : { paymentIdentifier }),
        ...(brokeredReservation.charge.transactionRef === undefined ? {} : { accountingTransactionRefs: [brokeredReservation.charge.transactionRef] }),
        ...(refundState === undefined ? {} : { refundState }),
        ...(lossState === undefined ? {} : { lossState }),
      })
  const trustedReconciliationEvidenceDigest: { value?: string } = {}
  const tracer = createDurableActionInvocationTracer({
    action,
    port,
    now: () => new Date().toISOString(),
    nextInvocationRef: () => recovered.invocationRef,
    nextAuthorityRef: () => `operation-authority:${recovered.invocationRef}`,
    nextAttemptRef: () => `${recovered.invocationRef}:recovery`,
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
        evidence.operationRef !== recovered.operationRef
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
    format: 'action-invocation-control:development:v1' as const,
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
    brokeredReservation,
    brokeredReceipt,
    trustedReconciliationEvidenceDigest,
  }
}

type RecoveryMaterial = Readonly<{
  operation: PublishedOperation
  descriptor: RuntimePublishedOperationDescriptor
  dynamicInput: DynamicPublishedInvocationInput
}>

function parseRecoveryMaterial(recovered: RecoveredInvocation): RecoveryMaterial | undefined {
  try {
    const operation = parsePublishedOperationSnapshot(recovered.operationJson)
    if (operation === undefined) return undefined
    const descriptor = materializeRuntimePublishedOperation(operation)
    const parsedInput: unknown = JSON.parse(recovered.inputJson)
    if (!isBoundedJsonValue(parsedInput)) return undefined
    const dynamicInput = buildDynamicPublishedInput({ operation, descriptor, value: parsedInput })
    return { operation, descriptor, dynamicInput }
  } catch {
    return undefined
  }
}

function recoveryMaterialMatches(
  recovered: RecoveredInvocation,
  control: RecoveryControlRow,
  material: RecoveryMaterial,
): boolean {
  return operationReference(material.operation) === recovered.operationRef
    && material.dynamicInput.inputDigest === recovered.inputDigest
    && preparedMaterialMatches(control, material.dynamicInput.inputDigest)
    && control.control.action.id === material.operation.operationId
    && control.control.action.contractVersion === material.descriptor.version
}

function operationReference(operation: PublishedOperation): string {
  return createPublicOperationRef({
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
  recovered: RecoveredInvocation,
  historyRows: readonly Readonly<{ invocationRef: string }>[],
): boolean {
  return historyRows.every(({ invocationRef }) => invocationRef === recovered.invocationRef)
}

async function loadX402Attempt(
  ctx: ActionCtx,
  recovered: RecoveredInvocation,
  control: RecoveryControlRow,
  operation: PublishedOperation,
) {
  if (operation.identity.adapterId !== 'x402-fetch:v2') return null
  if (control.currentAttemptRef === undefined || control.currentEffectGeneration === undefined) return null
  return await ctx.runQuery(internal.moneyX402PaymentAttempts.readX402PaymentAttempt, {
    dispatchRef: recovered.invocationRef,
    attemptRef: control.currentAttemptRef,
    effectGeneration: control.currentEffectGeneration,
  })
}

async function loadBrokeredReservation(
  ctx: ActionCtx,
  recovered: RecoveredInvocation,
  control: RecoveryControlRow,
  operation: PublishedOperation,
  include: boolean,
) {
  if (!include || operation.identity.adapterId !== 'x402-fetch:v2' || recovered.environment !== 'production') {
    return undefined
  }
  return await brokeredChargeReservationForRecovery(ctx, {
    operation,
    dispatch: recovered,
    durableAttemptRef: control.currentAttemptRef
      ?? recovered.attemptRef
      ?? `operation-attempt:${recovered.invocationRef}:1`,
  })
}

export type RecoveryWorkContext = NonNullable<Awaited<ReturnType<typeof loadRecoveryWorkContext>>>

export async function loadReadyRecoveryWork(
  ctx: ActionCtx,
  args: RecoveryIdentity,
  includeBrokeredReservation: boolean,
): Promise<
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'persisted'; recovered: RecoveredInvocation }>
  | Readonly<{ kind: 'ready'; work: RecoveryWorkContext }>
> {
  const recovered = await loadRecoveredInvocation(ctx, args)
  if (recovered === null) return { kind: 'not_found' }
  const loaded = await loadRecoveryControl(ctx, recovered)
  if (loaded.kind !== 'ready') return loaded
  const work = await loadRecoveryWorkContext(
    ctx,
    loaded.recovered,
    loaded.port,
    loaded.control,
    includeBrokeredReservation,
  )
  if (work === undefined) return { kind: 'not_found' }
  return { kind: 'ready', work }
}
