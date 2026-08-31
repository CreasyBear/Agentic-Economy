import { canonicalDigest } from '@/modules/common/canonical-digest'

export const X402_SELLER_CLAIM_TTL_MS = 10 * 60 * 1_000
export const X402_SELLER_CLAIM_MAX_FUTURE_MS = 15 * 60 * 1_000

export type X402SellerClaim = Readonly<{
  businessId: string
  endpointUrl: string
  method: 'GET' | 'POST'
  observationDigest: string
  payTo: string
  expiresAt: number
}>

export function x402SellerClaimMessage(claim: X402SellerClaim): string {
  return [
    'Agentic Economy x402 seller claim v1',
    '',
    'I control the payment address for this exact seller endpoint.',
    `Supplier: ${claim.businessId}`,
    `Endpoint: ${claim.endpointUrl}`,
    `Method: ${claim.method}`,
    `Observation: ${claim.observationDigest}`,
    `Payee: ${claim.payTo}`,
    `Expires: ${claim.expiresAt}`,
    '',
    'This signature does not authorize a payment or transaction.',
  ].join('\n')
}

export function x402SellerClaimDigest(claim: X402SellerClaim): string {
  return canonicalDigest({
    format: 'ae-x402-seller-claim:v1',
    ...claim,
  })
}

export function validX402SellerClaimTime(expiresAt: number, now: number): boolean {
  return Number.isSafeInteger(expiresAt)
    && expiresAt >= now
    && expiresAt <= now + X402_SELLER_CLAIM_MAX_FUTURE_MS
}
