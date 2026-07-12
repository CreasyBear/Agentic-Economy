export type ProviderQuoteMaterial = Readonly<{
  provider: string
  shipmentId: string
  rateId: string
  amountMinor: number
  currency: 'AUD'
  expiresAt: number
}>

export function issueProviderQuoteRef(material: Readonly<Record<string, unknown>>, signingKey: string): string

export function verifyProviderQuoteRef(
  reference: string | undefined,
  expectedProvider: string,
  signingKey: string,
  now?: number,
  options?: Readonly<{ allowExpired?: boolean }>,
): ProviderQuoteMaterial | undefined
