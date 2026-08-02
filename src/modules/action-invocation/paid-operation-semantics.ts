import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { ActionResult } from '@/modules/common/action'
import type { StableHashValue } from '@/modules/common/stable-hash'
import type { ActionInvocationView } from './contracts'

export const PAID_OPERATION_SEMANTICS_SCHEMA = 'agentic-paid-operation:v1' as const
export const PAID_OPERATION_SEMANTIC_DIGEST_USE =
  'projection_equality_only_not_authority' as const

export type OpaqueDigestReference = Readonly<{
  kind: 'opaque_digest_reference'
  algorithm: 'sha256'
  digest: string
}>

export type PaidOperationQueryRelease =
  | Readonly<{ state: 'not_released' }>
  | Readonly<{ state: 'released'; recipient: string; evidenceRefs: readonly string[] }>
  | Readonly<{ state: 'unknown'; evidenceRefs: readonly string[] }>

export type PaidOperationPaymentAuthorization =
  | Readonly<{ state: 'not_created' }>
  | Readonly<{
      state: 'created'
      paymentIdentifier: string
      custodyReference: OpaqueDigestReference
      evidenceRefs: readonly string[]
    }>

export type PaidOperationPaymentSubmission =
  | Readonly<{ state: 'not_submitted' }>
  | Readonly<{ state: 'possibly_submitted'; evidenceRefs: readonly string[] }>
  | Readonly<{ state: 'observed'; evidenceRefs: readonly string[] }>

export type PaidOperationSettlement =
  | Readonly<{ state: 'no_evidence' }>
  | Readonly<{ state: 'not_settled'; evidenceRefs: readonly string[] }>
  | Readonly<{
      state: 'settled'
      amount: Readonly<{ currency: string; amountMinor: number }>
      evidenceRefs: readonly string[]
    }>
  | Readonly<{ state: 'unknown'; evidenceRefs: readonly string[] }>

export type PaidOperationPaymentAttemptSnapshot = Readonly<{
  paymentIdentifier: string
  custodyRef: string
  settledAmount?: Readonly<{ currency: string; amountMinor: number }>
  state:
    | 'prepared'
    | 'possibly_submitted'
    | 'observed'
    | 'reconciliation_required'
    | 'not_settled'
    | 'settled'
  evidenceRefs: readonly string[]
}>

export type PaidOperationPresentationBlock =
  | Readonly<{ kind: 'text'; label: string; value: string }>
  | Readonly<{ kind: 'measurement'; label: string; value: number; unit: string }>
  | Readonly<{ kind: 'money'; label: string; amountMinor: number; currency: string }>
  | Readonly<{ kind: 'timestamp'; label: string; value: string }>
  | Readonly<{
      kind: 'source'
      label: string
      providerId: string
      providerName: string
      operationRevision: string
    }>
  | Readonly<{ kind: 'reference'; label: string; value: string }>
  | Readonly<{
      kind: 'status'
      label: string
      value: string
      tone: 'neutral' | 'positive' | 'caution' | 'critical'
    }>

export type PaidOperationResultDelivery =
  | Readonly<{ state: 'not_delivered' }>
  | Readonly<{ state: 'invalid'; code: string; evidenceRefs: readonly string[] }>
  | Readonly<{
      state: 'valid'
      blocks: readonly PaidOperationPresentationBlock[]
      evidenceRefs: readonly string[]
    }>

export type PaidOperationError = Readonly<{
  code: string
  phase:
    | 'inspection'
    | 'authority'
    | 'challenge'
    | 'payment_preparation'
    | 'paid_dispatch'
    | 'result_validation'
    | 'reconciliation'
  queryReleaseStatus: PaidOperationQueryRelease['state']
  paymentSubmissionStatus: PaidOperationPaymentSubmission['state']
  settlementStatus: PaidOperationSettlement['state']
  resultStatus: PaidOperationResultDelivery['state']
  retryability: 'not_retryable' | 'reconcile_before_retry' | 'retryable'
  safeNextAction: PaidOperationContinuation['kind'] | null
  evidenceRefs: readonly string[]
}>

