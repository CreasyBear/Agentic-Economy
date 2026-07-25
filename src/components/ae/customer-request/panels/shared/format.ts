import type { CustomerRequestView } from '@/modules/customer-request/customer-projection'

const optionTimeFormatter = new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' })

export function activityResponsibility(
  actor: NonNullable<CustomerRequestView['activity']>['actor'],
  certainty: NonNullable<CustomerRequestView['activity']>['certainty'],
): string {
  if (actor === 'business') {
    return certainty === 'unknown' ? 'Waiting on the business for evidence' : 'Waiting on the business'
  }
  if (actor === 'customer') return 'Waiting on you'
  if (actor === 'none') return 'No action is required'
  if (certainty === 'unknown') return 'AE is checking for evidence'
  return 'AE is handling the next step'
}

export function formatMoney(currency: string, amountMinor: number): string { return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(amountMinor / 100) }
export function formatOptionTime(timestamp: number): string { return optionTimeFormatter.format(timestamp) }
export function readableLabel(value: string): string {
  const words = value.replace(/[_-]+/gu, ' ').trim()
  return words.length === 0 ? value : `${words[0]?.toUpperCase() ?? ''}${words.slice(1)}`
}
export function businessList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? 'Registered business'
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`
}
export function effectLabel(kind: 'information_shared' | 'financial_commitment' | 'external_change'): string {
  if (kind === 'information_shared') return 'Shares information'
  if (kind === 'financial_commitment') return 'Creates a financial commitment'
  return 'Makes an external change'
}
export function reversibilityLabel(value: 'not_applicable' | 'reversible' | 'conditional' | 'irreversible'): string {
  if (value === 'not_applicable') return 'reversal does not apply'
  if (value === 'reversible') return 'reversible'
  if (value === 'conditional') return 'reversal depends on conditions'
  return 'cannot be reversed automatically'
}
export function uncertaintyLabel(
  value: 'price_needs_confirmation' | 'customer_fact_needs_evidence',
): string {
  return value === 'price_needs_confirmation'
    ? 'Price needs confirmation'
    : 'A fact you marked as uncertain still needs evidence'
}
export function readableResult(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    if ('kind' in value && value.kind === 'partial_result' && 'output' in value) {
      return readableResult(value.output)
    }
    const first = Object.values(value).find((item) => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean')
    if (first !== undefined) return String(first)
  }
  return 'Evidence is available for this result.'
}
export function isPartialResult(value: unknown): boolean {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && 'kind' in value && value.kind === 'partial_result' && 'output' in value
}
