import { describe, expect, it } from 'vitest'

import {
  createBudgetAuthority,
  reserveBudget,
  resolveBudgetReservation,
} from '@/modules/routing-kernel/internal/budget-authority'

const authorityInput = {
  budgetAuthorityRef: 'budget-authority:grant-1:network-1:AUD:provider-cost-v1',
  sourceGrantId: 'grant-1',
  agentId: 'agent-1',
  principalId: 'principal-1',
  networkId: 'network-1',
  railProfileId: 'provider-cost-v1',
  currency: 'AUD',
  maximumGrossMinor: 200,
  expiresAt: 2_000,
} as const

describe('routing Budget Authority', () => {
  it('prevents aggregate reservations from exceeding one parent authority', () => {
    const authority = createBudgetAuthority(authorityInput)
    const first = reserveBudget(authority, { rootRunId: 'root-1', amountMinor: 125, now: 1_000 })
    expect(first.kind).toBe('reserved')
    if (first.kind !== 'reserved') return

    expect(reserveBudget(first.authority, { rootRunId: 'root-2', amountMinor: 100, now: 1_001 })).toEqual({
      kind: 'refused', reason: 'budget_capacity_exceeded',
    })
    expect(reserveBudget(first.authority, { rootRunId: 'root-1', amountMinor: 125, now: 1_001 })).toEqual(first)
    expect(reserveBudget(first.authority, { rootRunId: 'root-1', amountMinor: 126, now: 1_001 })).toEqual({
      kind: 'refused', reason: 'budget_reservation_conflict',
    })
  })

  it('releases definite non-commitment, consumes commitment, and holds uncertainty', () => {
    const first = reserveBudget(createBudgetAuthority(authorityInput), { rootRunId: 'root-1', amountMinor: 125, now: 1_000 })
    if (first.kind !== 'reserved') throw new Error(first.reason)
    const released = resolveBudgetReservation(first.authority, { rootRunId: 'root-1', resolution: 'not_committed', now: 1_010 })
    expect(released).toMatchObject({ kind: 'resolved', authority: { reservedGrossMinor: 0, committedGrossMinor: 0 } })
    if (released.kind !== 'resolved') return

    const second = reserveBudget(released.authority, { rootRunId: 'root-2', amountMinor: 125, now: 1_020 })
    if (second.kind !== 'reserved') throw new Error(second.reason)
    const held = resolveBudgetReservation(second.authority, { rootRunId: 'root-2', resolution: 'unknown', now: 1_030 })
    expect(held).toEqual({ kind: 'held', authority: second.authority })

    const committed = resolveBudgetReservation(second.authority, { rootRunId: 'root-2', resolution: 'committed', now: 1_040 })
    expect(committed).toMatchObject({ kind: 'resolved', authority: { reservedGrossMinor: 0, committedGrossMinor: 125 } })
    if (committed.kind !== 'resolved') return
    expect(reserveBudget(committed.authority, { rootRunId: 'root-3', amountMinor: 76, now: 1_050 })).toEqual({
      kind: 'refused', reason: 'budget_capacity_exceeded',
    })
  })

  it('fails closed for expired, revoked, and scope-mismatched authority', () => {
    const expired = createBudgetAuthority(authorityInput)
    expect(reserveBudget(expired, { rootRunId: 'root-1', amountMinor: 1, now: 2_000 })).toEqual({ kind: 'refused', reason: 'budget_authority_expired' })
    expect(reserveBudget({ ...expired, status: 'revoked' }, { rootRunId: 'root-1', amountMinor: 1, now: 1_000 })).toEqual({ kind: 'refused', reason: 'budget_authority_revoked' })
    expect(reserveBudget(expired, { rootRunId: 'root-1', amountMinor: 1, now: 1_000, currency: 'USD' })).toEqual({ kind: 'refused', reason: 'budget_scope_mismatch' })
  })
})
