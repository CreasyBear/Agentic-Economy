import type { Doc } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { readCanonicalCompatibilityOwner, resolveBusinessActor } from './authz'
import {
  type ExactAmount,
} from '../src/modules/money/public'

import { payoutFromRow } from './moneyPayoutTransferShared/row_projection'

export {
  payoutFromRow,
  type PayoutTransferResult,
} from './moneyPayoutTransferShared/row_projection'

export async function payoutAuthorityAllowed(
  ctx: Pick<MutationCtx, 'auth' | 'db' | 'scheduler'>,
  businessId: string,
  principalId: string,
): Promise<boolean> {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return false
  if (principalId !== actor.canonicalPrincipalRef) return false
  const owner = await readCanonicalCompatibilityOwner(ctx.db, actor)
  if (owner === null) return false
  const canonicalBusinessId = ctx.db.normalizeId('businesses', businessId)
  if (canonicalBusinessId === null) return false
  const business = await ctx.db.get(canonicalBusinessId)
  return business !== null &&
    String(business._id) === businessId &&
    business.ownerId === owner._id
}

export {
  payoutAccountAfterReservationMatches,
  payoutAttemptMaterialIsFrozen,
  payoutEvidenceSourceDigest,
  payoutReservationCurrentAmountMatches,
  payoutReservationIdentity,
  payoutReservationRowIdentityMatches,
  payoutSnapshotAmounts,
  payoutTerminalReplayIsConsistent,
  payoutTransferRow,
  payoutTransferView,
  readPayoutReservationJournal,
  type PayoutReservationJournal,
} from './moneyPayoutTransferShared/reservation_journal'

const PAYOUT_SNAPSHOT_READ_LIMIT = 2

export async function readLatestCompletedPayoutPaidAfter(
  ctx: Pick<MutationCtx, 'db'>,
  businessId: string,
  expectedAmount: ExactAmount,
  currentPayoutId?: string,
): Promise<ExactAmount | null | undefined> {
  const [paidRows, reversedRows] = await Promise.all([
    ctx.db
      .query('moneyPayouts')
      .withIndex(
        'by_businessId_and_currency_and_state_and_updatedAt',
        (q) =>
          q
            .eq('businessId', businessId)
            .eq('currency', expectedAmount.currency)
            .eq('state', 'paid'),
      )
      .order('desc')
      .take(PAYOUT_SNAPSHOT_READ_LIMIT),
    ctx.db
      .query('moneyPayouts')
      .withIndex(
        'by_businessId_and_currency_and_state_and_updatedAt',
        (q) =>
          q
            .eq('businessId', businessId)
            .eq('currency', expectedAmount.currency)
            .eq('state', 'reversed'),
      )
      .order('desc')
      .take(PAYOUT_SNAPSHOT_READ_LIMIT),
  ])
  const candidates = [paidRows, reversedRows].flatMap((rows) => {
    const eligible = rows.filter(
      (row) => currentPayoutId === undefined || row._id !== currentPayoutId,
    )
    if (
      eligible.length > 1 &&
      eligible[0]?.updatedAt === eligible[1]?.updatedAt
    )
      return [undefined]
    return eligible[0] === undefined ? [] : [eligible[0]]
  })
  if (candidates.some((candidate) => candidate === undefined))
    return undefined
  const latestCandidates = candidates.filter(
    (candidate): candidate is Doc<'moneyPayouts'> =>
      candidate !== undefined,
  )
  if (latestCandidates.length === 0) return null
  const latest = latestCandidates.reduce((current, candidate) =>
    candidate.updatedAt > current.updatedAt ? candidate : current,
  )
  if (
    latestCandidates.some(
      (candidate) =>
        candidate !== latest && candidate.updatedAt === latest.updatedAt,
    )
  )
    return undefined
  const payout = payoutFromRow(latest)
  if (
    payout === undefined ||
    latest.currency !== expectedAmount.currency ||
    latest.exponent !== expectedAmount.exponent ||
    payout.providerPaidAfter === undefined ||
    payout.providerPaidAfter.currency !== expectedAmount.currency ||
    payout.providerPaidAfter.exponent !== expectedAmount.exponent
  )
    return undefined
  return payout.providerPaidAfter
}
