import type { MutationCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'
import { admitInteractiveOwnerConsequence } from '../../authority/consequence/owner'
import { requireSourceWrite } from '../../security/sourceWrite/admission'
import {
  prepareProviderReversalResultValue,
  providerReversalArgsValue,
  type ProviderReversalArgs,
} from './contracts'
import { markProviderObligationDisputed, readObligation, reversalRefused } from './state'
import type { Infer } from 'convex/values'

export const prepareOwnerReversalArgs = providerReversalArgsValue.fields
export const prepareOwnerReversalResult = prepareProviderReversalResultValue

const BOUNDED_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,499}$/u
const SHA256 = /^sha256:[a-f0-9]{64}$/u

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
    await markProviderObligationDisputed(ctx, row, args)
    return reversalRefused('provider_reversal_conflict')
  }
  if (row.reversalState !== undefined) {
    const sameRequest = row.reversalCommandRef === args.commandRef
      && row.reversalIdempotencyKey === args.idempotencyKey
      && row.reversalEvidenceDigest === args.evidenceDigest
    if (sameRequest) return { kind: 'prepared' }
    await markProviderObligationDisputed(ctx, row, args)
    return reversalRefused('provider_reversal_conflict')
  }
  if (row.state !== 'settled' || row.updatedAt !== args.expectedUpdatedAt) {
    return reversalRefused('provider_reversal_state_changed')
  }
  const consequence = await admitInteractiveOwnerConsequence(ctx, {
    actor,
    action: 'provider_obligation.reverse',
    target: {
      targetType: 'provider_obligation',
      targetRef: row.obligationRef,
      targetRevision: Math.max(1, row.updatedAt),
    },
    requiredScopes: ['billing'],
    resourceRefs: [`provider-obligation:${row.obligationRef}`],
    budgetAmount: 0,
    consequenceSummary: `Reverse the settled Provider obligation ${row.obligationRef}.`,
    statusReadbackRef: '/owner/credit',
    command: {
      version: 'ae.provider-obligation-reversal:v1',
      obligationRef: row.obligationRef,
      callRef: row.callRef,
      settlementTransactionRef: row.settlementTransactionRef,
      providerAmountUnits: row.providerAmountUnits,
      evidenceRef: args.evidenceRef,
      evidenceDigest: args.evidenceDigest,
    },
    correlationRef: args.correlationId,
    idempotencyRef: args.idempotencyKey,
    ...(args.proof === undefined ? {} : { proof: args.proof }),
    now: Date.now(),
  })
  if (consequence.kind === 'refused') return reversalRefused(consequence.code)
  await ctx.db.patch(row._id, {
    reversalCommandRef: args.commandRef,
    reversalIdempotencyKey: args.idempotencyKey,
    reversalEvidenceDigest: args.evidenceDigest,
    reversalState: 'pending',
    evidenceRefs: [...new Set([...row.evidenceRefs, args.evidenceRef])].slice(-32),
    updatedAt: Date.now(),
  })
  return { kind: 'prepared' }
}