export type PaidOperationContinuation = Readonly<{
  kind: 'authorize' | 'execute' | 'inspect' | 'reconcile' | 'retry'
  command:
    | 'authorize_paid_operation'
    | 'execute_paid_operation'
    | 'inspect_paid_operation'
    | 'reconcile_paid_operation'
    | 'retry_paid_operation'
  requiredInput: readonly string[]
  expectedInvocationVersion: number
  authorityRequired: boolean
}>

export type PaidOperationSemantics = Readonly<{
  schema: typeof PAID_OPERATION_SEMANTICS_SCHEMA
  identity: Readonly<{
    invocationRef: string
    expectedInvocationVersion: number
  }>
  operation: Readonly<{
    operationKey: string
    providerId: string
    providerName: string
    operationRevision: string
    materialInputs: StableHashValue
  }>
  presentation: Readonly<{
    title: string
    summary: string
    blocks: readonly PaidOperationPresentationBlock[]
  }>
  maximumAuthorizedCharge: Readonly<{ currency: string; amountMinor: number }>
  queryRelease: PaidOperationQueryRelease
  paymentAuthorization: PaidOperationPaymentAuthorization
  paymentSubmission: PaidOperationPaymentSubmission
  settlement: PaidOperationSettlement
  resultDelivery: PaidOperationResultDelivery
  environment: Readonly<{
    name: string
    evidenceClass: string
    claimCeiling: string
  }>
  error: PaidOperationError | null
  continuations: readonly PaidOperationContinuation[]
}>

export type RichPaidOperationProjection = Readonly<{
  kind: 'human_rich_paid_operation'
  title: string
  sections: readonly Readonly<{ label: string; value: StableHashValue }>[]
  semantics: PaidOperationSemantics
  semanticDigest: string
  semanticDigestUse: typeof PAID_OPERATION_SEMANTIC_DIGEST_USE
}>

export type StructuredPaidOperationProjection = Readonly<{
  kind: 'external_agent_paid_operation'
  semantics: PaidOperationSemantics
  semanticDigest: string
  semanticDigestUse: typeof PAID_OPERATION_SEMANTIC_DIGEST_USE
}>

export function createPaidOperationSemantics(
  input: Omit<PaidOperationSemantics, 'schema'>,
): PaidOperationSemantics {
  const semantics: PaidOperationSemantics = structuredClone({
    ...input,
    schema: PAID_OPERATION_SEMANTICS_SCHEMA,
  })
  assertPaidOperationSemantics(semantics)
  return semantics
}

/**
 * Derives the shared product truth from durable invocation and payment state.
 * Operation-owned code supplies only labels, material inputs and interpreted
 * result blocks; it cannot rewrite release, payment or continuation truth.
 */
