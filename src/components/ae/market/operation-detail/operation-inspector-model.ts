import type {
  PublicOperationDescriptor,
  PublicOperationPrice,
} from '@/modules/capability-supply/public'
import {
  formatOperationAuthentication,
  formatPaymentNetwork,
  formatOperationReadiness,
} from '@/modules/market/operation-view-model'
import { formatCurrencyAmount } from '@/modules/money/public'
import {
  continuationForOperationFacts,
  type SuggestedContinuation,
} from '@/modules/market/suggested-continuation'

export type OperationInspectorModel = Readonly<{
  operationRef: string
  summary: string
  continuation: SuggestedContinuation
  availabilityPosture: PublicOperationDescriptor['availability']['posture']
  readinessLabel: string
  authenticationLabel: string
  paymentNetwork?: string
  decisionLabel: string
  decisionDescription: string
  continuationDescription: string
  totalPrice: string
  lastVerifiedAt?: number
  inputExample?: NonNullable<PublicOperationDescriptor['contract']['inputExamples']>[number]
  invokeInput: string
}>

/**
 * The one presentation projection for an Operation inspection. Full-page and
 * compact inspectors consume this same decision state so readiness, access,
 * price, and the next safe action cannot drift between surfaces.
 */
export function toOperationInspectorModel(
  operation: PublicOperationDescriptor,
  hasBuyerCredential: boolean,
): OperationInspectorModel {
  const invokeNavigation = operation.navigation.find(({ relation }) => relation === 'invoke')
  const callable = operation.availability.posture === 'routeable' && invokeNavigation !== undefined
  const availabilityPosture = operation.availability.posture === 'routeable' && !callable
    ? 'setup_required'
    : operation.availability.posture
  const requiresBuyerCredential = invokeNavigation !== undefined
  const continuation = continuationForOperationFacts({
    operationRef: operation.operationRef,
    searchQuery: operation.summary,
    availabilityPosture,
    requiresBuyerCredential,
    hasBuyerCredential,
  })
  const inputExample = operation.contract.inputExamples?.[0]
  const decisionLabel = continuation.label === 'Call Operation'
    ? 'Ready to call'
    : continuation.label === 'Connect agent'
      ? 'Connection required'
      : 'Setup required'
  const lastVerifiedAt = operation.availability.observedAt
    ?? operation.commercial.priceEvidence?.observedAt

  return {
    operationRef: operation.operationRef,
    summary: catalogSummary(operation),
    continuation,
    availabilityPosture,
    readinessLabel: readinessForBuyer({
      availabilityPosture,
      requiresBuyerCredential,
      hasBuyerCredential,
    }),
    authenticationLabel: formatOperationAuthentication(operation.authentication),
    ...(operation.payment === undefined ? {} : { paymentNetwork: formatPaymentNetwork(operation.payment.network) }),
    decisionLabel,
    decisionDescription: decisionDescription(continuation),
    continuationDescription: continuationDescription(continuation),
    totalPrice: totalPrice(operation),
    ...(lastVerifiedAt === undefined ? {} : { lastVerifiedAt }),
    ...(inputExample === undefined ? {} : { inputExample }),
    invokeInput: inputExample === undefined
      ? '"$AE_INPUT_JSON"'
      : `'${JSON.stringify(inputExample.input).replaceAll("'", "'\\''")}'`,
  }
}

export function inspectCommand(operationRef: string): string {
  return `ae inspect '${operationRef}'`
}

export function callCommand(
  operationRef: string,
  input: Readonly<Record<string, unknown>>,
): string {
  const inputJson = JSON.stringify(input).replaceAll("'", "'\\''")
  return `ae call '${operationRef}' --input '${inputJson}' --wait`
}

export function continuationCode(model: OperationInspectorModel): string | undefined {
  const command = model.continuation.command
  if (model.continuation.label !== 'Call Operation' || command === undefined) return command
  return model.inputExample === undefined
    ? `ae call '${model.operationRef}' --input "$AE_INPUT_JSON" --wait`
    : callCommand(model.operationRef, model.inputExample.input)
}

export function operationLabel(value: string): string {
  return value.replaceAll('_', ' ')
}

function readinessForBuyer({
  availabilityPosture,
  requiresBuyerCredential,
  hasBuyerCredential,
}: Readonly<{
  availabilityPosture: PublicOperationDescriptor['availability']['posture']
  requiresBuyerCredential: boolean
  hasBuyerCredential: boolean
}>): string {
  if (availabilityPosture === 'routeable' && requiresBuyerCredential && !hasBuyerCredential) {
    return 'Connection required'
  }
  return formatOperationReadiness(availabilityPosture)
}

function decisionDescription(continuation: SuggestedContinuation): string {
  if (continuation.warning !== undefined) {
    return 'Read the contract before choosing a callable alternative.'
  }
  if (continuation.label === 'Connect agent') {
    return 'This protected call needs buyer access before it can run.'
  }
  if (continuation.label === 'Call Operation') {
    return 'The maximum charged for one call. Read the contract before invoking.'
  }
  return 'Read the full contract before requesting access.'
}

function continuationDescription(continuation: SuggestedContinuation): string {
  if (continuation.warning !== undefined) return continuation.warning
  if (continuation.label === 'Connect agent') {
    return 'Connect an agent before making this protected call.'
  }
  if (continuation.label === 'Call Operation') {
    return 'Your agent access is ready. This is the single safe next step.'
  }
  return 'Browse the current catalogue for a callable alternative.'
}

function catalogSummary(operation: PublicOperationDescriptor): string {
  const summary = operation.summary.trim()
  return summary === '' ? operation.offering.summary : summary
}

function formatPrice(price: PublicOperationPrice): string {
  if (price.kind === 'on_request') return 'On request'
  if (price.kind === 'fixed') return formatCurrencyAmount(price.amount)
  return `${formatCurrencyAmount(price.minimum)}–${formatCurrencyAmount(price.maximum)}`
}

function totalPrice(operation: PublicOperationDescriptor): string {
  return operation.commercial.priceBreakdown === undefined
    ? formatPrice(operation.commercial.price)
    : formatCurrencyAmount(operation.commercial.priceBreakdown.totalBuyerAuthorization)
}
