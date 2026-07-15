export type SensitiveCustomerRequestCategory = 'payment_card' | 'account_secret'

const ACCOUNT_SECRET = /\b(?:password|passcode|account\s+pin|security\s+answer|api[_ -]?key|secret[_ -]?key)\b["']?\s*(?:is|[:=])\s*["']?\S+/giu
const PAYMENT_CARD_CANDIDATE = /(?:\d[ -]?){13,19}/gu

export function sensitiveCustomerRequestCategories(value: string): readonly SensitiveCustomerRequestCategory[] {
  const categories: SensitiveCustomerRequestCategory[] = []
  if (paymentCardNumberPresent(value)) categories.push('payment_card')
  if (ACCOUNT_SECRET.test(value)) categories.push('account_secret')
  ACCOUNT_SECRET.lastIndex = 0
  return Object.freeze(categories)
}

export function sensitiveCustomerRequestRecoverySummary(
  categories: readonly SensitiveCustomerRequestCategory[],
): string {
  const paymentCard = categories.includes('payment_card')
  const accountSecret = categories.includes('account_secret')
  if (paymentCard && accountSecret) {
    return 'Remove payment card and account-secret details before submitting this request.'
  }
  if (paymentCard) return 'Remove payment card details before submitting this request.'
  return 'Remove account-secret details before submitting this request.'
}

export function sensitiveCustomerRequestRefusal(value: unknown): Readonly<{
  kind: 'refused'
  reason: 'sensitive_information_not_accepted'
  summary: string
  nextAction: 'revise_request'
}> | undefined {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value)
  if (serialized === undefined) return undefined
  const categories = sensitiveCustomerRequestCategories(serialized)
  return categories.length === 0 ? undefined : Object.freeze({
    kind: 'refused' as const,
    reason: 'sensitive_information_not_accepted' as const,
    summary: sensitiveCustomerRequestRecoverySummary(categories),
    nextAction: 'revise_request' as const,
  })
}

function paymentCardNumberPresent(value: string): boolean {
  for (const match of value.matchAll(PAYMENT_CARD_CANDIDATE)) {
    const digits = match[0].replace(/\D/gu, '')
    if (digits.length >= 13 && digits.length <= 19 && passesLuhn(digits)) return true
  }
  return false
}

function passesLuhn(digits: string): boolean {
  let sum = 0
  let double = false
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index])
    if (double) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
    double = !double
  }
  return sum % 10 === 0
}
