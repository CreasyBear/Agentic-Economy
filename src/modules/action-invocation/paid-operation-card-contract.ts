import type { PaidOperationProjection } from './paid-operation-application-service'
import type {
  PaidOperationContinuation,
  PaidOperationPresentationBlock,
  PaidOperationSemantics,
} from './paid-operation-semantics'

export type HostedPaidOperationCommandDescriptor = Readonly<{
  command: 'authorize' | 'execute' | 'inspect' | 'reconcile'
  commandIdRequired: true
  expectedInvocationVersion: number
  requiredInput: readonly string[]
  accept?: boolean
}>

export type HostedPaidOperationCardInput = Readonly<{
  disclosure: Readonly<{
    providerDisplayName: string
    materialFields: readonly string[]
    maximumCharge: Readonly<{ currency: string; amountMinor: number }>
  }>
  authorize: HostedPaidOperationCommandDescriptor | null
  refuse: HostedPaidOperationCommandDescriptor | null
  pendingCommand: null | Readonly<{ pendingCommandId: string; kind: string }>
  transportRescue: null | Readonly<{
    kind: 'update_not_confirmed'
    requestId: string
    inspectRelation: string
  }>
  paymentTruth: PaidOperationProjection['semantics']['paymentSubmission']
  settlementTruth: PaidOperationProjection['semantics']['settlement']
  resultTruth: PaidOperationProjection['semantics']['resultDelivery']
  safeContinuation: HostedPaidOperationCommandDescriptor | null
  noActionReason: string | null
  operationBlocks: readonly PaidOperationPresentationBlock[]
  runtimeEvidence: Readonly<{
    environment: string
    provenance: string
    evidenceClass: string
    claimCeiling: string
  }>
  technicalDetails: Readonly<{
    invocationRef: string
    expectedInvocationVersion: number
    operationRevision: string
    providerId: string
    semanticDigest: string
    semanticDigestUse: 'projection_equality_only_not_authority'
    evidenceReferences: readonly string[]
  }>
}>

export type HostedPaidOperationHumanAcceptedReadback = Readonly<{
  kind: 'accepted'
  schema: 'agentic-paid-operation:v1'
  projection: PaidOperationProjection['human']
  expectedInvocationVersion: number
  environment: HostedPaidOperationCardInput['runtimeEvidence']
  card: HostedPaidOperationCardInput
}>

export type HostedPaidOperationCardPresentation = Readonly<{
  label: string
  badgeVariant: 'neutral' | 'info' | 'warning' | 'error' | 'success'
  icon: 'info' | 'clock' | 'search' | 'success' | 'warning' | 'error'
  truth: string
  nextAction: string
}>

/**
 * Projects the already-derived paid-operation truth into the frozen card DTO.
 * The host supplies provenance; this helper never resolves provider or operation facts.
 */
export function projectHostedPaidOperationCardInput(
  projection: PaidOperationProjection,
  provenance: string,
): HostedPaidOperationCardInput {
  const semantics = projection.semantics
  const continuation = safeContinuation(semantics.continuations)
  const authorize = semantics.continuations.find((item) => item.kind === 'authorize')
  const evidenceReferences = [
    ...semantics.queryRelease.state === 'not_released' ? [] : semantics.queryRelease.evidenceRefs,
    ...semantics.paymentSubmission.state === 'not_submitted'
      ? []
      : semantics.paymentSubmission.evidenceRefs,
    ...semantics.settlement.state === 'no_evidence' ? [] : semantics.settlement.evidenceRefs,
    ...semantics.resultDelivery.state === 'not_delivered'
      ? []
      : semantics.resultDelivery.evidenceRefs,
  ]

  return Object.freeze({
    disclosure: {
      providerDisplayName: semantics.operation.providerName,
      materialFields: materialDisclosure(semantics.operation.materialInputs),
      maximumCharge: semantics.maximumAuthorizedCharge,
    },
    authorize: authorize === undefined ? null : descriptor(authorize, true),
    refuse: authorize === undefined ? null : descriptor(authorize, false),
    pendingCommand: null,
    transportRescue: null,
    paymentTruth: semantics.paymentSubmission,
    settlementTruth: semantics.settlement,
    resultTruth: semantics.resultDelivery,
    safeContinuation: continuation === undefined ? null : descriptor(continuation),
    noActionReason: continuation === undefined
      ? 'No further action is available for this operation.'
      : null,
    operationBlocks: semantics.presentation.blocks,
    runtimeEvidence: {
      environment: semantics.environment.name,
      provenance,
      evidenceClass: semantics.environment.evidenceClass,
      claimCeiling: semantics.environment.claimCeiling,
    },
    technicalDetails: {
      invocationRef: semantics.identity.invocationRef,
      expectedInvocationVersion: semantics.identity.expectedInvocationVersion,
      operationRevision: semantics.operation.operationRevision,
      providerId: semantics.operation.providerId,
      semanticDigest: projection.human.semanticDigest,
      semanticDigestUse: projection.human.semanticDigestUse,
      evidenceReferences: [...new Set(evidenceReferences)].sort(),
    },
  })
}

