import type { X402PayeeScreeningDecision } from './x402-spend-admission'

export type X402PayeeScreeningRequest = Readonly<Pick<X402PayeeScreeningDecision,
  'network' | 'normalizedPayTo' | 'paymentUnsignedMaterialDigest' | 'typedDataDigest'
>>

const UNAVAILABLE_REASON = 'trm_tenant_contract_unavailable'

/** Provider readiness cannot be inferred from a key or a manually set flag. */
export function readX402PayeeScreeningReadiness(): Readonly<{ kind: 'unavailable'; code: string }> {
  return { kind: 'unavailable', code: UNAVAILABLE_REASON }
}

/**
 * TRM Wallet Screening requires the tenant-entitled API contract. Public
 * Sanctions Screening is a different product and cannot provide this verdict.
 * Until the verified contract is connected, every request records unavailable.
 */
export async function screenX402Payee(
  request: X402PayeeScreeningRequest,
): Promise<X402PayeeScreeningDecision> {
  const startedAt = Date.now()
  return {
    ...request,
    provider: 'trm-wallet-screening',
    outcome: 'unavailable',
    startedAt,
    checkedAt: Date.now(),
    reason: UNAVAILABLE_REASON,
  }
}
