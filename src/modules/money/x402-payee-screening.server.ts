import type { X402PayeeScreeningDecision } from './x402-spend-admission'
import { ALPHA_X402_PAYEE_SCREENING_POLICY, ALPHA_X402_PAYEE_SCREENING_REASON,
  alphaX402PayeeScreeningEnabled } from './x402-spend-admission'

export type X402PayeeScreeningRequest = Readonly<Pick<X402PayeeScreeningDecision,
  'network' | 'normalizedPayTo' | 'paymentUnsignedMaterialDigest' | 'typedDataDigest'
>>

const UNAVAILABLE_REASON = 'trm_tenant_contract_unavailable'

/** Provider readiness cannot be inferred from a key or a manually set flag. */
export function readX402PayeeScreeningReadiness(): Readonly<
  { kind: 'unavailable'; code: string } | { kind: 'deferred'; policyRef: typeof ALPHA_X402_PAYEE_SCREENING_POLICY }
> {
  return alphaX402PayeeScreeningEnabled(process.env)
    ? { kind: 'deferred', policyRef: ALPHA_X402_PAYEE_SCREENING_POLICY }
    : { kind: 'unavailable', code: UNAVAILABLE_REASON }
}

/**
 * TRM Wallet Screening requires the tenant-entitled API contract. Public
 * Sanctions Screening is a different product and cannot provide this verdict.
 * Until the verified contract is connected, requests are unavailable by default.
 * The exact alpha setting records no provider screening, never a clear.
 */
export async function screenX402Payee(
  request: X402PayeeScreeningRequest,
): Promise<X402PayeeScreeningDecision> {
  const startedAt = Date.now()
  if (alphaX402PayeeScreeningEnabled(process.env)) return {
    ...request,
    provider: 'none', outcome: 'not_screened', policyRef: ALPHA_X402_PAYEE_SCREENING_POLICY,
    startedAt, checkedAt: Date.now(), reason: ALPHA_X402_PAYEE_SCREENING_REASON,
  }
  return {
    ...request,
    provider: 'trm-wallet-screening',
    outcome: 'unavailable',
    startedAt,
    checkedAt: Date.now(),
    reason: UNAVAILABLE_REASON,
  }
}
