import { describe, expect, it } from 'vitest'

import type { MutationCtx } from '../../../_generated/server'
import { resolveDisputeHandler } from './resolveDispute'

describe('provider obligation dispute resolution', () => {
  it('settles a disputed obligation and its call projection; replay is inert', async () => {
    const obligation = {
      _id: 'obligation:row', obligationRef: 'obligation:one', callRef: 'call:one',
      state: 'disputed', evidenceRefs: ['evidence:initial'], updatedAt: 1,
    }
    const call = { _id: 'call:row', callRef: 'call:one', providerObligationState: 'disputed', updatedAt: 1 }
    const patches: Array<{ id: string; changes: Record<string, unknown> }> = []
    const db = {
      query(table: string) {
        const query = {
          withIndex(_name: string, _filter: unknown) { return query },
          async unique() { return table === 'moneyProviderObligations' ? obligation : call },
        }
        return query
      },
      async patch(id: string, changes: Record<string, unknown>) {
        patches.push({ id, changes })
        Object.assign(id === obligation._id ? obligation : call, changes)
      },
    }
    const ctx = { db } as unknown as MutationCtx
    const args = { obligationRef: obligation.obligationRef, evidenceRef: 'evidence:resolution', observedAt: 10 }
    expect(await resolveDisputeHandler(ctx, args)).toEqual({ kind: 'settled', obligationRef: args.obligationRef })
    expect(obligation).toMatchObject({ state: 'settled', evidenceRefs: ['evidence:initial', args.evidenceRef], updatedAt: 10 })
    expect(call).toMatchObject({ providerObligationState: 'settled', updatedAt: 10 })
    expect(patches).toHaveLength(2)
    expect(await resolveDisputeHandler(ctx, args)).toEqual({ kind: 'replayed', obligationRef: args.obligationRef })
    expect(patches).toHaveLength(2)
  })

  it('does not resolve a non-disputed obligation', async () => {
    const row = { obligationRef: 'obligation:one', state: 'accrued' }
    const query = { withIndex: () => ({ unique: async () => row }) }
    const ctx = { db: { query: () => query } } as unknown as MutationCtx
    await expect(resolveDisputeHandler(ctx, {
      obligationRef: row.obligationRef, evidenceRef: 'evidence:resolution', observedAt: 10,
    })).rejects.toThrow('provider_obligation_dispute_state_invalid')
  })
})
