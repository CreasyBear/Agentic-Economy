/**
 * X402 challenge/payment-signature-request shapes, split out of
 * `route-transport-x402-payment.ts` (`X402Challenge`) and
 * `route-transport-x402.ts` (`X402PaymentSignatureRequest`) so payment
 * signer implementations (`x402-payment-signer.ts`,
 * `cdp-x402-payment-signer.ts`) can depend on the shared request shape
 * directly instead of importing it back from the `route-transport-runtime`
 * barrel - avoiding an `internal/x.ts -> route-transport-runtime.ts ->
 * internal/x.ts` round-trip through the mcp/x402/cancel/http-json
 * transport cluster. The owning files still re-export these for their
 * existing consumers.
 */
export type X402Challenge = Readonly<{
  x402Version: 2
  resource: Readonly<{ url: string; description?: string; mimeType?: string }>
  accepts: readonly Readonly<{
    scheme: string
    network: `${string}:${string}`
    amount: string
    asset: string
    payTo: string
    maxTimeoutSeconds: number
    extra: Readonly<Record<string, unknown>>
  }>[]
  extensions?: Readonly<Record<string, unknown>>
}>

export type X402PaymentSignatureRequest = Readonly<{
  challenge: X402Challenge
  /** Opaque server-only payer credential locator; resolve it only at signing. */
  credential: string
  paymentIdentifier: string
  selectedRequirement: X402Challenge['accepts'][number]
}>
