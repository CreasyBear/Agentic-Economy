import { describe, expect, it, vi } from 'vitest'

const authority = vi.hoisted(() => vi.fn())
vi.mock('../callLifecycle/agentCallAuthority', () => ({ resolveCurrentAgentAuthority: authority }))
vi.mock('../../security/sourceWrite/admission', () => ({ requireSourceWrite: async () => ({ kind: 'accepted' }) }))

import { admitCallableResolveHandler } from './prepareFinancialSubjects'

const run = (authorityMode: string | null) => {
  authority.mockResolvedValue(authorityMode === null ? null : { principal: { authorityMode } })
  return admitCallableResolveHandler({} as never, { principal: {} } as never)
}

describe('admitCallableResolveHandler authority mode', () => {
  it('refuses read_only before any resolve', async () => {
    expect(await run('read_only')).toMatchObject({ kind: 'refused', code: 'budget_exceeded' })
  })
  it('admits spending_policy', async () => {
    expect(await run('spending_policy')).toEqual({ kind: 'admitted' })
  })
  it('refuses without a grant', async () => {
    expect(await run(null)).toEqual({ kind: 'refused', code: 'grant_not_found' })
  })
})
