import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { recoverableSearch } from '@/lib/client/recoverable-search'

const filters = recoverableSearch(z.strictObject({
  kind: z.enum(['uncertain_call']).optional(),
  partition: z.enum(['opened']).optional(),
}), {
  fieldLabels: { kind: 'Kind', partition: 'State' },
})
const link = recoverableSearch(z.object({
  attempt: z.string().trim().min(1).max(10).optional(),
  next: z.string().optional(),
}), { identifierKeys: ['attempt'] })
const quiet = recoverableSearch(z.object({
  issue: z.literal('manual').optional(),
}), { ignoreUnknown: true })

describe('recoverableSearch', () => {
  it('keeps a valid filter and names an unknown value without throwing', () => {
    expect(filters({ kind: 'uncertain_call' })).toEqual({ kind: 'uncertain_call' })
    expect(filters({ kind: 'not_a_kind', partition: 'opened' })).toEqual({
      kind: undefined,
      partition: 'opened',
      rejected: 'Ignored Kind. The other filters still apply.',
    })
    expect(filters({ kind: 'uncertain_call', extra: '1' })).toEqual({
      kind: 'uncertain_call',
      extra: undefined,
      rejected: 'Ignored extra. The other filters still apply.',
    })
    expect(filters({
      rejected: 'Ignored Kind. The other filters still apply.',
      kind: 'uncertain_call',
    })).toEqual({
      kind: 'uncertain_call',
      rejected: 'Ignored Kind. The other filters still apply.',
    })
  })

  it('drops an invalid identifier instead of throwing', () => {
    expect(link({ attempt: 'ok', next: 'stay' })).toEqual({ attempt: 'ok', next: 'stay' })
    expect(link({ attempt: 1, next: 'stay' })).toEqual({
      attempt: undefined,
      next: 'stay',
      rejected: 'This link is not valid. Nothing was opened.',
    })
  })

  it('ignores a harmless optional filter when asked', () => {
    expect(quiet({ issue: 'nope' })).toEqual({ issue: undefined })
    expect(quiet({ issue: 'manual' })).toEqual({ issue: 'manual' })
  })
})
