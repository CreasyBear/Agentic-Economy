import { describe, expect, it, vi } from 'vitest'

import { completeWorkHandler } from '../../../convex/lib/callLifecycle/workComplete'

describe('capability operation work completion generation', () => {
  it('ignores a late callback from the work generation replaced by recovery', async () => {
    const row = {
      _id: 'capabilityCalls:one',
      callRef: 'operation-invocation:one',
      state: 'pending',
      workId: 'work:new-generation',
    }
    const patch = vi.fn()
    const runMutation = vi.fn()
    const ctx = {
      db: {
        query: () => {
          const query = {
            withIndex: (_name: string, build: (value: { eq: () => unknown }) => unknown) => {
              const builder = { eq: () => builder }
              build(builder)
              return query
            },
            unique: async () => row,
          }
          return query
        },
        patch,
      },
      runMutation,
    }

    await expect(completeWorkHandler(ctx as never, {
      workId: 'work:old-generation',
      context: { callRef: row.callRef },
      result: { kind: 'failed', error: 'late prior failure' },
    })).resolves.toBeNull()

    expect(patch).not.toHaveBeenCalled()
    expect(runMutation).not.toHaveBeenCalled()
  })
})