/**
 * Derives display-only language from source-issued paid-operation truth.
 * It does not infer provider outcomes, authority, payment or settlement.
 */
export function projectHostedPaidOperationCardPresentation(
  semantics: PaidOperationSemantics,
  card: HostedPaidOperationCardInput,
): HostedPaidOperationCardPresentation {
  const uncertain = card.paymentTruth.state === 'possibly_submitted'
    || card.settlementTruth.state === 'unknown'

  if (card.resultTruth.state === 'invalid' && uncertain) {
    return {
      label: 'Result not validated',
      badgeVariant: 'warning',
      icon: 'warning',
      truth: 'Payment may have occurred, but the returned result could not be validated.',
      nextAction: 'Check the existing payment and result. Do not start this purchase again.',
    }
  }

  if (semantics.error?.code === 'reconciliation_in_progress') {
    return {
      label: 'Checking existing payment',
      badgeVariant: 'info',
      icon: 'search',
      truth: 'AE is checking the existing payment and request. No new request will be sent.',
      nextAction: 'Wait for the read-only check to finish.',
    }
  }

  if (uncertain) {
    return {
      label: 'Needs checking',
      badgeVariant: 'warning',
      icon: 'warning',
      truth: 'The provider may have received the payment request. AE will not try again until the exact payment is checked.',
      nextAction: 'Check the existing payment and request. Do not start this purchase again.',
    }
  }

  if (card.settlementTruth.state === 'not_settled') {
    return {
      label: 'Checked — not paid',
      badgeVariant: 'info',
      icon: 'search',
      truth: 'Evidence shows the earlier payment was not settled.',
      nextAction: 'Review the recorded details. A new result requires a new operation and permission.',
    }
  }

  if (card.resultTruth.state === 'valid') {
    const paymentTruth = card.settlementTruth.state === 'settled'
      ? `The mock provider's recorded evidence reports ${
          formatHostedPaidOperationMoney(card.settlementTruth.amount)
        } settled.`
      : 'No independent payment settlement is recorded.'
    return {
      label: 'Result received',
      badgeVariant: 'success',
      icon: 'success',
      truth: `The result was received and validated. ${paymentTruth}`,
      nextAction: 'Review the result and its recorded source.',
    }
  }

  if (
    card.settlementTruth.state === 'settled'
    && card.resultTruth.state === 'invalid'
  ) {
    return {
      label: 'Paid — result unusable',
      badgeVariant: 'warning',
      icon: 'warning',
      truth: `Recorded evidence supports a payment of ${
        formatHostedPaidOperationMoney(card.settlementTruth.amount)
      }, but the returned result was not validated.`,
      nextAction: 'Review the payment and result evidence. Do not assume another result is free.',
    }
  }

  if (
    semantics.error !== null
    && semantics.queryRelease.state === 'not_released'
    && card.paymentTruth.state === 'not_submitted'
  ) {
    const refused = semantics.error.code === 'authority_refused'
    return {
      label: 'Not sent',
      badgeVariant: 'error',
      icon: 'error',
      truth: refused
        ? 'You did not authorize this operation. Nothing was sent to the provider and no payment request was submitted.'
        : `The operation stopped before anything was sent or paid. Reason: ${
            semantics.error.code.replaceAll('_', ' ')
          }.`,
      nextAction: 'Review why the operation stopped.',
    }
  }

  if (
    semantics.paymentAuthorization.state === 'created'
    && card.paymentTruth.state === 'not_submitted'
  ) {
    return {
      label: 'Payment prepared',
      badgeVariant: 'info',
      icon: 'clock',
      truth: 'Permission recorded. Nothing has been submitted yet.',
      nextAction: card.safeContinuation?.command === 'execute'
        ? 'Continue this exact operation.'
        : 'Review the prepared operation.',
    }
  }

  if (card.paymentTruth.state === 'observed') {
    return {
      label: 'Waiting for result',
      badgeVariant: 'info',
      icon: 'clock',
      truth: 'The provider received the payment request. AE is waiting for attributable payment and result evidence.',
      nextAction: 'Wait for the recorded request to resolve. Do not send another.',
    }
  }

  if (card.authorize !== null) {
    return {
      label: 'Ready for permission',
      badgeVariant: 'neutral',
      icon: 'info',
      truth: 'Nothing has been sent or paid. Review the mock provider, shared data and maximum charge.',
      nextAction: `Authorize up to ${
        formatHostedPaidOperationMoney(card.disclosure.maximumCharge)
      } or do not authorize this operation.`,
    }
  }

  return {
    label: 'Ready to inspect',
    badgeVariant: 'neutral',
    icon: 'info',
    truth: 'Nothing has been sent to the provider and no payment request has been submitted.',
    nextAction: 'Review the provider, shared data and maximum charge.',
  }
}

