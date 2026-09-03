import type { PublicOperationDescriptor } from '@/modules/capability-supply/public'
import type { PublicOperationChoice } from '@/modules/registry/operation-choice-contracts'
import { formatCurrencyAmount, type ExactAmount } from '@/modules/money/public'
import { isRecord } from '@/modules/common/is-record'

type OperationIdentity = PublicOperationDescriptor | PublicOperationChoice

export function operationLabel(operation: OperationIdentity): string {
  const provider = ('business' in operation ? operation.business.name : operation.provider.name).trim()
  const offering = ('offering' in operation ? operation.offering.label : operation.title).trim()
  return [provider, offering]
    .filter((value) => value.length > 0)
    .join(' — ') || operation.operationRef
}

export function formatOperationPrice(value: unknown): string {
  if (!isRecord(value)) return String(value)
  if (value.kind === 'on_request') return 'on request'
  if (value.kind === 'fixed' && isExactAmount(value.amount)) {
    return formatCurrencyAmount(value.amount)
  }
  if (
    value.kind === 'range'
    && isExactAmount(value.minimum)
    && isExactAmount(value.maximum)
  ) {
    return `${formatCurrencyAmount(value.minimum)}–${formatCurrencyAmount(value.maximum)}`
  }
  return JSON.stringify(value)
}

export function formatOperationTotalPrice(operation: OperationIdentity): string {
  if (!('commercial' in operation)) return operation.priceLabel
  const total = operation.commercial.priceBreakdown?.totalBuyerAuthorization
  return total === undefined ? formatOperationPrice(operation.commercial.price) : formatCurrencyAmount(total)
}

export function formatOperationVerification(operation: OperationIdentity): string {
  const observedAt = 'availability' in operation
    ? operation.availability.observedAt ?? operation.commercial.priceEvidence?.observedAt
    : operation.lastCheckedAt
  return observedAt === undefined ? 'not published' : new Date(observedAt).toISOString()
}

export function formatOperationAvailability(value: unknown): string {
  if (!isRecord(value)) return String(value)
  const posture =
    typeof value.posture === 'string'
      ? value.posture.replace(/_/gu, ' ')
      : 'unknown'
  const reason =
    typeof value.reason === 'string'
      ? ` (${value.reason.replace(/_/gu, ' ')})`
      : ''
  return `${posture}${reason}`
}

export function formatOperationAuthentication(
  operation: OperationIdentity,
): string {
  return 'authentication' in operation
    ? operation.authentication.kind.replace(/_/gu, ' ')
    : 'confirmed at inspection'
}

export function formatOperationPaymentNetwork(operation: OperationIdentity): string {
  if (!('payment' in operation) || operation.payment === undefined) return 'not applicable'
  if (operation.payment.network === 'eip155:84532') return 'Base Sepolia (eip155:84532)'
  if (operation.payment.network === 'eip155:8453') return 'Base (eip155:8453)'
  return operation.payment.network
}

export function formatOperationInputs(
  operation: OperationIdentity,
): string {
  const parameters = 'parameters' in operation ? operation.parameters ?? [] : []
  if (parameters.length === 0) return 'none'
  return parameters
    .map((parameter) =>
      `${parameter.name}${parameter.required ? '' : '?'} (${parameter.group})`)
    .join(', ')
}

export function formatOperationContinuations(
  operation: OperationIdentity,
): string {
  if (!('navigation' in operation)) return 'operation.inspect'
  const relations = [...new Set(
    operation.navigation.map((continuation) => continuation.relation),
  )]
  return relations.length === 0
    ? 'none'
    : relations.join(', ')
}

function isExactAmount(value: unknown): value is ExactAmount {
  return isRecord(value)
    && typeof value.currency === 'string'
    && typeof value.units === 'string'
    && typeof value.exponent === 'number'
}
