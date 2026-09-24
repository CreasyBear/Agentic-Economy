export type SavedPaymentMethodsSummary =
  | Readonly<{ kind: 'missing'; hasPaymentMethod: false }>
  | Readonly<{
      kind: 'ready'
      hasPaymentMethod: true
      card: Readonly<{
        brand: string
        last4: string
        expMonth: number
        expYear: number
        isDefault?: boolean
      }>
    }>

export type CardBrandDisplay = Readonly<{ label: string; letters: string }>

export type ExpiryBadgeKind = 'expired' | 'expires_soon'

export function paymentCardExpiryKind(
  card: Extract<SavedPaymentMethodsSummary, { kind: 'ready' }>['card'],
  nowMs: number,
): ExpiryBadgeKind | null {
  const endMs = new Date(card.expYear, card.expMonth, 0, 23, 59, 59, 999).getTime()
  if (endMs < nowMs) return 'expired'
  return endMs - nowMs <= 30 * 24 * 60 * 60 * 1000 ? 'expires_soon' : null
}

export function paymentCardBrandLabel(brand: string): string {
  switch (brand.trim().toLowerCase()) {
    case 'visa': return 'Visa'
    case 'mastercard': return 'Mastercard'
    case 'amex': return 'Amex'
    case 'eftpos_au': return 'Eftpos'
    case 'diners': return 'Diners Club'
    case 'jcb': return 'JCB'
    case 'unionpay': return 'UnionPay'
    case 'discover': return 'Discover'
    default: return 'Card'
  }
}
