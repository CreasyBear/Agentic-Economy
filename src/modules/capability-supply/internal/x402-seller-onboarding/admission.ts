const REQUIRED_REF = 'x402-seller-canary-admission:required:v1' as const
const ADMITTED_PREFIX = 'x402-seller-canary-admission:admitted:v1:' as const
const CANONICAL_DIGEST = /^sha256:[0-9a-f]{64}$/u

export const X402_SELLER_CANARY_ADMISSION_REQUIRED_REF = REQUIRED_REF

export function x402SellerCanaryAdmissionEvidenceRef(
  promotionEvidenceDigest: string,
): string {
  if (!CANONICAL_DIGEST.test(promotionEvidenceDigest)) {
    throw new Error('x402_seller_canary_promotion_evidence_digest_invalid')
  }
  return `${ADMITTED_PREFIX}${promotionEvidenceDigest}`
}

/**
 * Publications without the marker predate the seller-canary lane and retain
 * their existing admission semantics. A marked publication is routeable only
 * after the exact revision receives one canonical promotion evidence marker.
 */
export function x402SellerCanaryAdmissionIsSatisfied(
  evidenceRefs: readonly string[],
): boolean {
  const required = evidenceRefs.filter((ref) => ref === REQUIRED_REF)
  if (required.length === 0) return true
  if (required.length !== 1) return false
  const admitted = evidenceRefs.filter((ref) => ref.startsWith(ADMITTED_PREFIX))
  return admitted.length === 1
    && CANONICAL_DIGEST.test(admitted[0]!.slice(ADMITTED_PREFIX.length))
}