export function derivePaidOperationSemantics<Result extends ActionResult>(input: Readonly<{
  view: ActionInvocationView<Result>
  paymentAttempt?: PaidOperationPaymentAttemptSnapshot
  operation: PaidOperationSemantics['operation']
  presentation: PaidOperationSemantics['presentation']
  maximumAuthorizedCharge: PaidOperationSemantics['maximumAuthorizedCharge']
  queryRecipient: string
  resultDelivery: PaidOperationResultDelivery
  environment: PaidOperationSemantics['environment']
}>): PaidOperationSemantics {
  const attempt = input.view.attempts.at(-1)
  const release = attempt?.release.state
  const queryRelease: PaidOperationQueryRelease = release === 'not_released' || release === undefined
    ? { state: 'not_released' }
    : release === 'released'
      ? { state: 'released', recipient: input.queryRecipient, evidenceRefs: [] }
      : { state: 'unknown', evidenceRefs: [] }
  const paymentAuthorization: PaidOperationPaymentAuthorization = input.paymentAttempt === undefined
    ? { state: 'not_created' }
    : {
        state: 'created',
        paymentIdentifier: input.paymentAttempt.paymentIdentifier,
        custodyReference: opaqueDigestReference(input.paymentAttempt.custodyRef),
        evidenceRefs: input.paymentAttempt.evidenceRefs,
      }
  const paymentSubmission = projectPaymentSubmission(input.paymentAttempt)
  const settlement = projectSettlement(input.paymentAttempt)
  const requiresReconciliation = input.view.control.state === 'reconciliation_required'
    || input.paymentAttempt?.state === 'reconciliation_required'
  const continuations: PaidOperationContinuation[] = requiresReconciliation
    ? [{
        kind: 'reconcile',
        command: 'reconcile_paid_operation',
        requiredInput: ['reconciliationEvidence', 'paymentReconciliationEvidence'],
        expectedInvocationVersion: input.view.invocationVersion,
        authorityRequired: false,
      }]
    : input.view.control.state === 'awaiting_authority'
      ? [{
          kind: 'authorize',
          command: 'authorize_paid_operation',
          requiredInput: ['authorityDecision'],
          expectedInvocationVersion: input.view.invocationVersion,
          authorityRequired: true,
        }]
      : input.view.control.state === 'authorized'
        ? [{
            kind: 'execute',
            command: 'execute_paid_operation',
            requiredInput: [],
            expectedInvocationVersion: input.view.invocationVersion,
            authorityRequired: true,
          }]
    : [{
        kind: 'inspect',
        command: 'inspect_paid_operation',
        requiredInput: [],
        expectedInvocationVersion: input.view.invocationVersion,
        authorityRequired: false,
      }]
  const error = input.view.observedResolution.state === 'threw' || requiresReconciliation
    ? {
        code: input.view.observedResolution.state === 'threw'
          ? input.view.observedResolution.message
          : 'reconciliation_required',
        phase: 'reconciliation' as const,
        queryReleaseStatus: queryRelease.state,
        paymentSubmissionStatus: paymentSubmission.state,
        settlementStatus: settlement.state,
        resultStatus: input.resultDelivery.state,
        retryability: 'reconcile_before_retry' as const,
        safeNextAction: 'reconcile' as const,
        evidenceRefs: input.paymentAttempt?.evidenceRefs ?? [],
      }
    : null
  return createPaidOperationSemantics({
    identity: {
      invocationRef: input.view.invocationRef,
      expectedInvocationVersion: input.view.invocationVersion,
    },
    operation: input.operation,
    presentation: input.presentation,
    maximumAuthorizedCharge: input.maximumAuthorizedCharge,
    queryRelease,
    paymentAuthorization,
    paymentSubmission,
    settlement,
    resultDelivery: input.resultDelivery,
    environment: input.environment,
    error,
    continuations,
  })
}

function projectPaymentSubmission(
  attempt: PaidOperationPaymentAttemptSnapshot | undefined,
): PaidOperationPaymentSubmission {
  if (attempt === undefined || attempt.state === 'prepared') return { state: 'not_submitted' }
  if (attempt.state === 'possibly_submitted' || attempt.state === 'reconciliation_required') {
    return { state: 'possibly_submitted', evidenceRefs: attempt.evidenceRefs }
  }
  return { state: 'observed', evidenceRefs: attempt.evidenceRefs }
}

function projectSettlement(
  attempt: PaidOperationPaymentAttemptSnapshot | undefined,
): PaidOperationSettlement {
  if (attempt?.state === 'settled') {
    if (attempt.settledAmount === undefined || attempt.evidenceRefs.length === 0) {
      throw new Error('paid_operation_settlement_invalid')
    }
    return {
      state: 'settled',
      amount: attempt.settledAmount,
      evidenceRefs: attempt.evidenceRefs,
    }
  }
  if (attempt?.state === 'not_settled') {
    return { state: 'not_settled', evidenceRefs: attempt.evidenceRefs }
  }
  if (attempt === undefined || attempt.state === 'prepared') return { state: 'no_evidence' }
  return { state: 'unknown', evidenceRefs: attempt.evidenceRefs }
}