export function hostedPaidOperationCommandLabel(
  descriptor: HostedPaidOperationCommandDescriptor,
  maximumCharge: Readonly<{ currency: string; amountMinor: number }>,
): string {
  switch (descriptor.command) {
    case 'authorize':
      return descriptor.accept === false
        ? 'Do not authorize'
        : `Authorize up to ${formatHostedPaidOperationMoney(maximumCharge)}`
    case 'execute':
      return 'Continue operation'
    case 'reconcile':
      return 'Check existing payment'
    case 'inspect':
      return 'Review details'
  }
}

export function hostedPaidOperationCommandDescriptorIsSafe(
  descriptor: HostedPaidOperationCommandDescriptor,
): boolean {
  if (
    descriptor.commandIdRequired !== true
    || !Number.isSafeInteger(descriptor.expectedInvocationVersion)
    || descriptor.expectedInvocationVersion < 1
  ) return false
  if (descriptor.command === 'authorize') {
    return typeof descriptor.accept === 'boolean'
      && descriptor.requiredInput.length === 1
      && descriptor.requiredInput[0] === 'accept'
  }
  return descriptor.accept === undefined && descriptor.requiredInput.length === 0
}

export function formatHostedPaidOperationMoney(
  value: Readonly<{ currency: string; amountMinor: number }>,
): string {
  let formatter = moneyFormatters.get(value.currency)
  if (formatter === undefined) {
    formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: value.currency,
    })
    moneyFormatters.set(value.currency, formatter)
  }
  const minorUnitExponent = formatter.resolvedOptions().maximumFractionDigits ?? 2
  return formatter.format(value.amountMinor / (10 ** minorUnitExponent))
}

export function formatHostedPaidOperationAccessibleMoney(
  value: Readonly<{ currency: string; amountMinor: number }>,
): string {
  if (value.currency === 'USD' && value.amountMinor === 1) {
    return 'one cent, United States dollars'
  }
  return `${formatHostedPaidOperationMoney(value)} ${value.currency}`
}

