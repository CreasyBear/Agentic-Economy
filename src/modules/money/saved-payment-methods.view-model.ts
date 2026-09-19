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