export function projectRichPaidOperation(
  input: PaidOperationSemantics,
): RichPaidOperationProjection {
  const semantics = cloneAndValidate(input)
  const sections: RichPaidOperationProjection['sections'] = [
    {
      label: 'Operation',
      value: {
        provider: semantics.operation.providerName,
        summary: semantics.presentation.summary,
        materialInputs: semantics.operation.materialInputs,
        presentation: semantics.presentation.blocks,
        maximumAuthorizedCharge: semantics.maximumAuthorizedCharge,
        environment: semantics.environment,
      },
    },
    {
      label: 'What happened',
      value: {
        queryRelease: semantics.queryRelease,
        paymentAuthorization: semantics.paymentAuthorization,
        paymentSubmission: semantics.paymentSubmission,
        settlement: semantics.settlement,
        resultDelivery: semantics.resultDelivery,
      },
    },
    {
      label: 'Safe next action',
      value: {
        error: semantics.error,
        continuations: semantics.continuations,
      },
    },
  ]
  return {
    kind: 'human_rich_paid_operation',
    title: semantics.presentation.title,
    sections,
    semantics,
    semanticDigest: digest(semantics),
    semanticDigestUse: PAID_OPERATION_SEMANTIC_DIGEST_USE,
  }
}

export function projectStructuredPaidOperation(
  input: PaidOperationSemantics,
): StructuredPaidOperationProjection {
  const semantics = cloneAndValidate(input)
  return {
    kind: 'external_agent_paid_operation',
    semantics,
    semanticDigest: digest(semantics),
    semanticDigestUse: PAID_OPERATION_SEMANTIC_DIGEST_USE,
  }
}

function assertPaidOperationSemantics(value: PaidOperationSemantics): void {
  if (
    value.schema !== PAID_OPERATION_SEMANTICS_SCHEMA
    || value.identity.invocationRef.trim().length === 0
    || !Number.isSafeInteger(value.identity.expectedInvocationVersion)
    || value.identity.expectedInvocationVersion < 1
    || value.operation.operationKey.trim().length === 0
    || value.operation.providerId.trim().length === 0
    || value.operation.operationRevision.trim().length === 0
    || value.maximumAuthorizedCharge.currency.trim().length === 0
    || !Number.isSafeInteger(value.maximumAuthorizedCharge.amountMinor)
    || value.maximumAuthorizedCharge.amountMinor < 0
    || value.environment.name.trim().length === 0
    || value.environment.evidenceClass.trim().length === 0
    || value.environment.claimCeiling.trim().length === 0
  ) throw new Error('paid_operation_semantics_invalid')

  const uncertain = value.paymentSubmission.state === 'possibly_submitted'
    || value.settlement.state === 'unknown'
  if (uncertain && value.continuations.some(({ kind }) => kind === 'retry')) {
    throw new Error('paid_operation_retry_requires_reconciliation')
  }
  if (
    value.paymentSubmission.state !== 'not_submitted'
    && value.paymentAuthorization.state !== 'created'
  ) throw new Error('paid_operation_submission_without_authorization')
  if (
    value.paymentAuthorization.state === 'created'
    && (value.paymentAuthorization.paymentIdentifier.trim().length === 0
      || !opaqueDigestReferenceValid(value.paymentAuthorization.custodyReference))
  ) throw new Error('paid_operation_authorization_invalid')
  if (
    value.paymentAuthorization.state === 'created'
    && value.continuations.some(({ kind }) => kind === 'authorize')
  ) throw new Error('paid_operation_authorization_state_mismatch')
  if (
    value.settlement.state === 'settled'
    && (!Number.isSafeInteger(value.settlement.amount.amountMinor)
      || value.settlement.amount.amountMinor < 0
      || value.settlement.amount.currency.trim().length === 0
      || value.settlement.evidenceRefs.length === 0
      || value.settlement.evidenceRefs.some((reference) => reference.trim().length === 0))
  ) throw new Error('paid_operation_settlement_invalid')
  if (value.continuations.some((continuation) =>
    continuation.expectedInvocationVersion !== value.identity.expectedInvocationVersion
    || continuation.command !== continuationCommand(continuation.kind))) {
    throw new Error('paid_operation_continuation_invalid')
  }
  if (
    value.error !== null
    && (value.error.queryReleaseStatus !== value.queryRelease.state
      || value.error.paymentSubmissionStatus !== value.paymentSubmission.state
      || value.error.settlementStatus !== value.settlement.state
      || value.error.resultStatus !== value.resultDelivery.state
      || (value.error.safeNextAction !== null
        && !value.continuations.some(({ kind }) => kind === value.error?.safeNextAction)))
  ) throw new Error('paid_operation_error_state_mismatch')
  if (
    value.presentation.title.trim().length === 0
    || !presentationBlocksUnique(value.presentation.blocks)
    || value.presentation.blocks.some((block) => !presentationBlockValid(block))
    || (value.resultDelivery.state === 'valid'
      && (value.resultDelivery.blocks.length === 0
        || !presentationBlocksUnique(value.resultDelivery.blocks)
        || value.resultDelivery.blocks.some((block) => !presentationBlockValid(block))))
  ) throw new Error('paid_operation_presentation_invalid')
}

