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
import type { SuggestedContinuation } from '@/modules/market/suggested-continuation'

export type OperationInspectorModel = Readonly<{
  operationRef: string
  summary: string
  continuation: SuggestedContinuation
  availabilityPosture: PublicOperationDescriptor['availability']['posture']
  readinessLabel: string
  authenticationLabel: string
  paymentNetwork?: string
  decisionLabel: string
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
): OperationInspectorModel {
  const invokeNavigation = operation.navigation.find(({ relation }) => relation === 'invoke')
  const callable = operation.availability.posture === 'routeable' && invokeNavigation !== undefined
  const availabilityPosture: OperationInspectorModel['availabilityPosture'] = operation.availability.posture === 'routeable'
    ? callable ? 'routeable' : 'setup_required'
    : operation.availability.posture === 'setup_required'
      ? 'setup_required'
      : 'unavailable'
  const continuation: SuggestedContinuation = availabilityPosture === 'routeable'
    ? {
        label: 'Operation reference',
        kind: 'copy_command',
        command: operation.operationRef,
      }
    : {
        label: 'Find operational alternatives',
        kind: 'navigate',
        href: `/market?${new URLSearchParams({ query: operation.summary }).toString()}`,
        warning: 'This Operation is not operational. Choose an Operational alternative.',
      }
  const inputExample = operation.contract.inputExamples?.[0]
  const decisionLabel = availabilityPosture === 'routeable' ? 'Operational' : 'Not operational'
  const lastVerifiedAt = operation.availability.observedAt
    ?? operation.commercial.priceEvidence?.observedAt

  return {
    operationRef: operation.operationRef,
    summary: catalogSummary(operation),
    continuation,
    availabilityPosture,
    readinessLabel: formatOperationReadiness(availabilityPosture),
    authenticationLabel: formatOperationAuthentication(operation.authentication),
    ...(operation.payment === undefined ? {} : { paymentNetwork: formatPaymentNetwork(operation.payment.network) }),
    decisionLabel,
    continuationDescription: continuationDescription(continuation),
    totalPrice: totalPrice(operation),
    ...(lastVerifiedAt === undefined ? {} : { lastVerifiedAt }),
    ...(inputExample === undefined ? {} : { inputExample }),
    invokeInput: inputExample === undefined
      ? '"$AE_INPUT_JSON"'
      : `'${JSON.stringify(inputExample.input).replaceAll("'", "'\\''")}'`,
  }
}

export function continuationCode(model: OperationInspectorModel): string | undefined {
  return model.continuation.command
}

export function operationLabel(value: string): string {
  return value.replaceAll('_', ' ')
}

function continuationDescription(continuation: SuggestedContinuation): string {
  if (continuation.warning !== undefined) return continuation.warning
  if (continuation.label === 'Operation reference') {
    return 'Paste this reference into your existing agent client. It will inspect exact terms and request access only when needed.'
  }
  return 'This Operation cannot be called from AE right now. Browse the catalog for another route.'
}

function catalogSummary(operation: PublicOperationDescriptor): string {
  const summary = operation.summary.trim()
  return summary === '' ? operation.offering.summary : summary
}

function formatPrice(price: PublicOperationPrice): string {
  if (price.kind === 'on_request') return 'On request'
  if (price.kind === 'fixed') return formatCurrencyAmount(price.amount)
  return `${formatCurrencyAmount(price.minimum)} to ${formatCurrencyAmount(price.maximum)}`
}

function totalPrice(operation: PublicOperationDescriptor): string {
  return operation.commercial.priceBreakdown === undefined
    ? formatPrice(operation.commercial.price)
    : formatCurrencyAmount(operation.commercial.priceBreakdown.totalBuyerAuthorization)
}
