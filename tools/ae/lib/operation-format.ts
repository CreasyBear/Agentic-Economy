import type { PublicOperationDescriptor } from '@/modules/capability-supply/public'
import { formatCurrencyAmount, type ExactAmount } from '@/modules/money/public'
import { isRecord } from '@/modules/common/is-record'

export function operationLabel(operation: PublicOperationDescriptor): string {
  const provider = operation.business.name.trim()
  const offering = operation.offering.label.trim()
  return [provider, offering]
    .filter((value) => value.length > 0)
    .join(' — ') || operation.operationId
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

export function formatOperationTotalPrice(operation: PublicOperationDescriptor): string {
  const total = operation.commercial.priceBreakdown?.totalBuyerAuthorization
  return total === undefined ? formatOperationPrice(operation.commercial.price) : formatCurrencyAmount(total)
}

export function formatOperationVerification(operation: PublicOperationDescriptor): string {
  const observedAt = operation.availability.observedAt ?? operation.commercial.priceEvidence?.observedAt
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
  operation: PublicOperationDescriptor,
): string {
  return operation.authentication.kind.replace(/_/gu, ' ')
}

export function formatOperationInputs(
  operation: PublicOperationDescriptor,
): string {
  const parameters = operation.parameters ?? []
  if (parameters.length === 0) return 'none'
  return parameters
    .map((parameter) =>
      `${parameter.name}${parameter.required ? '' : '?'} (${parameter.group})`)
    .join(', ')
}

export function formatOperationContinuations(
  operation: PublicOperationDescriptor,
): string {
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
