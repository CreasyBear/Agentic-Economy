export type SpendReservation = Readonly<{
  rootRunId: string
  amountMinor: number
  state: 'reserved' | 'committed' | 'released'
  reservedAt: number
  resolvedAt?: number
}>

export type BudgetAuthority = Readonly<{
  budgetAuthorityRef: string
  sourceGrantId: string
  agentId: string
  principalId: string
  networkId: string
  railProfileId: string
  currency: string
  maximumGrossMinor: number
  reservedGrossMinor: number
  committedGrossMinor: number
  expiresAt: number
  status: 'active' | 'revoked'
  revision: number
  reservations: readonly SpendReservation[]
}>

type BudgetAuthorityInput = Omit<BudgetAuthority, 'reservedGrossMinor' | 'committedGrossMinor' | 'status' | 'revision' | 'reservations'>

export type ReserveBudgetInput = Readonly<{
  rootRunId: string
  amountMinor: number
  now: number
  currency?: string
}>

export type ReserveBudgetResult =
  | Readonly<{ kind: 'reserved'; authority: BudgetAuthority }>
  | Readonly<{ kind: 'refused'; reason: 'budget_authority_expired' | 'budget_authority_revoked' | 'budget_scope_mismatch' | 'budget_capacity_exceeded' | 'budget_reservation_conflict' | 'budget_input_invalid' }>

export type ResolveBudgetResult =
  | Readonly<{ kind: 'resolved'; authority: BudgetAuthority }>
  | Readonly<{ kind: 'held'; authority: BudgetAuthority }>
  | Readonly<{ kind: 'refused'; reason: 'budget_reservation_not_found' | 'budget_reservation_already_resolved' }>

export function createBudgetAuthority(input: BudgetAuthorityInput): BudgetAuthority {
  if (!Number.isSafeInteger(input.maximumGrossMinor) || input.maximumGrossMinor < 0) throw new Error('budget_authority_maximum_invalid')
  return Object.freeze({
    ...input,
    reservedGrossMinor: 0,
    committedGrossMinor: 0,
    status: 'active' as const,
    revision: 0,
    reservations: Object.freeze([]),
  })
}

export function reserveBudget(authority: BudgetAuthority, input: ReserveBudgetInput): ReserveBudgetResult {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor < 0 || input.rootRunId.length === 0) return refused('budget_input_invalid')
  if (authority.status !== 'active') return refused('budget_authority_revoked')
  if (authority.expiresAt <= input.now) return refused('budget_authority_expired')
  if (input.currency !== undefined && input.currency !== authority.currency) return refused('budget_scope_mismatch')

  const existing = authority.reservations.find((reservation) => reservation.rootRunId === input.rootRunId)
  if (existing !== undefined) {
    return existing.amountMinor === input.amountMinor && existing.state === 'reserved'
      ? { kind: 'reserved', authority }
      : refused('budget_reservation_conflict')
  }
  if (authority.reservedGrossMinor + authority.committedGrossMinor + input.amountMinor > authority.maximumGrossMinor) {
    return refused('budget_capacity_exceeded')
  }

  const reservation = Object.freeze({ rootRunId: input.rootRunId, amountMinor: input.amountMinor, state: 'reserved' as const, reservedAt: input.now })
  return {
    kind: 'reserved',
    authority: Object.freeze({
      ...authority,
      reservedGrossMinor: authority.reservedGrossMinor + input.amountMinor,
      revision: authority.revision + 1,
      reservations: Object.freeze([...authority.reservations, reservation]),
    }),
  }
}

export function resolveBudgetReservation(
  authority: BudgetAuthority,
  input: Readonly<{ rootRunId: string; resolution: 'committed' | 'not_committed' | 'unknown'; now: number }>,
): ResolveBudgetResult {
  const index = authority.reservations.findIndex((reservation) => reservation.rootRunId === input.rootRunId)
  if (index < 0) return { kind: 'refused', reason: 'budget_reservation_not_found' }
  const reservation = authority.reservations.at(index)
  if (reservation === undefined) return { kind: 'refused', reason: 'budget_reservation_not_found' }
  if (reservation.state !== 'reserved') return { kind: 'refused', reason: 'budget_reservation_already_resolved' }
  if (input.resolution === 'unknown') return { kind: 'held', authority }

  const resolvedReservation = Object.freeze({
    ...reservation,
    state: input.resolution === 'committed' ? 'committed' as const : 'released' as const,
    resolvedAt: input.now,
  })
  const reservations = [...authority.reservations]
  reservations[index] = resolvedReservation
  return {
    kind: 'resolved',
    authority: Object.freeze({
      ...authority,
      reservedGrossMinor: authority.reservedGrossMinor - reservation.amountMinor,
      committedGrossMinor: authority.committedGrossMinor + (input.resolution === 'committed' ? reservation.amountMinor : 0),
      revision: authority.revision + 1,
      reservations: Object.freeze(reservations),
    }),
  }
}

function refused(reason: Extract<ReserveBudgetResult, { kind: 'refused' }>['reason']): ReserveBudgetResult {
  return { kind: 'refused', reason }
}