function continuationCommand(
  kind: PaidOperationContinuation['kind'],
): PaidOperationContinuation['command'] {
  switch (kind) {
    case 'authorize':
      return 'authorize_paid_operation'
    case 'execute':
      return 'execute_paid_operation'
    case 'inspect':
      return 'inspect_paid_operation'
    case 'reconcile':
      return 'reconcile_paid_operation'
    case 'retry':
      return 'retry_paid_operation'
  }
}

function opaqueDigestReference(value: string): OpaqueDigestReference {
  if (!/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new Error('paid_operation_custody_reference_invalid')
  }
  return {
    kind: 'opaque_digest_reference',
    algorithm: 'sha256',
    digest: value,
  }
}

function opaqueDigestReferenceValid(value: OpaqueDigestReference): boolean {
  return value.kind === 'opaque_digest_reference'
    && value.algorithm === 'sha256'
    && /^sha256:[0-9a-f]{64}$/.test(value.digest)
}

function presentationBlocksUnique(blocks: readonly PaidOperationPresentationBlock[]): boolean {
  const keys = new Set(blocks.map((block) => `${block.kind}:${block.label}`))
  return keys.size === blocks.length
}

function presentationBlockValid(block: PaidOperationPresentationBlock): boolean {
  if (block.label.trim().length === 0) return false
  switch (block.kind) {
    case 'text':
    case 'reference':
      return block.value.trim().length > 0
    case 'measurement':
      return Number.isFinite(block.value) && block.unit.trim().length > 0
    case 'money':
      return Number.isSafeInteger(block.amountMinor)
        && block.amountMinor >= 0
        && block.currency.trim().length > 0
    case 'timestamp':
      return !Number.isNaN(Date.parse(block.value))
    case 'source':
      return block.providerId.trim().length > 0
        && block.providerName.trim().length > 0
        && block.operationRevision.trim().length > 0
    case 'status':
      return block.value.trim().length > 0
  }
}

function cloneAndValidate(input: PaidOperationSemantics): PaidOperationSemantics {
  const semantics = structuredClone(input)
  assertPaidOperationSemantics(semantics)
  return semantics
}


function digest(input: PaidOperationSemantics): string {
  return canonicalDigest(input)
}