export function formatHostedPaidOperationMaterialFields(
  values: readonly string[],
): string {
  if (values.length === 0) return 'No material data listed'
  if (values.length === 1) return values[0] ?? 'No material data listed'
  if (values.length === 2) return `${values[0]} and ${values[1]}`
  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`
}

export function formatHostedPaidOperationQueryRelease(
  truth: PaidOperationSemantics['queryRelease'],
): string {
  switch (truth.state) {
    case 'not_released':
      return 'Not shared'
    case 'released':
      return `Shared with ${truth.recipient}`
    case 'unknown':
      return 'Sharing status unknown'
  }
}

export function formatHostedPaidOperationPaymentSubmission(
  truth: HostedPaidOperationCardInput['paymentTruth'],
): string {
  switch (truth.state) {
    case 'not_submitted':
      return 'Not submitted'
    case 'possibly_submitted':
      return 'Possibly submitted'
    case 'observed':
      return 'Observed by provider'
  }
}

export function formatHostedPaidOperationSettlement(
  truth: HostedPaidOperationCardInput['settlementTruth'],
): string {
  switch (truth.state) {
    case 'no_evidence':
      return 'No settlement evidence'
    case 'not_settled':
      return 'Checked — not settled'
    case 'settled':
      return `${formatHostedPaidOperationMoney(
        truth.amount,
      )} settled in recorded sandbox evidence`
    case 'unknown':
      return 'Settlement unknown'
  }
}

export function formatHostedPaidOperationResultDelivery(
  truth: HostedPaidOperationCardInput['resultTruth'],
): string {
  switch (truth.state) {
    case 'not_delivered':
      return 'Not received'
    case 'invalid':
      return 'Not validated'
    case 'valid':
      return 'Validated'
  }
}

const moneyFormatters = new Map<string, Intl.NumberFormat>()

export function isHostedPaidOperationHumanAcceptedReadback(
  value: unknown,
): value is HostedPaidOperationHumanAcceptedReadback {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  if (
    candidate.kind !== 'accepted'
    || candidate.schema !== 'agentic-paid-operation:v1'
    || !Number.isSafeInteger(candidate.expectedInvocationVersion)
    || candidate.projection === null
    || typeof candidate.projection !== 'object'
    || Array.isArray(candidate.projection)
    || candidate.card === null
    || typeof candidate.card !== 'object'
    || Array.isArray(candidate.card)
  ) return false

  const projection = candidate.projection as Record<string, unknown>
  const card = candidate.card as Record<string, unknown>
  const semantics = projection.semantics
  const technicalDetails = card.technicalDetails
  if (
    projection.kind !== 'human_rich_paid_operation'
    || typeof projection.semanticDigest !== 'string'
    || projection.semanticDigestUse !== 'projection_equality_only_not_authority'
    || semantics === null
    || typeof semantics !== 'object'
    || Array.isArray(semantics)
    || technicalDetails === null
    || typeof technicalDetails !== 'object'
    || Array.isArray(technicalDetails)
  ) return false

  const identity = (semantics as Record<string, unknown>).identity
  if (identity === null || typeof identity !== 'object' || Array.isArray(identity)) return false
  const expectedVersion = candidate.expectedInvocationVersion as number
  return (semantics as Record<string, unknown>).schema === 'agentic-paid-operation:v1'
    && (identity as Record<string, unknown>).expectedInvocationVersion === expectedVersion
    && (technicalDetails as Record<string, unknown>).expectedInvocationVersion === expectedVersion
    && (technicalDetails as Record<string, unknown>).semanticDigest === projection.semanticDigest
}

function descriptor(
  continuation: PaidOperationContinuation,
  accept?: boolean,
): HostedPaidOperationCommandDescriptor {
  return Object.freeze({
    command: continuation.kind === 'retry' ? 'inspect' : continuation.kind,
    commandIdRequired: true,
    expectedInvocationVersion: continuation.expectedInvocationVersion,
    requiredInput: continuation.kind === 'reconcile'
      ? []
      : continuation.kind === 'authorize'
        ? ['accept']
        : continuation.requiredInput,
    ...(accept === undefined ? {} : { accept }),
  })
}

function safeContinuation(
  continuations: readonly PaidOperationContinuation[],
): PaidOperationContinuation | undefined {
  if (continuations.length !== 1 || continuations[0]?.kind === 'retry') return undefined
  return continuations[0]
}

function materialDisclosure(value: unknown): readonly string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return []
  const scalars = Object.values(value).flatMap((item) =>
    typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'
      ? [String(item)]
      : [])
  return scalars.length > 0 ? [...new Set(scalars)] : Object.keys(value).sort()
}
