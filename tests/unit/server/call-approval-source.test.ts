import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  callSourceMutation: vi.fn(),
  callSourceQuery: vi.fn(),
  sourceMutation: vi.fn((name: string) => ({ name })),
  sourceQuery: vi.fn((name: string) => ({ name })),
}))

vi.mock('@/lib/server/convex-source', () => ({
  callSourceMutation: mocks.callSourceMutation,
  callSourceQuery: mocks.callSourceQuery,
  sourceMutation: mocks.sourceMutation,
  sourceQuery: mocks.sourceQuery,
}))

import {
  decideCallApprovalThroughSource,
  listPendingCallApprovalsThroughSource,
} from '@/lib/server/call-approval-source'

describe('operation approval source', () => {
  beforeEach(() => {
    mocks.callSourceMutation.mockReset()
    mocks.callSourceQuery.mockReset()
  })

  it('delegates to Convex', async () => {
    mocks.callSourceQuery.mockResolvedValue([])
    mocks.callSourceMutation.mockResolvedValue({ kind: 'approved', callRef: 'call:test' })

    await expect(listPendingCallApprovalsThroughSource()).resolves.toEqual([])
    expect(mocks.callSourceQuery).toHaveBeenCalledTimes(1)

    await expect(
      decideCallApprovalThroughSource({ callRef: 'call:test', decision: 'deny' }),
    ).resolves.toEqual({ kind: 'approved', callRef: 'call:test' })
    expect(mocks.callSourceMutation).toHaveBeenCalledTimes(1)
  })
})
