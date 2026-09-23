import { afterEach, describe, expect, it, vi } from 'vitest'

const source = vi.hoisted(() => ({ action: vi.fn() }))
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    validator: (validate: (value: unknown) => unknown) => ({
      handler: (handler: (input: { data: unknown }) => Promise<unknown>) =>
        async (input: { data?: unknown } = {}) => await handler({ data: validate(input.data) }),
    }),
  }),
}))
vi.mock('@/lib/server/convex-source', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/convex-source')>()),
  callSourceAction: source.action,
}))

import { readOwnerAccountHistoryServer } from '@/lib/server/call-history.functions'

afterEach(() => source.action.mockReset())

describe('owner Account history server boundary', () => {
  it('preserves source unavailability and forwards only a bounded cursor', async () => {
    source.action.mockResolvedValue({ kind: 'unavailable', code: 'formance_read_unavailable' })
    await expect(readOwnerAccountHistoryServer({ data: { cursor: 'signed:cursor' } }))
      .resolves.toEqual({ kind: 'unavailable', code: 'formance_read_unavailable' })
    expect(source.action.mock.calls[0]?.[1]).toEqual({ cursor: 'signed:cursor' })
    await readOwnerAccountHistoryServer({ data: {} })
    expect(source.action.mock.calls[1]?.[1]).toEqual({})
  })

  it('rejects unknown input fields and invalid money results at their respective boundary', async () => {
    const forged = JSON.parse('{"accountRef":"account:other"}')
    await expect(readOwnerAccountHistoryServer({ data: forged })).rejects.toThrow()
    await expect(readOwnerAccountHistoryServer({ data: { cursor: 'x'.repeat(4097) } })).rejects.toThrow()
    expect(source.action).not.toHaveBeenCalled()
    source.action.mockResolvedValue({ kind: 'available', entries: [], isDone: true })
    await expect(readOwnerAccountHistoryServer({ data: {} })).rejects.toThrow()
  })
})
