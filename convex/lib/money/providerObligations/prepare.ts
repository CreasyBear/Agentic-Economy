import type { MutationCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'
import { requireSourceWrite } from '../../security/sourceWrite/admission'
import {
  prepareProviderReversalResultValue,
  providerReversalArgsValue,
  type ProviderReversalArgs,
} from './contracts'
import { readObligation, reversalRefused } from './state'
import type { Infer } from 'convex/values'

export const prepareOwnerReversalArgs = providerReversalArgsValue.fields
export const prepareOwnerReversalResult = prepareProviderReversalResultValue

const BOUNDED_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,499}$/u
const SHA256 = /^sha256:[a-f0-9]{64}$/u

/** Requires the current buyer Account owner and exact original purchase identity.
 * Ensures only an existing exact reversal receipt can replay; no new cash credit.
 * Invariant: buyer remedy is separate from proof of returned corporate USDC.
 * On violation: refuse without changing settled or unresolved reversal evidence.
 */
export async function prepareOwnerReversalHandler(
  ctx: MutationCtx,
  args: ProviderReversalArgs,
): Promise<Infer<typeof prepareProviderReversalResultValue>> {
  const sourceWrite = await requireSourceWrite(ctx, args, 'billing')
  if (sourceWrite.kind === 'rejected') return reversalRefused('source_write_denied')
  if (![args.obligationRef, args.callRef, args.settlementTransactionRef,
    args.evidenceRef, args.commandRef, args.idempotencyKey].every((value) => BOUNDED_REF.test(value))
    || !SHA256.test(args.evidenceDigest)
    || !Number.isSafeInteger(args.expectedUpdatedAt)
    || args.expectedUpdatedAt < 0
    || args.confirmation !== args.obligationRef) {
    return reversalRefused('provider_reversal_input_invalid')
  }
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return reversalRefused('authentication_required')
  const row = await readObligation(ctx, args.obligationRef)
  if (row === null
    || row.buyerAccountRef !== actor.canonicalAccountRef
    || row.callRef !== args.callRef
    || row.settlementTransactionRef !== args.settlementTransactionRef
    || row.payoutEligibility !== 'ineligible_x402') {
    return reversalRefused('provider_obligation_not_found')
  }
  if (row.state === 'reversed') {
    const { reversalTransactionRef } = row
    if (row.reversalCommandRef === args.commandRef
      && row.reversalIdempotencyKey === args.idempotencyKey
      && row.reversalEvidenceDigest === args.evidenceDigest
      && reversalTransactionRef !== undefined) {
      return {
        kind: 'replayed',
        obligationRef: row.obligationRef,
        transactionRef: reversalTransactionRef,
      }
    }
    return reversalRefused('provider_reversal_conflict')
  }
  // A buyer instruction and a digest do not prove the return of AE's corporate
  // cash. New and unresolved legacy reversals cannot credit the treasury. Keep
  // their evidence intact for reconciliation; buyer remedies refund AUD through
  // the Call report flow without rewriting the settled Provider payment.
  return reversalRefused('provider_settlement_evidence_invalid')
}
