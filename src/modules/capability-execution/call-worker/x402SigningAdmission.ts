import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import type { CdpX402PaymentSigningIntent } from '@/modules/capability-supply/server'
import { screenX402Payee } from '@/modules/money/x402-payee-screening.server'
import type { X402PayeeScreeningDecision, X402SpendAdmissionResult } from '@/modules/money/public'
import type { ActionCtx } from '../../../../convex/_generated/server'
import { internal } from '../../../../convex/_generated/api'

/** Fresh provider verdict and atomic admission for the exact material the leaf will sign. */
export async function admitManagedX402Signing(
  ctx: Pick<ActionCtx, 'runMutation'>,
  attempt: Readonly<{ custodyRef: string; authorizationDigest: string; custodyGeneration: number }>,
  intent: CdpX402PaymentSigningIntent,
  purpose: 'sign' | 'forensic_replay' = 'sign',
): Promise<boolean> {
  const material: unknown = JSON.parse(intent.paymentUnsignedMaterialJson)
  if (!isRecord(material) || !isRecord(material.accepted) || !isRecord(material.typedData)
    || typeof material.accepted.network !== 'string' || typeof material.accepted.payTo !== 'string'
    || canonicalDigest(material) !== intent.paymentUnsignedMaterialDigest) return false
  const request = {
    network: material.accepted.network,
    normalizedPayTo: material.accepted.payTo.toLowerCase(),
    paymentUnsignedMaterialDigest: intent.paymentUnsignedMaterialDigest,
    typedDataDigest: canonicalDigest(material.typedData),
  }
  const screeningInvocationRef = crypto.randomUUID()
  const startedAt = Date.now()
  let screening: X402PayeeScreeningDecision
  try {
    screening = await screenX402Payee(request)
  } catch {
    // Persist unavailability as a refusal, including network/provider failures.
    screening = { ...request, provider: 'trm-wallet-screening', outcome: 'unavailable',
      startedAt, checkedAt: Date.now(), reason: 'screening_provider_unavailable' }
  }
  const result: X402SpendAdmissionResult = await ctx.runMutation(
    internal.moneyX402PaymentAttempts.recordScreeningAndReserveSigning,
    { ...attempt, purpose, paymentUnsignedMaterialDigest: intent.paymentUnsignedMaterialDigest,
      paymentSigningIdempotencyKey: intent.paymentSigningIdempotencyKey,
      screeningInvocationRef, screening },
  )
  return result.kind === 'admitted'
}
