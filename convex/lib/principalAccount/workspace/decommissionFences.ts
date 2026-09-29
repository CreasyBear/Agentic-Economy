import type { GenericDatabaseReader } from 'convex/server'

import type { DataModel } from '../../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'

export type WorkspaceFenceReason =
  | 'unsettled_provider_obligations'
  | 'open_calls'
  | 'unreleased_call_holds'
  | 'in_flight_funding'
  | 'open_reconciliation'

type FenceDb = GenericDatabaseReader<DataModel>

const UNSETTLED_OBLIGATION_STATES = new Set([
  'accrued',
  'held',
  'payable',
  'disputed',
])

const OPEN_CALL_STATES = ['pending', 'reconciliation_required'] as const

const UNRELEASED_CALL_HOLD_STATES = new Set([
  'reservation_pending',
  'reserved',
  'possibly_submitted',
  'outcome_unknown',
])

const IN_FLIGHT_FUNDING_STATES = new Set(['pending', 'outcome_unknown'])

export async function checkWorkspaceFences(
  ctx: QueryCtx | MutationCtx,
  accountRef: string,
): Promise<WorkspaceFenceReason[]> {
  const reasons = new Set<WorkspaceFenceReason>()
  const db = ctx.db as FenceDb

  const buyerObligations = await db
    .query('moneyProviderObligations')
    .withIndex('by_buyerAccountRef_and_createdAt', (query) => query.eq('buyerAccountRef', accountRef))
    .collect()
  if (buyerObligations.some((row) => UNSETTLED_OBLIGATION_STATES.has(row.state))) {
    reasons.add('unsettled_provider_obligations')
  }

  const businesses = await db
    .query('businesses')
    .withIndex('by_owningAccountRef_and_updatedAt', (query) => query.eq('owningAccountRef', accountRef))
    .collect()

  for (const business of businesses) {
    const providerKey = String(business._id)
    const supplierObligations = await db
      .query('moneyProviderObligations')
      .withIndex('by_providerRef_and_createdAt', (query) => query.eq('providerRef', providerKey))
      .collect()
    if (supplierObligations.some((row) => UNSETTLED_OBLIGATION_STATES.has(row.state))) {
      reasons.add('unsettled_provider_obligations')
      break
    }
  }

  for (const state of OPEN_CALL_STATES) {
    const openCall = await db
      .query('capabilityCalls')
      .withIndex('by_ownerId_and_state_and_createdAt', (query) => query
        .eq('ownerId', accountRef)
        .eq('state', state))
      .first()
    if (openCall !== null) {
      reasons.add('open_calls')
      break
    }
  }

  const ownerCalls = await db
    .query('capabilityCalls')
    .filter((filter) => filter.eq(filter.field('ownerId'), accountRef))
    .collect()
  if (ownerCalls.some((row) =>
    row.formanceFinancialState !== undefined
    && UNRELEASED_CALL_HOLD_STATES.has(row.formanceFinancialState))) {
    reasons.add('unreleased_call_holds')
  }

  const fundingCommands = await db
    .query('moneyFundingCommands')
    .withIndex('by_accountRef_and_createdAt', (query) => query.eq('accountRef', accountRef))
    .collect()
  if (fundingCommands.some((row) => IN_FLIGHT_FUNDING_STATES.has(row.state))) {
    reasons.add('in_flight_funding')
  }

  const openCase = await db
    .query('moneyReconciliationCases')
    .withIndex('by_accountRef_and_status_and_createdAt', (query) => query
      .eq('accountRef', accountRef)
      .eq('status', 'open'))
    .first()
  if (openCase !== null) {
    reasons.add('open_reconciliation')
  }

  return [...reasons]
}
